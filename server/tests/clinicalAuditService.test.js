'use strict';

const assert = require('assert');
const {
  ACTIONS,
  OUTCOMES,
  recordClinicalEvent,
  recordClinicalFailure,
  maskNic,
  sanitizeDetails
} = require('../src/services/clinicalAuditService');

describe('ClinicalAuditService — Mandatory Service-Level Auditing Specification', () => {
  it('1. Fails closed if actorId is missing', async () => {
    await assert.rejects(
      async () => recordClinicalEvent({ actorRole: 'doctor', action: ACTIONS.CONSULTATION_CREATED }),
      /actorId is required/
    );
  });

  it('2. Fails closed if actorRole is missing', async () => {
    await assert.rejects(
      async () => recordClinicalEvent({ actorId: 'doc-123', action: ACTIONS.CONSULTATION_CREATED }),
      /actorRole is required/
    );
  });

  it('3. Fails closed if action is missing', async () => {
    await assert.rejects(
      async () => recordClinicalEvent({ actorId: 'doc-123', actorRole: 'doctor' }),
      /action is required/
    );
  });

  it('4. Correctly masks patient NIC', () => {
    assert.strictEqual(maskNic('199012345678'), '1990****5678');
    assert.strictEqual(maskNic('901234567V'), '9012****567V');
    assert.strictEqual(maskNic('123'), '****');
    assert.strictEqual(maskNic(null), 'N/A');
  });

  it('5. Strips sensitive PHI, tokens and passwords from audit metadata', () => {
    const dirty = {
      diagnosis: 'Acute Dengue Fever',
      symptoms: ['fever', 'joint pain'],
      notes: 'Confidential clinical discussion',
      jwtToken: 'eyJhbGciOi...',
      passwordHash: 'secret',
      drugName: 'Paracetamol',
      quantity: 10,
      authorized: true
    };
    const clean = sanitizeDetails(dirty);
    assert.strictEqual(clean.diagnosis, undefined);
    assert.strictEqual(clean.symptoms, undefined);
    assert.strictEqual(clean.notes, undefined);
    assert.strictEqual(clean.jwtToken, undefined);
    assert.strictEqual(clean.passwordHash, undefined);
    assert.strictEqual(clean.drugName, 'Paracetamol');
    assert.strictEqual(clean.quantity, 10);
    assert.strictEqual(clean.authorized, true);
  });

  it('6. Detects transaction boundary and returns audit record safely without capped collection conflict', async () => {
    const mockSession = {
      inTransaction: () => true
    };
    const result = await recordClinicalEvent({
      actorId: 'pharm-001',
      actorRole: 'pharmacist',
      action: ACTIONS.PRESCRIPTION_DISPENSED,
      resourceType: 'Dispensing',
      resourceId: 'disp-999',
      patientNic: '199012345678',
      session: mockSession
    });

    assert(result);
    assert.strictEqual(result.actorId, 'pharm-001');
    assert.strictEqual(result.actorRole, 'pharmacist');
    assert(result.action.includes('PRESCRIPTION_DISPENSED'));
    assert.strictEqual(result.accessedNic, '1990****5678');
    assert.strictEqual(result.outcome, OUTCOMES.SUCCESS);
  });

  it('7. Records failure outcomes truthfully without generating false success evidence', async () => {
    const mockSession = { inTransaction: () => true };
    const failureResult = await recordClinicalFailure({
      actorId: 'pharm-001',
      actorRole: 'pharmacist',
      action: ACTIONS.PRESCRIPTION_DISPENSED,
      resourceType: 'Dispensing',
      resourceId: 'disp-999',
      details: { reason: 'INSUFFICIENT_STOCK' },
      session: mockSession
    });

    assert(failureResult);
    assert.strictEqual(failureResult.outcome, OUTCOMES.FAILURE);
    assert(failureResult.action.includes('CLINICAL_FAILURE'));
  });
});
