const mongoose = require('mongoose');
const versionedEncryption = require('../utils/versionedEncryption');

const consultationSchema = new mongoose.Schema({
  consultationId: { type: String, unique: true },
  patientNic: { type: String, required: true },
  patientNic_bi: { type: String, index: true },
  nicHash: { type: String, index: true },
  // Unencrypted ObjectId — use this for queries instead of the encrypted patientNic
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', index: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  diagnosis: { type: String, required: true },
  icdCode: String,
  icdDescription: String,
  notes: String,
  district: String,
  symptoms: [String],
  labTests: [{ type: String }],
  isFollowUpRequired: { type: Boolean, default: false },
  followUpDate: Date,
  followUpNotes: String,
  riskScore: Number,
  loginType: { type: String, enum: ['personal', 'hospital'] },
  sessionHospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  isDemoData: { type: Boolean, default: false },
  isSynthetic: { type: Boolean, default: false },
  keyVersion: { type: Number, default: () => global.ACTIVE_KEY_VERSION || 1 }
}, { timestamps: true });

consultationSchema.plugin(versionedEncryption, {
  fields: ['patientNic', 'diagnosis', 'notes']
});

module.exports = mongoose.model('Consultation', consultationSchema);