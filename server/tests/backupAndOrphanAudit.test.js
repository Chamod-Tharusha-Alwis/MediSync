'use strict';

/**
 * server/tests/backupAndOrphanAudit.test.js
 *
 * Offline Unit Tests for:
 * 1. scripts/backup_db_readonly.js (destination guards, EJSON export, manifest, verification)
 * 2. scripts/audit_orphans_readonly.js (foreign key graph cross-check, clean vs orphan detection)
 * 3. scripts/restore_protected_seed.js (idempotency, insert-only-missing, key persistence)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { validateOutDir, backupDatabase, verifyBackup } = require('../../scripts/backup_db_readonly.js');
const { auditOrphans } = require('../../scripts/audit_orphans_readonly.js');
const { restoreProtectedSeed } = require('../../scripts/restore_protected_seed.js');

describe('Database Maintenance & Safe Recovery Tools', () => {
  describe('Read-Only Database Backup Tool (scripts/backup_db_readonly.js)', () => {
    test('validateOutDir strictly rejects paths inside repository or inside OneDrive', () => {
      // 1. Inside repo root
      const repoRoot = path.resolve(__dirname, '../..');
      expect(() => validateOutDir(repoRoot)).toThrow(/SECURITY_REJECTED.*inside repository/);
      expect(() => validateOutDir(path.join(repoRoot, 'backups'))).toThrow(/SECURITY_REJECTED.*inside repository/);

      // 2. Inside OneDrive
      expect(() => validateOutDir('C:\\Users\\test\\OneDrive\\backups')).toThrow(/SECURITY_REJECTED.*inside OneDrive/);
      expect(() => validateOutDir('/home/user/onedrive/backups')).toThrow(/SECURITY_REJECTED.*inside OneDrive/);

      // 3. Valid directory outside repo and OneDrive
      const validPath = path.join(os.tmpdir(), 'valid_medisync_backup_dir');
      const resolved = validateOutDir(validPath);
      expect(resolved).toBe(path.resolve(validPath));
    });

    test('backupDatabase exports collections with EJSON and verifyBackup verifies exact count parity', async () => {
      const tempDir = path.join(os.tmpdir(), `medisync_test_backup_${Date.now()}`);

      const mockDb = {
        listCollections: () => ({
          toArray: async () => [{ name: 'patients' }, { name: 'hospitals' }, { name: 'system.views' }]
        }),
        collection: (name) => {
          const sample = name === 'patients'
            ? [{ _id: 'p1', nic: '999990000001', createdAt: new Date('2026-11-01T00:00:00Z') }]
            : [{ _id: 'h1', name: 'Apex Hospital' }];
          return {
            find: () => ({ toArray: async () => sample }),
            countDocuments: async () => sample.length
          };
        }
      };

      try {
        const manifest = await backupDatabase('medisync_mock', tempDir, mockDb);
        expect(manifest.totalDocuments).toBe(2);
        expect(manifest.collections.patients.count).toBe(1);
        expect(manifest.collections.hospitals.count).toBe(1);
        expect(manifest.collections['system.views']).toBeUndefined(); // system collection skipped

        const verifyRes = await verifyBackup(tempDir, mockDb);
        expect(verifyRes.allValid).toBe(true);
        expect(verifyRes.recheckedDocs).toBe(2);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('Read-Only Orphan Audit Tool (scripts/audit_orphans_readonly.js)', () => {
    test('auditOrphans accurately detects broken foreign keys across collections', async () => {
      const mockBrokenDb = {
        collection: (name) => {
          const table = {
            hospitals: [{ _id: 'hosp_valid' }],
            pharmacies: [],
            doctors: [{ _id: 'doc_valid', hospitals: ['missing_hosp_1'] }],
            pharmacystaffs: [],
            patients: [],
            consultations: [
              { _id: 'con_1', doctorId: 'doc_valid', hospitalId: 'hosp_valid', patientId: 'missing_patient_1' },
              { _id: 'con_2', doctorId: 'missing_doc_1', hospitalId: 'missing_hosp_2', patientId: 'missing_patient_2' }
            ],
            prescriptions: [
              { _id: 'rx_1', consultationId: 'con_1', doctorId: 'doc_valid', patientId: 'missing_patient_1', dispensedBy: 'missing_pharm_1' }
            ],
            dispensings: [],
            labtests: [],
            verificationtokens: [],
            outbreakalerts: []
          };
          return {
            find: () => ({ toArray: async () => table[name] || [] })
          };
        }
      };

      const audit = await auditOrphans(mockBrokenDb, 'medisync_test');
      expect(audit.isClean).toBe(false);
      expect(audit.totalOrphans).toBeGreaterThan(0);
      expect(audit.countsByCollection.doctors).toBe(1); // 1 broken hospital ref in doctors
      expect(audit.countsByCollection.consultations).toBe(4); // 1 in con_1, 3 in con_2 (doctor, hospital, patient)
      expect(audit.countsByCollection.prescriptions).toBe(2); // patientId + dispensedBy
    });
  });

  describe('SEED_2026_11_A Safe Restoration Tool (scripts/restore_protected_seed.js)', () => {
    test('restoreProtectedSeed behaves in insert-only-missing mode without overwrite', async () => {
      const inMemStore = {};
      const mockDb = {
        collection(name) {
          if (!inMemStore[name]) inMemStore[name] = [];
          const list = inMemStore[name];
          return {
            async findOne(q) {
              return list.find(d => String(d._id) === String(q._id)) || null;
            },
            async insertOne(doc) {
              list.push(doc);
              return { insertedId: doc._id };
            },
            find() {
              return { toArray: async () => list };
            },
            countDocuments: async () => list.length
          };
        }
      };

      // 1. Dry run on empty DB: reports 21 missing, 0 restored
      const dryRes = await restoreProtectedSeed({ database: 'medisync_test', confirm: false, customDb: mockDb });
      expect(dryRes.missingCount).toBe(21);
      expect(dryRes.restoredCount).toBe(0);

      // 2. Confirm run: restores all 21 records
      const confirmRes = await restoreProtectedSeed({ database: 'medisync_test', confirm: true, customDb: mockDb });
      expect(confirmRes.restoredCount).toBe(21);
      expect(confirmRes.missingCount).toBe(21);

      // 3. Confirm run again: 0 missing, 21 existing, 0 restored (strictly idempotent)
      const repeatRes = await restoreProtectedSeed({ database: 'medisync_test', confirm: true, customDb: mockDb });
      expect(repeatRes.missingCount).toBe(0);
      expect(repeatRes.existingCount).toBe(21);
      expect(repeatRes.restoredCount).toBe(0);
    });
  });
});
