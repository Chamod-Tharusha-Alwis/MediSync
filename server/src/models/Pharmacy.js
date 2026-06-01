const mongoose = require('mongoose');

const pharmacySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  district: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  regNo: {
    type: String,
    unique: true,
    sparse: true // sparse allows multiple docs without a regNo, but ensures uniqueness if provided
  },
  phone: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PharmacyStaff'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  inventory: [{
    drugName: { type: String, required: true, trim: true },
    stock: { type: Number, default: 0, min: 0 },
    reorderLevel: { type: Number, default: 50 },
    unit: { type: String, default: 'tablets' }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

module.exports = mongoose.model('Pharmacy', pharmacySchema);
