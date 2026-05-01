const mongoose = require('mongoose');

const broadcastMessageSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true
  },
  targetRole: {
    type: String,
    enum: ['all', 'doctor', 'patient', 'pharmacist', 'health_officer'],
    required: true
  },
  targetDistrict: {
    type: String,
    trim: true
  },
  sentBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // Or specific admin model if it exists
  },
  sentAt: {
    type: Date,
    default: Date.now
  },
  readBy: [{
    type: mongoose.Schema.Types.ObjectId
  }]
});

module.exports = mongoose.model('BroadcastMessage', broadcastMessageSchema);
