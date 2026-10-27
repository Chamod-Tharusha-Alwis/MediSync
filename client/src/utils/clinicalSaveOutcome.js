// A failed write response is not proof that the server rolled back. Preserve
// the idempotency key and require record reconciliation before a fresh attempt.
export function requiresWriteReconciliation(error) {
  const status = error?.response?.status;
  return !status || status >= 500 || error?.response?.data?.error === 'TRANSACTION_OUTCOME_UNKNOWN';
}
