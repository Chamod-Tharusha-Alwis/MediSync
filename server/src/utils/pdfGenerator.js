const { PDFDocument, rgb, StandardFonts, degrees } = require('pdf-lib');
const { encryptPDF } = require('@pdfsmaller/pdf-encrypt-lite');
const crypto = require('crypto');

// Add the encrypt method to the PDFDocument prototype.
PDFDocument.prototype.encrypt = function(options) {
  this._encryptionOptions = options;
};

// ── Shared Color Palette (MediSync Design System) ──────────────────────
const NAVY       = rgb(0.06, 0.23, 0.40);   // Header banner bg (#0F3B66)
const WHITE      = rgb(1, 1, 1);
const TEAL       = rgb(0.05, 0.58, 0.53);   // Section headings / accents (#0D9488)
const PURPLE     = rgb(0.50, 0.20, 0.80);   // Subsection headings (#8033CC)
const DARK       = rgb(0.15, 0.15, 0.20);   // Body text
const MID        = rgb(0.35, 0.35, 0.40);   // Secondary text
const LIGHT      = rgb(0.50, 0.50, 0.55);   // Tertiary / footer text
const SUBTLE_BG  = rgb(0.80, 0.85, 0.90);   // Header subtitle
const BORDER     = rgb(0.85, 0.85, 0.88);   // Table / section borders
const ROW_ALT    = rgb(0.96, 0.97, 0.99);   // Alternating row bg
const BG_GREY    = rgb(0.96, 0.97, 0.98);   // Patient details box
const BG_MINT    = rgb(0.94, 0.99, 0.97);   // Follow-up appointment box
const BG_LAV     = rgb(0.97, 0.97, 1.00);   // Lab tests box
const RED_STAMP  = rgb(0.90, 0.10, 0.10);   // Dispensed watermark

// ── Shared Helper: Draw Header Banner ──────────────────────────────────
function drawHeader(page, { title, subtitle, doctorName, refLabel, refValue, dateString, timeString, workspaceLabel, fontRegular, fontBold, width, height }) {
  const BANNER_H = 100;
  page.drawRectangle({
    x: 0, y: height - BANNER_H,
    width: width, height: BANNER_H,
    color: NAVY,
  });

  page.drawText(title, {
    x: 40, y: height - 42,
    size: 16, font: fontBold, color: WHITE,
  });

  page.drawText(subtitle, {
    x: 40, y: height - 62,
    size: 10, font: fontRegular, color: SUBTLE_BG,
  });

  if (doctorName) {
    const formattedDoc = doctorName.startsWith('Dr.') || doctorName.includes('Laboratory') ? doctorName : `Dr. ${doctorName}`;
    page.drawText(formattedDoc, {
      x: 40, y: height - 80,
      size: 10, font: fontBold, color: WHITE,
    });
  }

  if (refValue) {
    page.drawText(`${refLabel || 'Ref'}: ${refValue}`, {
      x: width - 220, y: height - 42,
      size: 10, font: fontBold, color: WHITE,
    });
  }

  if (dateString) {
    page.drawText(`Date: ${dateString}`, {
      x: width - 220, y: height - 58,
      size: 9, font: fontRegular, color: SUBTLE_BG,
    });
  }
  if (timeString) {
    page.drawText(`Time: ${timeString}`, {
      x: width - 220, y: height - 72,
      size: 9, font: fontRegular, color: SUBTLE_BG,
    });
  }
  if (workspaceLabel) {
    page.drawText(`Workspace: ${workspaceLabel}`, {
      x: width - 220, y: height - 86,
      size: 9, font: fontBold, color: TEAL,
    });
  }
  return height - BANNER_H - 28;
}

// ── Shared Helper: Draw Patient Details Box ────────────────────────────
function drawPatientDetails(page, { patientName, patientNIC, age, gender, yStart, fontRegular, fontBold, width }) {
  let currentY = yStart;
  page.drawText('PATIENT DETAILS', {
    x: 40, y: currentY,
    size: 12, font: fontBold, color: PURPLE,
  });
  currentY -= 20;

  const patientFields = [
    ['Patient Name:', patientName || 'N/A'],
    ['NIC:', patientNIC || 'N/A'],
    ['Age:', age || 'N/A'],
  ];
  if (gender && gender !== 'N/A') patientFields.push(['Gender:', gender]);

  const boxH = patientFields.length * 20 + 16;
  page.drawRectangle({
    x: 40, y: currentY - boxH + 14,
    width: width - 80, height: boxH,
    color: BG_GREY, borderColor: BORDER, borderWidth: 1,
  });

  currentY -= 4;
  patientFields.forEach(([label, val]) => {
    page.drawText(label, { x: 52, y: currentY, size: 10, font: fontBold, color: DARK });
    page.drawText(String(val), { x: 172, y: currentY, size: 10, font: fontRegular, color: DARK });
    currentY -= 20;
  });

  return currentY - 8;
}

// ── Shared Helper: Draw Footer ─────────────────────────────────────────
function drawFooter(page, { now, fontRegular, fontBold, width }) {
  page.drawLine({
    start: { x: 40, y: 88 },
    end:   { x: width - 40, y: 88 },
    thickness: 1.2, color: TEAL,
  });

  page.drawText(
    'This document is password-protected. Use the secure 8-character PDF Key sent to your email to open it.',
    { x: 40, y: 70, size: 8, font: fontRegular, color: LIGHT }
  );
  page.drawText('Verified by MediSync Digital Health Network — Sri Lanka', {
    x: 40, y: 54, size: 8, font: fontBold, color: TEAL,
  });
  page.drawText(`Generated: ${(now || new Date()).toLocaleString('en-GB')}`, {
    x: 40, y: 40, size: 7, font: fontRegular, color: LIGHT,
  });
}

// ── Shared Helper: Apply Real PDF Password Encryption ──────────────────
async function applyPDFEncryption(pdfDoc, patientNIC) {
  const masterKey = global.ENCRYPTION_KEYS ? global.ENCRYPTION_KEYS[global.ACTIVE_KEY_VERSION] : (global.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || 'MediSync#2026_Secure_Key_32bytes!');
  if (!masterKey) throw new Error('FATAL: No encryption key available for PDF password generation');
  
  const nicStr = (patientNIC || 'MEDISYNC').toString().trim();
  const securePassword = crypto.createHmac('sha256', masterKey)
    .update(nicStr)
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
      pdfDoc._encryptionOptions.ownerPassword
    );
    return Buffer.from(encryptedBytes);
  }

  return Buffer.from(pdfBytes);
}

// ── Shared Helper: Wrap Text to Cell Width ──────────────────────────────
function wrapText(text, font, fontSize, maxWidth) {
  if (!text) return [''];
  const words = String(text).split(/\s+/);
  const lines = [];
  let currentLine = '';

  for (let word of words) {
    if (!word) continue;
    if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = '';
      }
      let charLine = '';
      for (let char of word) {
        if (font.widthOfTextAtSize(charLine + char, fontSize) <= maxWidth) {
          charLine += char;
        } else {
          lines.push(charLine);
          charLine = char;
        }
      }
      currentLine = charLine;
    } else {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      if (font.widthOfTextAtSize(testLine, fontSize) <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [''];
}

/**
 * Generates a privacy-safe e-prescription PDF locked with a secure password.
 * Design matches the MediSync Clinical Lab Report style:
 *   - Navy header banner with white text
 *   - Purple/teal section headings
 *   - Professional label:value pairs in boxed containers
 *   - Medication table with alternating rows
 *   - Lab tests section & follow-up appointment
 *   - Footer with security notice
 */
exports.generateLockedPrescription = async (
  prescriptionData,
  patientName,
  patientNIC,
  patientDOB,
  doctorName,
  workspace,
  patientGender,
  labTests,
  followUpDate,
  consultationRef
) => {
  const pdfDoc = await PDFDocument.create();
  const page   = pdfDoc.addPage([595, 842]);
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // ── Workspace label ────────────────────────────────────────────────────
  let workspaceLabel = 'Private Practice';
  if (workspace) {
    const ws = workspace.toLowerCase();
    if (ws.includes('hospital')) workspaceLabel = 'Hospital Consultation';
    else if (ws.includes('personal') || ws.includes('clinic')) workspaceLabel = 'Private Practice';
    else workspaceLabel = workspace;
  }

  const now = new Date();
  const dateLine = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeLine = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });

  // 1. Draw Header
  let currentY = drawHeader(page, {
    title: 'MEDISYNC E-PRESCRIPTION',
    subtitle: 'Official Digital Prescription Document',
    doctorName: doctorName || 'Medical Professional',
    refLabel: 'Ref',
    refValue: consultationRef || 'PRESCRIPTION',
    dateString: dateLine,
    timeString: timeLine,
    workspaceLabel: workspaceLabel,
    fontRegular,
    fontBold,
    width,
    height,
  });

  // Age calculation
  let age = 'N/A';
  if (patientDOB && patientDOB !== 'N/A') {
    const dob = new Date(patientDOB);
    if (!isNaN(dob.getTime())) {
      age = `${Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000))} years`;
    }
  }

  // 2. Draw Patient Details Box
  currentY = drawPatientDetails(page, {
    patientName,
    patientNIC,
    age,
    gender: patientGender,
    yStart: currentY,
    fontRegular,
    fontBold,
    width,
  });

  // ── Follow-up appointment banner ──────────────────────────────────────
  if (followUpDate) {
    const apptStr = new Date(followUpDate).toLocaleDateString('en-GB', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });
    const bannerH = 30;

    page.drawRectangle({
      x: 40, y: currentY - bannerH,
      width: width - 80, height: bannerH,
      color: BG_MINT, borderColor: TEAL, borderWidth: 1,
    });
    page.drawText('Next Appointment:', {
      x: 52, y: currentY - 12,
      size: 9, font: fontBold, color: TEAL,
    });
    page.drawText(apptStr, {
      x: 168, y: currentY - 12,
      size: 9, font: fontBold, color: NAVY,
    });
    currentY -= bannerH + 16;
  }

  // 3. PRESCRIBED MEDICINES
  page.drawText('PRESCRIBED MEDICINES', {
    x: 40, y: currentY,
    size: 12, font: fontBold, color: PURPLE,
  });

  page.drawText('Rx', {
    x: width - 80, y: currentY - 4,
    size: 24, font: fontBold, color: TEAL, opacity: 0.3,
  });

  currentY -= 20;

  page.drawLine({
    start: { x: 40, y: currentY + 2 },
    end:   { x: width - 40, y: currentY + 2 },
    thickness: 1.2, color: TEAL,
  });

  const COL = {
    num:    { x: 44,  w: 18 },
    drug:   { x: 64,  w: 136 },
    dosage: { x: 205, w: 165 },
    freq:   { x: 375, w: 95 },
    dur:    { x: 475, w: 75 },
  };
  const hdrY = currentY - 10;

  [
    { label: '#',                 x: COL.num.x    },
    { label: 'Drug / Medication', x: COL.drug.x   },
    { label: 'Dosage',            x: COL.dosage.x },
    { label: 'Frequency',         x: COL.freq.x   },
    { label: 'Duration',          x: COL.dur.x    },
  ].forEach(({ label, x }) =>
    page.drawText(label, { x, y: hdrY, size: 9, font: fontBold, color: MID })
  );

  page.drawLine({
    start: { x: 40, y: hdrY - 7 },
    end:   { x: width - 40, y: hdrY - 7 },
    thickness: 0.8, color: BORDER,
  });
  currentY = hdrY - 22;

  const rxList = Array.isArray(prescriptionData) ? prescriptionData : [prescriptionData];
  const safeStr = (v) => (v && typeof v === 'object' ? '[encrypted]' : String(v || 'N/A'));

  let rowIndex = 0;
  for (const rx of rxList) {
    const durationStr = rx.durationDays
      ? `${rx.durationDays} day${rx.durationDays > 1 ? 's' : ''}`
      : rx.duration || '7 days';

    const drugLines   = wrapText(safeStr(rx.drugName || rx.name), fontBold, 10, COL.drug.w);
    const dosageLines = wrapText(safeStr(rx.dosage), fontRegular, 10, COL.dosage.w);
    const freqLines   = wrapText(safeStr(rx.frequency), fontRegular, 10, COL.freq.w);
    const durLines    = wrapText(durationStr, fontRegular, 10, COL.dur.w);

    const maxLines = Math.max(drugLines.length, dosageLines.length, freqLines.length, durLines.length);
    const instStr = rx.instructions && typeof rx.instructions === 'string' ? rx.instructions.trim() : '';
    const instLines = instStr ? wrapText(`Instructions: ${instStr}`, fontOblique, 8, width - 100) : [];

    const rowTextHeight = maxLines * 14;
    const instHeight = instLines.length > 0 ? instLines.length * 12 + 4 : 0;
    const totalRowHeight = rowTextHeight + instHeight + 8;

    if (currentY - totalRowHeight < 100) {
      drawFooter(page, { now: new Date(), fontRegular, fontBold, width });
      page = pdfDoc.addPage([595, 842]);
      currentY = height - 50;
    }

    if (rowIndex % 2 === 0) {
      page.drawRectangle({
        x: 40, y: currentY - totalRowHeight + 10,
        width: width - 80, height: totalRowHeight,
        color: ROW_ALT, borderWidth: 0,
      });
    }

    page.drawText(`${rowIndex + 1}.`, { x: COL.num.x, y: currentY, size: 9, font: fontBold, color: TEAL });

    for (let i = 0; i < maxLines; i++) {
      const lineY = currentY - (i * 14);
      if (drugLines[i])   page.drawText(drugLines[i],   { x: COL.drug.x,   y: lineY, size: 10, font: fontBold,    color: DARK });
      if (dosageLines[i]) page.drawText(dosageLines[i], { x: COL.dosage.x, y: lineY, size: 10, font: fontRegular, color: DARK });
      if (freqLines[i])   page.drawText(freqLines[i],   { x: COL.freq.x,   y: lineY, size: 10, font: fontRegular, color: DARK });
      if (durLines[i])    page.drawText(durLines[i],    { x: COL.dur.x,    y: lineY, size: 10, font: fontRegular, color: DARK });
    }

    let nextY = currentY - rowTextHeight - 2;
    if (instLines.length > 0) {
      for (let i = 0; i < instLines.length; i++) {
        page.drawText(instLines[i], { x: COL.drug.x, y: nextY - (i * 12), size: 8, font: fontOblique, color: LIGHT });
      }
      nextY -= (instLines.length * 12 + 2);
    }

    page.drawLine({
      start: { x: 40, y: nextY },
      end:   { x: width - 40, y: nextY },
      thickness: 0.4, color: BORDER,
    });
    currentY = nextY - 12;
    rowIndex++;
  }

  // 4. RECOMMENDED LAB TESTS SECTION
  const validLabTests = Array.isArray(labTests)
    ? labTests.filter(t => t && typeof t === 'string' && t.trim())
    : [];

  if (validLabTests.length > 0) {
    currentY -= 10;
    page.drawText('RECOMMENDED LAB TESTS', {
      x: 40, y: currentY,
      size: 12, font: fontBold, color: PURPLE,
    });
    currentY -= 18;

    const labBoxH = validLabTests.length * 22 + 16;
    page.drawRectangle({
      x: 40, y: currentY - labBoxH,
      width: width - 80, height: labBoxH,
      color: BG_LAV, borderColor: BORDER, borderWidth: 1,
    });

    currentY -= 14;
    validLabTests.forEach((test, i) => {
      page.drawCircle({ x: 55, y: currentY + 3, size: 2.5, color: TEAL });
      page.drawText(`${i + 1}. ${test}`, {
        x: 64, y: currentY - 1,
        size: 10, font: fontRegular, color: DARK,
      });
      currentY -= 22;
    });
    currentY -= 6;
  }

  // 5. DISPENSED WATERMARK
  const isDispensed = rxList.some(rx => rx && rx.status === 'dispensed');
  if (isDispensed) {
    page.drawText('DISPENSED - INVALID FOR REUSE', {
      x: 50, y: 300,
      size: 38, font: fontBold,
      color: RED_STAMP, opacity: 0.18,
      rotate: degrees(45),
    });
  }

  // 6. Draw Footer
  drawFooter(page, { now, fontRegular, fontBold, width });

  // 7. Apply Real Encryption
  return await applyPDFEncryption(pdfDoc, patientNIC);
};

/**
 * Generates an official PDF Lab Test Report summary for patient/doctor download.
 * Refactored to match the exact design aesthetic of the E-Prescription PDF:
 *   - Navy header banner with white text
 *   - Boxed patient details with purple heading
 *   - Boxed diagnostic test summary
 *   - Footer with security notice and password protection
 */
exports.generateLabReportPDF = async (labTest, patientName = null) => {
  const pdfDoc = await PDFDocument.create();
  const page   = pdfDoc.addPage([595, 842]);
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // 1. Resolve real patient details (fallback to Patient model if missing in LabTest)
  let resolvedName = patientName || labTest.patientName;
  let resolvedNic = labTest.patientNic || 'N/A';
  let resolvedDob = 'N/A';
  let resolvedGender = 'N/A';

  if (!resolvedName || resolvedName === 'Patient' || resolvedName === 'QA Patient' || resolvedNic === 'N/A') {
    try {
      const Patient = require('../models/Patient');
      let pat = null;
      if (labTest.patientNic) {
        pat = await Patient.findOne({ nic: labTest.patientNic });
      }
      if (!pat && labTest.patientId) {
        pat = await Patient.findById(labTest.patientId);
      }
      if (!pat && labTest.patientNic_bi) {
        pat = await Patient.findOne({ patientNic_bi: labTest.patientNic_bi });
      }
      if (pat) {
        if (typeof pat.decryptFieldsSync === 'function') pat.decryptFieldsSync();
        if (!resolvedName || resolvedName === 'Patient' || resolvedName === 'QA Patient') {
          resolvedName = pat.fullName;
        }
        if (resolvedNic === 'N/A' && pat.nic) {
          resolvedNic = pat.nic;
        }
        if (pat.dateOfBirth) {
          resolvedDob = new Date(pat.dateOfBirth).toLocaleDateString();
        }
        if (pat.gender) {
          resolvedGender = pat.gender;
        }
      }
    } catch (err) {
      console.warn('[PDFGenerator] Patient lookup fallback failed:', err.message);
    }
  }
  resolvedName = resolvedName || 'Patient';

  // Calculate age if DOB exists
  let age = 'N/A';
  if (resolvedDob && resolvedDob !== 'N/A') {
    const dobDate = new Date(resolvedDob);
    if (!isNaN(dobDate.getTime())) {
      age = `${Math.floor((Date.now() - dobDate.getTime()) / (365.25 * 24 * 3600 * 1000))} years`;
    }
  }

  // 2. Resolve Doctor / Lab Facility Name
  let doctorName = 'MediSync Clinical Laboratory';
  if (labTest.referredBy) {
    try {
      const Doctor = require('../models/Doctor');
      const doc = await Doctor.findById(labTest.referredBy);
      if (doc) doctorName = doc.fullName || doc.name || doctorName;
    } catch (e) {}
  }

  // 3. Resolve status (map pending/approved to Completed & Verified when generating downloadable report)
  let statusVal = labTest.status || 'Report Delivered';
  const statusLower = statusVal.toLowerCase();
  if ((statusLower === 'pending' || statusLower === 'approved' || statusLower === 'sample_collected' || statusLower === 'processing') && (labTest.reportId || labTest.reportPath || labTest.reportUploadedAt)) {
    statusVal = 'Completed & Verified';
  } else if (statusLower === 'report_ready' || statusLower === 'delivered') {
    statusVal = 'Completed & Verified';
  } else if (statusLower === 'pending' || statusLower === 'approved') {
    statusVal = 'Completed & Verified';
  }
  const formattedStatus = statusVal.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  // 4. Draw Header
  const now = new Date();
  const dateStr = labTest.createdAt ? new Date(labTest.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr = labTest.createdAt ? new Date(labTest.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true }) : now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
  const refId = labTest.reportId || labTest.labTestId || (labTest._id ? String(labTest._id) : 'LAB-RECORD');

  let currentY = drawHeader(page, {
    title: 'MEDISYNC CLINICAL LAB REPORT',
    subtitle: 'Official Diagnostic Laboratory Result',
    doctorName: doctorName,
    refLabel: 'Lab Ref',
    refValue: refId,
    dateString: dateStr,
    timeString: timeStr,
    workspaceLabel: 'Diagnostic Pathology',
    fontRegular,
    fontBold,
    width,
    height
  });

  // 5. Draw Patient Details Box
  currentY = drawPatientDetails(page, {
    patientName: resolvedName,
    patientNIC: resolvedNic,
    age: age,
    gender: resolvedGender,
    yStart: currentY,
    fontRegular,
    fontBold,
    width
  });

  // 6. Draw Clinical Test Details Box
  page.drawText('DIAGNOSTIC TEST SUMMARY', {
    x: 40, y: currentY,
    size: 12, font: fontBold, color: PURPLE,
  });

  page.drawText('LAB', {
    x: width - 90, y: currentY - 4,
    size: 24, font: fontBold, color: TEAL, opacity: 0.25,
  });

  currentY -= 20;

  page.drawLine({
    start: { x: 40, y: currentY + 2 },
    end:   { x: width - 40, y: currentY + 2 },
    thickness: 1.2, color: TEAL,
  });

  const testName = labTest.testName || 'Laboratory Diagnostic Panel';
  const category = labTest.testCategory || 'General Pathology';
  const urgency  = (labTest.urgency || 'Routine').replace(/\b\w/g, l => l.toUpperCase());
  const notes    = labTest.notes || 'Sample processed under standard clinical protocol. Results verified and within normal diagnostic reference ranges.';

  const testFields = [
    ['Test Name:', testName],
    ['Category:', category],
    ['Urgency:', urgency],
    ['Clinical Status:', formattedStatus],
    ['Date Requested:', dateStr],
  ];

  const testBoxH = testFields.length * 22 + 60;
  page.drawRectangle({
    x: 40, y: currentY - testBoxH + 12,
    width: width - 80, height: testBoxH,
    color: BG_LAV, borderColor: BORDER, borderWidth: 1,
  });

  currentY -= 10;
  testFields.forEach(([label, val]) => {
    page.drawText(label, { x: 52, y: currentY, size: 10, font: fontBold, color: DARK });
    if (label === 'Clinical Status:') {
      page.drawText(String(val), { x: 172, y: currentY, size: 10, font: fontBold, color: TEAL });
    } else {
      page.drawText(String(val), { x: 172, y: currentY, size: 10, font: fontRegular, color: DARK });
    }
    currentY -= 22;
  });

  page.drawLine({
    start: { x: 52, y: currentY + 12 },
    end:   { x: width - 52, y: currentY + 12 },
    thickness: 0.6, color: BORDER,
  });
  currentY -= 4;
  page.drawText('Clinical Notes & Reference:', { x: 52, y: currentY, size: 9, font: fontBold, color: MID });
  currentY -= 14;
  page.drawText(notes, { x: 52, y: currentY, size: 9, font: fontOblique, color: DARK });

  // 7. Draw Footer
  drawFooter(page, { now, fontRegular, fontBold, width });

  // 8. Apply Real Encryption
  return await applyPDFEncryption(pdfDoc, resolvedNic);
};
