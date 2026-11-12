'use strict';

jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

const mongoose = require('mongoose');
const { buildVivaSeedPlan } = require('../../scripts/seedVivaPlan.cjs');
const { assertAccountState } = require('../src/security/accountState');
const { currentMedicationNames } = require('../src/services/currentMedicationSafety');
const { validateSafetyAcknowledgment, computeClinicalFindings } = require('../src/utils/clinicalSafetyValidator');
const { previewConsultationSafety } = require('../src/controllers/prescriptionController');
const { getPublicApprovedAlerts } = require('../src/controllers/alertController');
const { parseArgs, mint } = require('../../scripts/mint_demo_verification_link');
const { appendStock } = require('../../scripts/seed_viva_pharmacy_stock');
const { countOwnedManifest } = require('../../scripts/vivaOwnerMaintenance.cjs');

const plan = buildVivaSeedPlan().documentsByModel;
const fixtureId = new mongoose.Types.ObjectId();
const fixtureIdString = String(fixtureId);
const response = () => ({ json: jest.fn(), status: jest.fn().mockReturnThis() });

afterEach(() => jest.restoreAllMocks());

test.each([
  ['Patient', 'patient'], ['Doctor', 'doctor'], ['Hospital', 'hospital_admin'],
  ['PharmacyStaff', 'pharmacist'], ['PharmacyStaff', 'pharmacy_admin'],
])('production admission rejects the real seed-shaped %s marker even with active verification flags (%s)', (model, role) => {
  const row = plan[model].find(account => account.role === role) || plan[model][0];
  expect(row.isActive).toBe(true);
  expect(row.isSynthetic).toBe(true);
  expect(() => assertAccountState({ role, id: row._id }, { ...row, role, isVerified: true }, { NODE_ENV: 'production' }))
    .toThrow('ACCOUNT_DENIED');
});

test('consultation safety preview uses hydrated active medications and the write validator rejects changed findings', async () => {
  const actor = { role: 'doctor', id: fixtureIdString };
  const medications = [
    { name: 'Warfarin (custom)' },
    { name: 'Ciprofloxacin 500mg', dosage: '500mg', frequency: 'BD', durationDays: 5 },
  ];
  const patient = { allergies: [], decryptFieldsSync: jest.fn() };
  const Prescription = require('../src/models/Prescription');
  const row = {
    status: 'dispensed', expiresAt: new Date(Date.now() + 86400000), consultationRef: 'CON-SYNTHETIC',
    drugName: 'encrypted-placeholder', __enc_drugName: true,
    decryptFieldsSync() { this.drugName = 'Warfarin 5mg'; this.__enc_drugName = false; },
  };
  jest.spyOn(require('../src/services/patientConsentService'), 'verifyPatientConsent').mockResolvedValue({ patientId: fixtureIdString });
  jest.spyOn(require('../src/models/Patient'), 'findById').mockResolvedValue(patient);
  jest.spyOn(Prescription, 'find').mockReturnValue({ limit: jest.fn().mockResolvedValue([row]) });

  const res = response();
  await previewConsultationSafety({ user: actor, body: { medications }, headers: {} }, res);
  const preview = res.json.mock.calls[0][0];
  const activePrescriptions = await currentMedicationNames(fixtureIdString, { includeReferences: true });
  const computed = computeClinicalFindings({
    medications, activePrescriptions,
    analyze: names => require('../src/utils/ingredientResolver').analyzeMedicationSafety(names, [], require('../src/controllers/drugController').COMMON_DRUGS),
  });
  expect(preview.findingsHash).toBe(computed.findingsHash);
  expect(preview.findings.some(finding => finding.type === 'drug_interaction')).toBe(true);
  expect(preview.findings.some(finding => finding.summary.includes('encrypted-placeholder'))).toBe(false);
  const ack = { acknowledged: true, reason: 'Reviewed synthetic test findings', findingsHash: preview.findingsHash };
  expect(validateSafetyAcknowledgment(ack, computed).valid).toBe(true);
  expect(validateSafetyAcknowledgment({ ...ack, findingsHash: 'tampered' }, computed).valid).toBe(false);
});

test('consultation safety denies consent failures before accessing patient or medication records', async () => {
  const read = jest.spyOn(require('../src/models/Patient'), 'findById');
  jest.spyOn(require('../src/services/patientConsentService'), 'verifyPatientConsent').mockRejectedValue(new Error('DENIED'));
  const res = response();
  await previewConsultationSafety({ body: { medications: [] }, headers: {} }, res);
  expect(res.status).toHaveBeenCalledWith(403);
  expect(read).not.toHaveBeenCalled();
});

test('public alert reads require approved real records and return only public fields', async () => {
  const find = jest.spyOn(require('../src/models/OutbreakAlert'), 'find').mockReturnValue({
    select: () => ({ sort: () => ({ lean: async () => [
      { _id: fixtureId, disease: 'ICD10:A010', location: 'Colombo', severity: 'High', affectedCount: 7, approvedBy: fixtureId },
    ] }) }),
  });
  const res = response();
  await getPublicApprovedAlerts({}, res);
  expect(find).toHaveBeenCalledWith(expect.objectContaining({
    status: 'Active', approvedBy: { $type: 'objectId' }, isSimulation: false,
    syntheticSeedBatch: { $exists: false },
  }));
  expect(res.json.mock.calls[0][0].data[0]).toEqual({
    _id: fixtureId, disease: 'Typhoid fever', location: 'Colombo', severity: 'High', affectedCount: 7,
  });
});

test('stock dry-run reads only the owned pharmacy batch and plans existing gaps', async () => {
  const find = jest.fn().mockReturnValue({ toArray: async () => [{ _id: fixtureId, inventory: [] }] });
  const updateOne = jest.fn();
  const db = { collection: jest.fn().mockReturnValue({ find, updateOne }) };
  const result = await appendStock({ db, manifest: { collections: { pharmacies: [fixtureId] } }, confirm: false });
  expect(result.pharmacies).toBe(1);
  expect(result.stockEntries).toBeGreaterThan(7);
  expect(find.mock.calls[0][0]).toEqual({
    _id: { $in: [fixtureId] }, syntheticSeedBatch: 'viva-2026-11', isSynthetic: true,
  });
  expect(updateOne).not.toHaveBeenCalled();
});

test('mint dry-run makes no write and each confirmed mint stores only its fresh token hash', async () => {
  const crypto = require('node:crypto');
  const insertOne = jest.fn().mockResolvedValue({ acknowledged: true, insertedId: fixtureId });
  const updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
  const collections = {
    consultations: { findOne: async () => ({ patientId: fixtureId }) },
    patients: { findOne: async () => ({ _id: fixtureId }) },
    verificationtokens: { insertOne },
    seed_manifests: { updateOne },
  };
  const context = {
    db: { databaseName: 'medisync_prod', collection: name => collections[name] },
    manifest: { _id: fixtureId, collections: { consultations: [fixtureId], patients: [fixtureId] } },
  };
  const args = parseArgs(['--consultation=' + fixtureIdString]);
  expect(await mint(context, args)).toEqual({ mintCount: 1, revokeCount: 0 });
  expect(insertOne).not.toHaveBeenCalled();
  expect(updateOne).not.toHaveBeenCalled();
  const first = await mint({ ...context, confirm: true }, args);
  const second = await mint({ ...context, confirm: true }, args);
  expect(first.url).not.toBe(second.url);
  const raw = first.url.split('/').pop();
  const stored = insertOne.mock.calls[0][0];
  expect(stored.tokenHash).toBe(crypto.createHash('sha256').update(raw).digest('hex'));
  expect(JSON.stringify(stored)).not.toContain(raw);
  expect(updateOne).toHaveBeenCalledTimes(2);

  const tokenLookup = jest.spyOn(require('../src/models/VerificationToken'), 'findOne').mockReturnValue({
    populate() { return this; },
    then(resolve) { return Promise.resolve({
      ...stored,
      consultationId: { consultationId: 'CON-SYNTHETIC' },
      patientRef: {},
      save: async () => {},
    }).then(resolve); },
  });
  const res = response();
  await require('../src/controllers/verificationController').getVerificationPublicStatus({ params: { token: raw } }, res);
  expect(tokenLookup).toHaveBeenCalledWith({ tokenHash: stored.tokenHash });
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ authentic: true, requiresOtpForClinical: true }));

});

test('post-QA verification counts only exact batch-owned manifest IDs', async () => {
  const countDocuments = jest.fn().mockResolvedValue(1);
  const collection = jest.fn().mockReturnValue({ countDocuments });
  const result = await countOwnedManifest({
    db: { collection },
    manifest: { collections: { consultations: [fixtureId], patients: [fixtureId], unrelated: [fixtureId] } },
  });
  expect(result).toEqual({
    consultations: { tracked: 1, present: 1 }, patients: { tracked: 1, present: 1 },
  });
  expect(collection.mock.calls.flat()).toEqual(['patients', 'consultations']);
  expect(countDocuments).toHaveBeenCalledWith({
    _id: { $in: [fixtureId] }, syntheticSeedBatch: 'viva-2026-11', isSynthetic: true,
  }, { maxTimeMS: 5000 });
});

test('hospital stored report checks ownership before reading and delivers verified PDF bytes for its own completed report', async () => {
  const controller = require('../src/controllers/labController');
  const storage = require('../src/services/labReportStorage');
  const report = { hospitalId: fixtureId, status: 'report_ready' };
  const restoreFinder = controller._findLabTestByIdentifier;
  const restoreFlag = process.env.PDF_EXPORT_ENABLED;
  controller._findLabTestByIdentifier = jest.fn().mockResolvedValue(report);
  process.env.PDF_EXPORT_ENABLED = 'true';
  try {
    const read = jest.spyOn(storage, 'downloadStoredReport').mockResolvedValue(Buffer.from('%PDF-synthetic'));
    const req = { params: { id: 'LAB-SYNTHETIC' }, query: { source: 'stored' }, user: { role: 'hospital_admin', id: String(new mongoose.Types.ObjectId()) } };
    const denied = response();
    await controller.exportLabReportPdf(req, denied);
    expect(denied.status).toHaveBeenCalledWith(403);
    expect(read).not.toHaveBeenCalled();
    const allowed = { ...response(), set: jest.fn(), send: jest.fn() };
    await controller.exportLabReportPdf({ ...req, user: { ...req.user, id: fixtureIdString } }, allowed);
    expect(read).toHaveBeenCalledWith(report);
    expect(allowed.set).toHaveBeenCalledWith(expect.objectContaining({ 'Content-Type': 'application/pdf' }));
    expect(allowed.send).toHaveBeenCalledWith(Buffer.from('%PDF-synthetic'));
  } finally {
    controller._findLabTestByIdentifier = restoreFinder;
    if (restoreFlag === undefined) delete process.env.PDF_EXPORT_ENABLED;
    else process.env.PDF_EXPORT_ENABLED = restoreFlag;
  }
});

test('drug search uses the existing Warfarin reference when the database has no matching catalog row', async () => {
  const Drug = require('../src/models/Drug');
  jest.spyOn(Drug, 'find').mockReturnValue({ limit: () => ({ select: async () => [] }) });
  const res = response();
  await require('../src/controllers/drugController').searchDrugs({ query: { q: 'Warfarin' } }, res);
  expect(res.json).toHaveBeenCalledWith({ data: [expect.objectContaining({
    genericName: 'Warfarin', referenceOnly: true, limitsStatus: 'unverified_owner_must_check',
  })] });
});

test('outbreak detector on seeded verified consultations triggers Gampaha Dengue and Kandy Influenza, suppresses Kalutara and Matara, and admin approval surfaces alerts publicly', async () => {
  const { evaluateOutbreakCriteria } = require('../src/services/surveillanceService');
  const now = new Date('2026-11-10T00:00:00.000Z');
  const seededConsultations = buildVivaSeedPlan({ now }).documentsByModel.Consultation.map(c => ({
    ...c,
    diseaseId: c.icdCode?.replace('.', '') || 'UNKNOWN',
    time: new Date(c.createdAt).getTime()
  }));

  const criteriaResults = evaluateOutbreakCriteria({ cases: seededConsultations, now, baselineDays: 56, level: 'district' });
  const gampahaDengue = criteriaResults.find(r => r.district === 'Gampaha' && r.disease.includes('A90'));
  expect(gampahaDengue).toBeDefined();
  expect(gampahaDengue.triggered).toBe(true);
  expect(gampahaDengue.severity).toBe('Critical');

  const kandyFlu = criteriaResults.find(r => r.district === 'Kandy' && (r.disease.includes('J11') || r.disease.includes('J10')));
  expect(kandyFlu).toBeDefined();
  expect(kandyFlu.triggered).toBe(true);
  expect(kandyFlu.severity).toBe('High');

  const kalutaraDengue = criteriaResults.find(r => r.district === 'Kalutara' && r.disease.includes('A90'));
  expect(kalutaraDengue).toBeDefined();
  expect(kalutaraDengue.triggered).toBe(false);
  expect(kalutaraDengue.reason).toBe('PERSISTENCE_CRITERIA_NOT_MET');

  const mataraDengue = criteriaResults.find(r => r.district === 'Matara' && r.disease.includes('A90'));
  expect(mataraDengue).toBeDefined();
  expect(mataraDengue.triggered).toBe(false);
  expect(mataraDengue.reason).toBe('CASE_FLOOR_NOT_MET');

  // Test admin approval transitions alert from Pending to Active and surfaces to public
  const OutbreakAlert = require('../src/models/OutbreakAlert');
  const pendingAlert = {
    _id: fixtureId,
    status: 'Pending',
    disease: 'ICD10:A90',
    location: 'Gampaha',
    severity: 'High',
    affectedCount: 12,
    surveillancePolicy: '5w-verified-episodes-v1',
    isSimulation: false,
    syntheticSeedBatch: undefined
  };

  jest.spyOn(OutbreakAlert, 'findById').mockResolvedValue(pendingAlert);
  jest.spyOn(OutbreakAlert, 'findOneAndUpdate').mockResolvedValue({
    ...pendingAlert,
    status: 'Active',
    approvedBy: fixtureId,
    approvedAt: new Date()
  });
  jest.spyOn(require('../src/services/notificationService'), 'notifyOutbreakAlert').mockResolvedValue(true);
  jest.spyOn(require('../src/models/AuditLog'), 'create').mockResolvedValue(true);

  const adminUser = { id: fixtureIdString, role: 'admin' };
  const adminReq = { params: { id: fixtureIdString }, user: adminUser, body: {} };
  const adminRes = response();

  const { approveAlert } = require('../src/controllers/adminController');
  await approveAlert(adminReq, adminRes);
  expect(OutbreakAlert.findOneAndUpdate).toHaveBeenCalledWith(
    { _id: fixtureId, status: 'Pending' },
    expect.objectContaining({ $set: expect.objectContaining({ status: 'Active', approvedBy: fixtureIdString }) }),
    { new: true }
  );

  // Verify public endpoint returns the active approved alert
  jest.spyOn(OutbreakAlert, 'find').mockReturnValue({
    select: () => ({ sort: () => ({ lean: async () => [
      { _id: fixtureId, disease: 'ICD10:A90', location: 'Gampaha', severity: 'High', affectedCount: 12, approvedBy: fixtureId }
    ] }) })
  });

  const publicRes = response();
  await getPublicApprovedAlerts({}, publicRes);
  expect(publicRes.json).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.arrayContaining([
      expect.objectContaining({ location: 'Gampaha', severity: 'High', affectedCount: 12 })
    ])
  }));
});

test('pharmacy inventory route returns logged-in pharmacy stock and handles unstocked dispensing safely', async () => {
  const { getInventory } = require('../src/controllers/pharmacyController');
  const PharmacyStaff = require('../src/models/PharmacyStaff');
  const Pharmacy = require('../src/models/Pharmacy');

  const staffDoc = { pharmacyId: fixtureId };
  const pharmacyDocWithStock = {
    _id: fixtureId,
    isActive: true,
    inventory: [
      { _id: new mongoose.Types.ObjectId(), drugName: 'Paracetamol 500mg', stock: 100, unit: 'tablets' },
      { _id: new mongoose.Types.ObjectId(), drugName: 'Amoxicillin 250mg', stock: 0, unit: 'capsules' }
    ]
  };

  jest.spyOn(PharmacyStaff, 'findById').mockReturnValue({
    select: () => ({ lean: async () => staffDoc })
  });
  jest.spyOn(Pharmacy, 'findOne').mockReturnValue({
    select: () => ({ lean: async () => pharmacyDocWithStock })
  });

  const req = { user: { id: fixtureIdString, role: 'pharmacist' } };
  const res = response();
  await getInventory(req, res);
  expect(res.json).toHaveBeenCalledWith({
    data: [{ _id: pharmacyDocWithStock.inventory[0]._id, drugName: 'Paracetamol 500mg', stock: 100, unit: 'tablets' }]
  });

  // Empty stock case
  jest.spyOn(Pharmacy, 'findOne').mockReturnValue({
    select: () => ({ lean: async () => ({ _id: fixtureId, isActive: true, inventory: [] }) })
  });
  const emptyRes = response();
  await getInventory(req, emptyRes);
  expect(emptyRes.json).toHaveBeenCalledWith({ data: [] });
});

test('stock seeding with --pharmacy-email supports owner pharmacy lookup and dry-run safety', async () => {
  const { parseStockArgs, appendStock: appendStockFn } = require('../../scripts/seed_viva_pharmacy_stock');
  const parsed = parseStockArgs(['--pharmacy-email=owner@medisync.local', '--dry-run']);
  expect(parsed.confirm).toBe(false);
  expect(parsed.pharmacyEmail).toBe('owner@medisync.local');

  const confirmParsed = parseStockArgs(['--confirm', '--pharmacy-email=owner@medisync.local']);
  expect(confirmParsed.confirm).toBe(true);
  expect(confirmParsed.pharmacyEmail).toBe('owner@medisync.local');

  const findOnePharmacy = jest.fn().mockResolvedValue(null);
  const findOneStaff = jest.fn().mockResolvedValue({ pharmacyId: fixtureId });
  const findOnePharmacyById = jest.fn().mockResolvedValue({ _id: fixtureId, inventory: [] });
  const updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });

  const db = {
    databaseName: 'medisync_prod',
    collection: (name) => {
      if (name === 'pharmacies') {
        return {
          findOne: (q) => q._id ? findOnePharmacyById(q) : findOnePharmacy(q),
          updateOne
        };
      }
      if (name === 'pharmacystaffs') return { findOne: findOneStaff };
      if (name === 'seed_manifests') return { updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }) };
      return {};
    }
  };

  const dryResult = await appendStockFn({
    db, manifest: { _id: fixtureId }, confirm: false, pharmacyEmail: 'owner@medisync.local'
  });
  expect(dryResult.pharmacies).toBe(1);
  expect(dryResult.stockEntries).toBeGreaterThan(5);
  expect(updateOne).not.toHaveBeenCalled();

  const confirmResult = await appendStockFn({
    db, manifest: { _id: fixtureId }, confirm: true, pharmacyEmail: 'owner@medisync.local'
  });
  expect(confirmResult.pharmacies).toBe(1);
  expect(confirmResult.stockEntries).toBeGreaterThan(5);
  expect(updateOne).toHaveBeenCalled();
});
