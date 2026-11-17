'use strict';
/**
 * Server rule (fix pack 2, B2): the same active ingredient is not dispensed again to the same patient while an
 * earlier dispensed course is still running (dispensedAt + durationDays in the future). No override.
 *
 * Ingredient match: the prescription's stored resolvedIngredients (written at prescribing time from the
 * formulary via ingredientResolver), else parseMedicationEntry() on the medicine name, else the normalised
 * name itself. Limits: brand names unknown to the formulary fall back to a name match; combination products
 * match on any shared ingredient. Only doctor prescriptions (not OTC sales) are compared. Items marked
 * "not available" stay pending and are never counted as dispensed.
 */
const { parseMedicationEntry } = require('../utils/ingredientResolver');

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_COURSE_DAYS = 7;
const TIME_ZONE = 'Asia/Colombo';

const normalise = v => (typeof v === 'string' ? v.trim().toLowerCase().replace(/\s+/g, ' ') : '');

function ingredientsOf(rx = {}, fallbackName) {
  const stored = Array.isArray(rx.resolvedIngredients) ? rx.resolvedIngredients.map(normalise).filter(Boolean) : [];
  if (stored.length) return new Set(stored);
  const name = rx.drugName || rx.medications?.[0]?.name || fallbackName || '';
  try {
    const parsed = parseMedicationEntry(name);
    const list = (parsed?.allIngredientsNormalized || []).map(normalise).filter(Boolean);
    if (list.length) return new Set(list);
  } catch (_) { /* fall back to the name */ }
  return new Set([normalise(name)].filter(Boolean));
}

const day = d => new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, day: 'numeric', month: 'short' }).format(d);

function courseEnd(prev) {
  const days = Number(prev.durationDays);
  const parsed = Number.isFinite(days) && days > 0;
  const length = parsed ? days : DEFAULT_COURSE_DAYS;
  return { length, defaulted: !parsed, end: new Date(new Date(prev.dispensedAt).getTime() + length * DAY_MS) };
}

function blockMessage(prev, { length, defaulted, end }) {
  const name = prev.drugName || prev.medications?.[0]?.name || 'This medicine';
  const where = prev.pharmacyName ? ` at ${prev.pharmacyName}` : '';
  const note = defaulted ? ` (duration not recorded; a ${DEFAULT_COURSE_DAYS}-day default was used)` : '';
  return `${name} was dispensed on ${day(new Date(prev.dispensedAt))}${where} for ${length} days${note}. Available again on ${day(end)}.`;
}

/** Returns null when dispensing may proceed, else { code, message, availableAt }. */
async function findActiveCourse({ Prescription, patientId, rx, itemNames = [], session, now = new Date() }) {
  if (!patientId || !Prescription || typeof Prescription.find !== 'function') return null;
  // Same readiness rule as prescriptionController: a live connection (or a test double of find).
  if (Prescription.db?.readyState !== 1 && !Prescription.find._isMockFunction) return null;
  const wanted = new Set();
  for (const s of [ingredientsOf(rx || {}, itemNames[0]), ...itemNames.map(n => ingredientsOf({}, n))]) s.forEach(x => wanted.add(x));
  if (!wanted.size) return null;
  let query = Prescription.find({
    patientId,
    status: { $in: ['dispensed', 'partially_dispensed'] },
    dispensedAt: { $ne: null },
    isOTC: { $ne: true },
    ...(rx?._id ? { _id: { $ne: rx._id } } : {}),
  });
  if (session && typeof query?.session === 'function') query = query.session(session);
  const previous = await query;
  if (!Array.isArray(previous)) return null;
  let blocking = null;
  for (const prev of previous) {
    if (!prev?.dispensedAt) continue;
    const shared = [...ingredientsOf(prev)].some(x => wanted.has(x));
    if (!shared) continue;
    const course = courseEnd(prev);
    if (course.end.getTime() > now.getTime() && (!blocking || course.end > blocking.course.end)) blocking = { prev, course };
  }
  if (!blocking) return null;
  return { code: 'REPEAT_COURSE_ACTIVE', message: blockMessage(blocking.prev, blocking.course), availableAt: blocking.course.end };
}

module.exports = { findActiveCourse, ingredientsOf, DEFAULT_COURSE_DAYS };
