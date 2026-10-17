'use strict';

const {
  AUTHORIZED_ISSUER,
  AUTHORIZED_ALGORITHM,
  GENESIS_PREV_HASH,
  MAX_TOKEN_TTL_MS,
  createSyntheticToken,
  verifySyntheticToken,
  DurableLedger
} = require('./helpers/qaTrustLedger');

describe('B02 Trusted Authority & Durable Ledger Negative Security Suite', () => {
  const SECRET_KEY = 'super-secret-qa-test-signing-key-32b!';
  const BASE_PAYLOAD = Object.freeze({
    issuer: AUTHORIZED_ISSUER,
    tokenId: 'tok-synthetic-001',
    attemptId: 'att-20261017-001',
    hostId: 'host-win11-isolated-01',
    nonce: 'nonce-random-12345678',
    issuedAt: 1700000000000,
    expiresAt: 1700000000000 + 600000 // +10 mins
  });

  describe('Part A: Synthetic Approval Token Negative Cases (Fail-Closed)', () => {
    test('1. Fails closed on invalid signature (wrong secret key)', () => {
      const token = createSyntheticToken(BASE_PAYLOAD, SECRET_KEY);
      expect(() =>
        verifySyntheticToken(token, 'wrong-secret-key', {}, { now: 1700000001000 })
      ).toThrow(/Invalid token signature/);
    });

    test('2. Fails closed on wrong issuer', () => {
      const payload = { ...BASE_PAYLOAD, issuer: 'malicious-spoofed-issuer' };
      const token = createSyntheticToken(payload, SECRET_KEY);
      expect(() =>
        verifySyntheticToken(token, SECRET_KEY, { issuer: AUTHORIZED_ISSUER }, { now: 1700000001000 })
      ).toThrow(/Wrong issuer/);
    });

    test('3. Fails closed on expired token', () => {
      const token = createSyntheticToken(BASE_PAYLOAD, SECRET_KEY);
      // now is after expiresAt
      expect(() =>
        verifySyntheticToken(token, SECRET_KEY, {}, { now: BASE_PAYLOAD.expiresAt + 1000 })
      ).toThrow(/Token expired/);
    });

    test('4. Fails closed on future token (clock skew violation)', () => {
      const token = createSyntheticToken(BASE_PAYLOAD, SECRET_KEY);
      // now is before issuedAt
      expect(() =>
        verifySyntheticToken(token, SECRET_KEY, {}, { now: BASE_PAYLOAD.issuedAt - 5000 })
      ).toThrow(/Token issued in the future/);
    });

    test('5. Fails closed on excessive TTL (> 15 minutes)', () => {
      const payload = { ...BASE_PAYLOAD, expiresAt: BASE_PAYLOAD.issuedAt + MAX_TOKEN_TTL_MS + 1000 };
      const token = createSyntheticToken(payload, SECRET_KEY);
      expect(() =>
        verifySyntheticToken(token, SECRET_KEY, {}, { now: BASE_PAYLOAD.issuedAt + 1000 })
      ).toThrow(/Token TTL exceeds policy limit/);
    });

    test('6. Fails closed on tampered payload (modified after signing)', () => {
      const token = createSyntheticToken(BASE_PAYLOAD, SECRET_KEY);
      const [h, p, s] = token.split('.');
      const decodedP = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
      decodedP.hostId = 'tampered-attacker-machine';
      const tamperedP = Buffer.from(JSON.stringify(decodedP)).toString('base64url');
      const tamperedToken = `${h}.${tamperedP}.${s}`;

      expect(() =>
        verifySyntheticToken(tamperedToken, SECRET_KEY, {}, { now: 1700000001000 })
      ).toThrow(/Invalid token signature or tampered approval payload/);
    });

    test('7. Fails closed on replayed nonce', () => {
      const token = createSyntheticToken(BASE_PAYLOAD, SECRET_KEY);
      const consumedNonces = new Set();
      // First verification succeeds
      const res = verifySyntheticToken(token, SECRET_KEY, {}, { now: 1700000001000, consumedNonces });
      expect(res.valid).toBe(true);
      // Replay must fail
      expect(() =>
        verifySyntheticToken(token, SECRET_KEY, {}, { now: 1700000001000, consumedNonces })
      ).toThrow(/Replayed token nonce.*detected/);
    });

    test('8. Fails closed on missing nonce when nonce tracking active', () => {
      const { nonce, ...payloadWithoutNonce } = BASE_PAYLOAD;
      const token = createSyntheticToken(payloadWithoutNonce, SECRET_KEY);
      const consumedNonces = new Set();
      expect(() =>
        verifySyntheticToken(token, SECRET_KEY, {}, { now: 1700000001000, consumedNonces })
      ).toThrow(/Nonce required in approval token/);
    });

    test('9. Fails closed on mismatched attempt ID', () => {
      const token = createSyntheticToken(BASE_PAYLOAD, SECRET_KEY);
      expect(() =>
        verifySyntheticToken(token, SECRET_KEY, { attemptId: 'att-DIFFERENT-999' }, { now: 1700000001000 })
      ).toThrow(/Attempt ID mismatch/);
    });

    test('10. Fails closed on mismatched host ID', () => {
      const token = createSyntheticToken(BASE_PAYLOAD, SECRET_KEY);
      expect(() =>
        verifySyntheticToken(token, SECRET_KEY, { hostId: 'host-DIFFERENT-HOST' }, { now: 1700000001000 })
      ).toThrow(/Host ID mismatch/);
    });

    test('11. Fails closed on revoked token', () => {
      const token = createSyntheticToken(BASE_PAYLOAD, SECRET_KEY);
      const revocationList = new Set([BASE_PAYLOAD.tokenId]);
      expect(() =>
        verifySyntheticToken(token, SECRET_KEY, {}, { now: 1700000001000, revocationList })
      ).toThrow(/has been explicitly revoked/);
    });

    test('12. Fails closed on downgrade attack: "none" algorithm', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'QA_APPROVAL_TOKEN' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify(BASE_PAYLOAD)).toString('base64url');
      const downgradeToken = `${header}.${payload}.`;
      expect(() =>
        verifySyntheticToken(downgradeToken, SECRET_KEY, {}, { now: 1700000001000 })
      ).toThrow(/Prohibited algorithm "none"/);
    });

    test('13. Fails closed on downgrade attack: unauthorized algorithm', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'QA_APPROVAL_TOKEN' })).toString('base64url');
      const payload = Buffer.from(JSON.stringify(BASE_PAYLOAD)).toString('base64url');
      const fakeSig = Buffer.from('fake-signature').toString('base64url');
      const token = `${header}.${payload}.${fakeSig}`;
      expect(() =>
        verifySyntheticToken(token, SECRET_KEY, {}, { now: 1700000001000 })
      ).toThrow(/Prohibited algorithm "RS256"/);
    });

    test('14. Fails closed on malformed token structure (not 3 segments)', () => {
      expect(() => verifySyntheticToken('only-one-segment', SECRET_KEY)).toThrow(/Token must have exactly 3 dot-delimited segments/);
      expect(() => verifySyntheticToken('seg1.seg2', SECRET_KEY)).toThrow(/Token must have exactly 3 dot-delimited segments/);
      expect(() => verifySyntheticToken('seg1.seg2.seg3.seg4', SECRET_KEY)).toThrow(/Token must have exactly 3 dot-delimited segments/);
    });
  });

  describe('Part B: Append-Only Durable Ledger Negative Cases (Fail-Closed)', () => {
    test('15. Fails closed on unauthorized writer principal', () => {
      const ledger = new DurableLedger('medisync-qa-ledger-writer');
      expect(() =>
        ledger.append('AUTH_CHECK', { user: 'qa' }, 'unauthorized-intruder')
      ).toThrow(/Unauthorized ledger writer principal/);
    });

    test('16. Fails closed on out-of-order timestamp during append', () => {
      const ledger = new DurableLedger('medisync-qa-ledger-writer');
      ledger.append('INIT', {}, 'medisync-qa-ledger-writer', 2000);
      expect(() =>
        ledger.append('NEXT', {}, 'medisync-qa-ledger-writer', 1000)
      ).toThrow(/Out-of-order timestamp/);
    });

    test('17. Fails closed on broken hash chain in verifyChain()', () => {
      const ledger = new DurableLedger('medisync-qa-ledger-writer');
      ledger.append('INIT', { test: 1 }, 'medisync-qa-ledger-writer', 1000);
      ledger.append('STEP2', { test: 2 }, 'medisync-qa-ledger-writer', 2000);

      // Artificially corrupt prevHash of block 1
      ledger.chain[1] = { ...ledger.chain[1], prevHash: 'broken_hash_0000000000000000000000000000000000000000000000000000' };

      expect(() => ledger.verifyChain()).toThrow(/Broken hash chain/);
    });

    test('18. Fails closed on sequence gap or duplicate sequence', () => {
      const ledger = new DurableLedger('medisync-qa-ledger-writer');
      ledger.append('INIT', { test: 1 }, 'medisync-qa-ledger-writer', 1000);
      ledger.append('STEP2', { test: 2 }, 'medisync-qa-ledger-writer', 2000);

      // Corrupt sequence
      ledger.chain[1] = { ...ledger.chain[1], seq: 5 };
      expect(() => ledger.verifyChain()).toThrow(/Sequence gap or duplicate entry/);
    });

    test('19. Fails closed on altered entry payload in verified ledger', () => {
      const ledger = new DurableLedger('medisync-qa-ledger-writer');
      ledger.append('INIT', { val: 'original' }, 'medisync-qa-ledger-writer', 1000);

      // Alter payload while keeping original recorded block hash
      ledger.chain[0] = { ...ledger.chain[0], payload: { val: 'tampered-secret' } };
      expect(() => ledger.verifyChain()).toThrow(/Altered entry payload or tampered hash/);
    });

    test('20. Fails closed on truncated log', () => {
      const ledger = new DurableLedger('medisync-qa-ledger-writer');
      ledger.append('INIT', {}, 'medisync-qa-ledger-writer', 1000);

      // Expect at least 3 entries, only 1 present
      expect(() => ledger.verifyChain(3)).toThrow(/Truncated log/);
    });
  });

  describe('Part C: Positive Controls (Proving Verification Works When Valid)', () => {
    test('21. Valid token passes verification with full payload extraction', () => {
      const token = createSyntheticToken(BASE_PAYLOAD, SECRET_KEY);
      const result = verifySyntheticToken(
        token,
        SECRET_KEY,
        {
          issuer: AUTHORIZED_ISSUER,
          attemptId: BASE_PAYLOAD.attemptId,
          hostId: BASE_PAYLOAD.hostId
        },
        { now: BASE_PAYLOAD.issuedAt + 10000 }
      );
      expect(result.valid).toBe(true);
      expect(result.payload.tokenId).toBe(BASE_PAYLOAD.tokenId);
    });

    test('22. Valid ledger chain passes verification and provides head hash confirmation', () => {
      const ledger = new DurableLedger('medisync-qa-ledger-writer');
      ledger.append('BOOTSTRAP', { v: 1 }, 'medisync-qa-ledger-writer', 1000);
      ledger.append('PREFLIGHT', { v: 2 }, 'medisync-qa-ledger-writer', 2000);
      ledger.append('SHUTDOWN', { v: 3 }, 'medisync-qa-ledger-writer', 3000);

      const verification = ledger.verifyChain(3);
      expect(verification.valid).toBe(true);
      expect(verification.length).toBe(3);
      expect(typeof verification.headHash).toBe('string');
      expect(verification.headHash.length).toBe(64);
    });
  });
});
