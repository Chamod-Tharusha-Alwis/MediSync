// Display helpers for OTP request / verify errors. The OTP rules themselves (5 attempts, 15 min lock,
// 60 s cooldown) live on the server and are not changed here.
export const REQUEST_TIMEOUT_MS = 20000;

export function formatWait(seconds) {
  const s = Math.max(0, Math.ceil(Number(seconds) || 0));
  if (s >= 60) {
    const m = Math.ceil(s / 60);
    return `${m} minute${m === 1 ? '' : 's'}`;
  }
  return `${s} second${s === 1 ? '' : 's'}`;
}

// The server's own message when there is one; a plain sentence for timeouts and network errors.
export function otpErrorMessage(err, fallback) {
  const data = err?.response?.data;
  const serverMessage = typeof data?.message === 'string' && data.message.trim()
    ? data.message.trim()
    : (typeof data?.error === 'string' && /\s/.test(data.error) ? data.error.trim() : '');
  if (serverMessage) return serverMessage;
  if (err?.code === 'ECONNABORTED' || /timeout/i.test(String(err?.message || ''))) {
    return `${fallback.replace(/\.$/, '')}: the server did not respond within ${REQUEST_TIMEOUT_MS / 1000} seconds. Please try again.`;
  }
  if (err && !err.response && err.request) {
    return `${fallback.replace(/\.$/, '')}: no connection to the server. Please try again.`;
  }
  return fallback;
}
