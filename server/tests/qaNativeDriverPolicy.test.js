'use strict';

const {
  APPROVED_DATABASES,
  DISALLOWED_DATABASES,
  DEFAULT_POLICY,
  validateDriverPolicy,
  validatePrincipalAndRoles,
  createDisconnectedMongoClientDouble
} = require('./helpers/qaNativeDriverPolicy');

describe('B01 Native MongoDB Driver Enforcement Specification & Disconnected Test Doubles (Corrected GOV-R5)', () => {
  const VALID_ATLAS_URI = 'mongodb+srv://qa_user:pass123@cluster0.abcde.mongodb.net/medisync_automated_test?authSource=admin';
  const VALID_AUTH_INFO = Object.freeze({
    authenticatedUsers: [{ user: 'qa_user_test', db: 'admin' }],
    authenticatedUserRoles: [{ role: 'readWrite', db: 'medisync_automated_test' }]
  });

  describe('Part A: URI, Scheme & Database Strictness', () => {
    test('1. Fails closed if connection URI is missing or empty', () => {
      expect(() => validateDriverPolicy('')).toThrow(/Connection URI is required/);
      expect(() => validateDriverPolicy(null)).toThrow(/Connection URI is required/);
    });

    test('2. Fails closed if URI scheme is unsupported', () => {
      expect(() => validateDriverPolicy('http://cluster0.abcde.mongodb.net/medisync_automated_test')).toThrow(/Unsupported protocol/);
      expect(() => validateDriverPolicy('postgresql://localhost:5432/medisync_automated_test')).toThrow(/Unsupported protocol/);
    });

    test('3. Strictly rejects forbidden or ambiguous default database name "test"', () => {
      const uriWithTest = 'mongodb+srv://qa_user:pass@cluster0.abcde.mongodb.net/test?authSource=admin';
      expect(() => validateDriverPolicy(uriWithTest)).toThrow(/Database name "test" is forbidden/);
    });

    test('4. Strictly rejects secondary or unapproved QA database name "medisync_qa_isolated"', () => {
      const uriWithIsolated = 'mongodb+srv://qa_user:pass@cluster0.abcde.mongodb.net/medisync_qa_isolated?authSource=admin';
      expect(() => validateDriverPolicy(uriWithIsolated)).toThrow(/forbidden.*unapproved DB names prohibited/);
    });

    test('5. Rejects system or empty database names (admin, local, config, empty)', () => {
      for (const forbidden of DISALLOWED_DATABASES) {
        const uri = `mongodb+srv://qa_user:pass@cluster0.abcde.mongodb.net/${forbidden}?authSource=admin`;
        expect(() => validateDriverPolicy(uri)).toThrow(/is forbidden/);
      }
    });

    test('6. Rejects any other unapproved database name outside "medisync_automated_test"', () => {
      const uriOther = 'mongodb+srv://qa_user:pass@cluster0.abcde.mongodb.net/arbitrary_hospital_db?authSource=admin';
      expect(() => validateDriverPolicy(uriOther)).toThrow(/not the sole approved QA database/);
    });
  });

  describe('Part B: Host Security, Transport & Parameter Tamper Resistance', () => {
    test('7. Strictly prohibits localhost / 127.0.0.1 / ::1 across all profiles', () => {
      const localUri = 'mongodb://user:pass@localhost:27017/medisync_automated_test?authSource=admin';
      const ipUri = 'mongodb://user:pass@127.0.0.1:27017/medisync_automated_test?authSource=admin';
      expect(() => validateDriverPolicy(localUri)).toThrow(/localhost\/loopback, strictly forbidden/);
      expect(() => validateDriverPolicy(ipUri)).toThrow(/localhost\/loopback, strictly forbidden/);
    });

    test('8. Rejects non-Atlas host domains (must end with .mongodb.net)', () => {
      const nonAtlas = 'mongodb+srv://user:pass@unapproved.external.host.com/medisync_automated_test?authSource=admin';
      expect(() => validateDriverPolicy(nonAtlas)).toThrow(/not an approved MongoDB Atlas domain/);
    });

    test('9. Rejects plaintext connection attempts (mandatory TLS)', () => {
      const plainUri = 'mongodb://user:pass@cluster0.abcde.mongodb.net:27017/medisync_automated_test?authSource=admin';
      expect(() => validateDriverPolicy(plainUri, { tls: false })).toThrow(/Plaintext connection refused/);
    });

    test('10. Prohibits insecure TLS overrides or disabled certificate validation', () => {
      expect(() => validateDriverPolicy(VALID_ATLAS_URI, { tlsInsecure: true })).toThrow(/Insecure TLS.*prohibited/);
      expect(() => validateDriverPolicy(VALID_ATLAS_URI, { sslValidate: false })).toThrow(/Insecure TLS.*prohibited/);
      expect(() => validateDriverPolicy(VALID_ATLAS_URI + '&tlsInsecure=true')).toThrow(/Insecure TLS.*prohibited/);
    });

    test('11. Detects and rejects duplicate or ambiguous query options (e.g. tls=true&tls=false)', () => {
      const dupUri = VALID_ATLAS_URI + '&tls=true&tls=false';
      expect(() => validateDriverPolicy(dupUri)).toThrow(/Duplicate or ambiguous query parameter/);
    });

    test('12. Rejects mixed-case option bypass attempts (e.g. TLS=true)', () => {
      const mixedUri = VALID_ATLAS_URI + '&TLS=true';
      expect(() => validateDriverPolicy(mixedUri)).toThrow(/Mixed-case or unauthorized option key/);
    });

    test('13. Rejects unauthorized driver query options (e.g. retryWrites=true)', () => {
      const unauthUri = VALID_ATLAS_URI + '&retryWrites=true';
      expect(() => validateDriverPolicy(unauthUri)).toThrow(/unauthorized option|Unauthorized driver query option/i);
    });
  });

  describe('Part C: Timeouts, Connection Pool & Auth Policy', () => {
    test('14. Enforces maximum connectTimeoutMS (<= 10000ms)', () => {
      expect(() => validateDriverPolicy(VALID_ATLAS_URI, { connectTimeoutMS: 15000 })).toThrow(/connectTimeoutMS.*exceeds maximum/);
      const valid = validateDriverPolicy(VALID_ATLAS_URI, { connectTimeoutMS: 5000 });
      expect(valid.valid).toBe(true);
    });

    test('15. Enforces maximum serverSelectionTimeoutMS (<= 5000ms)', () => {
      expect(() => validateDriverPolicy(VALID_ATLAS_URI, { serverSelectionTimeoutMS: 8000 })).toThrow(/serverSelectionTimeoutMS.*exceeds maximum/);
      const valid = validateDriverPolicy(VALID_ATLAS_URI, { serverSelectionTimeoutMS: 3000 });
      expect(valid.valid).toBe(true);
    });

    test('16. Enforces maxPoolSize within bounded range [5, 50]', () => {
      expect(() => validateDriverPolicy(VALID_ATLAS_URI, { maxPoolSize: 2 })).toThrow(/maxPoolSize.*outside allowed range/);
      expect(() => validateDriverPolicy(VALID_ATLAS_URI, { maxPoolSize: 100 })).toThrow(/maxPoolSize.*outside allowed range/);
      const valid = validateDriverPolicy(VALID_ATLAS_URI, { maxPoolSize: 20 });
      expect(valid.valid).toBe(true);
    });

    test('17. Enforces authSource=admin policy', () => {
      const badAuth = 'mongodb+srv://qa:pass@cluster0.abcde.mongodb.net/medisync_automated_test?authSource=test';
      expect(() => validateDriverPolicy(badAuth)).toThrow(/authSource must be "admin"/);
    });
  });

  describe('Part D: Principal & Restricted Role Verification', () => {
    test('18. Accepts exactly one authenticated principal with single readWrite@medisync_automated_test role', () => {
      const res = validatePrincipalAndRoles(VALID_AUTH_INFO);
      expect(res.valid).toBe(true);
      expect(res.user).toBe('qa_user_test');
      expect(res.role).toBe('readWrite');
      expect(res.db).toBe('medisync_automated_test');
    });

    test('19. Fails closed if multiple authenticated users are present', () => {
      const multiUser = {
        authenticatedUsers: [{ user: 'user1', db: 'admin' }, { user: 'user2', db: 'admin' }],
        authenticatedUserRoles: [{ role: 'readWrite', db: 'medisync_automated_test' }]
      };
      expect(() => validatePrincipalAndRoles(multiUser)).toThrow(/Exactly one authenticated principal required/);
    });

    test('20. Fails closed if extra or elevated roles are present (e.g. clusterAdmin or root)', () => {
      const elevatedRoles = {
        authenticatedUsers: [{ user: 'qa_user', db: 'admin' }],
        authenticatedUserRoles: [
          { role: 'readWrite', db: 'medisync_automated_test' },
          { role: 'clusterAdmin', db: 'admin' }
        ]
      };
      expect(() => validatePrincipalAndRoles(elevatedRoles)).toThrow(/Exactly one restricted role required/);
    });

    test('21. Fails closed if role binds to wrong database (e.g. production database test)', () => {
      const wrongDbRole = {
        authenticatedUsers: [{ user: 'qa_user', db: 'admin' }],
        authenticatedUserRoles: [{ role: 'readWrite', db: 'test' }]
      };
      expect(() => validatePrincipalAndRoles(wrongDbRole)).toThrow(/Role must be "readWrite" on "medisync_automated_test"/);
    });
  });

  describe('Part E: Disconnected Test Doubles & E1 Read-Only Enforcement', () => {
    const DisconnectedClient = createDisconnectedMongoClientDouble();

    test('22. Fails closed before opening network socket on invalid connection attempt', async () => {
      const invalidClient = new DisconnectedClient('mongodb://127.0.0.1:27017/medisync_automated_test?authSource=admin');
      expect(invalidClient.socketOpened).toBe(false);
      expect(invalidClient.connected).toBe(false);

      await expect(invalidClient.connect()).rejects.toThrow(/strictly forbidden/);
      expect(invalidClient.socketOpened).toBe(false);
      expect(invalidClient.connected).toBe(false);
    });

    test('23. Virtual connection succeeds without opening network socket for valid config', async () => {
      const client = new DisconnectedClient(VALID_ATLAS_URI, { authInfo: VALID_AUTH_INFO });
      expect(client.socketOpened).toBe(false);

      const res = await client.connect();
      expect(res).toBe(client);
      expect(client.connected).toBe(true);
      expect(client.socketOpened).toBe(false); // Zero socket IO

      await client.close();
      expect(client.connected).toBe(false);
    });

    test('24. Test double strictly refuses ALL mutation operations under E1 read-only policy', async () => {
      const client = new DisconnectedClient(VALID_ATLAS_URI);
      await client.connect();

      const db = client.db('medisync_automated_test');
      const col = db.collection('clinical_records');

      // All write operations MUST fail closed under E1 read-only policy
      await expect(col.insertOne({ test: 1 })).rejects.toThrow(/Read-only E1 runtime policy strictly refuses every mutation \(insertOne\)/);
      await expect(col.updateOne({ _id: 1 }, { $set: { x: 2 } })).rejects.toThrow(/Read-only E1 runtime policy strictly refuses every mutation \(updateOne\)/);
      await expect(col.deleteOne({ _id: 1 })).rejects.toThrow(/Read-only E1 runtime policy strictly refuses every mutation \(deleteOne\)/);
      await expect(col.deleteMany({})).rejects.toThrow(/Read-only E1 runtime policy strictly refuses every mutation \(deleteMany\)/);

      await client.close();
    });

    test('25. Test double permits read-only operations without mutation risk', async () => {
      const client = new DisconnectedClient(VALID_ATLAS_URI);
      await client.connect();

      const db = client.db('medisync_automated_test');
      const col = db.collection('clinical_records');

      const doc = await col.findOne({ _id: '123' });
      expect(doc.simulationOnly).toBe(true);

      const list = await col.find({}).toArray();
      expect(Array.isArray(list)).toBe(true);

      await client.close();
    });
  });
});
