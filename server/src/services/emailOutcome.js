'use strict';
/**
 * Fix pack 2, C2: the real result of an outbreak email, for the admin UI.
 *   sent    – the provider accepted it and returned a message id (delivery to the inbox is then up to the
 *             provider; "accepted" is not "delivered").
 *   skipped – nothing was sent: kill switch, not allowlisted, daily cap, or captured in test mode / to a
 *             .local address (the app's test transport keeps it in memory).
 *   failed  – the provider refused it or the transport failed (reason code only; never the body or keys).
 */
const SKIP_TEXT = {
  OUTBREAK_EMAIL_DELIVERY_DISABLED: 'Skipped: outbreak email delivery is switched off (kill switch).',
  NOT_ON_ALLOWLIST: 'Skipped: the recipient is not on the demonstration allowlist.',
  DAILY_EMAIL_CAP_REACHED: 'Skipped: the daily email cap has been reached.',
  CAPTURED_NOT_SENT: 'Skipped: captured by the test transport (test mode or a .local address); no email left the server.',
};

const isCaptured = id => typeof id === 'string' && id.startsWith('test-accepted-');

function deliveryOutcome(result = {}) {
  const ids = (result.messageIds || []).filter(Boolean);
  if (result.blockedReason) return { outcome: 'skipped', reason: result.blockedReason, text: SKIP_TEXT[result.blockedReason] || `Skipped: ${result.blockedReason}.`, providerMessageIds: [] };
  if ((result.sentCount || 0) > 0 && ids.length && ids.every(isCaptured)) {
    return { outcome: 'skipped', reason: 'CAPTURED_NOT_SENT', text: SKIP_TEXT.CAPTURED_NOT_SENT, providerMessageIds: [] };
  }
  const real = ids.filter(id => !isCaptured(id));
  if ((result.sentCount || 0) > 0) {
    return { outcome: 'sent', reason: null, text: `Sent: accepted by the email provider${real.length ? ` (id ${real.join(', ')})` : ''}. Check the inbox and the spam folder.`, providerMessageIds: real };
  }
  const reason = (result.errors || [])[0] || 'DELIVERY_REJECTED';
  return { outcome: 'failed', reason, text: `Failed: the email provider did not accept the message (${reason}).`, providerMessageIds: [] };
}

module.exports = { deliveryOutcome, SKIP_TEXT };
