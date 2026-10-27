'use strict';
const crypto = require('crypto');
const { createNicBlindIndex } = require('./nicBlindIndex');
const { createAuthenticatedFields } = require('./authenticatedFields');

function decodeRing(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('SECURITY_KEY_CONFIGURATION_INVALID');
  const result = {};
  for (const [version, encoded] of Object.entries(input)) {
    if (!/^[1-9][0-9]{0,5}$/.test(version) || typeof encoded !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error('SECURITY_KEY_CONFIGURATION_INVALID');
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32 || key.toString('base64') !== encoded) throw new Error('SECURITY_KEY_CONFIGURATION_INVALID');
    result[version] = key;
  }
  return result;
}

function createSecurityRuntime(configuration = null, { legacyKeys = {}, otherSecrets = [] } = {}) {
  if (configuration === null) configuration = { schema: 1, nicMode: 'legacy', fieldMode: 'legacy' };
  configuration = { ...configuration };
  legacyKeys = { ...legacyKeys };
  if (configuration.schema !== 1 || !['legacy', 'dual', 'hmac'].includes(configuration.nicMode) || !['legacy', 'gcm'].includes(configuration.fieldMode)) throw new Error('SECURITY_MODE_INVALID');
  const nicKeys = configuration.nicMode === 'legacy' ? {} : decodeRing(configuration.nicKeys);
  const fieldKeys = configuration.fieldMode === 'legacy' ? {} : decodeRing(configuration.fieldKeys);
  const allKeys = [...Object.values(nicKeys), ...Object.values(fieldKeys)];
  const prohibited = [...otherSecrets, ...Object.values(legacyKeys)].filter(s => typeof s === 'string' && s.length).flatMap(s => [Buffer.from(s), crypto.createHash('sha256').update(s).digest(), Buffer.from(crypto.createHash('sha256').update(s).digest('hex').slice(0, 32))]);
  for (const [i, key] of allKeys.entries()) {
    if (allKeys.slice(0, i).some(other => crypto.timingSafeEqual(key, other)) || prohibited.some(other => other.length === key.length && crypto.timingSafeEqual(key, other))) throw new Error('SECURITY_KEY_PURPOSE_REUSE');
  }
  const nic = configuration.nicMode === 'legacy' ? null : createNicBlindIndex({ keys: nicKeys, activeVersion: configuration.nicActiveVersion });
  if (configuration.fieldMode === 'gcm') createAuthenticatedFields({ keys: fieldKeys, activeVersion: configuration.fieldActiveVersion, legacyKeys });
  const legacyAllowed = configuration.allowUnauthenticatedLegacyReads === true;
  return Object.freeze({
    nicMode: configuration.nicMode, fieldMode: configuration.fieldMode,
    index(nicValue) { if (!nic) throw new Error('NIC_INDEX_NOT_ENABLED'); return nic.index(nicValue); },
    matches(nicValue, index) { return nic ? nic.matches(nicValue, index) : false; },
    candidates(nicValue) { if (!nic) throw new Error('NIC_INDEX_NOT_ENABLED'); return nic.candidates(nicValue, { includeLegacy: configuration.nicMode === 'dual' }); },
    fieldConfiguration() { return { keys: Object.fromEntries(Object.entries(fieldKeys).map(([v, key]) => [v, Buffer.from(key)])), activeVersion: configuration.fieldActiveVersion }; },
    legacyKeys() { return { ...legacyKeys }; },
    allowsLegacyFieldReads() { return legacyAllowed; },
    status() { return { schema: 1, nicMode: configuration.nicMode, fieldMode: configuration.fieldMode, requiresMigration: configuration.nicMode !== 'hmac' || configuration.fieldMode !== 'gcm', unauthenticatedLegacyReads: legacyAllowed }; }
  });
}

// Legacy mode is explicit compatibility before bootstrap, with no new secret fallback.
let runtime = createSecurityRuntime(), bootstrapped = false;
function initialize(configuration, options) {
  if (bootstrapped) throw new Error('SECURITY_RUNTIME_ALREADY_INITIALIZED');
  const candidate = createSecurityRuntime(configuration || null, options);
  runtime = candidate; bootstrapped = true;
  return runtime.status();
}
function current() { return runtime; }
function assertProtectedCompatibility({ Patient, Consultation, fieldPlugin, doctorCreate }) {
  if (runtime.nicMode !== 'legacy' && (!Patient.schema.path('patientNic_hmac') || !Consultation.schema.path('patientNic_hmac'))) throw new Error('PROTECTED_NIC_MIGRATION_APPROVAL_REQUIRED');
  if (runtime.fieldMode === 'gcm' && fieldPlugin.securityFormat !== 'gcm1') throw new Error('PROTECTED_FIELD_MIGRATION_APPROVAL_REQUIRED');
  // Patient.nic is currently excluded from its encrypted field list. A keyed
  // lookup alone must not be mistaken for removal of this plaintext identifier.
  // Hold HMAC-only cutover until storage and uniqueness are separately reviewed.
  if (runtime.nicMode === 'hmac' && Patient.schema.path('nic')?.options?.required === true) throw new Error('PROTECTED_PATIENT_NIC_STORAGE_MIGRATION_REQUIRED');
  if ((runtime.nicMode !== 'legacy' || runtime.fieldMode !== 'legacy') && doctorCreate?.securityCommandVersion !== 1) throw new Error('PROTECTED_CLINICAL_WRITER_APPROVAL_REQUIRED');
}
module.exports = { createSecurityRuntime, initialize, current, assertProtectedCompatibility };
