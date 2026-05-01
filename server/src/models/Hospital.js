const mongoose = require('mongoose');

const hospitalSchema = new mongoose.Schema({
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
}, { timestamps: true });

module.exports = mongoose.model('Hospital', hospitalSchema);