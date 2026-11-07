'use strict';

/**
 * server/src/services/outbreakDetector.js
 * 
 * Stage D Outbreak Detector Service (Milestone 3 WP4)
 * Provides Sri Lanka Standard Time (+05:30) calendar-day window evaluation,
 * eligible case floor checks (N >= 5), 56-day baseline regularization,
 * and 2-consecutive-day persistence gating (z > 2.0).
 */

const {
  evaluateOutbreakCriteria,
  getColomboMidnight,
  selectCases,
  diseaseId,
  POLICY
} = require('./surveillanceService');

module.exports = {
  evaluateOutbreakCriteria,
  getColomboMidnight,
  selectCases,
  diseaseId,
  POLICY
};
