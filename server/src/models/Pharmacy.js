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
  // Inventory/stock fields were removed: MediSync does not manage pharmacy stock.
  // Legacy documents may still hold an `inventory` array; it is no longer read or written.
  createdAt: {
    type: Date,
    default: Date.now
  },
  profilePicture: { type: String, default: '' },
  description: { type: String, default: '' },
  googleMapsUrl: { type: String, default: '' },
  pickupLocationAddress: { type: String, default: '' },
  averageRating: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Pharmacy', pharmacySchema);
