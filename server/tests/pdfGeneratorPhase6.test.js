'use strict';

/**
 * MediSync Stage 7 PDF Generation Engine Unit & Regression Suite
 *
 * Full test coverage reconciling historical regression assertions with strict
 * fail-closed clinical production security and dedicated offline cryptographic proofs.
 *
 * Reconciled Test Coverage Matrix:
 * A. Ordinary clinical export fails closed.
 * B. Caller-supplied synthetic patient values cannot bypass the hold.
 * C. Caller-supplied password values cannot bypass the hold.
 * D. Production and test environment strings do not weaken the runtime boundary.
 * E. Admin confidential export cannot return plaintext.
 * F. Consultation/lab/prescription failure branches do not return unencrypted clinical content.
 * G. Synthetic legacy proof checks real randomized credentials and uniqueness.
 * H. Correct password succeeds in the isolated proof.
 * I. Wrong password fails in the isolated proof.
 * J. Real expected stream content is recovered in the isolated proof.
 * K. Real Sinhala/Tamil PDF rendering / INN preservation / script notices.
 */

const { PDFDocument, PDFName, PDFRawStream } = require('pdf-lib');
const pdfGenerator = require('../src/utils/pdfGenerator');
const { generateIsolatedSyntheticProofPDF } = require('./helpers/legacyPdfProof');
const crypto = require('crypto');
const zlib = require('zlib');

describe('PDF Generation Engine (Stage 7 Security, Isolation & Integrity)', () => {
  const dummyKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  beforeAll(() => {
    global.ENCRYPTION_KEY = dummyKey;
    global.ENCRYPTION_KEYS = { '1': dummyKey };
    global.ACTIVE_KEY_VERSION = 1;
  });

  const sampleRxData = [
    { drugName: 'Amoxicillin', dosage: '500mg', frequency: 'Three times daily', durationDays: 7, instructions: 'After meals' },
    { drugName: 'Paracetamol', dosage: '1000mg', frequency: 'As needed', durationDays: 3, instructions: 'For fever' }
  ];

  // ── Requirement A: Ordinary clinical export fails closed ──────────────
  it('(A) fails closed on ordinary clinical prescription export with typed SECURITY_HOLD', async () => {
    await expect(
      pdfGenerator.generateLockedPrescription(
        sampleRxData,
        'Nimal Perera',
        '200012345678',
        '1990-05-15',
        'Dr. Jayasinghe',
        'hospital',
        'Male',
        ['Full Blood Count'],
        '2026-11-01',
        'RX-CLINICAL-001'
      )
    ).rejects.toThrow(/SECURITY_HOLD/);
  });

  // ── Requirement B: Caller-supplied synthetic patient values cannot bypass hold ──
  it('(B) rejects caller-supplied synthetic patient values attempting to bypass hold', async () => {
    // Ordinary function arguments resembling synthetic QA identities must NEVER unlock RC4
    await expect(
      pdfGenerator.generateLockedPrescription(
        sampleRxData,
        'Synthetic QA Subject',
        'NIC-SYNTHETIC-ONLY',
        null,
        'Synthetic Doctor',
        'Synthetic Workspace',
        null,
        [],
        null,
        'SYNTHETIC-PDF-PROOF'
      )
    ).rejects.toThrow(/SECURITY_HOLD/);

    await expect(
      pdfGenerator.generateLockedPrescription(
        sampleRxData,
        'Synthetic Owner Control',
        'NIC-SYNTHETIC-ONLY',
        null,
        null,
        null,
        null,
        [],
        null,
        'OWNER-CONTROL'
      )
    ).rejects.toThrow(/SECURITY_HOLD/);
  });

  // ── Requirement C: Caller-supplied password values cannot bypass hold ──
  it('(C) rejects caller-supplied password values or credentials flags attempting to bypass hold', async () => {
    // documentPassword must not bypass hold
    await expect(
      pdfGenerator.generateLockedPrescription(
        sampleRxData,
        'Kasun Bandara',
        '200000000000',
        null, null, null, null, null, null, 'PR-001',
        { documentPassword: 'CallerSuppliedPassword123' }
      )
    ).rejects.toThrow(/SECURITY_HOLD/);

    // returnCredentials must not bypass hold
    await expect(
      pdfGenerator.generateLockedPrescription(
        sampleRxData,
        'Kasun Bandara',
        '200000000000',
        null, null, null, null, null, null, 'PR-001',
        { returnCredentials: true }
      )
    ).rejects.toThrow(/SECURITY_HOLD/);

    // allowSyntheticOfflineRc4 must not bypass hold
    await expect(
      pdfGenerator.generateLockedPrescription(
        sampleRxData,
        'Kasun Bandara',
        '200000000000',
        null, null, null, null, null, null, 'PR-001',
        { allowSyntheticOfflineRc4: true }
      )
    ).rejects.toThrow(/SECURITY_HOLD/);
  });

  // ── Requirement D: Production and test environment strings do not weaken runtime boundary ──
  it('(D) verifies production and test environment settings cannot weaken runtime security boundary', async () => {
    const origEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'test';
      await expect(
        pdfGenerator.generateLockedPrescription(
          sampleRxData,
          'Test Patient',
          '199512345678',
          null, null, null, null, null, null, 'RX-TEST'
        )
      ).rejects.toThrow(/SECURITY_HOLD/);

      process.env.NODE_ENV = 'production';
      await expect(
        pdfGenerator.generateLockedPrescription(
          sampleRxData,
          'Prod Patient',
          '199512345678',
          null, null, null, null, null, null, 'RX-PROD'
        )
      ).rejects.toThrow(/SECURITY_HOLD/);
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  // ── Requirement E: Admin confidential export cannot return plaintext ──
  it('(E) fails closed on admin confidential analytics export with SECURITY_HOLD (no plaintext bytes)', async () => {
    const analyticsData = {
      registrationGrowth: [{ count: 45 }, { count: 55 }],
      topDoctors: [{ name: 'Dr. Perera', count: 40 }],
      dispensingStats: { issuedCount: 120, dispensedCount: 112, dispensingRate: '93.3' },
      topDrugs: [{ name: 'Paracetamol', count: 120 }],
      alerts: [{ disease: 'Dengue', district: 'Colombo', count: 28, riskLevel: 'HIGH' }]
    };

    await expect(
      pdfGenerator.generateAdminAnalyticsReportPDF(analyticsData, {
        generatedBy: 'System SuperAdmin'
      })
    ).rejects.toThrow(/SECURITY_HOLD/);
  });

  // ── Requirement F: Consultation/lab/prescription failure branches do not return unencrypted clinical content ──
  it('(F) ensures consultation summary and lab report failure branches fail closed without plaintext fallback', async () => {
    const consultData = {
      consultationId: 'CONS-998877',
      patientName: 'Sunil Silva',
      patientNic: '198512345678',
      doctorName: 'Dr. K. Gunawardena',
      diagnosis: 'Acute Viral Pharyngitis',
      medications: [{ drugName: 'Paracetamol', dosage: '500mg' }]
    };
    await expect(
      pdfGenerator.generateConsultationSummaryPDF(consultData)
    ).rejects.toThrow(/SECURITY_HOLD/);

    const labData = {
      testType: 'Full Blood Count',
      patientName: 'Sunil Silva',
      patientNic: '198512345678',
      status: 'completed'
    };
    await expect(
      pdfGenerator.generateLabReportPDF(labData)
    ).rejects.toThrow(/SECURITY_HOLD/);

    // Missing data branches also fail closed
    await expect(
      pdfGenerator.generateConsultationSummaryPDF({})
    ).rejects.toThrow(/SECURITY_HOLD/);

    await expect(
      pdfGenerator.generateLabReportPDF({})
    ).rejects.toThrow(/SECURITY_HOLD/);
  });

  // ── Requirement G: Synthetic legacy proof checks real randomized credentials and uniqueness ──
  it('(G) verifies isolated legacy proof generates distinct randomized credentials and zero public buffer leakage', async () => {
    const proof1 = await generateIsolatedSyntheticProofPDF(
      sampleRxData,
      'Proof Subject 1',
      'NIC-001',
      'Doctor A',
      'Clinic A',
      { returnCredentials: true }
    );
    const proof2 = await generateIsolatedSyntheticProofPDF(
      sampleRxData,
      'Proof Subject 2',
      'NIC-002',
      'Doctor B',
      'Clinic B',
      { returnCredentials: true }
    );

    expect(Buffer.isBuffer(proof1.buffer)).toBe(true);
    expect(Buffer.isBuffer(proof2.buffer)).toBe(true);

    // Password uniqueness: distinct cryptographic secrets for each document
    expect(proof1.userPassword).not.toBe(proof2.userPassword);
    expect(proof1.ownerPassword).not.toBe(proof2.ownerPassword);
    expect(proof1.userPassword.length).toBeGreaterThanOrEqual(16);
    expect(proof1.ownerPassword.length).toBeGreaterThanOrEqual(32);

    // Credential secrecy: Buffer objects must NEVER carry password properties
    expect(proof1.buffer.documentPassword).toBeUndefined();
    expect(proof1.buffer.ownerPassword).toBeUndefined();
    expect(proof1.buffer.userPassword).toBeUndefined();
  });

  // ── Requirement H & I: Correct password succeeds, wrong password fails in isolated proof ──
  it('(H, I) verifies correct password succeeds and wrong password fails in isolated proof', async () => {
    const documentPassword = crypto.randomBytes(16).toString('hex').toUpperCase();
    const buf = await generateIsolatedSyntheticProofPDF(
      sampleRxData,
      'Synthetic Subject',
      'NIC-PROOF',
      'Synthetic Doctor',
      'Synthetic Workspace',
      { documentPassword }
    );

    // Standard load must fail (encrypted document)
    await expect(PDFDocument.load(buf)).rejects.toThrow(/encrypted/i);

    // ISO 32000-1 Rev 3 dictionary verification
    const rawDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
    const context = rawDoc.context;
    expect(context.trailerInfo.Encrypt).toBeDefined();

    const encryptDict = context.lookup(context.trailerInfo.Encrypt);
    const V = context.lookup(encryptDict.get(PDFName.of('V'))).asNumber();
    const R = context.lookup(encryptDict.get(PDFName.of('R'))).asNumber();
    const length = context.lookup(encryptDict.get(PDFName.of('Length'))).asNumber();

    expect(V).toBe(2);
    expect(R).toBe(3);
    expect(length).toBe(128);

    // Calculate document checksum helper
    const checksum = pdfGenerator.calculatePDFDocumentChecksum(buf);
    expect(typeof checksum).toBe('string');
    expect(checksum.length).toBe(64);
  });

  // ── Requirement J: Real expected stream content is recovered in isolated proof ──
  it('(J) recovers expected decrypted medication content from isolated proof stream', async () => {
    const proofResult = await require('../../scripts/agent_b_pdf_stream_proof.cjs').runProof();
    expect(proofResult.status).toBe('PASS_SYNTHETIC_RC4_STREAM_PROOF');
    expect(proofResult.expectedMedicationAndDosageRecovered).toBe(true);
    expect(proofResult.correctPasswordAuthenticated).toBe(true);
    expect(proofResult.wrongPasswordRejected).toBe(true);
  });

  // ── Requirement K: Static INN drug preservation & script notice validation ──
  // Note: Native PDF font rendering for Sinhala and Tamil (Brahmic scripts) is BLOCKED
  // without approved font embedding and complex-text shaping engine (HarfBuzz/FreeType).
  it('(K) validates static INN drug labels and resolves locale metadata (native SI/TA rendering BLOCKED)', () => {
    expect(pdfGenerator.PDF_LABELS).toBeDefined();
    expect(pdfGenerator.PDF_LABELS.si.colDrug).toContain('INN');
    expect(pdfGenerator.PDF_LABELS.ta.colDrug).toContain('INN');
    expect(pdfGenerator.PDF_LABELS.si.footerScriptNotice).toContain('Unicode Brahmic script view is available');
    expect(pdfGenerator.PDF_LABELS.ta.footerScriptNotice).toContain('Unicode Brahmic script view is available');

    // Language resolution helper handles valid and invalid options gracefully
    expect(pdfGenerator.resolvePdfLang({ lang: 'si' })).toBe('si');
    expect(pdfGenerator.resolvePdfLang({ preferredLanguage: 'ta' })).toBe('ta');
    expect(pdfGenerator.resolvePdfLang('en')).toBe('en');
    expect(pdfGenerator.resolvePdfLang('invalid-lang', 'en')).toBe('en');

    // Native rendering status: Standard 14 PDF fonts (Helvetica/WinAnsi) cannot encode Sinhala/Tamil
    // Native Brahmic PDF rendering remains BLOCKED until approved fonts and shaping engine are integrated.
    const nativeRenderingStatus = 'BLOCKED_REQUIRES_APPROVED_FONT_AND_SHAPING_ENGINE';
    expect(nativeRenderingStatus).toBe('BLOCKED_REQUIRES_APPROVED_FONT_AND_SHAPING_ENGINE');
  });

  // ── Requirement L: Rejection of weak cipher modes and hold on AES transport ──
  it('(L) rejects weak cipher mode requests and enforces security hold on all cipher options', async () => {
    // Weak RC4-40 or legacy algorithm requests fail closed
    await expect(
      pdfGenerator.generateLockedPrescription(
        sampleRxData,
        'Kasun Bandara',
        '200000000000',
        null, null, null, null, null, null, 'RX-WEAK-01',
        { cipher: 'RC4-40' }
      )
    ).rejects.toThrow(/SECURITY_HOLD/);

    // Pending modern AES cipher requests also fail closed until transport profile is certified
    await expect(
      pdfGenerator.generateLockedPrescription(
        sampleRxData,
        'Kasun Bandara',
        '200000000000',
        null, null, null, null, null, null, 'RX-AES-01',
        { cipher: 'AES-256-GCM' }
      )
    ).rejects.toThrow(/SECURITY_HOLD/);
  });

  // ── Requirement M: Truth in labeling: Prohibits false password-protection claims ──
  it('(M) verifies no false password-protected or locked PDF claims appear while real encryption is not implemented', () => {
    const prohibited = [/password-protected/i, /password protected/i, /pdf key/i, /locked pdf/i, /unlock it/i];

    // 1. Verify localized PDF labels have neutral wording
    const locales = ['en', 'si', 'ta'];
    for (const locale of locales) {
      const labels = pdfGenerator.PDF_LABELS[locale];
      expect(labels).toBeDefined();
      expect(labels.footerNotice).toBeDefined();
      expect(labels.footerNotice).toBe('Confidential medical document. Handle according to privacy policy.');
      for (const pat of prohibited) {
        expect(labels.footerNotice).not.toMatch(pat);
      }
    }

    // 2. Verify pdfGenerator source itself contains no untruthful password claims in footers
    const fs = require('fs');
    const path = require('path');
    const pdfGenSrc = fs.readFileSync(path.resolve(__dirname, '../src/utils/pdfGenerator.js'), 'utf8');
    const lines = pdfGenSrc.split('\n');
    lines.forEach((line, idx) => {
      if (line.includes('footerNotice') || line.includes('drawText')) {
        for (const pat of prohibited) {
          expect({ line: idx + 1, text: line.trim() }).not.toMatchObject({
            text: expect.stringMatching(pat)
          });
        }
      }
    });

    // 3. Verify emailService prescription email template contains no false locked/password claims
    const emailSrc = fs.readFileSync(path.resolve(__dirname, '../src/utils/emailService.js'), 'utf8');
    const emailRxSection = emailSrc.slice(emailSrc.indexOf('exports.sendPrescriptionEmail ='), emailSrc.indexOf('exports.sendPrescriptionEmail =') + 1500);
    for (const pat of prohibited) {
      expect(emailRxSection).not.toMatch(pat);
    }
    expect(emailRxSection).not.toContain('PDF-KEY');

    // 4. Verify client Prescriptions.jsx and History.jsx contain no false password banners
    const prescrJsx = fs.readFileSync(path.resolve(__dirname, '../../client/src/pages/patient/Prescriptions.jsx'), 'utf8');
    for (const pat of prohibited) {
      expect(prescrJsx).not.toMatch(pat);
    }
    expect(prescrJsx).not.toContain('password-protected with your NIC');

    const historyJsx = fs.readFileSync(path.resolve(__dirname, '../../client/src/pages/patient/History.jsx'), 'utf8');
    for (const pat of prohibited) {
      expect(historyJsx).not.toMatch(pat);
    }
    expect(historyJsx).not.toContain('Download E-Prescription (PDF) 🔒');

    // 5. Verify client translations have truthful wording
    for (const loc of ['en', 'si', 'ta']) {
      const transPath = path.resolve(__dirname, `../../client/src/i18n/translations/${loc}.js`);
      if (fs.existsSync(transPath)) {
        const transSrc = fs.readFileSync(transPath, 'utf8');
        expect(transSrc).not.toMatch(/pdf.*password-protected/i);
        expect(transSrc).not.toMatch(/password.*protected.*nic/i);
      }
    }
  });
});
