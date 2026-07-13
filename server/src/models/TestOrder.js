const mongoose = require('mongoose');
const versionedEncryption = require('../utils/versionedEncryption');

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
  keyVersion: { type: Number, default: () => global.ACTIVE_KEY_VERSION || 1 }
}, { timestamps: true });

// Index for fast patient lookups sorted by date
testOrderSchema.index({ patientNic: 1, orderedAt: -1 });

// Field-level encryption on sensitive clinical data
testOrderSchema.plugin(versionedEncryption, {
  fields: ['patientNic', 'resultNotes']
});

module.exports = mongoose.model('TestOrder', testOrderSchema);
