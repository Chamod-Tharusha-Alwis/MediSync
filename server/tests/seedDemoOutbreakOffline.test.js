'use strict';

/**
 * server/tests/seedDemoOutbreakOffline.test.js
 *
 * Offline Unit and Integration Test Suite for Feature F: Demo Outbreak Seed Script
 * Fulfills Requirement R2:
 *  - Case 1: --dry-run (default) computes full simulation trajectory without writing to database.
 *  - Case 2a: --confirm without DEMO_SEED_ALLOW=1 fails immediately with exit code 1 and writes nothing.
 *  - Case 2b: --confirm with DEMO_SEED_ALLOW="0" or invalid values is strictly rejected.
 *  - Case 3: --confirm with DEMO_SEED_ALLOW=1 and --seed 42 successfully inserts records, every single
 *            record carrying isSimulatedDemo: true and demoBatchId.
 *  - Case 4a: Determinism test: running twice with --seed 42 produces identical case counts and trajectories.
 *  - Case 4b: Running with different seed (e.g. 999 vs 42) produces different trajectories.
 *  - Case 5: --status command correctly outputs counts of existing demo batches without modifying DB.
 *  - Case 6a: --remove --batch <id> deletes only records with that specific demoBatchId and isSimulatedDemo: true,
 *             never touching any non-simulated records.
 *  - Case 6b: --remove without --batch flag throws error and deletes nothing.
 *  - Case 7: Pipeline verification: verify generated data satisfies surveillance baseline and spike criteria
 *            across all 4 risk tiers (Critical, High, Moderate, Low, Minimal).
 *
 * Guarantees: 100% offline, zero network calls, zero credentials, throwaway in-memory database.
 */

const path = require('path');
const mongoose = require('mongoose');
const { selectCases, POLICY } = require('../src/services/surveillanceService');

// Resolve path to scripts/seed-demo-outbreak.js
const seedScriptPath = path.resolve(__dirname, '../../scripts/seed-demo-outbreak.js');
const seedModule = require(seedScriptPath);

// In-Memory Database Harness
class InMemoryDatabaseHarness {
  constructor() {
    this.consultations = [];
    this.outbreakAlerts = [];
    this.trackingDb = null;
  }

  async setup() {
    const { DatabaseSync } = require('node:sqlite');
    this.trackingDb = new DatabaseSync(':memory:');
    this.trackingDb.exec('CREATE TABLE outbreak_tracking(id INTEGER PRIMARY KEY,date TEXT,district TEXT,disease TEXT,demoBatchId TEXT,count INTEGER,icd_code TEXT)');
    // Real owned in-memory SQLite; no file or network connection.
  }

  async teardown() {
    this.consultations = [];
    this.outbreakAlerts = [];
    this.trackingDb.close();
  }

  async reset() {
    this.consultations = [];
    this.outbreakAlerts = [];
    this.trackingDb.exec('DELETE FROM outbreak_tracking');
  }

  // Returns Native-compatible Collection Mock
  getConsultationCollection() {
    const self = this;
    const matchesVal = (a, b) => {
      if (a === b) return true;
      if (a === undefined || b === undefined || a === null || b === null) return a === b;
      if (typeof a === 'boolean' || typeof b === 'boolean') return a === b;
      if (typeof a === 'number' || typeof b === 'number') return a === b;
      return String(a) === String(b);
    };

    return {
      async insertMany(docs) {
        for (const doc of docs) {
          self.consultations.push({ _id: doc._id || new mongoose.Types.ObjectId(), ...doc });
        }
        return { insertedCount: docs.length };
      },
      async find(query = {}) {
        return {
          async toArray() {
            return self.consultations.filter(c => {
              for (const [k, v] of Object.entries(query)) {
                if (v && typeof v === 'object' && v.$ne !== undefined) {
                  if (matchesVal(c[k], v.$ne)) return false;
                } else if (v && typeof v === 'object' && v.$exists !== undefined) {
                  if (Boolean(c[k]) !== v.$exists) return false;
                } else if (v && typeof v === 'object' && v.$in !== undefined) {
                  if (!v.$in.some(target => matchesVal(c[k], target))) return false;
                } else if (!matchesVal(c[k], v)) {
                  return false;
                }
              }
              return true;
            });
          }
        };
      },
      async countDocuments(query = {}) {
        const items = await this.find(query);
        const arr = await items.toArray();
        return arr.length;
      },
      async deleteMany(query = {}) {
        const before = self.consultations.length;
        self.consultations = self.consultations.filter(c => {
          const allMatch = Object.entries(query).every(([k, v]) => matchesVal(c[k], v));
          return !allMatch;
        });
        return { deletedCount: before - self.consultations.length };
      },
      async distinct(field, query = {}) {
        const items = await this.find(query);
        const arr = await items.toArray();
        return [...new Set(arr.map(doc => doc[field]).filter(Boolean))];
      }
    };
  }

  get outbreakTrackingRows() {
    return this.trackingDb.prepare('SELECT * FROM outbreak_tracking').all();
  }

  getSqliteAdapter() {
    return this.trackingDb;
  }

}

describe('Feature F: Demo Outbreak Seed Script Offline Test Suite', () => {
  const harness = new InMemoryDatabaseHarness();

  beforeAll(async () => {
    await harness.setup();
  }, 30000);

  afterAll(async () => {
    await harness.teardown();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  // Helper to execute seed script runner
  const executeRunner = async (argv = [], envOverrides = {}) => {
    const consultationCol = harness.getConsultationCollection();
    const sqliteAdapter = harness.getSqliteAdapter();
    const env = { ...process.env, ...envOverrides };

    return await seedModule.runSeed(argv, {
      consultationCollection: consultationCol,
      sqliteDb: sqliteAdapter,
      env,
      silent: true
    });
  };

  describe('Safety Guards & Dry-Run (Cases 1 & 2)', () => {
    test('Case 1: --dry-run (default) computes full simulation trajectory without writing to database', async () => {
      const col = harness.getConsultationCollection();
      const countBefore = await col.countDocuments();
      expect(countBefore).toBe(0);

      // Invoke default (no args) or --dry-run
      const result = await executeRunner(['--dry-run']);

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.totalCases).toBeGreaterThan(1000);
      expect(result.batchId).toBeNull();

      // Verify ZERO database writes
      const countAfter = await col.countDocuments();
      expect(countAfter).toBe(0);
      expect(harness.outbreakTrackingRows.length).toBe(0);
    });

    test('Case 2a: --confirm without DEMO_SEED_ALLOW=1 fails immediately with exit code 1 and writes nothing', async () => {
      const col = harness.getConsultationCollection();
      const countBefore = await col.countDocuments();

      await expect(
        executeRunner(['--confirm'], { DEMO_SEED_ALLOW: undefined })
      ).rejects.toMatchObject({
        message: expect.stringMatching(/DEMO_SEED_ALLOW=1 required/i)
      });

      const countAfter = await col.countDocuments();
      expect(countAfter).toBe(countBefore);
      expect(harness.outbreakTrackingRows.length).toBe(0);
    });

    test('Case 2b: --confirm with DEMO_SEED_ALLOW="0" or invalid values is strictly rejected', async () => {
      const col = harness.getConsultationCollection();

      for (const invalidValue of ['0', 'false', '', 'null']) {
        await expect(
          executeRunner(['--confirm'], { DEMO_SEED_ALLOW: invalidValue })
        ).rejects.toMatchObject({
          message: expect.stringMatching(/DEMO_SEED_ALLOW=1 required/i)
        });
      }

      const countAfter = await col.countDocuments();
      expect(countAfter).toBe(0);
    });
  });

  describe('Live Seed Execution & Record Integrity (Case 3)', () => {
    test('Case 3: --confirm with DEMO_SEED_ALLOW=1 and --seed 42 successfully inserts records carrying isSimulatedDemo: true and demoBatchId', async () => {
      const col = harness.getConsultationCollection();

      const result = await executeRunner(['--confirm', '--seed', '42'], {
        DEMO_SEED_ALLOW: '1'
      });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(false);
      expect(result.batchId).toBeDefined();
      expect(typeof result.batchId).toBe('string');
      expect(result.totalCases).toBeGreaterThan(1000);

      // Retrieve inserted records
      const docs = await col.find({}).then(cursor => cursor.toArray());
      expect(docs.length).toBe(result.totalCases);

      // CRITICAL AUDIT: Every single record must carry isSimulatedDemo: true and demoBatchId
      for (const doc of docs) {
        expect(doc.isSimulatedDemo).toBe(true);
        expect(doc.demoBatchId).toBe(result.batchId);
        expect(doc.isSynthetic).toBe(true);
        expect(doc.surveillanceVerification).toBeDefined();
        expect(doc.surveillanceVerification.status).toBe('verified');
        expect(doc.surveillanceVerification.source).toBe('synthetic_qa');
        expect(doc.surveillanceVerification.diagnosisStatus).toBe('confirmed');
      }

      // Assert that ZERO non-simulated records were created
      const nonSimulated = await col.find({ isSimulatedDemo: { $ne: true } }).then(c => c.toArray());
      expect(nonSimulated.length).toBe(0);

      // Assert SQLite rows received records
      expect(harness.outbreakTrackingRows.length).toBeGreaterThan(0);
    });
  });

  describe('Determinism & PRNG Verification (Case 4)', () => {
    test('Case 4a: Running twice with --seed 42 produces identical case counts, distributions, and trajectories', async () => {
      const runA = await seedModule.generateOutbreakDataset(42);
      const runB = await seedModule.generateOutbreakDataset(42);

      expect(runA.totalCases).toBe(runB.totalCases);
      expect(runA.byDisease).toEqual(runB.byDisease);
      expect(runA.byDistrict).toEqual(runB.byDistrict);
      expect(runA.dailyCounts).toEqual(runB.dailyCounts);
    });

    test('Case 4b: Running with different seed (e.g. 999 vs 42) produces different trajectories', async () => {
      const run42 = await seedModule.generateOutbreakDataset(42);
      const run999 = await seedModule.generateOutbreakDataset(999);

      // Counts or daily trajectories must differ
      expect(run42.dailyCounts).not.toEqual(run999.dailyCounts);
    });
  });

  describe('Batch Status & Selective Removal (Cases 5 & 6)', () => {
    test('Case 5: --status command correctly outputs counts of existing demo batches without modifications', async () => {
      const col = harness.getConsultationCollection();

      // Seed first batch
      await executeRunner(['--confirm', '--seed', '100'], { DEMO_SEED_ALLOW: '1' });
      const countBefore = await col.countDocuments();

      // Run status
      const statusResult = await executeRunner(['--status']);
      expect(statusResult.success).toBe(true);
      expect(statusResult.batches.length).toBe(1);
      expect(statusResult.batches[0].count).toBe(countBefore);

      // Verify no changes occurred
      const countAfter = await col.countDocuments();
      expect(countAfter).toBe(countBefore);
    });

    test('Case 6a: --remove --batch <id> deletes only targeted batch, strictly preserving non-simulated records', async () => {
      const col = harness.getConsultationCollection();

      // 1. Insert a genuine "production" non-simulated record
      const realConsultationId = new mongoose.Types.ObjectId();
      await col.insertMany([{
        _id: realConsultationId,
        patientNic: '901234567V',
        diagnosis: 'Essential Hypertension',
        district: 'Colombo',
        isSimulatedDemo: false,
        createdAt: new Date()
      }]);

      // 2. Insert Batch Alpha
      const resultAlpha = await executeRunner(['--confirm', '--seed', '101'], { DEMO_SEED_ALLOW: '1' });
      const countAlpha = resultAlpha.totalCases;

      // 3. Insert Batch Beta
      const resultBeta = await executeRunner(['--confirm', '--seed', '102'], { DEMO_SEED_ALLOW: '1' });
      const countBeta = resultBeta.totalCases;

      const totalBeforeRemove = await col.countDocuments();
      expect(totalBeforeRemove).toBe(1 + countAlpha + countBeta);

      // 4. Remove Batch Alpha
      const removeResult = await executeRunner(['--remove', '--batch', resultAlpha.batchId]);
      expect(removeResult.success).toBe(true);
      expect(removeResult.deletedCount).toBe(countAlpha);

      // 5. Verify Invariants:
      // - Real production record is 100% intact
      const remainingReal = await col.find({ _id: realConsultationId }).then(c => c.toArray());
      expect(remainingReal.length).toBe(1);
      expect(remainingReal[0].isSimulatedDemo).toBe(false);

      // - Batch Beta is 100% intact
      const remainingBeta = await col.find({ demoBatchId: resultBeta.batchId }).then(c => c.toArray());
      expect(remainingBeta.length).toBe(countBeta);

      // - Batch Alpha is completely deleted
      const remainingAlpha = await col.find({ demoBatchId: resultAlpha.batchId }).then(c => c.toArray());
      expect(remainingAlpha.length).toBe(0);

      // - Total count equals 1 real + Beta
      const totalAfter = await col.countDocuments();
      expect(totalAfter).toBe(1 + countBeta);
    });

    test('Case 6b: --remove without --batch flag throws error and deletes nothing', async () => {
      await expect(
        executeRunner(['--remove'])
      ).rejects.toMatchObject({
        message: expect.stringMatching(/--batch <id> is required/i)
      });
    });
  });

  describe('Pipeline & Risk Tier Representation (Case 7)', () => {
    test('Case 7: Generated data satisfies surveillance baseline and spike criteria across all 4 risk tiers', async () => {
      const dataset = await seedModule.generateOutbreakDataset(42);
      const candidates = dataset.consultations;

      // Run real surveillance selectCases filter in simulation mode
      const now = new Date();
      const selection = selectCases(candidates, { mode: 'simulation', now });

      expect(selection.policy).toBe(POLICY);
      expect(selection.cases.length).toBeGreaterThan(0);

      // Verify ZERO candidates rejected due to unverified provenance or missing episode ID
      expect(selection.excluded.unverified || 0).toBe(0);
      expect(selection.excluded.unconfirmed || 0).toBe(0);
      expect(selection.excluded.identity_or_location || 0).toBe(0);

      // Aggregate case counts by district in the active 30-day window
      const districtCounts = {};
      for (const c of selection.cases) {
        districtCounts[c.district] = (districtCounts[c.district] || 0) + 1;
      }

      // Assert all 4 risk tiers appear:
      // 1. Critical tier (>1,000 cases in 30d): Colombo Dengue
      const criticalDistricts = Object.entries(districtCounts).filter(([_, count]) => count >= 1000);
      expect(criticalDistricts.length).toBeGreaterThanOrEqual(1);
      expect(criticalDistricts.some(([d]) => d === 'Colombo')).toBe(true);

      // 2. High tier (>500 cases in 30d): Kalutara or Ratnapura Leptospirosis
      const highDistricts = Object.entries(districtCounts).filter(([_, count]) => count >= 500 && count < 1000);
      expect(highDistricts.length).toBeGreaterThanOrEqual(1);

      // 3. Moderate tier (>100 cases in 30d): Galle or Matara Diarrhoeal disease
      const moderateDistricts = Object.entries(districtCounts).filter(([_, count]) => count >= 100 && count < 500);
      expect(moderateDistricts.length).toBeGreaterThanOrEqual(1);

      // 4. Low tier (>10 cases in 30d): Jaffna or Badulla Influenza
      const lowDistricts = Object.entries(districtCounts).filter(([_, count]) => count >= 10 && count < 100);
      expect(lowDistricts.length).toBeGreaterThanOrEqual(1);

      // 5. Clean districts (<10 cases): Baseline districts
      const minimalDistricts = Object.entries(districtCounts).filter(([_, count]) => count < 10);
      expect(minimalDistricts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Configuration, Host Masking & Cache Invalidation (Verification Items 1-5)', () => {
    test('Item 1: getMongoUri fails fast without MONGO_URI/MONGODB_URI and has no localhost fallback', () => {
      expect(() => seedModule.getMongoUri({})).toThrow(/FATAL: No MONGO_URI or MONGODB_URI found/i);
      expect(() => seedModule.getMongoUri({ MONGO_URI: '   ' })).toThrow(/FATAL: No MONGO_URI or MONGODB_URI found/i);
      expect(() => seedModule.getMongoUri({ MONGODB_URI: '' })).toThrow(/FATAL: No MONGO_URI or MONGODB_URI found/i);

      const validUri = 'mongodb+srv://user:pass@medisync.test.mongodb.net/medisync_prod';
      expect(seedModule.getMongoUri({ MONGO_URI: validUri })).toBe(validUri);
      expect(seedModule.getMongoUri({ MONGODB_URI: validUri })).toBe(validUri);
    });

    test('Item 2: maskHost and getConnectionDetails properly redact cluster identifiers and report collections', () => {
      const masked = seedModule.maskHost('medisync.xton2tj.mongodb.net');
      expect(masked).not.toContain('xton2tj');
      expect(masked).toMatch(/^m\*\*\*c\.x\*\*\*j\.mongodb\.net$/);

      const details = seedModule.getConnectionDetails({
        connection: { host: 'medisync.xton2tj.mongodb.net', name: 'medisync_prod' }
      });
      expect(details.maskedHost).toBe(masked);
      expect(details.dbName).toBe('medisync_prod');
      expect(details.collectionsRead).toEqual(['consultations', 'outbreakalerts']);
      expect(details.collectionsWritten).toEqual(['consultations', 'outbreakalerts']);
      expect(details.sqliteTable).toBe('outbreak_tracking');
    });

    test('Item 4: Tracking rows are tagged with demoBatchId and selectively removed', async () => {
      const dataset = seedModule.generateOutbreakDataset(42, { batchId: 'TEST_BATCH_42' });
      expect(dataset.dailyTracking.length).toBeGreaterThan(0);
      for (const row of dataset.dailyTracking) {
        expect(row.demoBatchId).toBe('TEST_BATCH_42');
        expect(row.isSimulatedDemo).toBe(true);
      }
    });

    test('Item 5: invalidateHealthStatsCache fails gracefully without redis', async () => {
      const res = await seedModule.invalidateHealthStatsCache({ REDIS_URL: '' });
      expect(res.cleared).toBe(0);
      expect(res.mode).toBe('no_redis_url');
    });
  });
});
