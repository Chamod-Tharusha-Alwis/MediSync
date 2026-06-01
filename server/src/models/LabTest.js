// server/src/models/LabTest.js
const mongoose  = require('mongoose');
const encrypt   = require('mongoose-field-encryption').fieldEncryption;

const { Schema } = mongoose;

// ─── Lab Test ID generator ────────────────────────────────────────────────────
// Format: LT-YYYYMMDD-XXXX   e.g. LT-20260527-4821
function generateLabTestId() {
  const date   = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Math.floor(1000 + Math.random() * 9000); // 4-digit random
  return `LT-${date}-${suffix}`;
}

// ─── Schema ───────────────────────────────────────────────────────────────────
const LabTestSchema = new Schema(
  {
    // ── Unique public ID (shown to patient and hospital) ──────────────────────
    labTestId: {
      type:     String,
      unique:   true,
      default:  generateLabTestId,
      index:    true,
    },

    // ── Patient identifiers ───────────────────────────────────────────────────
    patientNic: {
      type:     String,        // stored encrypted by mongoose-field-encryption
      required: true,
    },
    patientNic_bi: {
      type:     String,        // SHA-256(nic) — blind index for querying, NOT encrypted
      required: true,
      index:    true,
    },
    patientName: {
      type:     String,        // encrypted
    },
    patientEmail: {
      type:     String,        // encrypted — used for status emails
    },

    // ── Hospital / staff ──────────────────────────────────────────────────────
    hospitalId: {
      type:     Schema.Types.ObjectId,
      ref:      'Hospital',
      required: true,
    },
    acceptedBy: {
      type:     Schema.Types.ObjectId,
      ref:      'User',        // hospital admin / lab technician
      required: true,
    },

    // ── Referring doctor (optional) ───────────────────────────────────────────
    referredBy: {
      type:     Schema.Types.ObjectId,
      ref:      'Doctor',
      default:  null,
    },

    // ── Test details ──────────────────────────────────────────────────────────
    testName: {
      type:     String,
      required: true,
      trim:     true,
    },
    testCategory: {
      type: String,
      enum: [
        'Haematology', 'Biochemistry', 'Microbiology',
        'Immunology', 'Pathology', 'Radiology',
        'Cardiology', 'Urine Analysis', 'Other',
      ],
      default: 'Other',
    },
    urgency: {
      type:    String,
      enum:    ['routine', 'urgent', 'stat'],
      default: 'routine',
    },
    notes: {
      type:  String,
      default: '',
    },

    // ── Status lifecycle ──────────────────────────────────────────────────────
    // pending → sample_collected → processing → report_ready → delivered
    status: {
      type:    String,
      enum:    ['pending', 'sample_collected', 'processing', 'report_ready', 'delivered'],
      default: 'pending',
    },
    statusHistory: [
      {
        status:    String,
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        note:      String,
      },
    ],

    // ── PDF report ────────────────────────────────────────────────────────────
    reportPath: {
      type:    String,
      default: null,          // server-side path to NIC-encrypted PDF
    },
    reportUploadedAt: {
      type:    Date,
      default: null,
    },
    reportOriginalName: {
      type:    String,
      default: null,
    },
  },
  {
    timestamps: true,         // createdAt, updatedAt
  }
);

// ─── Encrypt PII fields at rest ───────────────────────────────────────────────
// patientNic_bi is intentionally NOT in this list — it's a hash, not PII
LabTestSchema.plugin(encrypt, {
  fields:    ['patientNic', 'patientName', 'patientEmail'],
  secret:    process.env.ENCRYPTION_KEY,
});

// ─── Model ────────────────────────────────────────────────────────────────────
module.exports = mongoose.model('LabTest', LabTestSchema);
