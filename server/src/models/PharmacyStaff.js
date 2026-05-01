const mongoose = require('mongoose');

const pharmacyStaffSchema = new mongoose.Schema({
  pharmacyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pharmacy',
    required: true
  },
  fullName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['pharmacy_admin', 'pharmacist', 'assistant'],
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  mustChangePassword: {
    type: Boolean,
    default: true
  },
  tempPassword: {
    type: String
  },
  lastLogin: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PharmacyStaff' // Self-referencing if created by another staff (admin)
  }
}, { timestamps: true });

module.exports = mongoose.model('PharmacyStaff', pharmacyStaffSchema);
