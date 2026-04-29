const mongoose = require('mongoose');
const fieldEncryption = require('mongoose-field-encryption').fieldEncryption;

const consultationSchema = new mongoose.Schema({
  patientNic: { type: String, required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  diagnosis: { type: String, required: true },
  icdCode: String,
  notes: String,
  district: String,
}, { timestamps: true });

consultationSchema.plugin(fieldEncryption, {
  fields: ['patientNic', 'diagnosis', 'notes'],
  secret: process.env.ENCRYPTION_KEY,
  saltGenerator: (secret) => secret.slice(0, 16)
});

module.exports = mongoose.model('Consultation', consultationSchema);