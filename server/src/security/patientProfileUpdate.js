'use strict';

// Shared validation for the two existing self-service profile update routes.
// This only describes values; it never queries, decrypts or writes a record.
const commonFields = Object.freeze(['contactInfo', 'bloodGroup', 'height', 'weight', 'allergies', 'emergencyContact']);
const legacyFields = Object.freeze(['address', 'district', 'chronicConditions']);
const own = (value, key) => Object.hasOwn(value, key);
const invalid = () => { const error = new Error('Invalid profile update'); error.code = 'PROFILE_INPUT_INVALID'; throw error; };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function text(value, limit) {
  if (typeof value !== 'string' || value.length > limit) invalid();
  return value.trim();
}

function stringList(value, allowCommaString = false) {
  if (allowCommaString && typeof value === 'string' && value.length <= 6000) value = value.split(',');
  if (!Array.isArray(value) || value.length > 50) invalid();
  return value.map(item => text(item, 120)).filter(Boolean);
}

function measurement(value) {
  if (value === null || value === '') return null;
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value))) invalid();
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 1000) invalid();
  return number;
}

function validateProfileUpdate(body, { legacy = false } = {}) {
  if (!record(body)) invalid();
  const allowed = new Set([...commonFields, ...(legacy ? legacyFields : [])]);
  const keys = Object.keys(body);
  if (!keys.length || keys.some(key => !allowed.has(key))) invalid();
  const result = {};
  for (const key of ['contactInfo', 'address', 'district']) if (own(body, key)) result[key] = text(body[key], key === 'address' ? 500 : 120);
  if (own(body, 'bloodGroup')) {
    if (!['', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].includes(body.bloodGroup)) invalid();
    result.bloodGroup = body.bloodGroup;
  }
  for (const key of ['height', 'weight']) if (own(body, key)) result[key] = measurement(body[key]);
  if (own(body, 'allergies')) result.allergies = stringList(body.allergies, true);
  if (own(body, 'chronicConditions')) result.chronicConditions = stringList(body.chronicConditions);
  if (own(body, 'emergencyContact')) {
    const contact = body.emergencyContact;
    if (!record(contact) || Object.keys(contact).some(key => !['name', 'relationship', 'phone'].includes(key))) invalid();
    result.emergencyContact = Object.fromEntries(Object.keys(contact).map(key => [key, text(contact[key], 120)]));
  }
  return result;
}

function applyProfileUpdate(patient, updates) {
  for (const [key, value] of Object.entries(updates)) {
    if (key === 'emergencyContact') {
      const previous = patient.emergencyContact?.toObject?.() || patient.emergencyContact || {};
      patient.emergencyContact = Object.fromEntries(['name', 'relationship', 'phone'].filter(name => own(value, name) || own(previous, name)).map(name => [name, own(value, name) ? value[name] : previous[name]]));
    } else patient[key] = value;
  }
}

module.exports = { validateProfileUpdate, applyProfileUpdate };
