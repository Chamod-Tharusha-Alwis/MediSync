const mongoose = require('mongoose');
const versionedEncryption = require('../utils/versionedEncryption');

const patientSchema = new mongoose.Schema({
  nic: { type: String, required: true, unique: true },
  patientNic_bi: { type: String }, // blind index for NIC
  fullName: { type: String, required: true },
  dateOfBirth: Date,
  gender: { type: String, enum: ['Male', 'Female', 'Other'] },
  district: String,
  contactInfo: String,
  address: { type: String, default: '' },  // physical address
  email: { type: String, required: true, unique: true },
  bloodGroup: String,
  allergies: [String],
  password: { type: String, required: true }, // Added for auth
  isActive: { type: Boolean, default: true }, // for ban/block system
  reportedDoctors: [{
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    reason: String,
    reportedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['pending', 'reviewed', 'dismissed'], default: 'pending' }
  }],
  emergencyContact: {
    name: String,
    relationship: String,
    phone: String
  },
  insurance: {
    provider: String,
    policyNumber: String,
    expiryDate: Date
  },
  chronicConditions: [String],
  riskScore: { type: Number, default: 0 },
  riskLevel: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
  height: { type: Number, default: null },   // centimetres
  weight: { type: Number, default: null },   // kilograms
  profilePicture: { type: String, default: '' },
  keyVersion: { type: Number, default: () => global.ACTIVE_KEY_VERSION || 1 }
}, { timestamps: true });

// AES-256 field-level encryption on sensitive clinical fields (NOT nic - it's used as a lookup key)
patientSchema.plugin(versionedEncryption, {
  fields: ['fullName', 'contactInfo', 'allergies']
});

module.exports = mongoose.model('Patient', patientSchema);