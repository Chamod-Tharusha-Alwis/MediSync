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
    console.error('Notification persistence unavailable.');
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const scope = { userId: req.user.id, role: req.user.role };
    const [notifications, unreadCount] = await Promise.all([
      Notification.find(scope).sort({ createdAt: -1 }).limit(50),
      Notification.countDocuments({ ...scope, read: false })
    ]);

    res.json({ data: notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) return res.status(400).json({ error: 'Invalid notification ID' });
    const notif = await Notification.findOneAndUpdate(
      { _id: id, userId: req.user.id, role: req.user.role },
      { read: true },
      { new: true }
    );
    if (!notif) return res.status(404).json({ error: 'Notification not found' });
    res.json({ message: 'Marked as read', data: notif });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
};

exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user.id, role: req.user.role, read: false },
      { read: true }
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
};
