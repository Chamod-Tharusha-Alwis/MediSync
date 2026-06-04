const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  role: {
    type: String,
    required: true
  },
  title: {
    type: String,
    default: 'Notification'
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: [
      'prescription_ready', 'appointment_confirmed', 'outbreak_alert',
      'low_stock', 'general',
      'lab_test_approved', 'lab_report_ready'   // ← new lab types
    ],
    default: 'general'
  },
  referenceId: {
    type: String,            // links to labTestId, reportId, prescriptionId, etc.
    default: null
  },
  read: {
    type: Boolean,
    default: false
  },
  actionLink: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Notification', notificationSchema);
