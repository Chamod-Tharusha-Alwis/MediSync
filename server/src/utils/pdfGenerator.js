const { PDFDocument, rgb, StandardFonts, degrees } = require('pdf-lib');
const { encryptPDF } = require('@pdfsmaller/pdf-encrypt-lite');
const crypto = require('crypto');

// Add the encrypt method to the PDFDocument prototype.
PDFDocument.prototype.encrypt = function(options) {
  this._encryptionOptions = options;
};

/**
 * Generates a privacy-safe e-prescription PDF locked with the patient's NIC.
 * Shows: Header (Doctor, Date/Time, Workspace, Follow-up), Patient (Name, NIC, Age),
 * Rx (Medicines only), and an optional Lab Tests section.
 * Does NOT include symptoms or diagnosis.
 *
 * @param {Object|Object[]} prescriptionData  - Single rx object or array of rx objects
 * @param {string}  patientName
 * @param {string}  patientNIC
 * @param {string}  patientDOB               - Localized date string or 'N/A'
 * @param {string}  doctorName
 * @param {string}  workspace                - 'personal' | 'hospital' | human-readable label
 * @param {string}  [patientGender]
 * @param {string[]} [labTests]              - Array of lab test name strings
 * @param {Date|null} [followUpDate]         - Follow-up appointment date
 * @param {string} [consultationRef]         - Global Consultation ID string
 * @returns {Promise<Buffer>}
 */
exports.generateLockedPrescription = async (
  prescriptionData,
  patientName,
  patientNIC,
  patientDOB,
  doctorName,
  workspace,
  patientGender = '',
  labTests      = [],
  followUpDate  = null,
  consultationRef = ''
) => {
  const pdfDoc = await PDFDocument.create();
  const page   = pdfDoc.addPage([595, 842]); // A4 portrait
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // ── Color palette ──────────────────────────────────────────────────────
  const TEAL     = rgb(0.05, 0.58, 0.53);
  const NAVY     = rgb(0.06, 0.23, 0.40);
  const DARK     = rgb(0.10, 0.10, 0.10);
  const MID      = rgb(0.30, 0.30, 0.30);
  const LIGHT    = rgb(0.50, 0.50, 0.50);
  const BORDER   = rgb(0.88, 0.88, 0.88);
  const BG_GREY  = rgb(0.96, 0.97, 0.98);
  const BG_APPT  = rgb(0.94, 0.99, 0.97); // light mint for follow-up box
  const APPT_BDR = rgb(0.05, 0.58, 0.53);
  const BG_LAB   = rgb(0.97, 0.97, 1.00); // light lavender for lab section

  // ── Workspace label ────────────────────────────────────────────────────
  let workspaceLabel = 'Private Clinic';
  if (workspace) {
    const ws = workspace.toLowerCase();
    if (ws.includes('hospital')) workspaceLabel = 'Hospital Consultation';
    else if (ws.includes('personal') || ws.includes('clinic')) workspaceLabel = 'Private Clinic';
    else workspaceLabel = workspace;
  }

  // ════════════════════════════════════════════════════════════════════════
  // 1. HEADER — Doctor  |  Date · Time  |  Workspace
  // ════════════════════════════════════════════════════════════════════════

  page.drawText('MediSync Digital Health Network', {
    x: 50, y: height - 52,
    size: 9, font: fontRegular, color: LIGHT,
  });
  const docName = doctorName || 'Medical Professional';
  const formattedDoctorName = docName.startsWith('Dr.') ? docName : `Dr. ${docName}`;
  page.drawText(formattedDoctorName, {
    x: 50, y: height - 70,
    size: 18, font: fontBold, color: NAVY,
  });
  page.drawText('Registered Medical Practitioner', {
    x: 50, y: height - 86,
    size: 9, font: fontRegular, color: LIGHT,
  });

  const now      = new Date();
  const dateLine = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeLine = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });

  page.drawText(`Date: ${dateLine}`,         { x: width - 220, y: height - 62, size: 9, font: fontRegular, color: MID  });
  page.drawText(`Time: ${timeLine}`,         { x: width - 220, y: height - 75, size: 9, font: fontRegular, color: MID  });
  page.drawText(`Workspace: ${workspaceLabel}`, { x: width - 220, y: height - 88, size: 9, font: fontBold,    color: TEAL });
  
  if (consultationRef) {
    page.drawText(`Ref: ${consultationRef}`, { x: width - 220, y: height - 100, size: 8, font: fontBold, color: NAVY });
  }

  // Teal divider
  const dividerY = consultationRef ? height - 110 : height - 102;
  page.drawLine({
    start: { x: 50, y: dividerY }, end: { x: width - 50, y: dividerY },
    thickness: 2, color: TEAL,
  });

  // ── Follow-up appointment banner (just below the divider if present) ───
  let currentY = dividerY - 22;

  if (followUpDate) {
    const apptStr = new Date(followUpDate).toLocaleDateString('en-GB', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });
    const bannerH = 28;

    page.drawRectangle({
      x: 50, y: currentY - bannerH,
      width: width - 100, height: bannerH,
      color: BG_APPT, borderColor: APPT_BDR, borderWidth: 1,
    });
    page.drawText('Next Appointment:', {
      x: 62, y: currentY - 10,
      size: 9, font: fontBold, color: TEAL,
    });
    page.drawText(apptStr, {
      x: 176, y: currentY - 10,
      size: 9, font: fontBold, color: NAVY,
    });
    currentY -= bannerH + 14;
  }

  // ════════════════════════════════════════════════════════════════════════
  // 2. PATIENT DETAILS — Name, NIC, Age/Gender (no diagnosis, no symptoms)
  // ════════════════════════════════════════════════════════════════════════

  page.drawText('PATIENT DETAILS', {
    x: 50, y: currentY,
    size: 9, font: fontBold, color: TEAL,
  });
  currentY -= 18;

  // Age calculation
  let age = 'N/A';
  if (patientDOB && patientDOB !== 'N/A') {
    const dob = new Date(patientDOB);
    if (!isNaN(dob.getTime())) {
      age = String(Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000)));
    }
  }
  const genderStr = patientGender ? `  ·  ${patientGender}` : '';
  const ageStr    = age !== 'N/A' ? `  ·  Age: ${age} yrs` : '';

  const boxH = 56;
  page.drawRectangle({
    x: 50, y: currentY - boxH,
    width: width - 100, height: boxH,
    color: BG_GREY, borderColor: BORDER, borderWidth: 1,
  });
  page.drawText(`Patient: ${patientName || 'N/A'}`, {
    x: 62, y: currentY - 18,
    size: 11, font: fontBold, color: DARK,
  });
  page.drawText(`NIC: ${patientNIC || 'N/A'}${genderStr}${ageStr}`, {
    x: 62, y: currentY - 38,
    size: 10, font: fontRegular, color: MID,
  });

  currentY -= boxH + 22;

  // ════════════════════════════════════════════════════════════════════════
  // 3. Rx — PRESCRIBED MEDICINES
  // ════════════════════════════════════════════════════════════════════════

  page.drawText('Rx', {
    x: 50, y: currentY,
    size: 26, font: fontBold, color: TEAL,
  });
  currentY -= 18;

  page.drawText('PRESCRIBED MEDICINES', {
    x: 50, y: currentY,
    size: 11, font: fontBold, color: NAVY,
  });
  currentY -= 22;

  // Table header
  page.drawLine({ start: { x: 50, y: currentY + 4 }, end: { x: width - 50, y: currentY + 4 }, thickness: 0.8, color: BORDER });

  const COL = { drug: 55, dosage: 220, freq: 325, dur: 435 };
  const hdrY = currentY - 12;

  [
    { label: 'Drug / Medication', x: COL.drug   },
    { label: 'Dosage',            x: COL.dosage },
    { label: 'Frequency',         x: COL.freq   },
    { label: 'Duration',          x: COL.dur    },
  ].forEach(({ label, x }) =>
    page.drawText(label, { x, y: hdrY, size: 9, font: fontBold, color: MID })
  );

  page.drawLine({ start: { x: 50, y: hdrY - 7 }, end: { x: width - 50, y: hdrY - 7 }, thickness: 0.8, color: BORDER });
  currentY = hdrY - 22;

  const rxList = Array.isArray(prescriptionData) ? prescriptionData : [prescriptionData];

  let rowIndex = 0;
  for (const rx of rxList) {
    // Alternating row shading
    if (rowIndex % 2 === 0) {
      page.drawRectangle({
        x: 50, y: currentY - 6,
        width: width - 100, height: 22,
        color: rgb(0.97, 0.98, 1.00), borderWidth: 0,
      });
    }

    const durationStr = rx.durationDays
      ? `${rx.durationDays} day${rx.durationDays > 1 ? 's' : ''}`
      : rx.duration || '7 days';

    // Safely stringify — guard against accidental Buffer/object values
    const safeStr = (v) => (v && typeof v === 'object' ? '[encrypted]' : String(v || 'N/A'));

    page.drawText(safeStr(rx.drugName || rx.name), { x: COL.drug,   y: currentY, size: 10, font: fontBold,    color: DARK });
    page.drawText(safeStr(rx.dosage),               { x: COL.dosage, y: currentY, size: 10, font: fontRegular, color: DARK });
    page.drawText(safeStr(rx.frequency),             { x: COL.freq,   y: currentY, size: 10, font: fontRegular, color: DARK });
    page.drawText(durationStr,                       { x: COL.dur,    y: currentY, size: 10, font: fontRegular, color: DARK });

    currentY -= 18;

    if (rx.instructions && typeof rx.instructions === 'string' && rx.instructions.trim()) {
      page.drawText(`  Instructions: ${rx.instructions}`, {
        x: COL.drug, y: currentY,
        size: 8, font: fontOblique, color: LIGHT,
      });
      currentY -= 14;
    }

    page.drawLine({ start: { x: 50, y: currentY + 4 }, end: { x: width - 50, y: currentY + 4 }, thickness: 0.4, color: BORDER });
    currentY -= 10;
    rowIndex++;
  }

  // ════════════════════════════════════════════════════════════════════════
  // 4. LAB TESTS SECTION (only if labTests are provided)
  // ════════════════════════════════════════════════════════════════════════

  const validLabTests = Array.isArray(labTests) ? labTests.filter(t => t && typeof t === 'string' && t.trim()) : [];

  if (validLabTests.length > 0) {
    currentY -= 10; // breathing room

    page.drawText('RECOMMENDED LAB TESTS', {
      x: 50, y: currentY,
      size: 11, font: fontBold, color: NAVY,
    });
    currentY -= 18;

    // Lab tests box background
    const labBoxH = validLabTests.length * 22 + 16;
    page.drawRectangle({
      x: 50, y: currentY - labBoxH,
      width: width - 100, height: labBoxH,
      color: BG_LAB, borderColor: BORDER, borderWidth: 1,
    });

    currentY -= 14;
    validLabTests.forEach((test, i) => {
      // Bullet dot
      page.drawCircle({ x: 65, y: currentY + 3, size: 2.5, color: TEAL });
      page.drawText(`${i + 1}. ${test}`, {
        x: 74, y: currentY - 1,
        size: 10, font: fontRegular, color: DARK,
      });
      currentY -= 22;
    });

    currentY -= 6;
  }

  // ════════════════════════════════════════════════════════════════════════
  // 5. FOOTER
  // ════════════════════════════════════════════════════════════════════════

  page.drawLine({ start: { x: 50, y: 80 }, end: { x: width - 50, y: 80 }, thickness: 0.8, color: BORDER });
  page.drawText(
    'This document is password-protected. Use the secure 8-character PDF Key sent to your email to open it.',
    { x: 50, y: 62, size: 8, font: fontRegular, color: LIGHT }
  );
  page.drawText('Powered by MediSync Digital Health Initiative — Sri Lanka', {
    x: 50, y: 48, size: 8, font: fontBold, color: TEAL,
  });

  // Watermark for dispensed prescriptions
  const isDispensed = rxList.some(rx => rx && rx.status === 'dispensed');
  if (isDispensed) {
    page.drawText('DISPENSED - INVALID FOR REUSE', {
      x: 50,
      y: 300,
      size: 38,
      font: fontBold,
      color: rgb(0.9, 0.1, 0.1),
      opacity: 0.18,
      rotate: degrees(45),
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // 6. ENCRYPT with secure 8-character hash password
  // ════════════════════════════════════════════════════════════════════════

  const masterKey = global.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || 'default-owner-key-12345678';
  const securePassword = crypto.createHmac('sha256', masterKey)
    .update(patientNIC)
    .digest('hex')
    .substring(0, 8)
    .toUpperCase();

  pdfDoc.encrypt({
    userPassword: securePassword,
    ownerPassword: masterKey,
  });

  const pdfBytes = await pdfDoc.save();

  if (pdfDoc._encryptionOptions) {
    const encryptedBytes = await encryptPDF(
      pdfBytes,
      pdfDoc._encryptionOptions.userPassword,
      { ownerPassword: pdfDoc._encryptionOptions.ownerPassword }
    );
    return Buffer.from(encryptedBytes);
  }

  return Buffer.from(pdfBytes);
};
