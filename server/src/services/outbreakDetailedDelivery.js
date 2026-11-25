'use strict';
/**
 * server/src/services/outbreakDetailedDelivery.js
 *
 * Sends the detailed disease notification email (outbreakDetailedEmail.js) for the existing approval flow
 * and the administrator test email. Keeps the existing controls:
 *  - kill switch OUTBREAK_EMAIL_DELIVERY_ENABLED (policy from outbreakNotificationDelivery.isOutbreakDeliveryEnabled;
 *    'false' also blocks test emails here),
 *  - allowlist OUTBREAK_DEMO_EMAIL_ALLOWLIST for synthetic/demo alerts (re-checked here),
 *  - daily cap DAILY_EMAIL_CAP / EMAIL_DAILY_CAP (default 100), counted by emailService.
 * Language per recipient comes from the stored preferredLanguage of the matching account (en fallback).
 * Logs carry only the provider message id and subject, never the body or the address.
 */
const DEFAULT_DAILY_CAP = 100;
const LANGUAGE_COLLECTIONS = ['patients', 'doctors', 'hospitals', 'pharmacystaffs', 'admins'];

function dailyCap(env = process.env) {
  return parseInt(env.DAILY_EMAIL_CAP || env.EMAIL_DAILY_CAP, 10) || DEFAULT_DAILY_CAP;
}

async function resolveLanguages(emails, { db } = {}) {
  const out = new Map(emails.map(e => [e, 'en']));
  const database = db || require('mongoose').connection?.db;
  if (!database || !emails.length) return out;
  for (const name of LANGUAGE_COLLECTIONS) {
    try {
      const docs = await database.collection(name).find({ email: { $in: emails } }, { projection: { email: 1, preferredLanguage: 1 } }).toArray();
      for (const d of docs) if (['en', 'si', 'ta'].includes(d.preferredLanguage) && out.get(String(d.email).toLowerCase()) === 'en') out.set(String(d.email).toLowerCase(), d.preferredLanguage);
    } catch (_) {}
  }
  return out;
}

/**
 * Numbers for the email, from verified consultations. An alert that a later scan updated uses the newest stored figures
 * (latest72h) and their date, the same as the Monitor; any other alert is as of its creation (stored snapshot preferred).
 */
async function numbersForAlert(alert, { cases } = {}) {
  const projection = require('./alertProjection72h');
  const service = require('./surveillanceService');
  const newest = alert.latest72h || null;
  const newestEnd = newest && newest.window && newest.window.actualEnd ? new Date(newest.window.actualEnd) : null;
  const asOf = newestEnd || (alert.createdAt ? new Date(alert.createdAt) : new Date());
  const rows = cases || (await service.loadCases({ mode: alert.isSimulation ? 'simulation' : 'real', now: new Date(), lookbackDays: 70 })).cases;
  const n = projection.computeAlertNumbers(alert, rows, { asOf, lookbackStart: +asOf - 63 * projection.DAY });
  const snap = newest || alert.projection72h;
  const pop = projection.populationFigures(alert.location || alert.district, snap ? snap.actual72h : n.actual72h);
  const previous72h = snap ? snap.previous72h : n.previous72h;
  const actual72h = snap ? snap.actual72h : n.actual72h;
  const change = actual72h - previous72h;
  return {
    previous72h, actual72h, change,
    percentChange: previous72h > 0 ? Number(((change / previous72h) * 100).toFixed(1)) : (actual72h > 0 ? 'new' : 0),
    projected: snap ? snap.projected : n.projection.projected, low: snap ? snap.low : n.projection.low, high: snap ? snap.high : n.projection.high,
    enoughHistory: snap ? snap.enoughHistory : n.projection.enoughHistory,
    islandActual72h: n.islandActual72h, sharePct: pop.sharePct, per100k: pop.per100k, dailyCounts7d: n.dailyCounts7d, dataNote: n.dataNote,
  };
}

async function sendDetailedOutbreakEmail(recipients = [], alert = {}, options = {}) {
  const env = options.env || process.env;
  const emailService = options.emailService || require('../utils/emailService');
  const delivery = require('./outbreakNotificationDelivery');
  const { buildDetailedOutbreakEmail } = require('./outbreakDetailedEmail');
  const result = { sentCount: 0, failedCount: 0, skippedCount: 0, errors: [], subjects: {}, isDemonstration: false, blockedReason: null, messageIds: [] };
  const list = (recipients || []).map(r => String(typeof r === 'string' ? r : r?.email || '').trim().toLowerCase()).filter(e => e.includes('@'));
  if (!list.length) return result;

  const isDemo = options.isDemo !== undefined ? Boolean(options.isDemo) : delivery.isSyntheticOrDemo(alert);
  result.isDemonstration = isDemo;
  // Kill switch.
  if (env.OUTBREAK_EMAIL_DELIVERY_ENABLED === 'false' || (!options.isTest && !delivery.isOutbreakDeliveryEnabled(isDemo, env))) {
    result.skippedCount = list.length; result.blockedReason = 'OUTBREAK_EMAIL_DELIVERY_DISABLED'; return result;
  }
  // Allowlist for demonstration alerts (the administrator's own address is allowed for the test email).
  let allowed = list;
  if (isDemo) {
    const allow = new Set(String(env.OUTBREAK_DEMO_EMAIL_ALLOWLIST || '').split(',').map(e => e.trim().toLowerCase()).filter(e => e.includes('@')));
    const admin = String(options.adminEmail || '').trim().toLowerCase();
    if (admin.includes('@') && (options.isTest || !allow.size)) allow.add(admin);
    allowed = list.filter(e => allow.has(e));
    result.skippedCount += list.length - allowed.length;
    if (!allowed.length) { result.blockedReason = 'NOT_ON_ALLOWLIST'; return result; }
  }
  // Daily cap.
  const cap = dailyCap(env);
  let used = 0;
  try { used = Number(await emailService.getDailyDispatchedEmailCount()) || 0; } catch (_) {}
  const room = Math.max(0, cap - used);
  if (room < allowed.length) { result.skippedCount += allowed.length - room; allowed = allowed.slice(0, room); if (!allowed.length) { result.blockedReason = 'DAILY_EMAIL_CAP_REACHED'; return result; } }

  // Numbers come from records; if they cannot be loaded the email says "not available" (never invented values).
  let numbers = options.numbers || null;
  if (!numbers) { try { numbers = await numbersForAlert(alert, { cases: options.cases }); } catch (_) { numbers = {}; } }
  const languages = options.languages || await resolveLanguages(allowed, { db: options.db });
  // One send per language group through the existing outbreak transport (emailService.sendOutbreakAlert).
  const groups = new Map();
  for (const to of allowed) { const lang = languages.get(to) || 'en'; if (!groups.has(lang)) groups.set(lang, []); groups.get(lang).push(to); }
  for (const [language, emails] of groups) {
    const mail = buildDetailedOutbreakEmail(alert, numbers, { language, isSynthetic: isDemo, isTest: options.isTest, approverRole: options.approverRole, frontendUrl: options.frontendUrl });
    result.subjects[language] = mail.subject;
    try {
      const res = await emailService.sendOutbreakAlert(emails, { subject: mail.subject, html: mail.html, text: mail.text });
      const accepted = res && res.success !== false ? (res.acceptedCount !== undefined ? res.acceptedCount : emails.length) : 0;
      result.sentCount += accepted; result.failedCount += emails.length - accepted;
      if (!accepted) result.errors.push(res?.errorCode || 'DELIVERY_REJECTED');
      result.messageIds.push(...(res?.messageIds || []).filter(Boolean));
      console.log(`[OUTBREAK EMAIL] subject="${mail.subject}" messageIds=${(res?.messageIds || []).filter(Boolean).join(',') || 'none'} accepted=${accepted}/${emails.length}`);
    } catch (err) {
      result.failedCount += emails.length; result.errors.push('TRANSPORT_ERROR');
    }
  }
  result.subject = Object.values(result.subjects)[0];
  return result;
}

module.exports = { sendDetailedOutbreakEmail, numbersForAlert, resolveLanguages, dailyCap, DEFAULT_DAILY_CAP };
