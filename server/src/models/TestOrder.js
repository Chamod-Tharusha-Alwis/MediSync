const mongoose = require('mongoose');
const fieldEncryption = require('mongoose-field-encryption').fieldEncryption;

const testOrderSchema = new mongoose.Schema({
  consultationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Consultation', required: true },
  patientNic: { type: String, required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
  hospitalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hospital' },
  testName: { type: String, required: true },
  testCategory: {
    type: String,
    enum: ['blood', 'urine', 'imaging', 'biopsy', 'culture', 'ecg', 'mri', 'ct', 'xray', 'ultrasound', 'other'],
    required: true
  },
  urgency: { type: String, enum: ['routine', 'urgent', 'stat'], default: 'routine' },
  instructions: { type: String },
  isSurgeryRelated: { type: Boolean, default: false },
  surgeryNotes: { type: String },
  status: {
    type: String,
    enum: ['ordered', 'sample_collected', 'processing', 'completed', 'cancelled'],
    default: 'ordered'
  },
  orderedAt: { type: Date, default: Date.now },
  resultUploadedAt: { type: Date },
  resultFileUrl: { type: String },
  resultFileName: { type: String },
  resultCloudinaryId: { type: String },
  resultNotes: { type: String },
  reportedBy: { type: String },
}, { timestamps: true });

// Index for fast patient lookups sorted by date
testOrderSchema.index({ patientNic: 1, orderedAt: -1 });

// Field-level encryption on sensitive clinical data
testOrderSchema.plugin(fieldEncryption, {
  fields: ['patientNic', 'resultNotes'],
  secret: process.env.ENCRYPTION_KEY,
  saltGenerator: (secret) => secret.slice(0, 16)
});

module.exports = mongoose.model('TestOrder', testOrderSchema);
