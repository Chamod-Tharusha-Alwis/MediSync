'use strict';

/**
 * Isolated Synthetic PDF Legacy Cryptographic Proof Helper
 *
 * Dedicated strictly to offline cryptographic verification harnesses.
 * Not imported or re-exported by any production server code or route.
 *
 * Implements ISO 32000 Revision 3 (128-bit RC4) encrypted PDF generation
 * using synthetic test fixtures and randomized credentials.
 * NEVER attaches credential properties to returned Buffer objects.
 */

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const { encryptPDF } = require('@pdfsmaller/pdf-encrypt-lite');
const crypto = require('crypto');

/**
 * Generates an isolated synthetic PDF encrypted with RC4-128 for verifiers.
 *
 * @param {Array} rxData - Synthetic medication lines
 * @param {string} patientName - Synthetic patient name
 * @param {string} patientNIC - Synthetic patient NIC
 * @param {string} doctorName - Synthetic doctor name
 * @param {string} workspace - Synthetic workspace label
 * @param {Object} options - Verification options (documentPassword, ownerPassword, returnCredentials)
 * @returns {Promise<Buffer|{buffer: Buffer, userPassword: string, ownerPassword: string}>}
 */
async function generateIsolatedSyntheticProofPDF(
  rxData = [{ drugName: 'Paracetamol', dosage: '500mg', frequency: 'PRN', durationDays: 2 }],
  patientName = 'Synthetic QA Subject',
  patientNIC = 'NIC-SYNTHETIC-ONLY',
  doctorName = 'Synthetic Doctor',
  workspace = 'Synthetic Workspace',
  options = {}
) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  page.drawText('MEDISYNC SYNTHETIC TEST RECORD', {
    x: 50,
    y: 800,
    size: 14,
    font: fontBold,
    color: rgb(0.1, 0.2, 0.4)
  });

  page.drawText(`Patient: ${patientName} | NIC: ${patientNIC}`, {
    x: 50,
    y: 770,
    size: 10,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2)
  });

  page.drawText(`Doctor: ${doctorName} | Workspace: ${workspace}`, {
    x: 50,
    y: 750,
    size: 10,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2)
  });

  let currentY = 710;
  page.drawText('PRESCRIBED MEDICINES (SYNTHETIC FIXTURE):', {
    x: 50,
    y: currentY,
    size: 11,
    font: fontBold,
    color: rgb(0.1, 0.4, 0.4)
  });

  currentY -= 25;
  for (const item of rxData) {
    page.drawText(`- ${item.drugName} | ${item.dosage} | ${item.frequency} | ${item.durationDays} days`, {
      x: 60,
      y: currentY,
      size: 10,
      font: fontRegular,
      color: rgb(0, 0, 0)
    });
    currentY -= 20;
  }

  const plainBytes = await pdfDoc.save();

  // Use explicit test passwords if provided by verifier harness, otherwise generate randomized secrets
  const userPassword =
    typeof options.documentPassword === 'string' && options.documentPassword.length > 0
      ? options.documentPassword
      : typeof options.userPassword === 'string' && options.userPassword.length > 0
      ? options.userPassword
      : crypto.randomBytes(16).toString('hex').toUpperCase();

  const ownerPassword =
    typeof options.ownerPassword === 'string' && options.ownerPassword.length > 0
      ? options.ownerPassword
      : crypto.randomBytes(32).toString('hex');

  const encryptedBytes = await encryptPDF(
    Buffer.from(plainBytes),
    userPassword,
    ownerPassword
  );

  const buf = Buffer.from(encryptedBytes);

  // Buffer objects must NEVER carry credential properties in production or tests
  if (options.returnCredentials) {
    return {
      buffer: buf,
      userPassword,
      ownerPassword
    };
  }

  return buf;
}

module.exports = {
  generateIsolatedSyntheticProofPDF
};
