'use strict';

/**
 * Task 1 (P0) — synthetic tagging of scan-created outbreak alerts.
 *
 * - Any alert whose contributing consultations include synthetic seed data is written with
 *   isDemoData=true, isSynthetic=true and the seed batch id.
 * - Approval of such an alert (district or nationwide) emails ONLY OUTBREAK_DEMO_EMAIL_ALLOWLIST,
 *   never real patients/clinicians, with the [DEMONSTRATION] prefix and red banner.
 * - Alerts created before tagging are detected through their source consultations; a failed
 *   lookup is treated as demonstration (fail closed).
 * - Real (non-demo) broadcast fails closed: it needs OUTBREAK_EMAIL_DELIVERY_ENABLED === 'true'.
 */

const mongoose = require('mongoose');

const mockConsultationCollection = { find: jest.fn(), countDocuments: jest.fn() };
jest.mock('../src/models/Consultation', () => ({ collection: mockConsultationCollection }));
jest.mock('../src/models/OutbreakAlert');
jest.mock('../src/models/OutbreakScan', () => ({ create: jest.fn().mockResolvedValue(null), findOne: jest.fn() }));
jest.mock('../src/models/AuditLog');
jest.mock('../src/models/Patient', () => ({ find: jest.fn() }));
jest.mock('../src/models/Hospital', () => ({ find: jest.fn() }));
jest.mock('../src/models/Doctor', () => ({ find: jest.fn() }));
jest.mock('../src/models/Pharmacy', () => ({ find: jest.fn() }));
jest.mock('../src/utils/emailService', () => ({ sendOutbreakAlert: jest.fn().mockResolvedValue({ success: true }) }));
jest.mock('../src/services/notificationService', () => ({ notifyOutbreakAlert: jest.fn().mockResolvedValue({}) }));
jest.mock('../src/utils/internalAuth', () => ({ generateToken: () => 'offline', verifyToken: () => false }));
jest.mock('axios', () => ({ post: jest.fn().mockRejectedValue(new Error('ML_OFFLINE')) }));

const OutbreakAlert = require('../src/models/OutbreakAlert');
const AuditLog = require('../src/models/AuditLog');
const Patient = require('../src/models/Patient');
const Hospital = require('../src/models/Hospital');
const Doctor = require('../src/models/Doctor');
const Pharmacy = require('../src/models/Pharmacy');
const emailService = require('../src/utils/emailService');
const service = require('../src/services/surveillanceService');
const delivery = require('../src/services/outbreakNotificationDelivery');
const { buildOutbreakAdvisoryEmail } = require('../src/services/outbreakEmailBuilder');
const adminController = require('../src/controllers/adminController');
const alertController = require('../src/controllers/alertController');

const ALLOWLIST = 'viva.supervisor@example.org, viva.examiner@example.org';
const REAL_USERS = [{ email: 'real.patient@example.org', district: 'Gampaha' }];
const DAY = 86400000;
const NOW = new Date('2026-11-10T06:00:00.000Z');

function response() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

function vivaConsultation(i, daysAgo, extra = {}) {
  const createdAt = new Date(service.getColomboMidnight(NOW) - daysAgo * DAY + 3 * 3600000);
  return {
    _id: new mongoose.Types.ObjectId(),
    patientId: new mongoose.Types.ObjectId(),
    createdAt,
    district: 'Gampaha',
    icdCode: 'A90',
    icdVersion: 'ICD10',
    syntheticSeedBatch: service.VIVA_DEMO_SEED_BATCH,
    isSynthetic: true,
    surveillanceVerification: {
      status: 'verified', source: 'clinical_review', verifiedBy: 'reviewer', caseDefinitionReference: 'WHO-2009',
      diagnosisStatus: 'confirmed', verifiedAt: createdAt, episodeId: `ep-${i}`,
    },
    ...extra,
  };
}

const vivaAlert = () => ({
  _id: new mongoose.Types.ObjectId(),
  disease: 'Dengue', location: 'Gampaha', district: 'Gampaha', severity: 'Critical', status: 'Pending',
  surveillancePolicy: service.POLICY, isSimulation: false, isDemoData: true, isSynthetic: true,
  syntheticSeedBatch: service.VIVA_DEMO_SEED_BATCH,
});

const realAlert = () => ({
  _id: new mongoose.Types.ObjectId(),
  disease: 'Dengue', location: 'Gampaha', district: 'Gampaha', severity: 'Critical', status: 'Pending',
  surveillancePolicy: service.POLICY, isSimulation: false, isDemoData: false,
});

function leanResolving(rows) {
  return { select: () => ({ lean: async () => rows }) };
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.OUTBREAK_EMAIL_DELIVERY_ENABLED;
  process.env.OUTBREAK_DEMO_EMAIL_ALLOWLIST = ALLOWLIST;
  AuditLog.create = jest.fn().mockResolvedValue({});
  for (const Model of [Patient, Hospital, Doctor, Pharmacy]) Model.find.mockReturnValue(leanResolving(REAL_USERS));
  mockConsultationCollection.countDocuments.mockResolvedValue(0);
});

afterAll(() => {
  delete process.env.OUTBREAK_DEMO_EMAIL_ALLOWLIST;
  delete process.env.OUTBREAK_EMAIL_DELIVERY_ENABLED;
});

describe('Task 1 — scan-created alerts carry synthetic provenance', () => {
  test('selectCases keeps the seed batch on viva cases while still counting them as real-mode cases', () => {
    const { cases } = service.selectCases([vivaConsultation(1, 1)], { mode: 'real', now: NOW });
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ isSynthetic: true, syntheticSeedBatch: service.VIVA_DEMO_SEED_BATCH });
  });

  test('alertProvenance labels any bucket containing synthetic cases as demonstration data', () => {
    const tagged = service.alertProvenance('real', { hasSynthetic: true, syntheticSeedBatches: new Set([service.VIVA_DEMO_SEED_BATCH]) });
    expect(tagged).toMatchObject({ isSimulation: false, isDemoData: true, isSynthetic: true, syntheticSeedBatch: service.VIVA_DEMO_SEED_BATCH });
    expect(tagged.syntheticLabel).toMatch(/Demonstration/);
    expect(service.alertProvenance('real', { hasSynthetic: false, syntheticSeedBatches: new Set() })).toEqual({ isSimulation: false, isDemoData: false });
  });

  test('runAnalysis writes isDemoData=true and the seed batch onto the alert it upserts', async () => {
    const docs = [];
    let n = 0;
    for (const [daysAgo, count] of [[3, 3], [2, 3], [1, 3]]) for (let k = 0; k < count; k++) docs.push(vivaConsultation(n++, daysAgo));
    mockConsultationCollection.find.mockReturnValue({ toArray: async () => docs });
    OutbreakAlert.updateOne = jest.fn().mockResolvedValue({});
    OutbreakAlert.findById = jest.fn().mockReturnValue({ lean: async () => null });

    const summary = await service.runAnalysis({ mode: 'real', now: NOW });

    expect(OutbreakAlert.updateOne).toHaveBeenCalledTimes(1);
    const update = OutbreakAlert.updateOne.mock.calls[0][1];
    expect(update.$set).toMatchObject({ isDemoData: true, isSynthetic: true, syntheticSeedBatch: service.VIVA_DEMO_SEED_BATCH });
    expect(update.$setOnInsert.isSimulation).toBe(false);
    expect(update.$set).not.toHaveProperty('isSimulation');
    expect(summary.results[0]).toMatchObject({ isDemoData: true, syntheticSeedBatch: service.VIVA_DEMO_SEED_BATCH });
  });
});

describe('Task 1 — approval of a viva alert reaches only the allowlist', () => {
  test.each([
    ['district', {}],
    ['national', { confirmationDisease: 'Dengue' }],
  ])('scope %s sends only to OUTBREAK_DEMO_EMAIL_ALLOWLIST with [DEMONSTRATION] prefix and red banner', async (scope, extraBody) => {
    const alert = vivaAlert();
    OutbreakAlert.findById = jest.fn().mockResolvedValue(alert);
    OutbreakAlert.findOneAndUpdate = jest.fn().mockResolvedValue({ ...alert, status: 'Active', emailScope: scope, metrics72h: { currentCases: 9 } });

    const res = response();
    await adminController.approveAlert({ params: { id: String(alert._id) }, body: { emailScope: scope, ...extraBody }, user: { id: String(new mongoose.Types.ObjectId()), role: 'admin', email: 'reviewer@example.org' } }, res);

    for (const Model of [Patient, Hospital, Doctor, Pharmacy]) expect(Model.find).not.toHaveBeenCalled();
    expect(emailService.sendOutbreakAlert).toHaveBeenCalledTimes(1);
    const [emails, payload] = emailService.sendOutbreakAlert.mock.calls[0];
    expect(emails).toEqual(['viva.supervisor@example.org', 'viva.examiner@example.org']);
    expect(payload.subject).toMatch(/^\[DEMONSTRATION\] /);
    expect(payload.html).toContain('data-demo-banner="true"');
    expect(payload.html).toContain('#D32F2F');
    expect(res.json.mock.calls[0][0].emailDelivery).toMatchObject({ attempted: true, isDemonstration: true, recipientCount: 2 });
  });

  test('a pre-fix alert with no flags is still confined to the allowlist when its source cases are synthetic', async () => {
    const alert = { ...realAlert(), sourceConsultationIds: [new mongoose.Types.ObjectId()] };
    mockConsultationCollection.countDocuments.mockResolvedValue(1);
    OutbreakAlert.findById = jest.fn().mockResolvedValue(alert);
    OutbreakAlert.findOneAndUpdate = jest.fn().mockResolvedValue({ ...alert, status: 'Active', metrics72h: { currentCases: 9 } });

    await adminController.approveAlert({ params: { id: String(alert._id) }, body: { emailScope: 'district' }, user: { id: String(new mongoose.Types.ObjectId()), role: 'admin' } }, response());

    for (const Model of [Patient, Hospital, Doctor, Pharmacy]) expect(Model.find).not.toHaveBeenCalled();
    expect(emailService.sendOutbreakAlert.mock.calls[0][0]).toEqual(['viva.supervisor@example.org', 'viva.examiner@example.org']);
    expect(emailService.sendOutbreakAlert.mock.calls[0][1].subject).toMatch(/^\[DEMONSTRATION\] /);
  });

  test('provenance lookup failure is treated as demonstration (fail closed)', async () => {
    mockConsultationCollection.countDocuments.mockRejectedValue(new Error('DB_DOWN'));
    await expect(delivery.isDemoOutbreakAlert({ sourceConsultationIds: [new mongoose.Types.ObjectId()] })).resolves.toBe(true);
  });

  test('demo alert with empty allowlist and no reviewer email resolves no recipients (no hardcoded mailbox)', async () => {
    delete process.env.OUTBREAK_DEMO_EMAIL_ALLOWLIST;
    const result = await delivery.resolveOutbreakRecipients(vivaAlert(), 'national', 100, {});
    expect(result.isDemonstration).toBe(true);
    expect(result.recipients).toEqual([]);
  });

  test('email builder treats isDemoData as demonstration', () => {
    const email = buildOutbreakAdvisoryEmail({ disease: 'Dengue', location: 'Gampaha', severity: 'High', isDemoData: true, metrics72h: { currentCases: 1 } });
    expect(email.subject).toMatch(/^\[DEMONSTRATION\] /);
  });
});

describe('Task 1 — real broadcast fails closed', () => {
  test('policy: demo delivery on unless flag is "false"; real delivery only when flag is exactly "true"', () => {
    expect(delivery.isOutbreakDeliveryEnabled(true, {})).toBe(true);
    expect(delivery.isOutbreakDeliveryEnabled(true, { OUTBREAK_EMAIL_DELIVERY_ENABLED: 'false' })).toBe(false);
    expect(delivery.isOutbreakDeliveryEnabled(false, {})).toBe(false);
    expect(delivery.isOutbreakDeliveryEnabled(false, { OUTBREAK_EMAIL_DELIVERY_ENABLED: 'yes' })).toBe(false);
    expect(delivery.isOutbreakDeliveryEnabled(false, { OUTBREAK_EMAIL_DELIVERY_ENABLED: 'true' })).toBe(true);
  });

  test.each([[undefined], ['false']])('real alert with OUTBREAK_EMAIL_DELIVERY_ENABLED=%s sends nothing and is dashboard-only', async (flag) => {
    if (flag !== undefined) process.env.OUTBREAK_EMAIL_DELIVERY_ENABLED = flag;
    const alert = realAlert();
    OutbreakAlert.findById = jest.fn().mockResolvedValue(alert);
    OutbreakAlert.findOneAndUpdate = jest.fn().mockResolvedValue({ ...alert, status: 'Active', emailScope: 'none' });

    const res = response();
    await adminController.approveAlert({ params: { id: String(alert._id) }, body: { emailScope: 'national', confirmationDisease: 'Dengue' }, user: { id: String(new mongoose.Types.ObjectId()), role: 'admin' } }, res);

    expect(emailService.sendOutbreakAlert).not.toHaveBeenCalled();
    for (const Model of [Patient, Hospital, Doctor, Pharmacy]) expect(Model.find).not.toHaveBeenCalled();
    expect(OutbreakAlert.findOneAndUpdate.mock.calls[0][1].$set.emailScope).toBe('none');
    expect(res.json.mock.calls[0][0].emailDelivery).toMatchObject({ skipped: true, reason: 'OUTBREAK_EMAIL_DELIVERY_DISABLED', sentCount: 0 });
  });

  test('recipient preview reports delivery disabled for a real alert when the flag is unset', async () => {
    OutbreakAlert.findById = jest.fn().mockResolvedValue(realAlert());
    const res = response();
    await adminController.previewOutbreakRecipients({ params: { id: 'x' }, query: { scope: 'district' }, user: { role: 'admin' } }, res);
    expect(res.json.mock.calls[0][0]).toMatchObject({ isDemonstration: false, deliveryEnabled: false });
  });
});

describe('Task 1 — labelled demonstration alerts stay visible', () => {
  function findReturning(byCall) {
    let call = 0;
    return jest.fn(() => {
      const rows = byCall[call++] || [];
      return { select: () => ({ sort: () => ({ lean: async () => rows }) }) };
    });
  }

  test('public approved alerts include viva alerts only with an explicit demonstration label', async () => {
    const realRow = { _id: new mongoose.Types.ObjectId(), disease: 'ICD10:A01', location: 'Colombo', severity: 'High', affectedCount: 7 };
    const demoRow = { _id: new mongoose.Types.ObjectId(), disease: 'ICD10:A90', location: 'Gampaha', severity: 'Critical', affectedCount: 9 };
    OutbreakAlert.find = findReturning([[realRow], [demoRow]]);
    const res = response();
    await alertController.getPublicApprovedAlerts({}, res);
    expect(OutbreakAlert.find.mock.calls[1][0]).toMatchObject({ syntheticSeedBatch: service.VIVA_DEMO_SEED_BATCH, status: 'Active', isSimulation: false });
    const data = res.json.mock.calls[0][0].data;
    expect(data[0]).not.toHaveProperty('isDemonstration');
    expect(data[1]).toMatchObject({ location: 'Gampaha', isDemonstration: true, syntheticLabel: expect.stringMatching(/Demonstration/) });
  });
});
