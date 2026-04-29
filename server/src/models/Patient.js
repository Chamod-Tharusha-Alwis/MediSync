const mongoose = require('mongoose');
const fieldEncryption = require('mongoose-field-encryption').fieldEncryption;

const patientSchema = new mongoose.Schema({
  nic: { type: String, required: true, unique: true },
  fullName: { type: String, required: true },
  dateOfBirth: Date,
  gender: { type: String, enum: ['Male', 'Female', 'Other'] },
  district: String,
  contactInfo: String,
  bloodGroup: String,
  allergies: [String],
}, { timestamps: true });

// AES-256 field-level encryption on sensitive fields
patientSchema.plugin(fieldEncryption, {
  fields: ['nic', 'fullName', 'contactInfo', 'allergies'],
  secret: process.env.ENCRYPTION_KEY,
  saltGenerator: (secret) => secret.slice(0, 16)
});

module.exports = mongoose.model('Patient', patientSchema);