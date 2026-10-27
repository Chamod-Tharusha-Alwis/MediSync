'use strict';
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  role: { type: String, enum: ['admin', 'doctor', 'patient', 'hospital_admin', 'pharmacist'], required: true },
  subjectId: { type: String, required: true }, emailDigest: { type: String, required: true, unique: true }, keyVersion: { type: Number, required: true },
  tokenHash: { type: String, required: true }, expiresAt: { type: Date, required: true }, consumedAt: { type: Date, default: null },
  emailOtpHash: { type: String, required: true }, emailOtpExpiresAt: { type: Date, required: true },
  failedAttempts: { type: Number, default: 0 }, pharmacyId: mongoose.Schema.Types.ObjectId,
  mfaMethod: { type: String, default: 'email-otp' }
}, { timestamps: true, collection: 'accountinvitations' });
// Retain consumed reservations; deleting them would weaken cross-role duplicate prevention.
module.exports = mongoose.model('AccountInvitation', schema);
