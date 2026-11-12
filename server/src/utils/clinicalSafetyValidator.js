'use strict';

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const {
  analyzeMedicationSafety,
  parseMedicationEntry,
  checkAllergyConflict,
} = require('./ingredientResolver');
const {
  getLimitsCatalog,
  findSafetyLimit,
  getResolvedCanonicalIngredients,
  parseDoseMg,
  frequencyMultiplier,
} = require('./medicineSafetyEngine');

const SEVERITY_RANKS = {
  info: 1,
  moderate: 2,
  severe: 3,
  critical: 4,
};

function normalizeSeverity(raw) {
  const lower = String(raw || 'moderate').toLowerCase();
  if (lower === 'high' || lower === 'severe' || lower === 'major') return 'severe';
  if (lower === 'critical' || lower === 'contraindicated') return 'critical';
  if (lower === 'moderate') return 'moderate';
  if (lower === 'info' || lower === 'low' || lower === 'minor') return 'info';
  return 'moderate';
}

function normalizeFinding(f) {
  const severity = normalizeSeverity(f.severity);
  const items = Array.isArray(f.items)
    ? [...new Set(f.items.map((i) => String(i || '').trim()).filter(Boolean))].sort()
    : [];
  return {
    type: String(f.type || 'warning'),
    severity,
    items,
    summary: String(f.summary || f.message || '').trim(),
    source: String(f.source || 'formulary_engine'),
  };
}

function computeFindingsHash(findings = []) {
  if (!Array.isArray(findings) || findings.length === 0) return null;
  const normalized = findings.map(normalizeFinding);
  normalized.sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    if (SEVERITY_RANKS[b.severity] !== SEVERITY_RANKS[a.severity]) {
      return SEVERITY_RANKS[b.severity] - SEVERITY_RANKS[a.severity];
    }
    const itemsA = a.items.join('|');
    const itemsB = b.items.join('|');
    if (itemsA !== itemsB) return itemsA.localeCompare(itemsB);
    return a.summary.localeCompare(b.summary);
  });
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex');
}

/**
 * Recomputes all clinical findings for a proposed medication set against:
 * 1. Patient recorded allergies
 * 2. Pairwise drug interactions
 * 3. Duplicate active ingredients (within current lines)
 * 4. Duplicate active ingredients (against patient active prescriptions)
 * 5. Dose limits (maximum daily mg)
 * 6. Course duration limits (maximum days)
 * 7. Unresolved ingredients / incomplete verification
 */
function computeClinicalFindings({
  medications = [],
  patientAllergies = [],
  activePrescriptions = [],
  analyze = analyzeMedicationSafety,
  allergyCheck = checkAllergyConflict,
} = {}) {
  const rawFindings = [];
  const medInputs = Array.isArray(medications) ? medications : [];
  const medNames = medInputs
    .map((m) => (typeof m === 'string' ? m : m?.drugName || m?.name || ''))
    .filter((n) => typeof n === 'string' && n.trim().length > 0);

  // 1. Patient Allergy Check
  for (const name of medNames) {
    try {
      const allergyRes = allergyCheck(name, patientAllergies || []);
      if (allergyRes?.hasConflict) {
        const conflicts = Array.isArray(allergyRes.conflicts) && allergyRes.conflicts.length > 0
          ? allergyRes.conflicts
          : [{ allergen: name, message: `Patient has documented allergy conflict with ${name}.` }];
        for (const conf of conflicts) {
          rawFindings.push({
            type: 'allergy_conflict',
            severity: 'critical',
            items: [name, conf.allergen || name],
            summary:
              conf.message ||
              `Patient has documented allergy to ${conf.allergen || name}.`,
            source: 'patient_record',
          });
        }
      }
    } catch (_) {}
  }

  // 2. Drug-Drug Interactions & Duplicate Active Ingredients
  const allMedsForAnalysis = [
    ...(Array.isArray(activePrescriptions) ? activePrescriptions.map(rx => rx.drugName || rx.name || '') : []),
    ...medNames
  ].filter(Boolean);

  if (allMedsForAnalysis.length > 0) {
    try {
      const safetyResult = analyze(allMedsForAnalysis, [], []);
      if (safetyResult) {
        if (safetyResult.hasInteraction || (Array.isArray(safetyResult.warnings) && safetyResult.warnings.length > 0)) {
          const warnings = Array.isArray(safetyResult.warnings) && safetyResult.warnings.length > 0
            ? safetyResult.warnings
            : [{ drug1: allMedsForAnalysis[0], drug2: allMedsForAnalysis[1] || allMedsForAnalysis[0], description: 'Potential drug interaction detected.' }];
          for (const w of warnings) {
            const isDrug1Active = (activePrescriptions || []).find(rx => (rx.drugName || rx.name || '').toLowerCase() === (w.drug1 || '').toLowerCase());
            const isDrug2Active = (activePrescriptions || []).find(rx => (rx.drugName || rx.name || '').toLowerCase() === (w.drug2 || '').toLowerCase());
            let summary = w.description || w.message || `Potential interaction between ${w.drug1} and ${w.drug2}.`;
            if (isDrug1Active && !isDrug2Active) {
              const ref = isDrug1Active.reference || isDrug1Active.consultationRef || 'active';
              summary = `${w.drug2} (this prescription) vs ${w.drug1} (active, ${ref}): ${summary}`;
            } else if (isDrug2Active && !isDrug1Active) {
              const ref = isDrug2Active.reference || isDrug2Active.consultationRef || 'active';
              summary = `${w.drug1} (this prescription) vs ${w.drug2} (active, ${ref}): ${summary}`;
            }

            rawFindings.push({
              type: 'drug_interaction',
              severity: w.severity === 'high' ? 'severe' : w.severity || 'severe',
              items: [w.drug1, w.drug2].filter(Boolean),
              summary,
              source: 'interactions_clean.json',
            });
          }
        }

        if (Array.isArray(safetyResult.duplicateIngredients)) {
          for (const d of safetyResult.duplicateIngredients) {
            rawFindings.push({
              type: 'duplicate_ingredient',
              severity: 'moderate',
              items: [d.drug1, d.drug2].filter(Boolean),
              summary:
                d.message ||
                `Duplicate active ingredient detected across prescribed medicines.`,
              source: 'ingredient_resolver',
            });
          }
        }

        if (Array.isArray(safetyResult.unresolvedDrugs) && safetyResult.unresolvedDrugs.length > 0) {
          const names = safetyResult.unresolvedDrugs
            .map(u => u.drug || u.brand)
            .filter(Boolean);
          const uniqueNames = [...new Set(names)];
          if (uniqueNames.length > 0) {
            const count = uniqueNames.length;
            const preview = uniqueNames.slice(0, 3).join(', ');
            const suffix = count > 3 ? `, and ${count - 3} more` : '';
            rawFindings.push({
              type: 'incomplete_verification',
              severity: 'info',
              items: uniqueNames,
              summary: count === 1
                ? `Automated interaction checking incomplete for "${uniqueNames[0]}". Clinical judgment required.`
                : `Interaction checking incomplete for ${count} co-prescribed medicines: ${preview}${suffix}. Clinical judgment required.`,
              source: 'ingredient_resolver',
            });
          }
        }
      }
    } catch (_) {}
  }

  // 3. Duplicate Active Ingredients against patient's active prescriptions
  if (Array.isArray(activePrescriptions) && activePrescriptions.length > 0 && medInputs.length > 0) {
    const activeNames = activePrescriptions
      .map((rx) => rx.drugName || rx.name || '')
      .filter((n) => typeof n === 'string' && n.trim().length > 0);

    for (const newMed of medInputs) {
      const newName = typeof newMed === 'string' ? newMed : newMed?.drugName || newMed?.name || '';
      if (!newName) continue;
      const newIngredients = getResolvedCanonicalIngredients(newName);

      for (const existingName of activeNames) {
        const existingIngredients = getResolvedCanonicalIngredients(existingName);
        for (const ing of newIngredients) {
          if (existingIngredients.includes(ing)) {
            rawFindings.push({
              type: 'duplicate_therapy_active_rx',
              severity: 'severe',
              items: [newName, existingName],
              summary: `Duplicate active ingredient (${ing}) detected between new prescription (${newName}) and patient's active prescription (${existingName}).`,
              source: 'active_prescriptions',
            });
          }
        }
      }
    }
  }

  // 4. Dose Ceiling and Course Duration Limits from BNF / WHO catalog
  const limits = getLimitsCatalog();
  for (const med of medInputs) {
    const medName = typeof med === 'string' ? med : med?.drugName || med?.name || '';
    if (!medName) continue;
    const resolvedCanonical = getResolvedCanonicalIngredients(medName);

    const limitHit = limits.find((l) => {
      const lName = String(l.drug || '').toLowerCase();
      const lIng = String(l.canonicalIngredient || '').toLowerCase();
      return (
        lName === medName.toLowerCase() ||
        resolvedCanonical.includes(lIng) ||
        medName.toLowerCase().includes(lName)
      );
    });

    if (!limitHit || (!limitHit.maxDailyDoseMg && !limitHit.maxCourseDurationDays)) {
      rawFindings.push({
        type: 'unconfigured_limit',
        severity: 'info',
        items: [medName],
        summary: `No dose ceiling on file for this ingredient (${medName}). Clinical assessment required.`,
        source: limitHit?.source || 'medicine_safety_limits.json',
      });
      continue;
    }

    const durationDays =
      typeof med.durationDays === 'number'
        ? med.durationDays
        : parseInt(med.durationDays, 10);
    const maxDays = limitHit.maxCourseDurationDays || limitHit.maxCourseDays;
    if (Number.isFinite(durationDays) && maxDays && durationDays > maxDays) {
      rawFindings.push({
        type: 'duration_limit_exceeded',
        severity: 'moderate',
        items: [medName],
        summary: `${medName} course of ${durationDays} days exceeds recommended duration of ${maxDays} days per ${limitHit.source}.`,
        source: limitHit.source,
      });
    }

    const doseMg = parseDoseMg(med.dosage);
    const multiplier = frequencyMultiplier(med.frequency);
    if (doseMg && multiplier && limitHit.maxDailyDoseMg) {
      const estimatedDailyMg = doseMg * multiplier;
      if (estimatedDailyMg > limitHit.maxDailyDoseMg) {
        rawFindings.push({
          type: 'dosage_limit_exceeded',
          severity: 'severe',
          items: [medName],
          summary: `${medName} estimated daily dose (${estimatedDailyMg}mg) exceeds recommended maximum (${limitHit.maxDailyDoseMg}mg) per ${limitHit.source}.`,
          source: limitHit.source,
        });
      }
    }
  }

  // Deduplicate and normalize findings
  const uniqueMap = new Map();
  for (const raw of rawFindings) {
    const norm = normalizeFinding(raw);
    const key = `${norm.type}|${norm.severity}|${norm.items.join(',')}|${norm.summary}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, norm);
    }
  }

  const findings = Array.from(uniqueMap.values());
  const findingsHash = computeFindingsHash(findings);

  let highestRank = 0;
  let maxSeverity = 'none';
  for (const f of findings) {
    const rank = SEVERITY_RANKS[f.severity] || 1;
    if (rank > highestRank) {
      highestRank = rank;
      maxSeverity = f.severity;
    }
  }

  const actionableFindings = findings.filter(
    (f) => f.severity === 'moderate' || f.severity === 'severe' || f.severity === 'critical'
  );
  const requiresAcknowledgment = actionableFindings.length > 0;
  const requiresReason = findings.some(
    (f) => f.severity === 'severe' || f.severity === 'critical'
  );

  return {
    findings,
    findingsHash,
    requiresAcknowledgment,
    requiresReason,
    maxSeverity,
    hasActionableWarnings: requiresAcknowledgment,
  };
}

/**
 * Validates a client safetyAcknowledgment payload against server-computed findings.
 */
function validateSafetyAcknowledgment(safetyAcknowledgment, computedResult) {
  if (!computedResult.requiresAcknowledgment) {
    return { valid: true };
  }

  if (
    !safetyAcknowledgment ||
    safetyAcknowledgment.acknowledged !== true
  ) {
    return {
      valid: false,
      code: 'SAFETY_ACKNOWLEDGMENT_REQUIRED',
      message: 'Prescription safety warnings require prescriber acknowledgment.',
      findings: computedResult.findings,
      findingsHash: computedResult.findingsHash,
    };
  }

  // Verify hash match to prevent race conditions or tampered acknowledgments
  if (
    typeof safetyAcknowledgment.findingsHash === 'string' &&
    safetyAcknowledgment.findingsHash !== computedResult.findingsHash
  ) {
    return {
      valid: false,
      code: 'SAFETY_ACKNOWLEDGMENT_REQUIRED',
      message:
        'Prescription changes detected since acknowledgment. Please review updated safety warnings.',
      findings: computedResult.findings,
      findingsHash: computedResult.findingsHash,
    };
  }

  // Verify reason when severe or critical findings exist
  if (computedResult.requiresReason) {
    const reason = safetyAcknowledgment.reason;
    if (
      typeof reason !== 'string' ||
      reason.trim().length < 5 ||
      reason.trim().length > 250
    ) {
      return {
        valid: false,
        code: 'SAFETY_ACKNOWLEDGMENT_REQUIRED',
        message:
          'Clinical justification reason required (min 5, max 250 characters) for severe or critical warnings.',
        findings: computedResult.findings,
        findingsHash: computedResult.findingsHash,
      };
    }
  }

  return { valid: true };
}

module.exports = {
  computeClinicalFindings,
  computeFindingsHash,
  validateSafetyAcknowledgment,
  normalizeSeverity,
  normalizeFinding,
};
