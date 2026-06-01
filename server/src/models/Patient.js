const mongoose = require('mongoose');
const fieldEncryption = require('mongoose-field-encryption').fieldEncryption;

const patientSchema = new mongoose.Schema({
  nic: { type: String, required: true, unique: true },
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
}, { timestamps: true });

// AES-256 field-level encryption on sensitive clinical fields (NOT nic - it's used as a lookup key)
patientSchema.plugin(fieldEncryption, {
  fields: ['fullName', 'contactInfo', 'allergies'],
  // global.ENCRYPTION_KEY is set by initializeVault() before this module is require()'d.
  // process.env.ENCRYPTION_KEY is the fallback for isolated test environments.
  secret: global.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY,
  saltGenerator: (secret) => secret.slice(0, 16)
});

module.exports = mongoose.model('Patient', patientSchema);