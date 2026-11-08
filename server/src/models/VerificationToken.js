'use strict';

const mongoose = require('mongoose');

const verificationTokenSchema = new mongoose.Schema(
  {
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    consultationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Consultation',
      required: true,
      index: true,
    },
    patientRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      index: true,
    },
    doctorRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Doctor',
    },
    consultationRef: {
      type: String,
      trim: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days default
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    revocationReason: {
      type: String,
      default: null,
      maxlength: 250,
    },
    useCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index to automatically purge expired tokens
verificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('VerificationToken', verificationTokenSchema);
