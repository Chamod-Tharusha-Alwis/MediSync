const mongoose = require('mongoose');
const fieldEncryption = require('mongoose-field-encryption').fieldEncryption;

const doctorSchema = new mongoose.Schema({
  doctorId: { type: String, unique: true }, // auto-generated universal ID
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  specialization: String,
  licenseNo: { type: String, required: true, unique: true },
  hospitals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' }],
  role: { type: String, default: 'doctor' }
}, { timestamps: true });

doctorSchema.plugin(fieldEncryption, {
  fields: ['licenseNo'],
  secret: process.env.ENCRYPTION_KEY,
  saltGenerator: (secret) => secret.slice(0, 16)
});

module.exports = mongoose.model('Doctor', doctorSchema);