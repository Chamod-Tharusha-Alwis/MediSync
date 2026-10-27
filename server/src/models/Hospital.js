const mongoose = require('mongoose');

const hospitalSchema = new mongoose.Schema({
  preferredLanguage: require('../security/preferredLanguage').preferredLanguageField(),
  isActive: { type: Boolean, default: true },
  isVerified: { type: Boolean, default: false },
  clinicalUseVersion: { type: Number, default: 0 },
  name: { type: String, required: true },
  type: { type: String, enum: ['government', 'private'], default: 'private' },
  district: String,
  address: String,
  regNo: { type: String, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  emergencyHotline: { type: String, default: '' },
  contactPhone: { type: String, default: '' },
  website: { type: String, default: '' },
  profilePicture: { type: String, default: '' },
  description: { type: String, default: '' },
  googleMapsUrl: { type: String, default: '' },
  pickupLocationAddress: { type: String, default: '' },
  averageRating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
  twoFactorEnabled: { type: Boolean, default: false },
  lastLoginAt: { type: Date },
  lastSignOutAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Hospital', hospitalSchema);
