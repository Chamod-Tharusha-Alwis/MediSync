'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const Dispensing = require('../src/models/Dispensing');
const PharmacyStaff = require('../src/models/PharmacyStaff');
const pharmacyController = require('../src/controllers/pharmacyController');
const {
  SEED_NAMESPACE,
  parseCliArgs,
  runDispensingSampleSeed,
  getMongooseInstance,
} = require('../../scripts/seed-dispensing-sample');

describe('Phase 3 — Grouped Prescriptions, Receipt History, Analytics & SEED_2026_11_B Seeder', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('3.1 Patient Active Prescriptions group by consultation with all medications and individual statuses', () => {
    const helperSource = fs.readFileSync(
      path.join(__dirname, '../../client/src/utils/patientPrescriptionStatus.js'),
      'utf8'
    );
    const cjsSource =
      helperSource.replace(/export\s+function\s+/g, 'function ') +
      '\nmodule.exports = { isActivePrescription, resolvePrescriptionStatus, groupPrescriptionsByConsultation, patientDashboardTimeline };';
    const mod = { exports: {} };
    new Function('module', 'exports', cjsSource)(mod, mod.exports);
    const { groupPrescriptionsByConsultation } = mod.exports;

    const now = Date.parse('2026-11-08T00:00:00Z');
    const prescriptions = [
      {
        _id: 'rx-1',
        prescriptionId: 'RX-101',
        consultationRef: 'CON-500',
        status: 'issued',
        expiresAt: '2026-12-01T00:00:00Z',
        diagnosis: 'Viral Fever',
        medications: [
          { name: 'Paracetamol', dosage: '500mg', frequency: 'TDS' },
          { name: 'Cetirizine', dosage: '10mg', frequency: 'OD' },
        ],
      },
      {
        _id: 'rx-2',
        prescriptionId: 'RX-102',
        consultationRef: 'CON-500',
        status: 'dispensed',
        expiresAt: '2026-12-01T00:00:00Z',
        drugName: 'Vitamin C',
        dosage: '500mg',
        frequency: 'OD',
      },
    ];

    const grouped = groupPrescriptionsByConsultation(prescriptions, [], now);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].consultationRef).toBe('CON-500');
    expect(grouped[0].hasActiveMedication).toBe(true);
    expect(grouped[0].medications).toHaveLength(3);
    expect(grouped[0].medications.map(m => `${m.name}:${m.status}`)).toEqual([
      'Paracetamol:issued',
      'Cetirizine:issued',
      'Vitamin C:dispensed',
    ]);
  });

  test('3.2 Pharmacy Dispensation History groups rows by Receipt Number with all medications listed together', () => {
    const staffId = new mongoose.Types.ObjectId();
    const grouped = pharmacyController.groupDispensingHistoryByReceipt([
      {
        _id: new mongoose.Types.ObjectId(),
        receiptNumber: 'RCP-GROUP-001',
        patientNic: '199412345678',
        staffId: { _id: staffId, fullName: 'Lead Pharmacist' },
        createdAt: new Date('2026-11-07T10:00:00Z'),
        items: [
          { drugName: 'Paracetamol', dosage: '500mg', quantityDispensed: 10, unit: 'tablets' },
        ],
      },
      {
        _id: new mongoose.Types.ObjectId(),
        receiptNumber: 'RCP-GROUP-001',
        patientNic: '199412345678',
        staffId: { _id: staffId, fullName: 'Lead Pharmacist' },
        createdAt: new Date('2026-11-07T10:00:01Z'),
        items: [
          { drugName: 'Amoxicillin', dosage: '500mg', quantityDispensed: 15, unit: 'capsules' },
        ],
      },
    ]);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].receiptNumber).toBe('RCP-GROUP-001');
    expect(grouped[0].medicationCount).toBe(2);
    expect(grouped[0].medications.map(m => m.drugName)).toEqual(['Paracetamol', 'Amoxicillin']);
    expect(grouped[0].medicationSummary).toContain('Paracetamol 500mg (10 tablets)');
    expect(grouped[0].medicationSummary).toContain('Amoxicillin 500mg (15 capsules)');
  });

  test('3.4 SEED_2026_11_B seeder defaults to dry-run, enforces approval flag, is idempotent, and isolates namespaces', async () => {
    const pharmacyId = new mongoose.Types.ObjectId();
    const staffId = new mongoose.Types.ObjectId();
    const prescriptionId = new mongoose.Types.ObjectId();

    const inMemoryDispensing = [
      {
        _id: new mongoose.Types.ObjectId(),
        prescriptionId,
        pharmacyId,
        staffId,
        patientNic: '199011112222',
        receiptNumber: 'RCP-SEED-202611A-001',
        items: [
          { drugName: 'Losartan', dosage: '50mg', quantityDispensed: 28, unit: 'tablets', status: 'dispensed' },
        ],
        dispensedAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
        isSynthetic: true,
        syntheticSeedBatch: 'SEED_2026_11_A',
      },
    ];

    jest.spyOn(Dispensing, 'countDocuments').mockImplementation(async (filter = {}) => {
      if (filter.syntheticSeedBatch) {
        return inMemoryDispensing.filter(d => d.syntheticSeedBatch === filter.syntheticSeedBatch).length;
      }
      return inMemoryDispensing.length;
    });

    jest.spyOn(Dispensing, 'findOne').mockImplementation(filter => ({
      lean: async () => inMemoryDispensing.find(d => d.receiptNumber === filter.receiptNumber) || null,
    }));

    jest.spyOn(Dispensing, 'create').mockImplementation(async doc => {
      const copy = { ...doc };
      inMemoryDispensing.push(copy);
      return copy;
    });

    jest.spyOn(Dispensing, 'updateOne').mockImplementation(async (filter, update) => {
      const idx = inMemoryDispensing.findIndex(d => String(d._id) === String(filter._id));
      if (idx !== -1 && update?.$set) {
        inMemoryDispensing[idx] = { ...inMemoryDispensing[idx], ...update.$set };
      }
      return { modifiedCount: idx !== -1 ? 1 : 0 };
    });

    jest.spyOn(PharmacyStaff, 'findById').mockImplementation(() => ({
      populate: async () => ({
        _id: staffId,
        pharmacyId: { _id: pharmacyId, name: 'Analytics Test Pharmacy', district: 'Colombo' },
      }),
    }));

    jest.spyOn(Dispensing, 'aggregate').mockImplementation(async pipeline => {
      const matchStage = pipeline.find(s => s.$match)?.$match || {};
      const orClauses = matchStage.$or || [];
      const rangeClause = orClauses[0]?.dispensedAt || {};
      const gte = rangeClause.$gte ? new Date(rangeClause.$gte).getTime() : 0;
      const lte = rangeClause.$lte ? new Date(rangeClause.$lte).getTime() : Infinity;

      const matched = inMemoryDispensing.filter(d => {
        if (String(d.pharmacyId) !== String(matchStage.pharmacyId)) return false;
        const ts = new Date(d.dispensedAt).getTime();
        return ts >= gte && ts <= lte;
      });

      const byDrug = new Map();
      for (const doc of matched) {
        for (const item of doc.items || []) {
          const key = item.drugName.trim().toLowerCase();
          if (!byDrug.has(key)) {
            byDrug.set(key, {
              _id: key,
              displayName: item.drugName,
              unit: item.unit || 'units',
              totalDispensed: 0,
              dispenseEvents: 0,
            });
          }
          const entry = byDrug.get(key);
          entry.totalDispensed += Number(item.quantityDispensed) || 1;
          entry.dispenseEvents += 1;
        }
      }
      return [...byDrug.values()].sort((a, b) => b.totalDispensed - a.totalDispensed);
    });

    // 1. Default invocation is DRY_RUN and writes 0 documents
    expect(parseCliArgs(['--db', 'medisync_automated_test']).dryRun).toBe(true);
    expect(parseCliArgs(['--help']).isHelp).toBe(true);
    expect(parseCliArgs(['-h']).helpText).toContain('Usage: node scripts/seed-dispensing-sample.js');
    const dryRunRes = await runDispensingSampleSeed({
      args: ['--db', 'medisync_automated_test'],
      env: {},
      pharmacyId,
      staffId,
      prescriptionId,
    });
    expect(dryRunRes.mode).toBe('DRY_RUN');
    expect(dryRunRes.plannedRecords).toBe(60);
    expect(await Dispensing.countDocuments({ syntheticSeedBatch: SEED_NAMESPACE })).toBe(0);

    // 2. --confirm without approval env var is rejected
    await expect(
      runDispensingSampleSeed({
        args: ['--db', 'medisync_automated_test', '--confirm'],
        env: {},
        pharmacyId,
        staffId,
        prescriptionId,
      })
    ).rejects.toMatchObject({ code: 'SEED_WRITE_APPROVAL_REQUIRED' });

    // 3. Before seeding SEED_2026_11_B, 24h analytics returns 0
    const emptyResPayload = await new Promise((resolve, reject) => {
      pharmacyController.getDispensingAnalytics(
        { user: { id: String(staffId) }, query: { range: '24h' } },
        {
          status: code => ({ json: body => reject(new Error(`Unexpected ${code}: ${JSON.stringify(body)}`)) }),
          json: body => resolve(body),
        }
      );
    });
    expect(emptyResPayload.data).toEqual([]);
    expect(emptyResPayload.meta.drugsAnalyzed).toBe(0);

    // 4. First approved apply inserts 60 records
    const firstApply = await runDispensingSampleSeed({
      args: ['--db', 'medisync_automated_test', '--confirm'],
      env: { MEDISYNC_SEED_RUN_APPROVAL: 'SEED RUN APPROVED' },
      pharmacyId,
      staffId,
      prescriptionId,
    });
    expect(firstApply.mode).toBe('APPLY');
    expect(firstApply.insertedCount).toBe(60);
    expect(firstApply.finalOwnedCount).toBe(60);

    // 5. Second approved apply is idempotent (0 new inserts, 60 updates, total stays 60)
    const secondApply = await runDispensingSampleSeed({
      args: ['--db', 'medisync_automated_test', '--confirm'],
      env: { MEDISYNC_SEED_RUN_APPROVAL: 'SEED RUN APPROVED' },
      pharmacyId,
      staffId,
      prescriptionId,
    });
    expect(secondApply.insertedCount).toBe(0);
    expect(secondApply.updatedCount).toBe(60);
    expect(secondApply.finalOwnedCount).toBe(60);

    // 6. Pre-existing SEED_2026_11_A record is untouched
    expect(await Dispensing.countDocuments({ syntheticSeedBatch: 'SEED_2026_11_A' })).toBe(1);

    // 7. 30d analytics now returns populated medication volumes
    const populatedResPayload = await new Promise((resolve, reject) => {
      pharmacyController.getDispensingAnalytics(
        { user: { id: String(staffId) }, query: { range: '30d' } },
        {
          status: code => ({ json: body => reject(new Error(`Unexpected ${code}: ${JSON.stringify(body)}`)) }),
          json: body => resolve(body),
        }
      );
    });
    expect(populatedResPayload.data.length).toBeGreaterThan(0);
    expect(populatedResPayload.meta.drugsAnalyzed).toBeGreaterThan(0);
  });

  test('3.6 Seeder script and models share the exact same Mongoose instance and dry-run executes without buffering timeout', async () => {
    const seederMongoose = getMongooseInstance();
    const serverMongoose = require('../src/models/Pharmacy').base;
    expect(seederMongoose).toBe(serverMongoose);

    // Assert require.resolve equality for server/node_modules/mongoose
    const resolvedFromSeeder = require.resolve('mongoose', { paths: [path.resolve(__dirname, '../../server')] });
    const resolvedFromServer = require.resolve('mongoose', { paths: [path.resolve(__dirname, '../src/models')] });
    expect(resolvedFromSeeder).toBe(resolvedFromServer);

    const Pharmacy = require('../src/models/Pharmacy');
    const mockPharmFindOne = jest.spyOn(Pharmacy, 'findOne').mockReturnValue({
      select: () => ({
        lean: async () => ({ _id: new mongoose.Types.ObjectId() })
      })
    });

    const PharmacyStaff = require('../src/models/PharmacyStaff');
    const mockStaffFindOne = jest.spyOn(PharmacyStaff, 'findOne').mockReturnValue({
      select: () => ({
        lean: async () => ({ _id: new mongoose.Types.ObjectId(), pharmacyId: new mongoose.Types.ObjectId() })
      })
    });

    const dryRunRes = await runDispensingSampleSeed({
      args: ['--db', 'medisync_automated_test', '--dry-run'],
      env: {},
    });

    expect(dryRunRes.mode).toBe('DRY_RUN');
    expect(dryRunRes.plannedRecords).toBe(60);

    mockPharmFindOne.mockRestore();
    mockStaffFindOne.mockRestore();
  });
});
