'use strict';

const {
  TARGET_BATCH,
  PROTECTED_SEED_BATCH,
  ALLOWED_DATABASES,
  parseCliArgs,
  verifyRemovalAdmission,
  buildQuery,
  inspectOrRemoveBatch
} = require('../../scripts/remove_demo_batch.js');

describe('Guarded Demo Batch Removal (remove_demo_batch.js)', () => {
  describe('CLI Argument Parsing', () => {
    test('defaults to dryRun: true and target batch DEMO_OUTBREAK_2026_V1', () => {
      const parsed = parseCliArgs([]);
      expect(parsed.dryRun).toBe(true);
      expect(parsed.database).toBe('medisync_prod');
      expect(parsed.targetBatch).toBe(TARGET_BATCH);
    });

    test('accepts approved database flags', () => {
      const parsed = parseCliArgs(['--db', 'medisync_automated_test', '--dry-run']);
      expect(parsed.database).toBe('medisync_automated_test');
      expect(parsed.dryRun).toBe(true);
    });

    test('rejects unapproved database names', () => {
      expect(() => parseCliArgs(['--db', 'unknown_db'])).toThrow('DATABASE_NOT_PERMITTED');
    });

    test('parses --confirm-demo-removal', () => {
      const parsed = parseCliArgs(['--confirm-demo-removal', TARGET_BATCH]);
      expect(parsed.dryRun).toBe(false);
      expect(parsed.confirmBatch).toBe(TARGET_BATCH);
    });
  });

  describe('Admission Verification & Fail-Closed Guard', () => {
    test('dry-run is admitted without any approval env vars', () => {
      const result = verifyRemovalAdmission({ dryRun: true, targetBatch: TARGET_BATCH }, {});
      expect(result.admitted).toBe(true);
      expect(result.mode).toBe('DRY_RUN');
    });

    test('destructive removal is blocked without approval env var', () => {
      expect(() => {
        verifyRemovalAdmission(
          { dryRun: false, targetBatch: TARGET_BATCH, confirmBatch: TARGET_BATCH },
          {}
        );
      }).toThrow('APPROVAL_ENV_REQUIRED');
    });

    test('destructive removal is admitted when approval env var is true', () => {
      const result = verifyRemovalAdmission(
        { dryRun: false, targetBatch: TARGET_BATCH, confirmBatch: TARGET_BATCH },
        { APPROVE_DEMO_OUTBREAK_REMOVAL: 'true' }
      );
      expect(result.admitted).toBe(true);
      expect(result.mode).toBe('EXECUTE');
    });

    test('destructive removal is admitted when alternate approval env var is APPROVED', () => {
      const result = verifyRemovalAdmission(
        { dryRun: false, targetBatch: TARGET_BATCH, confirmBatch: TARGET_BATCH },
        { MEDISYNC_DEMO_REMOVAL_APPROVAL: 'APPROVED' }
      );
      expect(result.admitted).toBe(true);
      expect(result.mode).toBe('EXECUTE');
    });

    test('rejects removal if targetBatch differs from TARGET_BATCH', () => {
      expect(() => {
        verifyRemovalAdmission(
          { dryRun: false, targetBatch: 'OTHER_BATCH', confirmBatch: 'OTHER_BATCH' },
          { APPROVE_DEMO_OUTBREAK_REMOVAL: 'true' }
        );
      }).toThrow('BATCH_UNAPPROVED');
    });

    test('rejects removal if confirmBatch does not match targetBatch', () => {
      expect(() => {
        verifyRemovalAdmission(
          { dryRun: false, targetBatch: TARGET_BATCH, confirmBatch: 'WRONG_BATCH' },
          { APPROVE_DEMO_OUTBREAK_REMOVAL: 'true' }
        );
      }).toThrow('CONFIRM_BATCH_MISMATCH');
    });
  });

  describe('Query Isolation & Protected Seed Safeguards', () => {
    test('query explicitly enforces ne: SEED_2026_11_A', () => {
      const query = buildQuery(TARGET_BATCH);
      expect(query.$and).toBeDefined();
      const seedFilter = query.$and.find(clause => clause.syntheticSeedBatch && clause.syntheticSeedBatch.$ne);
      expect(seedFilter).toBeDefined();
      expect(seedFilter.syntheticSeedBatch.$ne).toBe(PROTECTED_SEED_BATCH);
    });
  });

  describe('inspectOrRemoveBatch Execution Logic', () => {
    function createMockMongoose(counts = { consultations: 42, alerts: 10, protectedSeed: 4500 }) {
      const deleteConsultationsSpy = jest.fn().mockResolvedValue({ deletedCount: counts.consultations });
      const deleteAlertsSpy = jest.fn().mockResolvedValue({ deletedCount: counts.alerts });

      const mockDb = {
        collection: (name) => {
          if (name === 'consultations') {
            return {
              countDocuments: jest.fn().mockImplementation((query) => {
                if (query.syntheticSeedBatch === PROTECTED_SEED_BATCH) {
                  return Promise.resolve(counts.protectedSeed);
                }
                return Promise.resolve(counts.consultations);
              }),
              deleteMany: deleteConsultationsSpy
            };
          }
          if (name === 'outbreakalerts') {
            return {
              countDocuments: jest.fn().mockResolvedValue(counts.alerts),
              deleteMany: deleteAlertsSpy
            };
          }
          return {
            countDocuments: jest.fn().mockResolvedValue(0),
            deleteMany: jest.fn().mockResolvedValue({ deletedCount: 0 })
          };
        }
      };

      return {
        instance: { connection: { db: mockDb } },
        spies: { deleteConsultationsSpy, deleteAlertsSpy }
      };
    }

    test('dryRun counts records and NEVER invokes deleteMany', async () => {
      const { instance, spies } = createMockMongoose();
      const report = await inspectOrRemoveBatch(instance, {
        dryRun: true,
        database: 'medisync_prod',
        targetBatch: TARGET_BATCH
      });

      expect(report.dryRun).toBe(true);
      expect(report.status).toBe('DRY_RUN_COMPLETED');
      expect(report.consultationsTargeted).toBe(42);
      expect(report.alertsTargeted).toBe(10);
      expect(report.consultationsDeleted).toBe(0);
      expect(report.alertsDeleted).toBe(0);
      expect(report.protectedSeedPreserved).toBe(true);

      expect(spies.deleteConsultationsSpy).not.toHaveBeenCalled();
      expect(spies.deleteAlertsSpy).not.toHaveBeenCalled();
    });

    test('execute mode performs deletion and verifies protected seed preservation', async () => {
      const { instance, spies } = createMockMongoose();
      const report = await inspectOrRemoveBatch(instance, {
        dryRun: false,
        confirmBatch: TARGET_BATCH,
        database: 'medisync_prod',
        targetBatch: TARGET_BATCH,
        env: { APPROVE_DEMO_OUTBREAK_REMOVAL: 'true' }
      });

      expect(report.dryRun).toBe(false);
      expect(report.status).toBe('DELETION_COMPLETED');
      expect(report.consultationsDeleted).toBe(42);
      expect(report.alertsDeleted).toBe(10);
      expect(report.protectedSeedPreserved).toBe(true);

      expect(spies.deleteConsultationsSpy).toHaveBeenCalled();
      expect(spies.deleteAlertsSpy).toHaveBeenCalled();
    });
  });
});
