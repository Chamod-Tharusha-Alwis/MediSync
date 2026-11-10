const mongoose = require('mongoose');
const versionedEncryption = require('../security/fieldEncryption');

const prescriptionSchema = new mongoose.Schema({
  prescriptionId: { type: String, unique: true },
  // Optional — not set for OTC dispensings
  consultationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Consultation' },
  consultationRef: { type: String }, // Human-readable CON-XXXXXX string
  patientNic: { type: String, required: true },
  patientNic_bi: { type: String, index: true },
  nicHash: { type: String, index: true },
  // Unencrypted ObjectId — use for queries instead of encrypted patientNic
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', index: true },
  // Optional — not set for OTC dispensings
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital', default: null },
  // Single-drug fields (used by doctor prescriptions)
  drugName: { type: String, default: '' },
  dosage: { type: String, default: '' },
  frequency: { type: String, default: '' },
  durationDays: Number,
  instructions: { type: String, default: '' },
  labTests: [{ type: String }],
  // Multi-drug array (used by OTC dispensings and multi-Rx consultations)
  medications: [{
    name:     { type: String },
    dosage:   { type: String },
    frequency:{ type: String },
  }],
  // OTC flags
  isOTC: { type: Boolean, default: false },
  dispensedByPharmacist: { type: String }, // Pharmacist full name
  dispenserStaffId: { type: String },      // PharmacyStaff ObjectId as string
  pharmacyName: { type: String },          // Pharmacy name at time of dispensing
  status: { 
    type: String, 
    enum: ['pending', 'dispensed', 'issued', 'partially_dispensed', 'expired', 'cancelled'],
    default: 'pending'
  },
  issuedAt: { type: Date, default: Date.now },
  expiresAt: Date,
  dispensedAt: Date,
  dispensedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Pharmacy' },
  // Alternative medication tracking
  isAlternativeDispensed: { type: Boolean, default: false },
  alternativeDetails:     { type: String, default: '' },
  // Safety override tracking (Task P10-A: Warn, never block)
  safetyOverride: {
    acknowledged: { type: Boolean, default: false },
    acknowledgedAt: Date,
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' },
    reason: { type: String, default: '' },
    findings: [{
      type: { type: String },
      severity: { type: String },
      items: [String],
      summary: String,
      source: String
    }],
    findingTypes: [String]
  },
  // Supersession tracking (Task R6: Auto-expiry / supersession of repeated medication)
  supersededBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Prescription', default: null },
  supersededByConsultationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Consultation', default: null },
  supersededAt: { type: Date, default: null },
  supersededReason: { type: String, default: null },
  resolvedIngredients: [{ type: String }],
  keyVersion: { type: Number, default: () => global.ACTIVE_KEY_VERSION || 1 }
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

prescriptionSchema.plugin(versionedEncryption, {
  fields: ['patientNic', 'drugName', 'dosage']
});

module.exports = mongoose.model('Prescription', prescriptionSchema);
