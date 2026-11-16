// Presentation-only mapping of stored audit events to readable lines for the admin dashboard feed.
// Nothing here changes what is stored. Raw ids, NICs and redaction markers are never displayed.

const ROLE_LABELS = {
  admin: 'Administrator', super_admin: 'Super administrator', superadmin: 'Super administrator', health_officer: 'Health officer',
  doctor: 'Doctor', patient: 'Patient', hospital_admin: 'Hospital administrator', pharmacist: 'Pharmacist',
  pharmacy_admin: 'Pharmacy administrator', lab_technician: 'Lab technician', labTechnician: 'Lab technician',
  anonymous: 'Visitor', system: 'System',
};

// action -> [plain action, target type]
const ACTIONS = {
  USER_LOGIN: ['Signed in', 'session'], PATIENT_LOGIN: ['Signed in', 'session'], HOSPITAL_LOGIN: ['Signed in', 'session'],
  PHARMACY_LOGIN: ['Signed in', 'session'], USER_LOGOUT: ['Signed out', 'session'], LOGIN: ['Signed in', 'session'],
  USER_HEARTBEAT: ['Heartbeat', 'session'], REFRESH_TOKEN: ['Refreshed session', 'session'], VERIFY_TOKEN_REVOKED: ['Session check', 'session'],
  ALERT_APPROVED: ['Approved outbreak alert', 'outbreak alert'], APPROVE_OUTBREAK: ['Approved outbreak alert', 'outbreak alert'],
  ALERT_RESOLVED: ['Resolved outbreak alert', 'outbreak alert'], VERIFY_ALERT_STATUS: ['Reviewed outbreak alert', 'outbreak alert'],
  TRIGGER_ML_DETECTION: ['Ran outbreak scan', 'surveillance scan'], TRIGGER_ALERT: ['Ran outbreak scan', 'surveillance scan'],
  SURVEILLANCE_REVIEW: ['Reviewed surveillance case', 'surveillance case'], TEST_EMAIL_SENT: ['Sent test alert email', 'outbreak alert'],
  BROADCAST_ALERT: ['Sent broadcast', 'broadcast'],
  CREATE_CONSULTATION: ['Recorded consultation', 'consultation'], ISSUE_PRESCRIPTION: ['Issued prescription', 'prescription'],
  DISPENSE_PRESCRIPTION: ['Dispensed prescription', 'prescription'], DISPENSE_OTC: ['Dispensed medicine', 'prescription'],
  VIEW_PATIENT_RECORD: ['Viewed patient record', 'patient record'], VIEW_PATIENT_TIMELINE: ['Viewed patient timeline', 'patient record'],
  UPDATE_PATIENT_RECORD: ['Updated patient record', 'patient record'], REGISTER_PATIENT: ['Registered patient', 'patient record'],
  REGISTER_DOCTOR: ['Registered doctor', 'user account'], REGISTER_HOSPITAL: ['Registered hospital', 'organisation'],
  REGISTER_PHARMACY: ['Registered pharmacy', 'organisation'], ADD_ADMIN: ['Added administrator', 'user account'],
  BAN_USER: ['Suspended user', 'user account'], LIFT_BAN: ['Lifted suspension', 'user account'],
  ADMIN_TOGGLE_USER_STATUS: ['Changed user status', 'user account'], ADMIN_FORCE_LOGOUT: ['Forced sign-out', 'session'],
  ADMIN_VIEW_USER_AUDIT_PROFILE: ['Viewed user audit profile', 'user account'], ADMIN_REVEAL_PII: ['Revealed protected field', 'user account'],
  CREATE_LAB_ORDER: ['Ordered lab test', 'lab order'], UPLOAD_LAB_REPORT: ['Uploaded lab report', 'lab order'],
  VIEW_LAB_REPORT: ['Viewed lab report', 'lab order'], CHECK_DRUG_INTERACTIONS: ['Checked medicine interactions', 'medicine check'],
  CHECK_MEDICINE_SAFETY: ['Checked medicine safety', 'medicine check'], ML_PREDICT_DISEASE: ['Requested symptom suggestions', 'symptom check'],
  CHANGE_PASSWORD: ['Changed password', 'user account'], RESET_PASSWORD: ['Reset password', 'user account'],
  CREATE_SUPPORT_TICKET: ['Opened support ticket', 'support ticket'], REPLY_SUPPORT_TICKET: ['Replied to support ticket', 'support ticket'],
};

// Transport noise hidden by default: heartbeats, token refresh, plain GET requests and polling.
const NOISE_ACTIONS = new Set(['USER_HEARTBEAT', 'REFRESH_TOKEN', 'VERIFY_TOKEN_REVOKED', 'MARK_NOTIFICATION_READ', 'MARK_NOTIFICATIONS_READ']);
export function isSystemEvent(action) {
  const a = String(action || '').toUpperCase();
  return NOISE_ACTIONS.has(a) || /^GET[_ ]/.test(a) || /STATS|POLL|HEALTH|ML_STATUS|LAST_SCAN/.test(a);
}

const titleCase = s => s.toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim().replace(/^./, c => c.toUpperCase());

export function describeAction(action) {
  const a = String(action || '').toUpperCase();
  if (ACTIONS[a]) return { text: ACTIONS[a][0], target: ACTIONS[a][1] };
  const m = a.match(/^(GET|POST|PUT|PATCH|DELETE)[_ ](.*)$/);
  if (m) {
    const path = m[2].replace(/^_?API_/, '').replace(/_+/g, ' ').trim().toLowerCase();
    if (m[1] === 'GET') return { text: path.includes('stats') || path.includes('dashboard') || !path ? 'Viewed dashboard' : 'Viewed page', target: null };
    return { text: 'Changed data', target: path ? path.split(' ')[0] : null };
  }
  if (!a) return { text: 'Activity', target: null };
  return { text: titleCase(a), target: null };
}

export function roleLabel(role) {
  const r = String(role || '').trim();
  return ROLE_LABELS[r] || (r ? titleCase(r) : 'Unknown role');
}

export function relativeTime(when, now = Date.now()) {
  const t = new Date(when).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

/**
 * events: newest first, each { _id, action, actorRole, timestamp }.
 * Returns display rows; consecutive identical (role + action) events are grouped with a count.
 */
export function buildAuditFeed(events = [], { showSystem = false, now = Date.now(), limit = 25 } = {}) {
  const rows = [];
  let hidden = 0;
  for (const e of events || []) {
    const system = isSystemEvent(e.action);
    if (system && !showSystem) { hidden++; continue; }
    const d = describeAction(e.action);
    const actor = roleLabel(e.actorRole);
    const last = rows[rows.length - 1];
    if (last && last.action === e.action && last.actor === actor) { last.count++; continue; }
    rows.push({ key: String(e._id || `${e.action}-${e.timestamp}`), action: e.action, actor, text: d.text, target: d.target, system,
      when: e.timestamp || e.createdAt, ago: relativeTime(e.timestamp || e.createdAt, now), count: 1 });
  }
  return { rows: rows.slice(0, limit), hiddenSystemEvents: hidden };
}

export function rowSentence(row) {
  return `${row.actor}: ${row.text}${row.count > 1 ? ` × ${row.count}` : ''}${row.target ? ` (${row.target})` : ''}`;
}
