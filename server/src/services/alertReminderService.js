'use strict';
/**
 * Fix pack 2, C3: reminder for pending High / Critical outbreak alerts.
 *
 * After a scan (manual trigger or the existing daily scan) every pending High/Critical alert that has not been
 * reminded yet gets, once: an in-app notification (bell) for each active administrator, and ONE reminder
 * email to the administrators ("N alerts need review: disease, district, severity, link").
 * "Send reminder now" (force) sends the current list again without the once-per-alert limit.
 *
 * Email controls are the existing ones: kill switch OUTBREAK_EMAIL_DELIVERY_ENABLED ('false' = off), the
 * demonstration allowlist OUTBREAK_DEMO_EMAIL_ALLOWLIST when any listed alert is synthetic/demo, and the daily cap.
 * No scheduler or service is added; nothing here runs on its own.
 */
const SEVERITIES = ['High', 'Critical'];
const MAX_ALERTS = 50;

const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function reminderEmail(alerts, { link }) {
  const { diseaseLabel } = require('./publicHealthStats');
  const rows = alerts.map(a => `${diseaseLabel(a.disease) || a.disease}, ${a.location || a.district || 'district not recorded'}, ${a.severity}`);
  const subject = `${alerts.length} outbreak alert${alerts.length === 1 ? '' : 's'} need${alerts.length === 1 ? 's' : ''} review`;
  const text = [`${subject}:`, ...rows.map(r => `- ${r}`), '', `Review them in the outbreak monitor: ${link}`, '', 'Pending alerts are statistical signals; nothing is sent to the public until an administrator approves it.'].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;font-size:14px;line-height:1.5">
<p><strong>${escapeHtml(subject)}</strong></p><ul>${rows.map(r => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
<p>Review them in the outbreak monitor: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>
<p style="color:#4b5563">Pending alerts are statistical signals; nothing is sent to the public until an administrator approves it.</p></div>`;
  return { subject, text, html };
}

async function claimAlerts({ OutbreakAlert, force, now }) {
  const filter = { status: 'Pending', severity: { $in: SEVERITIES }, ...(force ? {} : { reminderSentAt: { $exists: false } }) };
  const candidates = await OutbreakAlert.find(filter).sort({ createdAt: -1 }).limit(MAX_ALERTS).lean();
  if (force) return candidates;
  const claimed = [];
  for (const a of candidates) {
    // Once per alert, even if two scans finish at the same moment.
    const r = await OutbreakAlert.updateOne({ _id: a._id, reminderSentAt: { $exists: false } }, { $set: { reminderSentAt: now } });
    if (r.modifiedCount === 1) claimed.push(a);
  }
  return claimed;
}

async function remindPendingAlerts({ io = null, force = false, now = new Date(), env = process.env } = {}, deps = {}) {
  const OutbreakAlert = deps.OutbreakAlert || require('../models/OutbreakAlert');
  const Admin = deps.Admin || require('../models/Admin');
  const notifications = deps.notifications || require('./notificationService');
  const emailService = deps.emailService || require('../utils/emailService');
  const delivery = deps.delivery || require('./outbreakNotificationDelivery');
  const { deliveryOutcome } = require('./emailOutcome');

  const alerts = await claimAlerts({ OutbreakAlert, force, now });
  const out = { alerts: alerts.length, notifications: 0, email: null };
  if (!alerts.length) return out;
  if (force) await OutbreakAlert.updateMany({ _id: { $in: alerts.map(a => a._id) } }, { $set: { reminderSentAt: now } });

  const admins = await Admin.find({ isActive: { $ne: false } }).select('_id email role').lean();
  const link = `${String(env.FRONTEND_URL || env.CLIENT_URL || '').replace(/\/$/, '')}/admin/dashboard/outbreak`;
  const mail = reminderEmail(alerts, { link });

  // In-app notification (bell) for each administrator.
  for (const admin of admins) {
    try {
      await notifications.sendNotification(io, admin._id, { title: mail.subject, message: mail.text.split('\n').slice(0, Math.min(alerts.length, 5) + 1).join(' '),
        type: 'outbreak_alert', referenceId: String(alerts[0]._id), role: admin.role || 'admin', actionLink: '/admin/dashboard/outbreak' });
      out.notifications++;
    } catch (_) { /* a failed bell entry must not block the others */ }
  }

  // One reminder email to the administrators, through the existing controls.
  const result = { sentCount: 0, failedCount: 0, errors: [], messageIds: [], blockedReason: null };
  let to = [...new Set(admins.map(a => String(a.email || '').trim().toLowerCase()).filter(e => e.includes('@')))];
  if (env.OUTBREAK_EMAIL_DELIVERY_ENABLED === 'false') result.blockedReason = 'OUTBREAK_EMAIL_DELIVERY_DISABLED';
  else {
    if (alerts.some(a => delivery.isSyntheticOrDemo(a))) {
      const allow = new Set(String(env.OUTBREAK_DEMO_EMAIL_ALLOWLIST || '').split(',').map(e => e.trim().toLowerCase()).filter(e => e.includes('@')));
      to = to.filter(e => allow.has(e));
      if (!to.length) result.blockedReason = 'NOT_ON_ALLOWLIST';
    }
    if (!result.blockedReason) {
      const cap = parseInt(env.DAILY_EMAIL_CAP || env.EMAIL_DAILY_CAP, 10) || 100;
      let used = 0; try { used = Number(await emailService.getDailyDispatchedEmailCount()) || 0; } catch (_) {}
      to = to.slice(0, Math.max(0, cap - used));
      if (!to.length) result.blockedReason = 'DAILY_EMAIL_CAP_REACHED';
    }
  }
  if (!result.blockedReason) {
    try {
      const res = await emailService.sendOutbreakAlert(to, mail);
      result.sentCount = res?.acceptedCount || 0; result.failedCount = to.length - result.sentCount;
      result.messageIds = (res?.messageIds || []).filter(Boolean);
      if (!result.sentCount) result.errors.push(res?.errorCode || 'DELIVERY_REJECTED');
    } catch (_) { result.failedCount = to.length; result.errors.push('TRANSPORT_ERROR'); }
  }
  out.email = { ...deliveryOutcome(result), recipients: result.blockedReason ? 0 : to.length, subject: mail.subject };
  return out;
}

module.exports = { remindPendingAlerts, reminderEmail, SEVERITIES };
