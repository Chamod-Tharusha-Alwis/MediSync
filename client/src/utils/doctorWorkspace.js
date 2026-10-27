export function selectDoctorWorkspace(rows, identifier) {
  const active = (Array.isArray(rows) ? rows : []).filter(row => row.isActive === true);
  const matching = active.filter(row => String(row.orgEmail || '').toLowerCase() === String(identifier || '').trim().toLowerCase());
  if (matching.length === 1) return matching[0];
  if (matching.length === 0 && active.length === 1) return active[0];
  throw new Error('Use the login address for your active hospital organization.');
}
