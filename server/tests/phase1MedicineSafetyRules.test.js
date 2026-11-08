'use strict';

const assert = require('assert');
const {
  evaluateMedicineSafety,
  evaluatePrescriptionSafety,
  findSafetyLimit,
  SAFETY_LIMITS,
} = require('../src/utils/medicineSafetyEngine');
const { checkMedicineSafety } = require('../src/controllers/prescriptionController');

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

describe('Sub-Project 3 Phase 1: Medicine Safety Rules Engine', () => {
  it('loads cited safety limits correctly', () => {
    assert(SAFETY_LIMITS && SAFETY_LIMITS.medicines, 'SAFETY_LIMITS must be loaded');
    const paracetamol = findSafetyLimit('Paracetamol');
    assert(paracetamol, 'Paracetamol limits must exist');
    assert.strictEqual(paracetamol.maxSingleDoseMg, 1000);
    assert.strictEqual(paracetamol.maxDailyDoseMg, 4000);
    assert.strictEqual(paracetamol.maxCourseDurationDays, 7);
    assert(paracetamol.source.includes('BNF') || paracetamol.source.includes('WHO'));
  });

  it('flags unconfigured medicines with pending_owner_data notice without crashing', async () => {
    const result = await evaluateMedicineSafety({
      medications: [{ name: 'NonExistentDrug123', dosage: '50mg', durationDays: 5 }],
    });
    assert.strictEqual(result.clinicalValidation, 'not_established');
    assert.strictEqual(result.hasActionableWarnings, false);
    assert.strictEqual(result.allowed, true);
    const infoNotice = result.warnings.find((w) => w.type === 'limits_unconfigured');
    assert(infoNotice, 'Must include limits_unconfigured notice');
    assert.strictEqual(infoNotice.status, 'pending_owner_data');
    assert.strictEqual(infoNotice.severity, 'info');
  });

  it('detects duplicate active ingredients across prescription lines', async () => {
    const result = await evaluateMedicineSafety({
      medications: [
        { name: 'Panadol', dosage: '500mg', durationDays: 3 },
        { name: 'Calpol', dosage: '250mg', durationDays: 3 },
      ],
    });
    assert.strictEqual(result.hasWarnings, true);
    const dupWarning = result.warnings.find(
      (w) => w.type === 'duplicate_ingredient' || w.type === 'duplicate_active_ingredient'
    );
    assert(dupWarning, 'Must flag duplicate active ingredient');
    assert(dupWarning.severity === 'high' || dupWarning.severity === 'moderate');
    assert.strictEqual(dupWarning.ingredient, 'acetaminophen');
  });

  it('detects course duration exceeding formulary safety limit', async () => {
    const result = await evaluateMedicineSafety({
      medications: [
        { name: 'Paracetamol', dosage: '500mg', durationDays: 14 },
      ],
    });
    assert.strictEqual(result.hasWarnings, true);
    const durWarning = result.warnings.find((w) => w.type === 'duration_limit_exceeded');
    assert(durWarning, 'Must flag course duration exceeding 7 days');
    assert.strictEqual(durWarning.severity, 'moderate');
    assert(durWarning.message.includes('exceeds recommended duration of 7 days'));
  });

  it('requires clinician acknowledgment with valid justification for actionable warnings', async () => {
    // 1. Without acknowledgment -> disallowed
    const unacknowledged = await evaluateMedicineSafety({
      medications: [
        { name: 'Panadol', dosage: '500mg', durationDays: 3 },
        { name: 'Calpol', dosage: '250mg', durationDays: 3 },
      ],
      acknowledgment: { acknowledged: false, reason: '' },
    });
    assert.strictEqual(unacknowledged.allowed, false);

    // 2. Acknowledged but reason too short (< 5 chars) -> disallowed
    const shortReason = await evaluateMedicineSafety({
      medications: [
        { name: 'Panadol', dosage: '500mg', durationDays: 3 },
        { name: 'Calpol', dosage: '250mg', durationDays: 3 },
      ],
      acknowledgment: { acknowledged: true, reason: 'ok' },
    });
    assert.strictEqual(shortReason.allowed, false);

    // 3. Acknowledged with valid clinical reason (>= 5 chars) -> allowed
    const validAck = await evaluateMedicineSafety({
      medications: [
        { name: 'Panadol', dosage: '500mg', durationDays: 3 },
        { name: 'Calpol', dosage: '250mg', durationDays: 3 },
      ],
      acknowledgment: {
        acknowledged: true,
        reason: 'Clinically indicated alternating schedule with dose monitoring',
      },
    });
    assert.strictEqual(validAck.allowed, true);
    assert(validAck.acknowledgment, 'Must preserve acknowledgment metadata');
  });

  it('checkMedicineSafety controller endpoint returns structured safety evaluation without PII', async () => {
    const req = {
      body: {
        medications: [
          { name: 'Paracetamol', dosage: '500mg', durationDays: 10 },
        ],
        acknowledgment: { acknowledged: false },
      },
      user: { id: '507f1f77bcf86cd799439011', role: 'doctor' },
    };
    const res = mockRes();
    await checkMedicineSafety(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.clinicalValidation, 'not_established');
    assert.strictEqual(res.body.hasWarnings, true);
    assert.strictEqual(res.body.allowed, false);
    // Verify no PII in body
    const bodyStr = JSON.stringify(res.body);
    assert(!bodyStr.includes('patientNic'), 'Must not leak patientNic');
    assert(!bodyStr.includes('"nic"'), 'Must not leak nic field');
  });
});
