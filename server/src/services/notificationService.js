const Notification = require('../models/Notification');

/**
 * sendNotification
 *
 * Persists a notification document and, if the target user is currently
 * connected via Socket.io, pushes it in real time.
 *
 * @param {import('socket.io').Server} io   – Socket.io server instance
 * @param {string}  userId                  – Mongo ObjectId of the recipient
 * @param {Object}  opts
 * @param {string}  opts.title              – Short notification title
 * @param {string}  opts.message            – Human-readable body
 * @param {string}  opts.type               – Notification type enum value
 * @param {string}  [opts.referenceId]      – Related entity id (labTest, prescription, …)
 * @param {string}  opts.role               – Recipient role (patient, doctor, …)
 * @param {string}  [opts.actionLink]       – Client-side route to navigate to
 * @returns {Promise<import('mongoose').Document>} saved notification
 */
async function sendNotification(io, userId, { title, message, type, referenceId, role, actionLink }) {
  // 1. Persist to MongoDB
  const notification = await Notification.create({
    userId,
    title,
    message,
    type,
    referenceId: referenceId || null,
    role,
    actionLink,
  });

  // 2. Push via Socket.io if the user is online
  if (typeof io?.emitToVerifiedUser === 'function') await io.emitToVerifiedUser(userId, 'notification', notification);

  return notification;
}

/**
 * getUnreadCount
 *
 * Returns the number of unread notifications for a given user.
 *
 * @param {string} userId – Mongo ObjectId of the user
 * @returns {Promise<number>}
 */
async function getUnreadCount(userId) {
  return Notification.countDocuments({ userId, read: false });
}

/**
 * notifyOutbreakAlert
 *
 * Dispatches notifications to Doctor, Hospital, and Admin users when an outbreak alert is created or activated.
 * Avoids duplicate notifications for the same alert referenceId.
 * Emits real-time socket events if Socket.io server instance is available.
 *
 * @param {Object} alert - The OutbreakAlert document or object
 * @param {Object} [opts]
 * @param {import('socket.io').Server} [opts.io] - Optional Socket.io instance
 * @returns {Promise<{ createdCount: number, recipientsCount: number, alertId: string }>}
 */
async function notifyOutbreakAlert(alert, { io } = {}) {
  if (!alert) return { createdCount: 0, recipientsCount: 0, alertId: null };

  const alertId = alert._id ? String(alert._id) : (alert.id ? String(alert.id) : null);
  const disease = alert.disease || 'Unknown Disease';
  const location = alert.location || alert.district || 'Nationwide';
  const severity = alert.severity || 'Moderate';
  const isSimulation = Boolean(alert.isSimulation);

  let Doctor, Hospital, Admin;
  try { Doctor = require('../models/Doctor'); } catch (_) {}
  try { Hospital = require('../models/Hospital'); } catch (_) {}
  try { Admin = require('../models/Admin'); } catch (_) {}

  const [doctors, hospitals, admins] = await Promise.all([
    Doctor?.find ? Doctor.find({ isActive: { $ne: false } }, { _id: 1 }).lean().catch(() => []) : [],
    Hospital?.find ? Hospital.find({ isActive: { $ne: false } }, { _id: 1 }).lean().catch(() => []) : [],
    Admin?.find ? Admin.find({ isActive: { $ne: false } }, { _id: 1, role: 1 }).lean().catch(() => []) : []
  ]);

  const recipients = [
    ...(Array.isArray(doctors) ? doctors : []).map(d => ({ userId: d._id, role: 'doctor', actionLink: '/public-health' })),
    ...(Array.isArray(hospitals) ? hospitals : []).map(h => ({ userId: h._id, role: 'hospital_admin', actionLink: '/public-health' })),
    ...(Array.isArray(admins) ? admins : []).map(a => ({ userId: a._id, role: a.role || 'admin', actionLink: '/admin/dashboard/outbreak' }))
  ];

  if (recipients.length === 0) {
    return { createdCount: 0, recipientsCount: 0, alertId };
  }

  let existingUserIds = new Set();
  if (alertId) {
    try {
      const existing = await Notification.find({
        type: 'outbreak_alert',
        referenceId: alertId
      }, { userId: 1 }).lean();
      if (Array.isArray(existing)) {
        existingUserIds = new Set(existing.map(e => String(e.userId)));
      }
    } catch (_) {}
  }

  const titlePrefix = isSimulation ? '[SIMULATION] ' : '';
  const title = `${titlePrefix}Outbreak Alert: ${disease} (${location})`;

  // Plain language trilingual alert message (U20)
  const getTrilingualPlainMessage = (role) => {
    if (role === 'admin' || role === 'super_admin') {
      return [
        `Outbreak alert: ${disease} rising in ${location}. ${severity} level. View Outbreak Monitor.`,
        `වසංගත අනතුරු ඇඟවීම: ${location} හි ${disease} වැඩිවේ. ${severity} මට්ටම. Outbreak Monitor බලන්න.`,
        `தொற்றுநோய் எச்சரிக்கை: ${location} இல் ${disease} பரவல் உயர்கிறது. ${severity} நிலை. Outbreak Monitor பார்க்கவும்.`
      ].join('\n');
    }
    // doctor, hospital_admin
    return [
      `Alert in your district: ${disease} cases increasing in ${location}. Check district dashboard.`,
      `ඔබගේ දිස්ත්‍රික්කයේ අනතුරු ඇඟවීමක්: ${location} හි ${disease} රෝගීන් සංඛ්‍යාව වැඩිවේ. දිස්ත්‍රික් පුවරුව පරීක්ෂා කරන්න.`,
      `உங்கள் மாவட்டத்தில் எச்சரிக்கை: ${location} இல் ${disease} பாதிப்புகள் அதிகரிக்கின்றன. மாவட்ட டாஷ்போர்டை சரிபார்க்கவும்.`
    ].join('\n');
  };

  const docsToInsert = recipients
    .filter(r => !existingUserIds.has(String(r.userId)))
    .map(r => ({
      userId: r.userId,
      role: r.role,
      title,
      message: alert.message && !alert.message.includes('Unreviewed statistical signal')
        ? alert.message
        : getTrilingualPlainMessage(r.role),
      type: 'outbreak_alert',
      referenceId: alertId,
      actionLink: r.actionLink,
      read: false,
      createdAt: new Date()
    }));

  let inserted = [];
  if (docsToInsert.length > 0) {
    inserted = await Notification.insertMany(docsToInsert);
  }

  const socketServer = io || global.io;
  if (socketServer) {
    for (const notif of inserted) {
      if (typeof socketServer.emitToVerifiedUser === 'function') {
        try {
          await socketServer.emitToVerifiedUser(notif.userId, 'notification', notif);
        } catch (_) {}
      }
    }
    if (typeof socketServer.emitToVerifiedAdmins === 'function') {
      try {
        await socketServer.emitToVerifiedAdmins('outbreak_alert', {
          alertId,
          disease,
          location,
          severity,
          isSimulation,
          message: getTrilingualPlainMessage('admin')
        });
      } catch (_) {}
    }
  }

  return {
    createdCount: inserted.length,
    recipientsCount: recipients.length,
    alertId
  };
}

module.exports = { sendNotification, getUnreadCount, notifyOutbreakAlert };
