const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  fullName: { type: String, default: 'Administrator' },
  name:     { type: String },
  email:    { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role:     { type: String, default: 'admin' },
  isSuperAdmin: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Admin', adminSchema);
