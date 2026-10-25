'use strict';

/**
 * MediSync Service-Level Clinical Audit Service
 * Provides audit projection and bounded reconciliation helpers. Durable evidence
 * depends on an embedded transactional outbox and an operational archival worker.
 *
 * Enforces:
 * - Mandatory audit context (actorId, actorRole, action, outcome)
 * - Safe handling of MongoDB capped audit collection limitations
 * - Correlation IDs for request traceability
 * - Filtering of known sensitive metadata (not a general PII detector)
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
  return '*'.repeat(clean.length - 4) + clean.slice(-4);
}

function sanitizeDetails(details = {}) {
  if (!details || typeof details !== 'object') return {};
  const sanitized = {};
  const forbiddenKeys = ['password', 'token', 'jwt', 'secret', 'key', 'diagnosis', 'notes', 'symptoms', 'nic', 'email', 'address', 'phone', 'patient', 'name'];
  
  for (const [k, v] of Object.entries(details)) {
    const lower = k.toLowerCase();
    if (lower !== 'drugname' && forbiddenKeys.some(fk => lower.includes(fk))) {
      continue; // exclude PHI and secrets
    }
    if ((typeof v === 'string' && v.length <= 120 && !/@|\b(?:\d{12}|\d{9}[vVxX])\b/.test(v)) || (typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean') {
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
    auditLogModel = null,
    projectionId: requestedProjectionId = null,
    eventAt = new Date()
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
  if (requestedProjectionId !== null && !/^[a-f0-9]{24}$/.test(requestedProjectionId)) throw new Error('AUDIT_PROJECTION_ID_INVALID');
  if (!Number.isFinite(new Date(eventAt).getTime())) throw new Error('AUDIT_TIMESTAMP_INVALID');
  const projectionId = requestedProjectionId || (resourceType === 'Dispensing' && resourceId !== 'N/A'
    ? crypto.createHash('sha256').update(JSON.stringify(['dispensing-audit-v1', resourceId, outcome])).digest('hex').slice(0, 24) : null);
  const payload = {
      ...(projectionId ? { _id: projectionId } : {}),
      actorId,
      actorRole,
      action: formattedAction,
      accessedNic: masked,
      deviceModel: `ServiceLevel[${correlationId.slice(0, 8)}]`,
      timestamp: new Date(eventAt)
    };
  try {
    const entry = await TargetAuditModel.create(payload);
    return entry;
  } catch (err) {
    if (projectionId && err.code === 11000) {
      const existing = await TargetAuditModel.findById(projectionId).lean();
      if (!existing || ['actorId', 'actorRole', 'action', 'accessedNic'].some(field => existing[field] !== payload[field]) || (requestedProjectionId && new Date(existing.timestamp).getTime() !== new Date(payload.timestamp).getTime())) throw new Error('AUDIT_PROJECTION_CONFLICT');
      return existing;
    }
    console.error('[ClinicalAuditService] Audit persistence unavailable.');
    // In regulated healthcare context, sensitive clinical operations must fail if auditing is down
    if (process.env.ENFORCE_STRICT_AUDIT === 'true') {
      throw new Error('[ClinicalAuditService] Audit persistence unavailable');
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
 * to the central AuditLog collection. Callers must schedule reconciliation and
 * archive evidence before the capped collection rolls off.
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
    const query = DispensingModel.find({
      'audit.actorId': { $exists: true },
      'audit.projectedAt': { $exists: false }
    });
    if (typeof query.limit !== 'function' || typeof DispensingModel.updateOne !== 'function') throw new Error('AUDIT_RECONCILIATION_ADAPTER_INVALID');
    const unprojected = await query.limit(100).lean();
    scanned += unprojected.length;
    for (const doc of unprojected) {
      const recordedRole = doc.audit?.actorRole;
      const written = await recordClinicalEvent({
        actorId: doc.audit?.actorId || 'system',
        actorRole: recordedRole || 'unknown',
        action: doc.audit?.action || 'RECONCILED',
        resourceType: 'Dispensing',
        resourceId: String(doc._id),
        patientNic: doc.patientNic,
        correlationId: doc.idempotencyKey || doc.requestHash || crypto.randomUUID(),
        details: { receiptNumber: doc.receiptNumber, reconciled: true },
        auditLogModel: AuditLogModel
      });
      if (written) {
        const result = await DispensingModel.updateOne({ _id: doc._id, 'audit.projectedAt': { $exists: false } }, { $set: { 'audit.projectedAt': new Date() } });
        if (result.modifiedCount === 1) reconciled++;
      }
    }
  }

  // 2. Consultation domain outbox - only for records carrying an embedded audit block
  if (ConsultationModel && typeof ConsultationModel.find === 'function') {
    const query = ConsultationModel.find({
      'audit.actorId': { $exists: true },
      'audit.projectedAt': { $exists: false }
    });
    if (typeof query.limit !== 'function' || typeof ConsultationModel.updateOne !== 'function') throw new Error('AUDIT_RECONCILIATION_ADAPTER_INVALID');
    const unprojectedConsultations = await query.limit(100).lean();
    scanned += unprojectedConsultations.length;
    for (const doc of unprojectedConsultations) {
      const written = await recordClinicalEvent({
        actorId: String(doc.audit?.actorId || doc.doctorId),
        actorRole: doc.audit?.actorRole || 'unknown',
        action: doc.audit?.action || 'RECONCILED',
        resourceType: 'Consultation',
        resourceId: String(doc._id),
        patientNic: doc.patientNic,
        correlationId: doc.consultationId || crypto.randomUUID(),
        details: { consultationId: doc.consultationId, reconciled: true },
        auditLogModel: AuditLogModel
      });
      if (written) {
        const result = await ConsultationModel.updateOne({ _id: doc._id, 'audit.projectedAt': { $exists: false } }, { $set: { 'audit.projectedAt': new Date() } });
        if (result.modifiedCount === 1) reconciled++;
      }
    }
  }

  // 3. Lab test domain outbox - only for records carrying an embedded audit block
  if (LabTestModel && typeof LabTestModel.find === 'function') {
    const query = LabTestModel.find({
      'audit.actorId': { $exists: true },
      'audit.projectedAt': { $exists: false }
    });
    if (typeof query.limit !== 'function' || typeof LabTestModel.updateOne !== 'function') throw new Error('AUDIT_RECONCILIATION_ADAPTER_INVALID');
    const unprojectedLabTests = await query.limit(100).lean();
    scanned += unprojectedLabTests.length;
    for (const doc of unprojectedLabTests) {
      const written = await recordClinicalEvent({
        actorId: String(doc.audit?.actorId || doc.referredBy || doc.acceptedBy || 'system'),
        actorRole: doc.audit?.actorRole || 'unknown',
        action: doc.audit?.action || 'RECONCILED',
        resourceType: 'LabTest',
        resourceId: String(doc._id),
        patientNic: doc.patientNic,
        correlationId: doc.labTestId || crypto.randomUUID(),
        details: { labTestId: doc.labTestId, status: doc.status, reconciled: true },
        auditLogModel: AuditLogModel
      });
      if (written) {
        const result = await LabTestModel.updateOne({ _id: doc._id, 'audit.projectedAt': { $exists: false } }, { $set: { 'audit.projectedAt': new Date() } });
        if (result.modifiedCount === 1) reconciled++;
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
