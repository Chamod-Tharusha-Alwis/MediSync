const mongoose = require('mongoose');

const dispensingSchema = new mongoose.Schema({
  prescriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Prescription',
    required: true
  },
  pharmacyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pharmacy',
    required: true
  },
  staffId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PharmacyStaff',
    required: true
  },
  patientNic: {
    type: String,
    required: true
  },
  items: [{
    drugName: {
      type: String,
      required: true
    },
    dosage: {
      type: String,
      required: true
    },
    quantityDispensed: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ['dispensed', 'out_of_stock', 'partial'],
      required: true
    }
  }],
  notes: {
    type: String
  },
  dispensedAt: {
    type: Date,
    default: Date.now
  },
  receiptNumber: {
    type: String,
    unique: true,
    required: true
  }
});

module.exports = mongoose.model('Dispensing', dispensingSchema);
