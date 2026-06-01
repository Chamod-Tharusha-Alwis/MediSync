const mongoose = require('mongoose');

const outbreakAlertSchema = new mongoose.Schema({
  disease: { 
    type: String, 
    required: true 
  },
  severity: { 
    type: String, 
    enum: ['Low', 'Moderate', 'High', 'Critical'], 
    default: 'Moderate' 
  },
  affectedCount: { 
    type: Number, 
    default: 1 
  },
  location: { 
    type: String,
    default: 'Nationwide'
  },
  status: { 
    type: String, 
    enum: ['Active', 'Resolved'], 
    default: 'Active' 
  },
  message: {
    type: String
  },
  feedbackStatus: {
    type: String,
    enum: ['unverified', 'confirmed', 'false_positive'],
    default: 'unverified'
  }
}, { 
  timestamps: true 
});

module.exports = mongoose.model('OutbreakAlert', outbreakAlertSchema);