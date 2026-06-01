const mongoose = require('mongoose');
const fieldEncryption = require('mongoose-field-encryption').fieldEncryption;

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
}, { timestamps: true });

consultationSchema.plugin(fieldEncryption, {
  fields: ['patientNic', 'diagnosis', 'notes'],
  // global.ENCRYPTION_KEY is set by initializeVault() before this module is require()'d.
  // process.env.ENCRYPTION_KEY is the fallback for isolated test environments.
  secret: global.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY,
});

module.exports = mongoose.model('Consultation', consultationSchema);