'use strict';

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { analyzeMedicationSafety, parseMedicationEntry } = require('./ingredientResolver');
const AuditLog = require('../models/AuditLog');
const Prescription = require('../models/Prescription');

let limitsCatalog = null;

function getLimitsCatalog() {
  if (!limitsCatalog) {
    try {
      const p = path.resolve(__dirname, '../data/medicine_safety_limits.json');
      if (fs.existsSync(p)) {
        limitsCatalog = JSON.parse(fs.readFileSync(p, 'utf8'));
      }
    } catch (_) {
      limitsCatalog = { limits: [] };
    }
  }
  return limitsCatalog?.limits || [];
}

function findSafetyLimit(drugName) {
  const catalog = getLimitsCatalog();
  const lower = String(drugName || '').trim().toLowerCase();
  return (
    catalog.find(
      (c) =>
        String(c.drug || '').toLowerCase() === lower ||
        String(c.canonicalIngredient || '').toLowerCase() === lower ||
        (Array.isArray(c.synonyms) && c.synonyms.some((s) => s.toLowerCase() === lower))
    ) || null
  );
}

function getResolvedCanonicalIngredients(medName) {
  if (!medName || typeof medName !== 'string') return [];
  const parsed = parseMedicationEntry(medName);
  let resolved = parsed.resolvedIngredients.map((i) => i.canonical.toLowerCase());
  if (resolved.length === 0) {
    const limit = findSafetyLimit(medName);
    if (limit && limit.canonicalIngredient) {
      resolved = [limit.canonicalIngredient.toLowerCase()];
    }
  }
  return resolved;
}

function parseDoseMg(dosageStr) {
  if (!dosageStr || typeof dosageStr !== 'string') return null;
  const match = dosageStr.match(/(\d+(?:\.\d+)?)\s*(?:mg|milligram)/i);
  return match ? parseFloat(match[1]) : null;
}

function frequencyMultiplier(freqStr) {
  if (!freqStr || typeof freqStr !== 'string') return 1;
  const f = freqStr.trim().toUpperCase();
  if (['TDS', 'TID', '3X', 'THREE TIMES A DAY'].includes(f)) return 3;
  if (['BD', 'BID', '2X', 'TWICE DAILY'].includes(f)) return 2;
  if (['QDS', 'QID', '4X', 'FOUR TIMES DAILY'].includes(f)) return 4;
  if (['OD', 'QD', 'ONCE DAILY', 'DAILY'].includes(f)) return 1;
  if (['PRN', 'SOS', 'AS NEEDED'].includes(f)) return 1;
  const numMatch = f.match(/(\d+)\s*(?:times|x)/i);
  return numMatch ? parseInt(numMatch[1], 10) : 1;
}

/**
 * Evaluates comprehensive medicine safety:
 * (a) Pairwise interactions from interactions_clean.json
 * (b) Duplicate active ingredients across lines and active patient prescriptions
 * (c) Course duration & dosage limits from cited reference catalog
 * (d) Mandatory clinician acknowledgment with reason for actionable warnings
 */
async function evaluateMedicineSafety({
  medications = [],
  patientId = null,
  activePrescriptions = null,
  acknowledgment = null,
  actorId = 'system',
  actorRole = 'doctor',
} = {}) {
  const warnings = [];
  const unconfiguredMeds = [];
  const limits = getLimitsCatalog();

  const medInputs = Array.isArray(medications) ? medications : [];
  const medNames = medInputs
    .map((m) => (typeof m === 'string' ? m : m?.drugName || m?.name || ''))
    .filter((n) => typeof n === 'string' && n.trim().length > 0);

  // 1. Pairwise Drug Interactions from clean interactions reference dataset
  if (medNames.length > 0) {
    try {
      const safetyResult = analyzeMedicationSafety(medNames, [], []);
      if (safetyResult && Array.isArray(safetyResult.warnings)) {
        for (const w of safetyResult.warnings) {
          warnings.push({
            type: w.type || 'drug_interaction',
            severity: w.severity || 'moderate',
            drug1: w.drug1,
            drug2: w.drug2,
            message: w.message || w.description,
            description: w.description,
            interactingIngredients: w.interactingIngredients,
          });
        }
      }
    } catch (_) {
      // Non-fatal fallback
    }
  }

  // 2. Duplicate Active Ingredients across current prescription lines
  if (medNames.length >= 2) {
    for (let i = 0; i < medNames.length; i++) {
      for (let j = i + 1; j < medNames.length; j++) {
        const drugA = medNames[i];
        const drugB = medNames[j];
        const ingsA = getResolvedCanonicalIngredients(drugA);
        const ingsB = getResolvedCanonicalIngredients(drugB);
        for (const ing of ingsA) {
          if (ingsB.includes(ing)) {
            const alreadyFlagged = warnings.some(
              (w) =>
                w.type === 'duplicate_active_ingredient' &&
                ((w.drug1 === drugA && w.drug2 === drugB) || (w.drug1 === drugB && w.drug2 === drugA))
            );
            if (!alreadyFlagged) {
              warnings.push({
                type: 'duplicate_active_ingredient',
                severity: 'high',
                drug1: drugA,
                drug2: drugB,
                ingredient: ing,
                message: `Duplicate active ingredient (${ing}) detected between ${drugA} and ${drugB}. Risk of additive toxicity.`,
              });
            }
          }
        }
      }
    }
  }

  // 3. Duplicate Active Ingredients against patient's existing active prescriptions
  let activeRxList = activePrescriptions;
  if (!activeRxList && patientId && mongoose.connection?.readyState === 1) {
    try {
      const now = new Date();
      activeRxList = await Prescription.find({
        patientId,
        status: 'active',
        $or: [{ expiresAt: { $gt: now } }, { expiresAt: null }],
      }).lean();
    } catch (_) {
      activeRxList = [];
    }
  }

  if (Array.isArray(activeRxList) && activeRxList.length > 0 && medInputs.length > 0) {
    const activeNames = activeRxList
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
            warnings.push({
              type: 'duplicate_therapy_active_rx',
              severity: 'high',
              drug1: newName,
              drug2: existingName,
              ingredient: ing,
              message: `Duplicate active ingredient (${ing}) detected between new prescription (${newName}) and patient's active prescription (${existingName}).`,
            });
          }
        }
      }
    }
  }

  // 4. Course Duration & Daily Dose Limits from Cited Formulary Catalog
  for (const med of medInputs) {
    const medName = typeof med === 'string' ? med : med?.drugName || med?.name || '';
    if (!medName) continue;
    const resolvedCanonical = getResolvedCanonicalIngredients(medName);

    // Match against cited limits catalog by drug name or canonical ingredient
    const limitHit = limits.find((l) => {
      const lName = String(l.drug || '').toLowerCase();
      const lIng = String(l.canonicalIngredient || '').toLowerCase();
      return (
        lName === medName.toLowerCase() ||
        resolvedCanonical.includes(lIng) ||
        medName.toLowerCase().includes(lName)
      );
    });

    if (!limitHit) {
      unconfiguredMeds.push(medName);
      warnings.push({
        type: 'limits_unconfigured',
        severity: 'info',
        drug: medName,
        status: 'pending_owner_data',
        message: `Safety limits not configured for ${medName} (pending national formulary data). Clinical assessment required.`,
      });
      continue;
    }

    // A. Course duration limit check
    const durationDays = typeof med.durationDays === 'number' ? med.durationDays : parseInt(med.durationDays, 10);
    const maxDays = limitHit.maxCourseDurationDays || limitHit.maxCourseDays;
    if (Number.isFinite(durationDays) && maxDays && durationDays > maxDays) {
      warnings.push({
        type: 'duration_limit_exceeded',
        severity: 'moderate',
        drug: medName,
        durationDays,
        limitDays: maxDays,
        source: limitHit.source,
        message: `${medName} course of ${durationDays} days exceeds recommended duration of ${maxDays} days per ${limitHit.source}. Clinical justification required.`,
      });
    }

    // B. Daily dose limit check
    const doseMg = parseDoseMg(med.dosage);
    const multiplier = frequencyMultiplier(med.frequency);
    if (doseMg && multiplier && limitHit.maxDailyDoseMg) {
      const estimatedDailyMg = doseMg * multiplier;
      if (estimatedDailyMg > limitHit.maxDailyDoseMg) {
        warnings.push({
          type: 'dosage_limit_exceeded',
          severity: 'high',
          drug: medName,
          dailyDoseMg: estimatedDailyMg,
          limitDailyMg: limitHit.maxDailyDoseMg,
          source: limitHit.source,
          message: `${medName} estimated daily dose (${estimatedDailyMg}mg) exceeds recommended maximum (${limitHit.maxDailyDoseMg}mg) per ${limitHit.source}. Clinical justification required.`,
        });
      }
    }
  }

  // 5. Acknowledgment Evaluation
  const actionableWarnings = warnings.filter((w) => w.severity === 'high' || w.severity === 'moderate');
  const hasActionableWarnings = actionableWarnings.length > 0;

  let requiresAcknowledgment = false;
  let canProceed = true;
  let acknowledged = false;

  const isAck =
    acknowledgment &&
    acknowledgment.acknowledged === true &&
    typeof acknowledgment.reason === 'string' &&
    acknowledgment.reason.trim().length >= 5;

  if (hasActionableWarnings) {
    if (!isAck) {
      requiresAcknowledgment = true;
      canProceed = false;
    } else {
      acknowledged = true;
      canProceed = true;

      // Audit-log the clinical acknowledgment (zero PII)
      try {
        if (mongoose.connection?.readyState === 1) {
          await AuditLog.create({
            actorId: String(actorId || 'system'),
            actorRole: String(actorRole || 'doctor'),
            action: 'medicine_safety_warning_acknowledged',
            accessedNic: 'N/A',
            deviceModel: 'N/A',
          });
        }
      } catch (_) {
        // Non-fatal persistence failure
      }
    }
  }

  return {
    hasWarnings: warnings.length > 0,
    hasActionableWarnings,
    requiresAcknowledgment,
    canProceed,
    allowed: canProceed,
    acknowledged,
    acknowledgment: isAck ? acknowledgment : null,
    warnings,
    unconfiguredMeds,
    clinicalValidation: 'not_established',
  };
}

module.exports = {
  evaluateMedicineSafety,
  evaluatePrescriptionSafety: evaluateMedicineSafety,
  getLimitsCatalog,
  findSafetyLimit,
  getResolvedCanonicalIngredients,
  parseDoseMg,
  frequencyMultiplier,
  get SAFETY_LIMITS() {
    return { medicines: getLimitsCatalog() };
  },
};
