const mongoose = require('mongoose');
const fieldEncryption = require('mongoose-field-encryption').fieldEncryption;

const consultationSchema = new mongoose.Schema({
  patientNic: { type: String, required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  diagnosis: { type: String, required: true },
  icdCode: String,
  icdDescription: String,
  notes: String,
  district: String,
  symptoms: [String],
  isFollowUpRequired: { type: Boolean, default: false },
  followUpDate: Date,
  followUpNotes: String,
  riskScore: Number,
  loginType: { type: String, enum: ['personal', 'hospital'] },
  sessionHospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
}, { timestamps: true });

consultationSchema.plugin(fieldEncryption, {
  fields: ['patientNic', 'diagnosis', 'notes'],
  secret: process.env.ENCRYPTION_KEY,
});

module.exports = mongoose.model('Consultation', consultationSchema);