// Display-only view of the trusted-device list: nothing is deleted or changed on the server.
// Default: the 5 most recently seen devices, without never-verified devices not seen for 30 days.
export const RECENT_DEVICE_LIMIT = 5;
const STALE_UNVERIFIED_MS = 30 * 24 * 60 * 60 * 1000;

const seenAt = d => new Date(d?.lastSeenAt || d?.trustedAt || 0).getTime() || 0;

export function deviceListView(devices = [], { showOlder = false, now = Date.now() } = {}) {
  const sorted = [...(Array.isArray(devices) ? devices : [])].sort((a, b) => seenAt(b) - seenAt(a));
  if (showOlder) return { shown: sorted, hiddenCount: 0 };
  const recent = sorted.filter(d => d?.isTrusted || now - seenAt(d) <= STALE_UNVERIFIED_MS).slice(0, RECENT_DEVICE_LIMIT);
  return { shown: recent, hiddenCount: sorted.length - recent.length };
}
