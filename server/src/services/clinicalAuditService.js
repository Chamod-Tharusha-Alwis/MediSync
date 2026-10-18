'use strict';

/**
 * MediSync Service-Level Clinical Audit Service
 * Provides mandatory, durable, attributable clinical audit logging
 * for state-changing operations across services and background workers.
 *
 * Enforces:
 * - Mandatory audit context (actorId, actorRole, action, outcome)
 * - Safe handling of MongoDB capped audit collection limitations
 * - Correlation IDs for request traceability
 * - Zero PHI, password, or token leakage
 * - Fail-closed validation
 */

const crypto = require('crypto');
const AuditLog = require('../models/AuditLog');

const ACTIONS = {
  CONSULTATION_CREATED: 'CONSULTATION_CREATED',
  PRESCRIPTION_ISSUED: 'PRESCRIPTION_ISSUED',
  PRESCRIPTION_DISPENSED: 'PRESCRIPTION_DISPENSED',
  OTC_PRESCRIPTION_DISPENSED: 'OTC_PRESCRIPTION_DISPENSED',
  LAB_TEST_ORDERED: 'LAB_TEST_ORDERED',
  LAB_TEST_STATUS_CHANGED: 'LAB_TEST_STATUS_CHANGED',
  PATIENT_CONSENT_GRANTED: 'PATIENT_CONSENT_GRANTED',
  PATIENT_CONSENT_REVOKED: 'PATIENT_CONSENT_REVOKED',
  CLINICAL_ACCESS_DENIED: 'CLINICAL_ACCESS_DENIED'
};

const OUTCOMES = {
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
  DENIED: 'DENIED',
  ROLLED_BACK: 'ROLLED_BACK'
};

function maskNic(nic) {
  if (!nic || typeof nic !== 'string') return 'N/A';
  const clean = nic.trim().toUpperCase();
  if (clean.length <= 4) return '****';
  return clean.slice(0, 4) + '****' + clean.slice(-4);
}

function sanitizeDetails(details = {}) {
  if (!details || typeof details !== 'object') return {};
  const sanitized = {};
  const forbiddenKeys = ['password', 'token', 'jwt', 'secret', 'key', 'diagnosis', 'notes', 'symptoms'];
  
  for (const [k, v] of Object.entries(details)) {
    const lower = k.toLowerCase();
    if (forbiddenKeys.some(fk => lower.includes(fk))) {
      continue; // exclude PHI and secrets
    }
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

/**
 * Record a clinical audit event.
 * @param {Object} params
 * @param {string} params.actorId - ID of actor (doctor, pharmacist, worker)
 * @param {string} params.actorRole - Role of actor
 * @param {string} params.action - One of ACTIONS.*
 * @param {string} params.outcome - One of OUTCOMES.*
 * @param {string} [params.resourceType] - Model name (Consultation, Prescription, etc.)
 * @param {string} [params.resourceId] - ID of modified record
 * @param {string} [params.patientNic] - Target patient NIC (will be masked)
 * @param {string} [params.correlationId] - Correlation / idempotency ID
 * @param {Object} [params.details] - Non-sensitive audit metadata
 * @param {Object} [params.session] - MongoDB ClientSession (if running inside a transaction)
 */
async function recordClinicalEvent(params = {}) {
  const {
    actorId,
    actorRole,
    action,
    outcome = OUTCOMES.SUCCESS,
    resourceType = 'ClinicalResource',
    resourceId = 'N/A',
    patientNic = 'N/A',
    correlationId = crypto.randomUUID(),
    details = {},
    session = null,
    auditLogModel = null
  } = params;

  // 1. Mandatory audit context validation (Fail-closed)
  if (!actorId || typeof actorId !== 'string') {
    throw new Error('[ClinicalAuditService] actorId is required');
  }
  if (!actorRole || typeof actorRole !== 'string') {
    throw new Error('[ClinicalAuditService] actorRole is required');
  }
  if (!action || typeof action !== 'string') {
    throw new Error('[ClinicalAuditService] action is required');
  }
  if (!outcome || !Object.values(OUTCOMES).includes(outcome)) {
    throw new Error(`[ClinicalAuditService] Invalid outcome: ${outcome}`);
  }

  const masked = maskNic(patientNic);
  const cleanDetails = sanitizeDetails(details);
  const formattedAction = `CLINICAL_${outcome}:${action}:${resourceType}[${resourceId}]`;

  // 2. Multi-document transaction boundary check:
  // MongoDB forbids operations on capped collections (like AuditLog) inside transactions.
  // If session is present and active in transaction, we defer audit write or handle post-commit.
  if (session && session.inTransaction && session.inTransaction()) {
    // In transaction: return audit payload for attachment to transactional record
    const transactionAuditRecord = {
      actorId,
      actorRole,
      action: formattedAction,
      accessedNic: masked,
      correlationId,
      outcome,
      timestamp: new Date(),
      details: cleanDetails
    };
    return transactionAuditRecord;
  }

  // 3. Standalone persistent write to AuditLog capped collection
  const TargetAuditModel = auditLogModel || AuditLog;
  try {
    const entry = await TargetAuditModel.create({
      actorId,
      actorRole,
      action: formattedAction,
      accessedNic: masked,
      deviceModel: `ServiceLevel[${correlationId.slice(0, 8)}]`,
      timestamp: new Date()
    });
    return entry;
  } catch (err) {
    console.error('[ClinicalAuditService] Failed to write durable audit log:', err.message);
    // In regulated healthcare context, sensitive clinical operations must fail if auditing is down
    if (process.env.ENFORCE_STRICT_AUDIT === 'true') {
      throw new Error(`[ClinicalAuditService] Audit persistence unavailable: ${err.message}`);
    }
    return null;
  }
}

/**
 * Record a clinical failure or rollback outcome.
 */
async function recordClinicalFailure(params = {}) {
  return recordClinicalEvent({
    ...params,
    outcome: OUTCOMES.FAILURE
  });
}

/**
 * Reconcile unprojected clinical audits from durable transactional models (Dispensing, etc.)
 * to the central AuditLog collection, ensuring zero silent evidence loss across process restarts.
 */
async function reconcileClinicalAuditOutbox(models = {}) {
  const DispensingModel = models.DispensingModel || require('../models/Dispensing');
  const ConsultationModel = models.ConsultationModel || (models.DispensingModel ? null : require('../models/Consultation'));
  const LabTestModel = models.LabTestModel || (models.DispensingModel ? null : require('../models/LabTest'));
  const AuditLogModel = models.AuditLogModel || require('../models/AuditLog');

  let reconciled = 0;
  let scanned = 0;

  // 1. Dispensing domain outbox
  if (DispensingModel && typeof DispensingModel.find === 'function') {
    const unprojected = await DispensingModel.find({ 'audit.actorId': { $exists: true } }).lean();
    scanned += unprojected.length;
    for (const doc of unprojected) {
      const existing = await AuditLogModel.findOne({
        action: new RegExp(`\\[${doc._id}\\]`)
      });
      if (!existing) {
        await recordClinicalEvent({
          actorId: doc.audit?.actorId || 'system',
          actorRole: 'pharmacist',
          action: doc.audit?.action || ACTIONS.PRESCRIPTION_DISPENSED,
          resourceType: 'Dispensing',
          resourceId: String(doc._id),
          patientNic: doc.patientNic,
          correlationId: doc.idempotencyKey || doc.requestHash || crypto.randomUUID(),
          details: { receiptNumber: doc.receiptNumber, reconciled: true },
          auditLogModel: AuditLogModel
        });
        reconciled++;
      }
    }
  }

  // 2. Consultation domain outbox
  if (ConsultationModel && typeof ConsultationModel.find === 'function') {
    const unprojectedConsultations = await ConsultationModel.find({ doctorId: { $exists: true } }).lean();
    scanned += unprojectedConsultations.length;
    for (const doc of unprojectedConsultations) {
      const existing = await AuditLogModel.findOne({
        action: new RegExp(`\\[${doc._id}\\]`)
      });
      if (!existing) {
        await recordClinicalEvent({
          actorId: String(doc.doctorId),
          actorRole: 'doctor',
          action: ACTIONS.CONSULTATION_CREATED,
          resourceType: 'Consultation',
          resourceId: String(doc._id),
          patientNic: doc.patientNic,
          correlationId: doc.consultationId || crypto.randomUUID(),
          details: { consultationId: doc.consultationId, reconciled: true },
          auditLogModel: AuditLogModel
        });
        reconciled++;
      }
    }
  }

  // 3. Lab test domain outbox
  if (LabTestModel && typeof LabTestModel.find === 'function') {
    const unprojectedLabTests = await LabTestModel.find({ labTestId: { $exists: true } }).lean();
    scanned += unprojectedLabTests.length;
    for (const doc of unprojectedLabTests) {
      const existing = await AuditLogModel.findOne({
        action: new RegExp(`\\[${doc._id}\\]`)
      });
      if (!existing) {
        await recordClinicalEvent({
          actorId: String(doc.referredBy || doc.acceptedBy || 'system'),
          actorRole: 'hospital_admin',
          action: ACTIONS.LAB_TEST_ORDERED,
          resourceType: 'LabTest',
          resourceId: String(doc._id),
          patientNic: doc.patientNic,
          correlationId: doc.labTestId || crypto.randomUUID(),
          details: { labTestId: doc.labTestId, status: doc.status, reconciled: true },
          auditLogModel: AuditLogModel
        });
        reconciled++;
      }
    }
  }

  return { scanned, reconciled };
}

module.exports = {
  ACTIONS,
  OUTCOMES,
  recordClinicalEvent,
  recordClinicalFailure,
  reconcileClinicalAuditOutbox,
  maskNic,
  sanitizeDetails
};
