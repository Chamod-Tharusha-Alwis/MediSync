'use strict';
jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));
const { cloudinary, generateSignedUrl } = require('../src/utils/cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { PassThrough } = require('stream');
afterEach(() => jest.restoreAllMocks());

test('six requested teaching tiers are preserved while manual severity and catalog mismatch remain explicit holds', () => {
  const preview = require('../scripts/previewSyntheticOutbreakScenarios').generateOutbreakPreview(new Date('2026-01-01T00:00:00Z'));
  expect(preview.documents.map(row => [row.disease, row.dangerLevel])).toEqual([['Dengue', 'High'], ['Cholera', 'High'], ['Gastroenteritis', 'Medium'], ['Typhoid Fever', 'Medium'], ['Common Cold', 'Low'], ['Seasonal Allergies', 'Low']]);
  expect(preview.readiness).toMatchObject({ clinicalUse: 'FORBIDDEN', catalogAlignment: 'HOLD', severityValidation: 'MANUAL_LABELS_NOT_A_MODEL_RESULT' });
  expect(preview.documents.every(row => row.severitySource === 'MANUAL_SYNTHETIC_TEACHING_SCENARIO' && row.clinicalUsePermitted === false)).toBe(true);
  expect(preview.safetyGuards).toMatchObject({ zeroPatientNics: true, zeroExternalBroadcasts: true });
});

test('read-only pinned ML/catalog source confirms the Typhoid discrepancy without importing Flask or running a seeder', () => {
  const fs = require('fs'), path = require('path');
  const app = fs.readFileSync(path.resolve(__dirname, '../../ml-engine/app.py'), 'utf8');
  const seeder = fs.readFileSync(path.resolve(__dirname, '../../ml-engine/scripts/seed_local_icd10.py'), 'utf8');
  expect(app).toMatch(/'typhoid': 'High'/); expect(seeder).toMatch(/'Typhoid': \{'danger': 'High'/);
});
test('private download uses provider API expiry and never falls back to ordinary URL signing', () => {
  const sign = jest.spyOn(cloudinary.utils, 'private_download_url').mockReturnValue('https://example.invalid/synthetic');
  const fallback = jest.spyOn(cloudinary, 'url').mockImplementation(() => { throw new Error('fallback forbidden'); });
  generateSignedUrl('synthetic/report'); expect(sign.mock.calls[0][2]).toMatchObject({ type: 'authenticated', resource_type: 'raw', secure: true });
  expect(sign.mock.calls[0][2].expires_at).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 300);
  sign.mockImplementation(() => { throw new Error('private provider data'); });
  expect(() => generateSignedUrl('synthetic/report')).toThrow(/^PRIVATE_DOWNLOAD_UNAVAILABLE$/); expect(fallback).not.toHaveBeenCalled();
});
test.each([{ type: 'upload' }, { expires_at: 0 }, { expires_at: Date.now() }, { resource_type: 'video' }])('rejects unsafe private URL options %#', options => expect(() => generateSignedUrl('synthetic/report', options)).toThrow());
test.each(['network failure', 'invalid format', 'quota exceeded'])('actual storage adapter propagates mocked provider %s', async message => {
  const provider = { uploader: { upload_stream: jest.fn((_options, callback) => { const sink = new PassThrough(); sink.on('finish', () => callback(new Error(message))); sink.resume(); return sink; }) } };
  const storage = new CloudinaryStorage({ cloudinary: provider, params: { resource_type: 'raw', type: 'authenticated', folder: 'synthetic' } });
  await new Promise(resolve => {
    const input = new PassThrough(); storage._handleFile({}, { stream: input }, (error, result) => { expect(error.message).toBe(message); expect(result).toBeUndefined(); resolve(); }); input.end(Buffer.from('synthetic only'));
  });
});
test('six preview documents carry persistent simulation batch and pass actual schema validation', () => {
  const preview = require('../scripts/previewSyntheticOutbreakScenarios').generateOutbreakPreview(new Date('2026-01-01T00:00:00Z'));
  const Model = require('../src/models/OutbreakAlert');
  expect(preview.documents).toHaveLength(6); expect(preview.tierBreakdown).toEqual({ highDangerCount: 2, mediumDangerCount: 2, lowDangerCount: 2 });
  for (const row of preview.documents) {
    const doc = new Model(row); expect(doc.validateSync()).toBeUndefined(); expect(doc.datasetBatch).toBe('PHASE6_SYNTHETIC_V1');
    expect(doc.isSimulation).toBe(true); expect(doc.isSyntheticUniversityData).toBe(true); expect(doc.sourceConsultationIds).toHaveLength(0);
    expect(require('../src/services/surveillanceService').synthetic(doc)).toBe(true);
  }
});
test('batch provenance alone excludes synthetic records and official query excludes all markers', () => {
  const service = require('../src/services/surveillanceService');
  expect(service.synthetic({ datasetBatch: 'PHASE6_SYNTHETIC_V1' })).toBe(true);
  expect(service.realAlertFilter()).toMatchObject({ isSimulation: false, isSyntheticUniversityData: { $ne: true }, datasetBatch: { $exists: false } });
  expect(() => service.selectCases([], { mode: 'unknown' })).toThrow();
});
test('installed Cloudinary SDK builds private API URL containing signed expiry without a network request', () => {
  cloudinary.config({ cloud_name: 'synthetic-offline', api_key: '000000', api_secret: 'synthetic-only-signing-secret' });
  const expires = Math.floor(Date.now() / 1000) + 120;
  const url = new URL(generateSignedUrl('synthetic/report', { expires_at: expires }));
  expect(url.hostname).toBe('api.cloudinary.com'); expect(url.searchParams.get('expires_at')).toBe(String(expires));
  expect(url.searchParams.get('signature')).toMatch(/^[a-f0-9]+$/); expect(url.searchParams.get('type')).toBe('authenticated');
});
