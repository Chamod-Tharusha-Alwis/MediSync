'use strict';

const rulesData = require('../data/emergencyRedFlags.json');

const normalize = (str) =>
  typeof str === 'string'
    ? str.toLowerCase().trim().replace(/[-_]/g, ' ').replace(/\s+/g, ' ')
    : '';

/**
 * Deterministic rule-based emergency red-flag screen.
 * Evaluates symptoms against conservative critical clinical presentation patterns.
 *
 * Invariants:
 * 1. Informational only: produces an advisory banner ("Possible emergency presentation: urgent clinical assessment recommended").
 * 2. Never alters statistical ML candidate ranking or probabilities.
 * 3. Never auto-diagnoses a clinical condition.
 * 4. Never blocks clinician autonomy.
 * 5. Explicitly unvalidated heuristic ("clinicalValidation: not_established").
 */
function evaluateEmergencyRedFlags(rawSymptoms = []) {
  const symptomsArray = Array.isArray(rawSymptoms)
    ? rawSymptoms
    : typeof rawSymptoms === 'string'
    ? rawSymptoms.split(',').map((s) => s.trim())
    : [];

  const normalizedInput = symptomsArray.map(normalize).filter(Boolean);

  if (normalizedInput.length === 0) {
    return {
      hasEmergencyRedFlag: false,
      advisory: null,
      flaggedRules: [],
      clinicalValidation: 'not_established',
      provenance: rulesData.metadata?.provenance || 'design heuristic, not clinically validated',
    };
  }

  const flaggedRules = [];

  for (const rule of rulesData.rules || []) {
    const requiredMatches = (rule.requiredAny || []).filter((req) => {
      const normReq = normalize(req);
      if (!normReq) return false;
      return normalizedInput.some((s) => s === normReq || s.includes(normReq));
    });

    if (requiredMatches.length === 0) continue;

    let accompaniedMatches = [];
    if (Array.isArray(rule.accompaniedByAny) && rule.accompaniedByAny.length > 0) {
      accompaniedMatches = rule.accompaniedByAny.filter((acc) => {
        const normAcc = normalize(acc);
        if (!normAcc) return false;
        return normalizedInput.some((s) => s === normAcc || s.includes(normAcc));
      });
      if (accompaniedMatches.length === 0) continue;
    }

    flaggedRules.push({
      id: rule.id,
      label: rule.label,
      matchedRequired: requiredMatches,
      matchedAccompanied: accompaniedMatches,
      advisoryMessage: rule.advisoryMessage,
    });
  }

  const hasEmergencyRedFlag = flaggedRules.length > 0;

  return {
    hasEmergencyRedFlag,
    advisory: hasEmergencyRedFlag
      ? 'Possible emergency presentation: urgent clinical assessment recommended'
      : null,
    flaggedRules,
    clinicalValidation: 'not_established',
    provenance: rulesData.metadata?.provenance || 'design heuristic, not clinically validated',
  };
}

module.exports = {
  evaluateEmergencyRedFlags,
};
