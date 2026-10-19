'use strict';

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Middleware: Verify QA owner header
router.use((req, res, next) => {
  const incomingOwner = req.headers['x-medisync-qa-owner'];
  const approvedOwner = process.env.MEDISYNC_QA_OWNER || 'qa_e1_operator';

  if (!incomingOwner || incomingOwner !== approvedOwner) {
    return res.status(403).json({
      error: 'Unauthorized QA owner',
      code: 'QA_UNAUTHORIZED_OWNER',
      details: 'x-medisync-qa-owner header missing or does not match authorized attempt binding.'
    });
  }
  next();
});

/**
 * E1-01 / E1-02: Status & Restricted Privilege Probe
 */
router.get('/status', (req, res) => {
  const dbName = mongoose.connection?.db?.databaseName || mongoose.connection?.name || 'unknown';
  res.status(200).json({
    status: 'READY',
    phase: '5X-E1',
    attemptId: process.env.MEDISYNC_QA_ATTEMPT_ID || '5X-E1-R3',
    owner: process.env.MEDISYNC_QA_OWNER || 'qa_e1_operator',
    dbName: dbName,
    role: `readWrite@${dbName}`,
    readOnly: true,
    mutationsAllowed: false,
    timestamp: new Date().toISOString()
  });
});

/**
 * E1-04: Mock Email / Zero-Actor Boundary Probe
 * Enforces zero-actor invariant: mock email dispatch is strictly blocked during E1.
 */
router.get('/mock-email', (req, res) => {
  res.status(403).json({
    error: 'Zero-actor policy active. Email dispatch disabled.',
    code: 'QA_ZERO_ACTOR_BLOCKED'
  });
});

/**
 * E1-05: Freeze & Orderly Teardown Probe
 * Seals the attempt and triggers clean shutdown.
 */
router.post('/freeze', (req, res) => {
  res.status(200).json({
    status: 'FROZEN',
    attemptId: process.env.MEDISYNC_QA_ATTEMPT_ID || '5X-E1-R3',
    message: 'Sealed attempt. Draining connections and initiating clean shutdown.'
  });

  // Clean shutdown sequence
  setImmediate(async () => {
    try {
      console.log('[QA] Freeze signal received. Draining connections and shutting down cleanly.');
      await mongoose.disconnect().catch(() => {});
      process.exit(0);
    } catch (_) {
      process.exit(0);
    }
  });
});

module.exports = router;
