'use strict';

const { parseMedicationEntry } = require('./ingredientResolver');

const DAY_MS = 86400000;

/**
 * Derives the active state of a prescription.
 * Possible states: 'active' | 'expired' | 'superseded' | 'cancelled'
 *
 * Expiry logic:
 * - startDate = dispensedAt if dispensed, else issuedAt || createdAt || startDate || now
 * - endDate = expiresAt || (startDate + durationDays * DAY_MS)
 * - If now >= endDate, it is expired.
 */
function getPrescriptionActiveState(rx, now = new Date()) {
  if (!rx) return 'expired';
  const nowDate = now instanceof Date ? now : new Date(now);
  const nowMs = nowDate.getTime();

  if (rx.status === 'cancelled') {
    return 'cancelled';
  }

  if (rx.supersededBy || rx.supersededAt) {
    return 'superseded';
  }

  if (rx.status === 'expired') {
    return 'expired';
  }

  let startDateMs;
  if (rx.dispensedAt) {
    startDateMs = new Date(rx.dispensedAt).getTime();
  } else if (rx.issuedAt) {
    startDateMs = new Date(rx.issuedAt).getTime();
  } else if (rx.createdAt) {
    startDateMs = new Date(rx.createdAt).getTime();
  } else if (rx.startDate) {
    startDateMs = new Date(rx.startDate).getTime();
  } else {
    startDateMs = nowMs;
  }

  let endDateMs = null;
  if (rx.expiresAt) {
    endDateMs = new Date(rx.expiresAt).getTime();
  } else if (Number.isFinite(Number(rx.durationDays)) && Number(rx.durationDays) > 0) {
    endDateMs = startDateMs + Number(rx.durationDays) * DAY_MS;
  }

  if (Number.isFinite(endDateMs) && nowMs >= endDateMs) {
    return 'expired';
  }

  return 'active';
}

/**
 * Extracts a sorted, canonical ingredient list from a drug name or medication object.
 */
function getCanonicalIngredientSet(drugNameOrMed) {
  if (!drugNameOrMed) return [];
  const parsed = parseMedicationEntry(drugNameOrMed);
  const canonicals = new Set();

  if (Array.isArray(parsed.resolvedIngredients) && parsed.resolvedIngredients.length > 0) {
    for (const r of parsed.resolvedIngredients) {
      if (r && r.canonical) canonicals.add(String(r.canonical).toLowerCase().trim());
    }
  }

  // Fallback to allIngredientsNormalized if resolvedIngredients was empty
  if (canonicals.size === 0 && Array.isArray(parsed.allIngredientsNormalized)) {
    for (const ing of parsed.allIngredientsNormalized) {
      if (ing && typeof ing === 'string') canonicals.add(ing.toLowerCase().trim());
    }
  }

  return [...canonicals].sort();
}

/**
 * Tests whether two medicines have an identical resolved active-ingredient set.
 * Partial overlap (e.g. combination product sharing 1 ingredient) does NOT match.
 */
function isSameMedicine(medA, medB) {
  const setA = getCanonicalIngredientSet(medA);
  const setB = getCanonicalIngredientSet(medB);

  if (setA.length === 0 || setB.length === 0) return false;
  if (setA.length !== setB.length) return false;

  for (let i = 0; i < setA.length; i++) {
    if (setA[i] !== setB[i]) return false;
  }
  return true;
}

/**
 * Computes remaining active days for a prescription.
 */
function getDaysRemaining(rx, now = new Date()) {
  const nowDate = now instanceof Date ? now : new Date(now);
  const nowMs = nowDate.getTime();

  let startDateMs;
  if (rx.dispensedAt) {
    startDateMs = new Date(rx.dispensedAt).getTime();
  } else if (rx.issuedAt) {
    startDateMs = new Date(rx.issuedAt).getTime();
  } else if (rx.createdAt) {
    startDateMs = new Date(rx.createdAt).getTime();
  } else {
    startDateMs = nowMs;
  }

  let endDateMs = null;
  if (rx.expiresAt) {
    endDateMs = new Date(rx.expiresAt).getTime();
  } else if (Number.isFinite(Number(rx.durationDays)) && Number(rx.durationDays) > 0) {
    endDateMs = startDateMs + Number(rx.durationDays) * DAY_MS;
  }

  if (!Number.isFinite(endDateMs)) return 0;
  const diffMs = endDateMs - nowMs;
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / DAY_MS);
}

module.exports = {
  DAY_MS,
  getPrescriptionActiveState,
  getCanonicalIngredientSet,
  isSameMedicine,
  getDaysRemaining
};
