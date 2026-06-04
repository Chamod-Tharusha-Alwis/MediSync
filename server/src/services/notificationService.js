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
  if (io.userSocketMap) {
    const socketId = io.userSocketMap.get(userId.toString());
    if (socketId) {
      io.to(socketId).emit('notification', notification);
    }
  }

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

module.exports = { sendNotification, getUnreadCount };
