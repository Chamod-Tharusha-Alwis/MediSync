const mongoose = require('mongoose');
const fieldEncryption = require('mongoose-field-encryption').fieldEncryption;

const prescriptionSchema = new mongoose.Schema({
  prescriptionId: { type: String, unique: true },
  consultationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Consultation' },
  patientNic: { type: String, required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', default: null },
  drugName: { type: String, required: true },
  dosage: { type: String, required: true },
  frequency: { type: String, required: true },
  durationDays: Number,
  status: { 
    type: String, 
    enum: ['issued', 'dispensed', 'expired', 'cancelled'],
    default: 'issued'
  },
  issuedAt: { type: Date, default: Date.now },
  expiresAt: Date,
  dispensedAt: Date,
  dispensedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy' }
}, { timestamps: true });

// Auto-generate prescriptionId before saving if not set
prescriptionSchema.pre('save', async function() {
  if (!this.prescriptionId) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const rand = Math.floor(100000 + Math.random() * 900000);
    this.prescriptionId = `RX-${year}${month}${day}-${rand}`;
  }
});

prescriptionSchema.plugin(fieldEncryption, {
  fields: ['patientNic', 'drugName', 'dosage'],
  secret: process.env.ENCRYPTION_KEY,
});

module.exports = mongoose.model('Prescription', prescriptionSchema);