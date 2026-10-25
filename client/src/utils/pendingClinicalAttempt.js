const STORAGE_KEY = 'medisync:pending-consultation';
const validKey = value => typeof value === 'string' && /^[A-Za-z0-9:_-]{16,128}$/.test(value);
// Persist only an opaque operation reference, never a patient, token or draft.
export function pendingClinicalAttempt(storage) {
  try {
    storage = storage || window.sessionStorage;
    const value = storage.getItem(STORAGE_KEY);
    if (value === null) return { blocked: false, key: null };
    const record = JSON.parse(value);
    return { blocked: true, key: validKey(record.key) ? record.key : null };
  } catch (_) { return { blocked: true, key: null }; }
}
export function beginClinicalAttempt(key, storage) {
  storage = storage || window.sessionStorage;
  if (!validKey(key) || pendingClinicalAttempt(storage).blocked) throw new Error('CLINICAL_ATTEMPT_RECONCILIATION_REQUIRED');
  storage.setItem(STORAGE_KEY, JSON.stringify({ key }));
  const proof = pendingClinicalAttempt(storage);
  if (!proof.blocked || proof.key !== key) throw new Error('CLINICAL_ATTEMPT_STORAGE_UNAVAILABLE');
}
export function finishClinicalAttempt(key, storage) {
  storage = storage || window.sessionStorage;
  const current = pendingClinicalAttempt(storage);
  if (!current.blocked || current.key !== key) throw new Error('CLINICAL_ATTEMPT_RECONCILIATION_REQUIRED');
  storage.removeItem(STORAGE_KEY);
  if (pendingClinicalAttempt(storage).blocked) throw new Error('CLINICAL_ATTEMPT_STORAGE_UNAVAILABLE');
}
