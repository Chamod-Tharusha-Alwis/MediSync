const mongoose = require('mongoose');
const fieldEncryption = require('mongoose-field-encryption').fieldEncryption;

const doctorSchema = new mongoose.Schema({
  doctorId: { type: String, unique: true }, // auto-generated universal ID
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  specialization: String,
  licenseNo: { type: String, required: true },
  hospitals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' }],
  role: { type: String, default: 'doctor' },
  loginType: { type: String, enum: ['personal', 'hospital'] },
  twoFactorEnabled: { type: Boolean, default: false },
  otpSecret: String,
  personalEmail: String,
  contactNumber: String,
  clinicAddress: String,
  orgLogins: [{
    hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
    orgEmail: String,
    tempPassword: String,
    mustChangePassword: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true }
  }],
  passwordChangedAt: Date
}, { timestamps: true });

doctorSchema.plugin(fieldEncryption, {
  fields: ['licenseNo'],
  // global.ENCRYPTION_KEY is set by initializeVault() before this module is require()'d.
  // process.env.ENCRYPTION_KEY is the fallback for isolated test environments.
  secret: global.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY,
  saltGenerator: (secret) => secret.slice(0, 16)
});

module.exports = mongoose.model('Doctor', doctorSchema);