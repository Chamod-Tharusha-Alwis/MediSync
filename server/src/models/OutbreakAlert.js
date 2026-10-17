const mongoose = require('mongoose');

const outbreakAlertSchema = new mongoose.Schema({
  surveillancePolicy: String,
  sourceConsultationIds: [{type:mongoose.Schema.Types.ObjectId,ref:'Consultation'}],
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
    enum: ['Pending', 'Active', 'Resolved', 'Dismissed'], 
    default: 'Pending' 
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  approvedAt: {
    type: Date
  },
  emailScope: {
    type: String,
    enum: ['none', 'district', 'national'],
    default: 'none'
  },
  message: {
    type: String
  },
  feedbackStatus: {
    type: String,
    enum: ['unverified', 'confirmed', 'false_positive'],
    default: 'unverified'
  },
  dangerLevel: {
    type: String,
    enum: ['Low', 'Medium', 'High']
  },
  riskLevel: {
    type: String,
    enum: ['Normal', 'Low', 'Medium', 'High']
  },
  responsePriority: {
    type: String
  },
  isDemoData: {
    type: Boolean,
    default: false
  },
  isSyntheticUniversityData: {
    type: Boolean,
    default: false
  },
  datasetVersion: {
    type: String
  },
  isSimulation: {
    type: Boolean,
    default: false
  }
}, { 
  timestamps: true 
});

module.exports = mongoose.model('OutbreakAlert', outbreakAlertSchema);
