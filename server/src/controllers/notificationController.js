const Notification = require('../models/Notification');

// Helper function to create notification internally
exports.createNotification = async (userId, role, message, type, actionLink = null) => {
  try {
    const notif = new Notification({
      userId,
      role,
      message,
      type,
      actionLink
    });
    await notif.save();
    return notif;
  } catch (err) {
    console.error('Failed to create notification:', err);
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);
    
    const unreadCount = notifications.filter(n => !n.read).length;

    res.json({ data: notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notifications', details: error.message });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const notif = await Notification.findOneAndUpdate(
      { _id: id, userId: req.user.id },
      { read: true },
      { new: true }
    );
    if (!notif) return res.status(404).json({ error: 'Notification not found' });
    res.json({ message: 'Marked as read', data: notif });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark notification as read', details: error.message });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user.id, read: false },
      { read: true }
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark all as read', details: error.message });
  }
};
