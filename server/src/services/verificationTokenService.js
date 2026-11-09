'use strict';

const crypto = require('crypto');
const VerificationToken = require('../models/VerificationToken');

const BASE_VERIFICATION_URL =
  process.env.CLIENT_URL || 'https://medisync.chamodtharusha.com.lk';

/**
 * Issue a cryptographically random 256-bit verification token.
 * Stores only the SHA-256 hash of the token in the database.
 */
async function issueVerificationToken({
  consultationId,
  patientId,
  doctorId = null,
  consultationRef = null,
  expiresInDays = 90,
} = {}) {
  if (!consultationId || !patientId) {
    throw new Error('consultationId and patientId are required to issue verification token');
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  let tokenRecord = null;
  const mongoose = require('mongoose');
  if (mongoose.connection?.readyState === 1) {
    tokenRecord = new VerificationToken({
      tokenHash,
      consultationId,
      patientRef: patientId,
      doctorRef: doctorId,
      consultationRef,
      expiresAt,
    });
    await tokenRecord.save();
  }

  const verificationUrl = `${BASE_VERIFICATION_URL}/verify/${rawToken}`;

  return {
    rawToken,
    tokenHash,
    verificationUrl,
    expiresAt,
    tokenRecord,
  };
}

/**
 * Lookup and validate a token by its raw representation.
 */
async function resolveVerificationToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.length < 32) {
    return { valid: false, reason: 'INVALID_TOKEN_FORMAT', token: null };
  }

  const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
  const record = await VerificationToken.findOne({ tokenHash })
    .populate('consultationId')
    .populate('patientRef')
    .populate('doctorRef');

  if (!record) {
    return { valid: false, reason: 'TOKEN_NOT_FOUND', token: null };
  }

  if (record.revokedAt) {
    return {
      valid: false,
      reason: 'TOKEN_REVOKED',
      revokedAt: record.revokedAt,
      revocationReason: record.revocationReason,
      token: record,
    };
  }

  if (record.expiresAt && record.expiresAt < new Date()) {
    return {
      valid: false,
      reason: 'TOKEN_EXPIRED',
      expiresAt: record.expiresAt,
      token: record,
    };
  }

  // Increment usage
  try {
    record.useCount = (record.useCount || 0) + 1;
    record.lastUsedAt = new Date();
    await record.save();
  } catch (_) {
    // Non-fatal usage tracking
  }

  return { valid: true, reason: null, token: record };
}

/**
 * Revoke an active verification token.
 */
async function revokeToken({ rawToken = null, tokenHash = null, revokedBy = null, reason = 'Clinical revocation' } = {}) {
  let hash = tokenHash;
  if (!hash && rawToken) {
    hash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
  }
  if (!hash) throw new Error('Token hash or raw token required to revoke');

  const record = await VerificationToken.findOne({ tokenHash: hash });
  if (!record) return { success: false, reason: 'TOKEN_NOT_FOUND' };

  record.revokedAt = new Date();
  record.revokedBy = revokedBy;
  record.revocationReason = String(reason || 'Revoked by clinician/patient').slice(0, 250);
  await record.save();

  return { success: true, revokedAt: record.revokedAt };
}

module.exports = {
  issueVerificationToken,
  resolveVerificationToken,
  revokeToken,
  BASE_VERIFICATION_URL,
};
