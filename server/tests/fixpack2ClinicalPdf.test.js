'use strict';
/**
 * Fix pack 2, item A1 / A3: clinical PDFs are readable and never print stored ciphertext.
 * Offline: no database. Encryption uses the legacy test key path (NODE_ENV=test + ENCRYPTION_KEY).
 */
process.env.NODE_ENV = 'test';
if (!process.env.ENCRYPTION_KEY) process.env.ENCRYPTION_KEY = 'fixpack2-offline-test-key';

const zlib = require('zlib');
const { PDFDocument, PDFRawStream } = require('pdf-lib');
const Prescription = require('../src/models/Prescription');
const pdf = require('../src/utils/pdfGenerator');
const data = require('../src/utils/clinicalPdfData');
const labController = require('../src/controllers/labController');

const CIPHER = /[0-9a-f]{32}:[0-9a-f]+/i;
const CIPHER_LINE = /^[0-9a-f]{32}:[0-9a-f]+/im;

async function pdfText(bytes) {
  const doc = await PDFDocument.load(bytes);
  const chunks = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    try {
      const raw = zlib.inflateSync(Buffer.from(obj.contents)).toString('latin1');
      // pdf-lib writes each drawText() as one hex string: decode each to its own line.
      (raw.match(/<([0-9a-fA-F]+)>\s*Tj/g) || []).forEach(t => chunks.push(Buffer.from(t.slice(1, t.indexOf('>')), 'hex').toString('latin1')));
    } catch (_) { /* not a content stream */ }
  }
  return { text: chunks.join('\n'), pages: doc.getPageCount() };
}

function encryptedLeanPrescription(fields) {
  const doc = new Prescription({ patientNic: '200012345678', ...fields });
  doc.encryptFieldsSync();
  return doc.toObject(); // what .lean() returns: ciphertext, no decryption hook
}

const patient = { fullName: 'Fixture Patient', nic: '200012345678', gender: 'Female', dateOfBirth: new Date('1990-02-01') };
const doctorDetails = { _id: '507f1f77bcf86cd799439022', fullName: 'Chamod Alwis', specialization: 'General Practice', hospitalName: 'Private practice, Colombo 07' };
const consultation = {
  consultationId: 'CON-7A1B86A5B30A3AADD1518EA2', createdAt: new Date('2026-11-17T00:55:49Z'),
  diagnosis: 'Dengue fever', icdCode: 'A90', symptoms: ['fever', 'headache'], doctorId: '507f1f77bcf86cd799439022',
};
const labs = [
  { testName: 'Full Blood Count', status: 'pending', createdAt: new Date('2026-11-17T01:00:00Z') },
  { testName: 'NS1 Antigen', status: 'report_ready', results: 'NS1 antigen detected', reportUploadedAt: new Date('2026-11-17T05:00:00Z'), createdAt: new Date('2026-11-17T01:00:00Z') },
];

describe('A1: lean prescription rows are decrypted with the model hook', () => {
  test('ciphertext from .lean() becomes readable after decryptLeanRows', () => {
    const lean = encryptedLeanPrescription({ drugName: 'Warfarin', dosage: '5 mg', frequency: 'Once daily', durationDays: 5 });
    expect(lean.drugName).toMatch(CIPHER_LINE);
    const [row] = data.decryptLeanRows(Prescription, [lean]);
    expect(row.drugName).toBe('Warfarin');
    expect(row.dosage).toBe('5 mg');
  });

  test('a value that is still encrypted is shown as "Unavailable", never as hex', () => {
    expect(data.readableText('6305f3bd73fabd0c82791ba625a6c315:1e4c7c9f00aa')).toBe('Unavailable');
    const rows = data.medicationRows([{ drugName: '6305f3bd73fabd0c82791ba625a6c315:1e4c7c9f00aa', dosage: 'x', status: 'pending' }]);
    expect(rows[0][0]).toBe('Unavailable');
  });
});

describe('A1: consultation report, summary and lab report PDFs', () => {
  const origExport = process.env.PDF_EXPORT_ENABLED;
  beforeAll(() => { process.env.PDF_EXPORT_ENABLED = 'true'; });
  afterAll(() => { if (origExport === undefined) delete process.env.PDF_EXPORT_ENABLED; else process.env.PDF_EXPORT_ENABLED = origExport; });

  const rx = () => data.decryptLeanRows(Prescription, [
    encryptedLeanPrescription({ drugName: 'Warfarin', dosage: '5 mg', frequency: 'Once daily', durationDays: 5, status: 'dispensed' }),
    encryptedLeanPrescription({ drugName: 'Paracetamol', dosage: '500 mg', frequency: 'Every 6 hours when needed', durationDays: 3, status: 'pending' }),
  ]).concat([encryptedLeanPrescription({ drugName: 'Omeprazole', dosage: '20 mg', frequency: 'Before breakfast', durationDays: 14 })]);

  test('consultation report: table, doctor, facility, Sri Lanka time, lab rule, no ciphertext', async () => {
    const bytes = await pdf.generateConsultationReportPDF(patient, consultation, rx(), labs, { doctorDetails, unlockForTest: true });
    const { text } = await pdfText(bytes);
    expect(text).not.toMatch(CIPHER);
    for (const h of ['Medicine', 'Dose', 'Frequency', 'Duration', 'Status']) expect(text).toContain(h);
    expect(text).toContain('Warfarin');
    expect(text).toContain('Dispensed');
    expect(text).toMatch(/Consulting Medical Professional: Dr\.? ?Chamod Alwis/);
    expect(text).toContain('Facility / Practice: Private practice, Colombo 07');
    expect(text).not.toMatch(/Consulting Medical Professional: Unavailable|Facility \/ Practice: Unavailable/);
    expect(text).toMatch(/Generated: .*\(Sri Lanka time, UTC\+05:30\)/);
    expect(text).toContain('Unavailable until the laboratory uploads');
    expect(text).toContain('NS1 antigen detected');
    expect(text).toContain('200***678');
    expect(text).not.toContain('200012345678');
  });

  test('consultation summary (portal export): table and no ciphertext', async () => {
    const bytes = await pdf.generateConsultationSummaryPDF({ ...consultation, medications: rx() }, patient, doctorDetails, { unlockForTest: true });
    const { text } = await pdfText(bytes);
    expect(text).not.toMatch(CIPHER);
    expect(text).toContain('Paracetamol');
    expect(text).toContain('Every 6 hours when\nneeded'); // wrapped inside the Frequency column
    expect(text).toMatch(/Generated: .*Sri Lanka time/);
  });

  test('long medicine names wrap and many rows continue on a new page', async () => {
    const many = Array.from({ length: 45 }, (_, i) => ({ drugName: `Long medicine name number ${i} with an extended descriptive salt form and release profile`, dosage: '10 mg', frequency: 'Twice daily after meals', durationDays: 7 }));
    const bytes = await pdf.generateConsultationReportPDF(patient, consultation, many, labs, { doctorDetails, unlockForTest: true });
    const { text, pages } = await pdfText(bytes);
    expect(pages).toBeGreaterThan(1);
    expect(text.split('\n').filter(l => l === 'Medicine').length).toBeGreaterThan(1); // header repeated after the page break
    // No single drawn line is wider than its column: the longest name is split into several lines.
    expect(text).not.toContain(many[0].drugName);
  });

  test('lab report PDF: Sri Lanka time and no ciphertext', async () => {
    const bytes = await pdf.generateLabReportPDF({ ...labs[1], reportId: 'REP-FIX-1', patientName: '6305f3bd73fabd0c82791ba625a6c315:1e4c7c9f00aa', patientNic: '200012345678' }, null, { unlockForTest: true });
    const { text } = await pdfText(bytes);
    expect(text).not.toMatch(CIPHER);
    expect(text).toContain('Sri Lanka time');
  });
});

describe('A3: lab report endpoint refuses until the result is uploaded', () => {
  const origExport = process.env.PDF_EXPORT_ENABLED;
  beforeAll(() => { process.env.PDF_EXPORT_ENABLED = 'true'; });
  afterAll(() => { jest.restoreAllMocks(); if (origExport === undefined) delete process.env.PDF_EXPORT_ENABLED; else process.env.PDF_EXPORT_ENABLED = origExport; });
  const res = () => { const r = { statusCode: 200, headers: {}, body: null }; r.status = c => { r.statusCode = c; return r; }; r.json = b => { r.body = b; return r; }; r.set = h => { Object.assign(r.headers, h); return r; }; r.send = b => { r.body = b; return r; }; return r; };
  const doctorId = '507f1f77bcf86cd799439022';
  const req = { params: { id: 'LAB-1' }, user: { id: doctorId, role: 'doctor' }, headers: {}, query: {} };

  test('pending lab: 409 with the plain message, no PDF', async () => {
    jest.spyOn(labController, '_findLabTestByIdentifier').mockResolvedValue({ testName: 'FBC', status: 'pending', referredBy: doctorId, patientNic: '200012345678' });
    const out = res();
    await labController.exportLabReportPdf(req, out);
    expect(out.statusCode).toBe(409);
    expect(out.body).toEqual({ code: 'LAB_REPORT_NOT_READY', message: 'Lab result unavailable. It will appear after the laboratory uploads the result.' });
    expect(out.headers['Content-Type']).toBeUndefined();
  });

  test('uploaded lab: PDF is returned', async () => {
    jest.spyOn(labController, '_findLabTestByIdentifier').mockResolvedValue({ testName: 'FBC', status: 'report_ready', reportUploadedAt: new Date(), referredBy: doctorId, patientNic: '200012345678', reportId: 'REP-2' });
    const out = res();
    await labController.exportLabReportPdf(req, out);
    expect(out.headers['Content-Type']).toBe('application/pdf');
  });
});
