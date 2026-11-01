'use strict';

// Run the actual controller and PDF hold with inert repositories and delivery boundaries.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const actualGenerator = require('../src/utils/pdfGenerator');
const { nicFilter, writeNicFields } = require('../src/security/nicPersistence');

const patientId = '1'.repeat(24);
const differentId = '2'.repeat(24);
const syntheticNic = '9'.repeat(9) + 'V';
const privateFixture = 'INERT_PRIVATE_FIXTURE';

function fixture({ variant = 'owned', lang = 'en', generationError = null } = {}) {
  const patient = { _id: patientId, nic: syntheticNic, fullName: privateFixture, gender: 'fixture' };
  const owned = {
    patientId, patientNic: syntheticNic, doctorId: { fullName: 'Synthetic clinician' },
    drugName: 'Synthetic medication', dosage: 'fixture', frequency: 'OD', durationDays: 1,
    instructions: 'Synthetic instruction'
  };
  const rows = variant === 'missing-prescription' ? []
    : variant === 'wrong-nic' ? [{ ...owned, patientNic: '8'.repeat(9) + 'V' }]
      : variant === 'wrong-patient' ? [{ ...owned, patientId: differentId }]
        : variant === 'mixed-owners' ? [owned, { ...owned, patientId: differentId }] : [owned];
  const chain = { populate: () => chain, then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject) };
  const find = jest.fn(() => chain);
  const findById = jest.fn(async () => variant === 'missing-patient' ? null : patient);
  const consultation = jest.fn(async () => null);
  const language = jest.fn(async () => ({ lang }));
  const generate = jest.fn(generationError ? async () => { throw generationError; } : actualGenerator.generateLockedPrescription);
  const safeLog = jest.fn();
  const deps = {
    crypto,
    '../security/nicPersistence': { nicFilter, writeNicFields },
    '../models/Patient': { findById },
    '../models/Prescription': { find },
    '../models/Doctor': {},
    '../models/Consultation': { findOne: consultation },
    '../utils/pdfGenerator': { generateLockedPrescription: generate },
    '../utils/emailService': {},
    '../utils/ingredientResolver': {},
    '../utils/prescriptionDuration': {},
    '../services/recipientLanguageService': { pdf: language },
    './dispensingController': { dispense: () => { throw Error('UNEXPECTED_WRITE'); } }
  };
  const exports = {};
  const filename = path.resolve(__dirname, '../src/controllers/prescriptionController.js');
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    exports, module: { exports }, Buffer, Date,
    console: { error: safeLog },
    require(id) {
      if (!Object.hasOwn(deps, id)) throw Error('UNEXPECTED_DEPENDENCY');
      return deps[id];
    }
  }, { filename });
  const res = {
    status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(),
    send: jest.fn(), set: jest.fn(), setHeader: jest.fn(), write: jest.fn(), end: jest.fn()
  };
  const req = { user: { id: patientId, role: 'patient' }, params: { refId: 'synthetic-reference' } };
  return { run: () => exports.downloadPrescriptionPdf(req, res), res, find, findById, consultation, language, generate, safeLog };
}

function expectJsonOnly(f, status, body) {
  expect(f.res.status).toHaveBeenCalledTimes(1);
  expect(f.res.status).toHaveBeenCalledWith(status);
  expect(f.res.json).toHaveBeenCalledTimes(1);
  expect(JSON.parse(JSON.stringify(f.res.json.mock.calls[0][0]))).toStrictEqual(body);
  for (const method of ['send', 'set', 'setHeader', 'write', 'end']) expect(f.res[method]).not.toHaveBeenCalled();
  const serialized = JSON.stringify(f.res.json.mock.calls);
  for (const value of [privateFixture, syntheticNic, patientId, 'SENSITIVE_ERROR_FIXTURE', '%PDF']) expect(serialized).not.toContain(value);
  for (const call of f.safeLog.mock.calls) expect(call).toEqual(['[PDF Download] Generation unavailable.']);
}

test.each(['en', 'si', 'ta'])('authorized %s prescription reaches the real PDF hold and returns exact 503 JSON without bytes or PDF headers', async lang => {
  const f = fixture({ lang });
  await f.run();
  expect(f.generate).toHaveBeenCalledTimes(1);
  await expect(f.generate.mock.results[0].value).rejects.toMatchObject({ code: 'SECURITY_HOLD' });
  expect(f.language).toHaveBeenCalledWith({ model: 'Patient', accountId: patientId, authorizedSubjectId: patientId });
  expectJsonOnly(f, 503, { code: 'PDF_EXPORT_UNAVAILABLE' });
});

test.each(['wrong-nic', 'wrong-patient', 'mixed-owners'])('persisted ownership failure (%s) returns 403 before language resolution or generation', async variant => {
  const f = fixture({ variant });
  await f.run();
  expect(f.generate).not.toHaveBeenCalled();
  expect(f.language).not.toHaveBeenCalled();
  expect(f.consultation).not.toHaveBeenCalled();
  expectJsonOnly(f, 403, { error: 'Access denied' });
});

test('missing persisted patient returns 403 before prescription lookup or generation', async () => {
  const f = fixture({ variant: 'missing-patient' });
  await f.run();
  expect(f.find).not.toHaveBeenCalled();
  expect(f.generate).not.toHaveBeenCalled();
  expectJsonOnly(f, 403, { error: 'Access denied' });
});

test('missing owned prescription returns 404 before generation', async () => {
  const f = fixture({ variant: 'missing-prescription' });
  await f.run();
  expect(f.generate).not.toHaveBeenCalled();
  expect(f.language).not.toHaveBeenCalled();
  expectJsonOnly(f, 404, { error: 'No prescriptions found for this reference.' });
});

test('unrelated generation failure retains sanitized 500 JSON with no sensitive body or PDF headers', async () => {
  const f = fixture({ generationError: Error('SENSITIVE_ERROR_FIXTURE') });
  await f.run();
  expect(f.generate).toHaveBeenCalledTimes(1);
  expectJsonOnly(f, 500, { error: 'Failed to generate PDF' });
});

test('hold-like message without typed SECURITY_HOLD code remains an ordinary sanitized 500', async () => {
  const f = fixture({ generationError: Error('SECURITY_HOLD SENSITIVE_ERROR_FIXTURE') });
  await f.run();
  expectJsonOnly(f, 500, { error: 'Failed to generate PDF' });
});
