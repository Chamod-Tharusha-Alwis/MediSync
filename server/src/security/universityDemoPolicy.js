'use strict';

// Pure restriction layer for a future separately qualified real-application demo
// entry point. It creates no connection, account, collection, session or listener.
// Successful checks NEVER replace JWT/session, RBAC or patient-consent checks.
const MODE = 'university-demo';
const DISCLAIMER = 'EDUCATIONAL DEMONSTRATION — SYNTHETIC DATA ONLY — NOT FOR CLINICAL CARE.';
const CLUSTER = 'medisync.p7hjket.mongodb.net';
const ROLES = Object.freeze({ admin: 'Admin', doctor: 'Doctor', patient: 'Patient', pharmacist: 'PharmacyStaff', hospital_admin: 'Hospital' });
const COLLECTIONS = Object.freeze(['admins', 'doctors', 'patients', 'pharmacystaffs', 'pharmacies', 'hospitals', 'consultations', 'prescriptions', 'labtests', 'dispensings', 'notifications']);
const ID = /^[a-f0-9]{24}$/;
const NON_NETWORK_FLAGS = Object.freeze(['email', 'sms', 'cloudinary', 'geolocation', 'broadcasts', 'cron', 'automaticDdl', 'registration', 'uploads']);
const READ_ROUTES = Object.freeze({
  admin: Object.freeze(['/api/admin/stats']),
  doctor: Object.freeze(['/api/doctor/profile', '/api/doctor/stats', '/api/doctor/consultations']),
  patient: Object.freeze(['/api/lab/patient/my-tests']),
  pharmacist: Object.freeze(['/api/pharmacy/staff/me', '/api/pharmacy/inventory', '/api/pharmacy/history', '/api/pharmacy/stats']),
  hospital_admin: Object.freeze(['/api/hospital/stats', '/api/hospital/profile', '/api/hospital/doctors', '/api/hospital/staff'])
});

function denied(code) { throw new Error('UNIVERSITY_DEMO_' + code); }
function record(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) denied('PLAIN_DATA_REQUIRED');
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) if (!Object.hasOwn(descriptor, 'value')) denied('ACCESSOR_FORBIDDEN');
  return value;
}
function keys(value, required) {
  record(value);
  const actual = Object.keys(value).sort();
  if (actual.length !== required.length || required.some(name => !Object.hasOwn(value, name))) denied('EXACT_CONFIGURATION_REQUIRED');
}
function list(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) denied('PLAIN_LIST_REQUIRED');
  for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if ((name !== 'length' && !/^(?:0|[1-9][0-9]*)$/.test(name)) || !Object.hasOwn(descriptor, 'value')) denied('PLAIN_LIST_REQUIRED');
  }
  for (let index = 0; index < value.length; index++) if (!Object.hasOwn(value, index)) denied('PLAIN_LIST_REQUIRED');
  return value;
}
function freeze(value) {
  if (value && typeof value === 'object') { for (const item of Object.values(value)) freeze(item); Object.freeze(value); }
  return value;
}

function configuration(input) {
  keys(input, ['mode', 'namespace', 'database', 'username', 'cluster', 'tls', 'disabled', 'actors', 'recordIds']);
  if (input.mode !== MODE || typeof input.namespace !== 'string' || !/^[a-z0-9][a-z0-9_-]{7,63}$/.test(input.namespace)) denied('NAMESPACE_REQUIRED');
  // No implicit reuse of the operational or automated-QA database. Naming a
  // candidate here is not authorization to provision or write such a database.
  if (typeof input.database !== 'string' || !/^medisync_demo_[a-z0-9_]{1,40}$/.test(input.database)) denied('DEDICATED_DATABASE_REQUIRED');
  if (typeof input.username !== 'string' || !/^medisync_demo_[a-z0-9_]{1,40}$/.test(input.username)) denied('DEDICATED_IDENTITY_REQUIRED');
  if (input.cluster !== CLUSTER || input.tls !== true) denied('EXACT_CLUSTER_AND_TLS_REQUIRED');
  keys(input.disabled, [...NON_NETWORK_FLAGS]);
  if (NON_NETWORK_FLAGS.some(name => input.disabled[name] !== true)) denied('UNQUALIFIED_SIDE_EFFECT_FORBIDDEN');
  list(input.actors);
  if (input.actors.length !== 5) denied('FIVE_EXPLICIT_ACTORS_REQUIRED');
  const roles = new Set(), ids = new Set(), emails = new Set();
  for (const actor of input.actors) {
    keys(actor, ['id', 'role', 'email']);
    if (typeof actor.id !== 'string' || !ID.test(actor.id) || !Object.hasOwn(ROLES, actor.role) || roles.has(actor.role) || ids.has(actor.id)) denied('ACTOR_MANIFEST_INVALID');
    // Reserved .invalid mailboxes cannot accidentally deliver to a real person.
    if (typeof actor.email !== 'string' || !/^[a-z0-9][a-z0-9._+-]{0,63}@demo\.medisync\.invalid$/.test(actor.email) || emails.has(actor.email)) denied('SYNTHETIC_LOGIN_IDENTITY_REQUIRED');
    roles.add(actor.role); ids.add(actor.id); emails.add(actor.email);
  }
  record(input.recordIds);
  if (Object.keys(input.recordIds).length > COLLECTIONS.length) denied('RECORD_MANIFEST_INVALID');
  for (const [collection, values] of Object.entries(input.recordIds)) {
    list(values);
    if (!COLLECTIONS.includes(collection) || values.length > 1000 || values.some(id => typeof id !== 'string' || !ID.test(id)) || new Set(values).size !== values.length) denied('RECORD_MANIFEST_INVALID');
  }
  // Copy only after accessor/shape checks so later caller mutation cannot widen
  // this private policy. No credentials or connection URI are accepted here.
  return freeze(JSON.parse(JSON.stringify(input)));
}

function createUniversityDemoPolicy(input) {
  const config = configuration(input), capabilities = new WeakSet();
  let databaseVerified = false;
  const actors = new Map(config.actors.map(actor => [actor.id, actor]));
  function assertDatabaseIdentity(proof) {
    databaseVerified = false;
    keys(proof, ['database', 'username', 'cluster', 'tls', 'roles']);
    list(proof.roles);
    if (proof.database !== config.database || proof.username !== config.username || proof.cluster !== CLUSTER || proof.tls !== true || proof.roles.length !== 1) denied('DATABASE_IDENTITY_DENIED');
    keys(proof.roles[0], ['role', 'db']);
    if (proof.roles[0].role !== 'readWrite' || proof.roles[0].db !== config.database) denied('DATABASE_ROLE_DENIED');
    databaseVerified = true;
    return freeze({ database: config.database, namespace: config.namespace, tls: true });
  }
  function loginLookup(role, identifier) {
    if (!databaseVerified) denied('DATABASE_IDENTITY_NOT_VERIFIED');
    if (!Object.hasOwn(ROLES, role) || typeof identifier !== 'string') denied('LOGIN_IDENTITY_DENIED');
    const actor = config.actors.find(row => row.role === role && row.email === identifier);
    if (!actor) denied('LOGIN_IDENTITY_DENIED');
    return freeze({ model: ROLES[role], filter: { _id: actor.id, email: actor.email, isSynthetic: true, universityDemoNamespace: config.namespace } });
  }
  function admitPersistedActor(identity, persisted) {
    if (!databaseVerified) denied('DATABASE_IDENTITY_NOT_VERIFIED');
    record(identity); record(persisted);
    const actor = actors.get(identity.id);
    if (!actor || actor.role !== identity.role || !Object.hasOwn(ROLES, identity.role) || identity.model !== ROLES[identity.role] || persisted._id !== actor.id || persisted.role !== actor.role || persisted.email !== actor.email || persisted.isSynthetic !== true || persisted.universityDemoNamespace !== config.namespace || persisted.isActive !== true || persisted.isDeleted === true || persisted.mustChangePassword === true) denied('PERSISTED_SYNTHETIC_ACTOR_REQUIRED');
    if (['doctor', 'pharmacist', 'hospital_admin'].includes(actor.role) && persisted.isVerified !== true) denied('PROFESSIONAL_VERIFICATION_REQUIRED');
    const capability = freeze({ id: actor.id, role: actor.role, model: ROLES[actor.role] });
    capabilities.add(capability);
    return capability;
  }
  function requireCapability(capability) {
    if (!databaseVerified) denied('DATABASE_IDENTITY_NOT_VERIFIED');
    if (!capability || !capabilities.has(capability)) denied('PERSISTED_ACTOR_CAPABILITY_REQUIRED');
  }
  function ownedReadEnvelope(capability, collection, requestedIds) {
    requireCapability(capability);
    const approved = config.recordIds[collection];
    if (!Array.isArray(approved) || !Array.isArray(requestedIds) || requestedIds.length < 1 || requestedIds.length > 100 || requestedIds.some(id => typeof id !== 'string' || !approved.includes(id)) || new Set(requestedIds).size !== requestedIds.length) denied('EXACT_OWNED_READ_REQUIRED');
    if (capability.role === 'patient' && (collection !== 'patients' || requestedIds.length !== 1 || requestedIds[0] !== capability.id)) denied('PATIENT_SELF_READ_REQUIRED');
    return freeze({ _id: { $in: [...requestedIds] }, isSynthetic: true, universityDemoNamespace: config.namespace });
  }
  function assertOwnedRows(capability, collection, requestedIds, rows) {
    ownedReadEnvelope(capability, collection, requestedIds);
    if (!Array.isArray(rows) || rows.length > requestedIds.length) denied('OWNED_READ_RESULT_DENIED');
    const seen = new Set();
    for (const row of rows) {
      record(row);
      if (!requestedIds.includes(row._id) || seen.has(row._id) || row.isSynthetic !== true || row.universityDemoNamespace !== config.namespace) denied('OWNED_READ_RESULT_DENIED');
      seen.add(row._id);
    }
    return true;
  }
  function assertRequest(capability, request) {
    requireCapability(capability);
    record(request);
    if (typeof request.method !== 'string' || typeof request.path !== 'string' || /[%\\?#\u0000-\u0020\u007f]/.test(request.path) || !request.path.startsWith('/api/') || request.path.includes('//') || request.path.includes('/.')) denied('CANONICAL_REQUEST_REQUIRED');
    if (Object.hasOwn(request, 'files') || Object.hasOwn(request, 'file') || Object.hasOwn(request, 'query')) denied('UNQUALIFIED_REQUEST_FORBIDDEN');
    const method = request.method, url = request.path;
    if (['GET', 'HEAD'].includes(method) && (READ_ROUTES[capability.role].includes(url) || url === '/api/auth/preferences/language')) {
      if (Object.hasOwn(request, 'body') && request.body !== undefined) denied('READ_BODY_FORBIDDEN');
      return freeze({ allowed: true, purpose: 'SYNTHETIC_READ', requiresExistingAuthorization: true, requiresNativeOwnedReadEnvelope: true });
    }
    if (method === 'PATCH' && url === '/api/auth/preferences/language') {
      keys(request.body, ['preferredLanguage']);
      if (!['en', 'si', 'ta'].includes(request.body.preferredLanguage)) denied('LANGUAGE_REQUIRED');
      return freeze({ allowed: true, purpose: 'OWNED_SYNTHETIC_PREFERENCE', requiresExistingAuthorization: true, requiresExactOwnedWriteGuard: true });
    }
    // Registration, OTP/provider paths, arbitrary uploads, clinical mutations,
    // exports, administration changes and unknown paths fail closed by default.
    denied('ROUTE_NOT_QUALIFIED');
  }
  function assertExternalOperation() { denied('EXTERNAL_OPERATION_FORBIDDEN'); }
  return Object.freeze({ config, disclaimer: DISCLAIMER, assertDatabaseIdentity, loginLookup, admitPersistedActor, ownedReadEnvelope, assertOwnedRows, assertRequest, assertExternalOperation });
}

function createUniversityDemoGate(environment, policy, readCapability) {
  const enabled = environment && Object.hasOwn(environment, 'MEDISYNC_UNIVERSITY_DEMO') ? environment.MEDISYNC_UNIVERSITY_DEMO : undefined;
  if (enabled === undefined || enabled === 'false') return (_request, _response, next) => next();
  // A misspelled flag is an admission failure, not an accidental live mode.
  if (enabled !== 'true' || !policy || typeof policy.assertRequest !== 'function' || typeof readCapability !== 'function') denied('RUNTIME_INTEGRATION_REQUIRED');
  return (req, res, next) => {
    try {
      policy.assertRequest(readCapability(req), { method: req.method, path: req.originalUrl, ...(req.body === undefined ? {} : { body: req.body }), ...(req.file ? { file: req.file } : {}), ...(req.files ? { files: req.files } : {}) });
      res.setHeader('X-MediSync-Mode', MODE);
      res.setHeader('Cache-Control', 'no-store');
      next();
    } catch (_) { res.status(403).json({ error: 'This operation is unavailable in the synthetic educational demonstration.' }); }
  };
}

module.exports = { MODE, DISCLAIMER, CLUSTER, ROLES, COLLECTIONS, READ_ROUTES, createUniversityDemoPolicy, createUniversityDemoGate };
