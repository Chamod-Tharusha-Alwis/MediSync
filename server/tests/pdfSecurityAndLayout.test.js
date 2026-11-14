'use strict';

const zlib = require('zlib');
const { PDFDocument, PDFRawStream } = require('pdf-lib');
const {
  normalizePdfPassword,
  isPdfEncrypted,
  securePdfBuffer,
} = require('../src/utils/pdfSecurity');
const {
  generateConsultationSummaryPDF,
  generatePrescriptionPDF,
  generatePatientHistoryPDF,
} = require('../src/utils/pdfGenerator');

/**
 * Extracts plain text strings from an unlocked/unencrypted PDF document.
 */
async function extractPdfText(pdfBytes) {
  const doc = await PDFDocument.load(pdfBytes);
  const textChunks = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) {
      try {
        const decompressed = zlib.inflateSync(Buffer.from(obj.contents)).toString('latin1');
        const decoded = decompressed.replace(/<([0-9a-fA-F]+)>/g, (_, hex) => {
          try {
            return Buffer.from(hex, 'hex').toString('latin1');
          } catch (_) {
            return '';
          }
        });
        textChunks.push(decoded);
      } catch (_) {}
    }
  }
  return textChunks.join('\n');
}

describe('Task P11-A2 & P11-A3: PDF Security Encryption & Clean Layout', () => {
  const origExport = process.env.PDF_EXPORT_ENABLED;
  const TEST_NIC = '199512345678';
  const MASKED_NIC = '199***678';

  beforeAll(() => {
    process.env.PDF_EXPORT_ENABLED = 'true';
  });

  afterAll(() => {
    if (origExport === undefined) {
      delete process.env.PDF_EXPORT_ENABLED;
    } else {
      process.env.PDF_EXPORT_ENABLED = origExport;
    }
  });

  describe('pdfSecurity utility', () => {
    test('normalizePdfPassword correctly sanitizes NIC and uses fallback when absent', () => {
      expect(normalizePdfPassword('  199512345678  ')).toBe('199512345678');
      expect(normalizePdfPassword('951234567v')).toBe('951234567V');
      expect(normalizePdfPassword('95 123 4567 v')).toBe('951234567V');
      expect(normalizePdfPassword('N/A', 'CONS-2026-999')).toBe('CONS-2026-999');
      expect(normalizePdfPassword(null, 'CONS-001')).toBe('CONS-001');
      // No fixed default password: absent NIC and reference yields null (caller fails closed).
      expect(normalizePdfPassword(undefined, null)).toBeNull();
    });

    test('securePdfBuffer encrypts a PDF with standard /Encrypt dictionary and password lock', async () => {
      const doc = await PDFDocument.create();
      doc.addPage([200, 200]);
      const plainBytes = await doc.save();

      expect(isPdfEncrypted(plainBytes)).toBe(false);

      const encrypted = await securePdfBuffer(plainBytes, TEST_NIC);
      expect(isPdfEncrypted(encrypted)).toBe(true);
      expect(Buffer.from(encrypted).includes(Buffer.from('/Encrypt'))).toBe(true);

      // Loading without ignoreEncryption throws
      await expect(PDFDocument.load(encrypted)).rejects.toThrow(/encrypted/i);

      // Loading with ignoreEncryption succeeds
      const parsed = await PDFDocument.load(encrypted, { ignoreEncryption: true });
      expect(parsed.getPageCount()).toBe(1);
    });
  });

  describe('pdfGenerator content, layout and encryption', () => {
    test('generateConsultationSummaryPDF generates encrypted PDF by default when PDF_EXPORT_ENABLED=true', async () => {
      const consultation = {
        consultationId: 'CONS-2026-0091',
        createdAt: new Date('2026-11-09T18:33:00Z'),
        diagnosis: 'Acute Gastritis',
        notes: 'Follow low-acid diet and take prescribed medication.',
        symptoms: ['Epigastric pain', 'Nausea'],
        patientNic: TEST_NIC,
        verificationUrl: 'https://medisync.local/verify/tok-123',
      };
      const patient = {
        fullName: 'Kasun Perera',
        nic: TEST_NIC,
        dateOfBirth: new Date('1990-04-15'),
        gender: 'Male',
      };
      const doctor = {
        fullName: 'Dr. Nimal Silva',
        slmcNumber: 'SLMC-78901',
        specialization: 'Gastroenterology',
        _id: '507f1f77bcf86cd799439022',
      };

      const encryptedBytes = await generateConsultationSummaryPDF(consultation, patient, doctor);
      expect(Buffer.isBuffer(Buffer.from(encryptedBytes))).toBe(true);
      expect(isPdfEncrypted(encryptedBytes)).toBe(true);
      expect(Buffer.from(encryptedBytes).includes(Buffer.from('/Encrypt'))).toBe(true);
    });

    test('unlocked consultation PDF contains Sri Lanka timezone, masked NIC, real SLMC, and no placeholder', async () => {
      const consultation = {
        consultationId: 'CONS-2026-0091',
        createdAt: new Date('2026-11-09T18:33:00Z'), // 00:03 AM on 10 Nov Sri Lanka time
        diagnosis: 'Acute Gastritis',
        notes: 'Follow low-acid diet.',
        patientNic: TEST_NIC,
        verificationUrl: 'https://medisync.local/verify/tok-123',
      };
      const patient = {
        fullName: 'Kasun Perera',
        nic: TEST_NIC,
        dateOfBirth: new Date('1990-04-15'),
        gender: 'Male',
      };
      const doctor = {
        fullName: 'Dr. Nimal Silva',
        slmcNumber: 'SLMC-78901',
        specialization: 'Gastroenterology',
        _id: '507f1f77bcf86cd799439022',
      };

      // Generate unlocked for inspecting text stream
      const unlockedBytes = await generateConsultationSummaryPDF(consultation, patient, doctor, { unlockForTest: true });
      expect(isPdfEncrypted(unlockedBytes)).toBe(false);
      const str = await extractPdfText(unlockedBytes);

      // Zero placeholder "SLMC-REG-VERIFIED"
      expect(str).not.toContain('SLMC-REG-VERIFIED');
      // Contains real doctor registration and specialty
      expect(str).toContain('SLMC-78901');
      expect(str).toContain('Gastroenterology');
      expect(str).toContain('DOC-');

      // Masked NIC: first 3 + *** + last 3
      expect(str).toContain(MASKED_NIC);
      // Raw unmasked NIC never appears in the text stream
      expect(str).not.toContain(TEST_NIC);

      // Sri Lanka time label
      expect(str).toContain('Sri Lanka time');
    });

    test('omits demographic lines that would print N/A when demographics are missing', async () => {
      const consultation = {
        consultationId: 'CONS-2026-0092',
        createdAt: new Date(),
        diagnosis: 'Viral Infection',
      };
      const patient = {
        fullName: 'Anonymous Walk-in',
      };
      const doctor = {
        fullName: 'Dr. Unknown',
      };

      const bytes = await generateConsultationSummaryPDF(consultation, patient, doctor, { unlockForTest: true });
      expect(isPdfEncrypted(bytes)).toBe(false);
      const str = await extractPdfText(bytes);

      // Must not print "NIC: N/A" or "Age: N/A"
      expect(str).not.toMatch(/NIC:\s*N\/A/);
      expect(str).not.toMatch(/Age:\s*N\/A/);
      expect(str).not.toContain('SLMC-REG-VERIFIED');
      expect(str).toContain('SLMC reg. no.: not on file');
    });
  });
});
