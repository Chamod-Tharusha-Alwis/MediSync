const mongoose = require('mongoose');
const fieldEncryption = require('mongoose-field-encryption').fieldEncryption;

const prescriptionSchema = new mongoose.Schema({
  consultationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Consultation' },
  patientNic: { type: String, required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
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

prescriptionSchema.plugin(fieldEncryption, {
  fields: ['patientNic', 'drugName', 'dosage'],
  secret: process.env.ENCRYPTION_KEY,
  saltGenerator: (secret) => secret.slice(0, 16)
});

module.exports = mongoose.model('Prescription', prescriptionSchema);