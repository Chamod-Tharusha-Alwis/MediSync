'use strict';
/**
 * How a scan signal is saved (what happens AFTER the detector decides; the detector itself is not touched).
 *
 *   identity = policy + mode (isSimulation) + disease + location
 *   an active alert (Pending or Active) with that identity exists -> update it, or do nothing if nothing changed
 *   otherwise                                                     -> create one, unless a closed alert already covers every case
 *
 * Two scans at the same moment: updates are compare-and-set on updateCount; creations share one deterministic _id, so the
 * unique _id index lets only one through. docs/perf/alert_update_findings.md explains the choices.
 */
const crypto = require('crypto');
const mongoose = require('mongoose');

const ACTIVE_STATUSES = Object.freeze(['Pending', 'Active']);
const CLOSED_STATUSES = Object.freeze(['Resolved', 'Dismissed']);
const SEVERITY_RANK = Object.freeze({ Low: 0, Moderate: 1, High: 2, Critical: 3 });
const NOTE_LOWER = 'WINDOW_RESULT_LOWER';
const MAX_ATTEMPTS = 20; // each retry means another scan or an administrator changed the alert in between

const rank = s => (s in SEVERITY_RANK ? SEVERITY_RANK[s] : -1);
const idOf = v => String(v && v._id ? v._id : v);

const identityFilter = s => ({ surveillancePolicy: s.surveillancePolicy, isSimulation: s.isSimulation, disease: s.disease, location: s.location });

// Existing unit tests replace the model with partial mocks, so a missing method means "nothing stored".
async function lean(query) {
  if (!query) return null;
  return typeof query.lean === 'function' ? query.lean() : query;
}
async function findActive(Model, signal) {
  if (typeof Model.findOne !== 'function') return null;
  const q = Model.findOne({ ...identityFilter(signal), status: { $in: [...ACTIVE_STATUSES] } });
  return (await lean(q && typeof q.sort === 'function' ? q.sort({ createdAt: -1, _id: -1 }) : q)) || null;
}
async function findClosed(Model, signal) {
  if (typeof Model.find !== 'function') return [];
  const q = Model.find({ ...identityFilter(signal), status: { $in: [...CLOSED_STATUSES] } });
  const rows = await lean(q && typeof q.select === 'function' ? q.select('status severity sourceConsultationIds updatedAt') : q);
  return Array.isArray(rows) ? rows : [];
}

/** The figures a scan measured, in one comparable object. */
function measurementOf(signal) {
  const s = signal.snapshot72h;
  return { caseCount: signal.caseCount, severity: signal.severity, ...(signal.alertLevel ? { alertLevel: signal.alertLevel } : {}),
    previous72h: s ? s.previous72h : null, actual72h: s ? s.actual72h : null, projected72h: s ? s.projected : null };
}

/** The last measured figures of a stored alert. Alerts saved before this feature fall back to what they have. */
function lastMeasurement(alert) {
  if (alert.lastMeasured) return alert.lastMeasured;
  const s = alert.projection72h;
  return { caseCount: alert.affectedCount ?? null, severity: alert.severity ?? null, previous72h: s ? s.previous72h : null, actual72h: s ? s.actual72h : null, projected72h: s ? s.projected : null };
}

function isChanged(before, after) {
  if (before.caseCount !== after.caseCount || before.severity !== after.severity) return true;
  // An old alert without a stored 72-hour figure has nothing to compare: that alone is not a change.
  return ['previous72h', 'actual72h', 'projected72h'].some(k => before[k] !== null && before[k] !== undefined && after[k] !== null && before[k] !== after[k]);
}

function historyEntry(alert, before, after, signal, at, displayedCaseCount) {
  const lower = typeof before.caseCount === 'number' && after.caseCount < before.caseCount;
  return {
    at, source: signal.source, triggeredBy: signal.triggeredBy, ...(signal.actor && signal.actor.id ? { actorId: String(signal.actor.id) } : {}),
    caseCountBefore: before.caseCount, caseCountAfter: after.caseCount, displayedCaseCount,
    severityBefore: before.severity, severityAfter: after.severity,
    actual72hBefore: before.actual72h ?? null, previous72h: after.previous72h, actual72h: after.actual72h, projected72h: after.projected72h,
    ...(lower || after.caseCount < displayedCaseCount ? { note: NOTE_LOWER } : {}),
  };
}

const sameIds = (a = [], b = []) => a.length === b.length && JSON.stringify(a.map(idOf).sort()) === JSON.stringify(b.map(idOf).sort());

async function updateActive(Model, alert, signal, at) {
  const before = lastMeasurement(alert), after = measurementOf(signal);
  if (!isChanged(before, after)) {
    // Same figures. New source rows that do not count yet (today's partial day) are only remembered, silently.
    // Demonstration labels are also kept in step, as every scan did before.
    const relabel = Object.entries(signal.flags).some(([k, v]) => (alert[k] ?? (k === 'isDemoData' ? false : undefined)) !== v);
    if (relabel || !sameIds(alert.sourceConsultationIds, signal.sourceConsultationIds)) {
      await Model.updateOne({ _id: alert._id, status: { $in: [...ACTIVE_STATUSES] } }, { $set: { ...signal.flags, sourceConsultationIds: signal.sourceConsultationIds } }, { timestamps: false });
    }
    return { action: 'unchanged', alert };
  }
  const displayed = Math.max(Number(alert.affectedCount) || 0, signal.caseCount); // a smaller window never lowers the displayed count
  const count = Number(alert.updateCount) || 0;
  const set = {
    ...signal.flags, severity: signal.severity, affectedCount: displayed, message: signal.message,
    ...(signal.alertLevel ? { alertLevel: signal.alertLevel } : {}),
    ...(signal.snapshot72h ? { latest72h: signal.snapshot72h } : {}),
    lastMeasured: after, sourceConsultationIds: signal.sourceConsultationIds,
    firstDetectedAt: alert.firstDetectedAt || alert.createdAt || at, lastUpdatedAt: at,
  };
  const updated = await lean(Model.findOneAndUpdate(
    { _id: alert._id, ...identityFilter(signal), status: { $in: [...ACTIVE_STATUSES] }, updateCount: count === 0 ? { $in: [0, null] } : count },
    { $set: set, $inc: { updateCount: 1 }, $push: { updateHistory: historyEntry(alert, before, after, signal, at, displayed) } },
    { returnDocument: 'after' }
  ));
  if (!updated) return null; // another scan updated it, or an administrator closed it: the caller reads again
  return { action: 'updated', alert: updated, before, after, escalated: rank(after.severity) > rank(before.severity) };
}

function newAlertId(signal, closed) {
  const key = [signal.surveillancePolicy, signal.mode, signal.location, signal.disease, 'after', ...closed.map(c => String(c._id)).sort()];
  return new mongoose.Types.ObjectId(crypto.createHash('sha256').update(JSON.stringify(key)).digest('hex').slice(0, 24));
}

async function createAlert(Model, signal, closed, at) {
  const _id = newAlertId(signal, closed);
  let result;
  try {
    result = await Model.updateOne(
      { _id, status: { $in: [...ACTIVE_STATUSES] } },
      {
        $setOnInsert: {
          status: 'Pending', surveillancePolicy: signal.surveillancePolicy, sourceConsultationIds: signal.sourceConsultationIds, isSimulation: signal.isSimulation,
          disease: signal.disease, location: signal.location, affectedCount: signal.caseCount, severity: signal.severity, message: signal.message,
          ...(signal.alertLevel ? { alertLevel: signal.alertLevel } : {}),
          firstDetectedAt: at, lastUpdatedAt: at, createdAt: at, updatedAt: at, updateCount: 0, lastMeasured: measurementOf(signal),
        },
        $set: { ...signal.flags }, // demonstration provenance
      },
      { upsert: true, timestamps: false }
    );
  } catch (error) {
    if (error && error.code === 11000) return null; // another scan created it at the same moment
    throw error;
  }
  if (result && result.upsertedCount === 0) return null;
  return { action: 'created', alert: { _id, status: 'Pending', severity: signal.severity } };
}

/**
 * Saves one signal. Returns { action: 'created' | 'updated' | 'unchanged' | 'closed', alert, escalated?, before?, after? }.
 * signal: { surveillancePolicy, mode, isSimulation, disease, location, caseCount, severity, alertLevel?, message, flags,
 *           sourceConsultationIds, snapshot72h?, source, triggeredBy, actor? }
 */
async function saveScanAlert(Model, signal, { at = new Date() } = {}) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const active = await findActive(Model, signal);
    if (active) {
      const done = await updateActive(Model, active, signal, at);
      if (done) return done;
      continue;
    }
    const closed = await findClosed(Model, signal);
    const current = signal.sourceConsultationIds.map(idOf);
    const covered = closed.find(c => {
      const known = new Set((c.sourceConsultationIds || []).map(idOf));
      return known.size > 0 && current.every(id => known.has(id));
    });
    if (covered) return { action: 'closed', alert: covered }; // no case is new since that alert was closed
    const created = await createAlert(Model, signal, closed, at);
    if (created) return created;
  }
  throw new Error('ALERT_SAVE_CONTENTION');
}

/** One audit entry for an update, through the existing audit helper (never throws). */
async function auditUpdate(outcome, signal) {
  const { recordAudit } = require('../utils/auditLogger');
  await recordAudit({
    actorId: signal.actor && signal.actor.id ? String(signal.actor.id) : 'system', actorRole: (signal.actor && signal.actor.role) || 'system',
    action: 'ALERT_UPDATED_BY_SCAN', deviceModel: 'surveillance-scan',
    details: {
      alertId: String(outcome.alert._id), disease: signal.disease, district: signal.location, triggeredBy: signal.triggeredBy, source: signal.source,
      severityBefore: String(outcome.before.severity), severityAfter: String(outcome.after.severity),
      caseCountBefore: outcome.before.caseCount ?? -1, caseCountAfter: outcome.after.caseCount, displayedCaseCount: outcome.alert.affectedCount,
      updateNumber: outcome.alert.updateCount,
    },
  });
}

module.exports = { ACTIVE_STATUSES, CLOSED_STATUSES, NOTE_LOWER, identityFilter, measurementOf, lastMeasurement, isChanged, saveScanAlert, auditUpdate };
