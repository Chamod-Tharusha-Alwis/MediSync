'use strict';

/**
 * Task 2 (P0) — PDF encryption honesty.
 * - No fixed 'MEDISYNC' fallback password: missing NIC and reference fails closed (SECURITY_HOLD).
 * - The produced PDF really is RC4-128 (/V 2 /R 3 /Length 128); the source says so honestly.
 * - Both PDF flags default to off.
 */

const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const { normalizePdfPassword, securePdfBuffer } = require('../src/utils/pdfSecurity');

const root = path.resolve(__dirname, '../..');
const TEST_NIC = '199012345678';

async function blankPdf() {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  return doc.save();
}

describe('Task 2 — PDF password fails closed', () => {
  const saved = process.env.MEDISYNC_TEST_DISABLE_PDF_LOCK;
  beforeEach(() => { delete process.env.MEDISYNC_TEST_DISABLE_PDF_LOCK; });
  afterAll(() => { if (saved === undefined) delete process.env.MEDISYNC_TEST_DISABLE_PDF_LOCK; else process.env.MEDISYNC_TEST_DISABLE_PDF_LOCK = saved; });

  test.each([[undefined, undefined], [null, null], ['N/A', ''], ['  ', 'null'], ['undefined', undefined]])(
    'normalizePdfPassword(%p, %p) returns null instead of a fixed default', (nic, ref) => {
      expect(normalizePdfPassword(nic, ref)).toBeNull();
    });

  test('normalizePdfPassword never returns the old literal default', () => {
    expect(normalizePdfPassword(undefined)).not.toBe('MEDISYNC');
    expect(normalizePdfPassword(undefined, 'CONS-7')).toBe('CONS-7');
  });

  test('securePdfBuffer refuses to encrypt without a password source (SECURITY_HOLD)', async () => {
    await expect(securePdfBuffer(await blankPdf(), undefined, {})).rejects.toMatchObject({
      code: 'SECURITY_HOLD', reason: 'PDF_PASSWORD_UNAVAILABLE',
    });
  });

  test('securePdfBuffer with a NIC emits an RC4-128 Standard security handler (/V 2 /R 3 /Length 128)', async () => {
    const encrypted = Buffer.from(await securePdfBuffer(await blankPdf(), TEST_NIC));
    const text = encrypted.toString('latin1');
    expect(text).toMatch(/\/Filter\s*\/Standard/);
    expect(text).toMatch(/\/V\s+2/);
    expect(text).toMatch(/\/R\s+3/);
    expect(text).toMatch(/\/Length\s+128/);
    expect(text).not.toMatch(/AESV[23]/);
  });
});

describe('Task 2 — source and defaults are honest', () => {
  test('pdfGenerator no longer claims RC4 is eliminated, and pdfSecurity has no MEDISYNC literal', () => {
    const generator = fs.readFileSync(path.join(root, 'server/src/utils/pdfGenerator.js'), 'utf8');
    const security = fs.readFileSync(path.join(root, 'server/src/utils/pdfSecurity.js'), 'utf8');
    expect(generator).not.toMatch(/RC4\)? are completely eliminated/);
    expect(generator).toMatch(/RC4-128/);
    expect(security).not.toMatch(/'MEDISYNC'/);
    expect(security).toMatch(/RC4-128/);
  });

  test('server and client PDF flags default to off', () => {
    // .env* files are off-limits to the offline boundary; assert the fail-closed gate in source.
    const generator = fs.readFileSync(path.join(root, 'server/src/utils/pdfGenerator.js'), 'utf8');
    expect(generator).toContain("process.env.PDF_EXPORT_ENABLED !== 'true'");
    const clientHelper = fs.readFileSync(path.join(root, 'client/src/utils/pdfDownload.js'), 'utf8');
    expect(clientHelper).toContain("process.env.REACT_APP_PDF_EXPORT_ENABLED === 'true'");
  });

  test('the RC4 limitation is documented in docs/final', () => {
    const doc = fs.readFileSync(path.join(root, 'docs/final/PDF_ENCRYPTION_LIMITATION.md'), 'utf8');
    expect(doc).toMatch(/RC4-128/);
    expect(doc).toMatch(/PDF_EXPORT_ENABLED/);
    expect(doc).toMatch(/REACT_APP_PDF_EXPORT_ENABLED/);
  });
});
