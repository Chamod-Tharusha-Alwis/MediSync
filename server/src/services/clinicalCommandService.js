'use strict';
const crypto = require('crypto');
const { ClinicalCommandError } = require('./clinicalErrors');
function canonical(value, depth = 0) {
  if (depth > 16) throw new Error('CLINICAL_REQUEST_INVALID');
  if (value === null || ['string', 'boolean'].includes(typeof value)) return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value) && value.length <= 128) return '[' + value.map(item => canonical(item, depth + 1)).join(',') + ']';
  if (value && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Object]' && Object.keys(value).length <= 128) return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key], depth + 1)).join(',') + '}';
  throw new Error('CLINICAL_REQUEST_INVALID');
}
const digest = value => crypto.createHash('sha256').update(canonical(value)).digest('hex');
function eventPayload(event) { return Object.fromEntries(['eventId', 'actorId', 'actorRole', 'action', 'resourceType', 'resourceId', 'eventAt'].map(key => [key, key === 'eventAt' ? new Date(event[key]).toISOString() : event[key]])); }
function eventHash(event) { return digest(eventPayload(event)); }

function createClinicalCommandService({ transact, CommandModel, guard, preflight = async () => {}, now = () => new Date() }) {
  if (typeof transact !== 'function' || !CommandModel || typeof guard !== 'function') throw new Error('CLINICAL_COMMAND_CONFIGURATION_INVALID');
  return async ({ user, kind, idempotencyKey, request, write, context }) => {
    if (!user || !/^[a-f0-9]{24}$/i.test(String(user.id)) || user.role !== 'doctor' || !['consultation', 'prescription'].includes(kind) || typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9:_-]{16,128}$/.test(idempotencyKey) || typeof write !== 'function') throw new ClinicalCommandError('CLINICAL_COMMAND_INVALID');
    if (Buffer.byteLength(canonical(request)) > 65536 || !/^[a-f0-9]{24}$/i.test(String(context?.patientId))) throw new ClinicalCommandError('CLINICAL_REQUEST_INVALID');
    const requestHash = digest({ actorId: String(user.id), patientId: String(context.patientId), kind, request });
    const commandId = digest({ domain: 'clinical-command-v1', actorId: String(user.id), role: user.role, kind, idempotencyKey }).slice(0, 24);
    await preflight();
    return transact(async session => {
      await guard({ user, request, context, session });
      const previous = await CommandModel.findById(commandId).session(session);
      if (previous) {
        if (previous.requestHash !== requestHash || String(previous.actorId) !== String(user.id) || previous.kind !== kind) throw new ClinicalCommandError('CLINICAL_IDEMPOTENCY_CONFLICT', 409);
        return { replayed: true, commandId, result: previous.result };
      }
      const outcome = await write(session);
      if (!outcome || !Array.isArray(outcome.events) || !outcome.events.length || outcome.events.length > 128) throw new Error('CLINICAL_OUTBOX_REQUIRED');
      if (!outcome.result || typeof outcome.result !== 'object' || !Object.keys(outcome.result).length || Object.keys(outcome.result).some(key => !['consultationId', 'prescriptionId', 'prescriptionIds', 'labTestIds'].includes(key)) || Object.values(outcome.result).some(value => (Array.isArray(value) ? value.length > 100 || value.some(id => !/^[a-f0-9]{24}$/i.test(String(id))) : !/^[a-f0-9]{24}$/i.test(String(value))))) throw new Error('CLINICAL_RESULT_MUST_CONTAIN_IDENTIFIERS_ONLY');
      const eventAt = now();
      const outbox = outcome.events.map((event, index) => {
        if (!/^[A-Z_]{3,64}$/.test(event.action) || !['Consultation', 'Prescription', 'LabTest'].includes(event.resourceType) || !/^[a-f0-9]{24}$/i.test(String(event.resourceId))) throw new Error('CLINICAL_EVENT_INVALID');
        const row = { eventId: digest({ commandId, index }).slice(0, 24), actorId: String(user.id), actorRole: user.role,
          action: event.action, resourceType: event.resourceType, resourceId: String(event.resourceId), eventAt };
        return { ...row, eventHash: eventHash(row) };
      });
      // Repeat the conditional guard immediately before committing. Its writes
      // serialize against consent, account and session revocation updates.
      await guard({ user, request, context, session });
      await CommandModel.create([{ _id: commandId, actorId: user.id, actorRole: user.role, patientId: context.patientId, kind, requestHash, result: outcome.result, outbox }], { session });
      return { replayed: false, commandId, result: outcome.result };
    });
  };
}
function productionCommandService() {
  return createClinicalCommandService({
    transact: require('./dispensingService').runTransaction,
    CommandModel: require('../models/ClinicalCommand'), guard: require('./clinicalCommitGuard').claimClinicalAuthorization,
    preflight: () => require('./clinicalCommandStorage').assertClinicalCommandStorage(require('mongoose').connection.db)
  });
}
module.exports = { createClinicalCommandService, productionCommandService, canonical, digest, eventHash };
