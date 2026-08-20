const mongoose = require('mongoose');
const versionedEncryption = require('../utils/versionedEncryption');

const doctorSchema = new mongoose.Schema({
  doctorId: { type: String, unique: true }, // auto-generated universal ID
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  specialization: String,
  licenseNo: { type: String, required: true },
  hospitals: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' }],
  role: { type: String, default: 'doctor' },
  loginType: { type: String, enum: ['personal', 'hospital'], default: 'personal' },
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
  passwordChangedAt: Date,
  profilePicture: { type: String, default: '' },
  description: { type: String, default: '' },
  googleMapsUrl: { type: String, default: '' },
  averageRating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
  keyVersion: { type: Number, default: () => global.ACTIVE_KEY_VERSION || 1 },
  lastLoginAt: { type: Date },
  lastSignOutAt: { type: Date }
}, { timestamps: true });

doctorSchema.plugin(versionedEncryption, {
  fields: ['licenseNo']
});

module.exports = mongoose.model('Doctor', doctorSchema);