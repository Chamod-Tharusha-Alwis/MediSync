'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('../client/node_modules/@playwright/test');

process.env.PDF_EXPORT_ENABLED = 'true';
const { generateConsultationSummaryPDF } = require('../server/src/utils/pdfGenerator');

async function main() {
  const outDir = path.resolve(__dirname, '../docs/final/evidence');
  fs.mkdirSync(outDir, { recursive: true });

  const patient = {
    fullName: 'Kasun Perera',
    nic: '199512345678',
    dateOfBirth: new Date('1990-05-14'),
    gender: 'Male',
  };

  const doctor = {
    _id: '507f1f77bcf86cd799439022',
    fullName: 'Dr. Nimal Silva',
    specialization: 'Consultant Physician',
    slmcNumber: 'SLMC-44821',
    hospitalName: 'Colombo National Hospital',
  };

  // Case 1: Short Case
  const shortConsultation = {
    consultationId: 'CONS-2026-0811',
    createdAt: new Date('2026-11-09T18:30:00Z'),
    diagnosis: 'Acute Upper Respiratory Tract Infection',
    icdCode: 'J06.9',
    icdDescription: 'Acute upper respiratory infection, unspecified',
    symptoms: ['Sore throat', 'Fever', 'Nasal congestion'],
    notes: 'Prescribed symptomatic relief. Maintain warm fluid intake and monitor temperature.',
    followUpDate: new Date('2026-11-16'),
    patientNic: '199512345678',
    verificationUrl: 'https://medisync.chamodtharusha.com.lk/verify/tok-evidence-short',
    medications: [
      { drugName: 'Paracetamol', dosage: '500mg', frequency: 'TDS', durationDays: 5, instructions: 'Take after meals' },
      { drugName: 'Cetirizine', dosage: '10mg', frequency: 'Nocte', durationDays: 7, instructions: 'At night' },
    ],
  };

  const shortEncryptedBytes = await generateConsultationSummaryPDF(shortConsultation, patient, doctor);
  fs.writeFileSync(path.join(outDir, 'pdf_short_case_encrypted.pdf'), Buffer.from(shortEncryptedBytes));

  const shortUnlockedBytes = await generateConsultationSummaryPDF(shortConsultation, patient, doctor, { unlockForTest: true });
  const shortUnlockedPath = path.join(outDir, 'pdf_short_case_unlocked.pdf');
  fs.writeFileSync(shortUnlockedPath, Buffer.from(shortUnlockedBytes));

  // Case 2: Long Case (20 Medications + Long Notes)
  const longMeds = [
    { drugName: 'Paracetamol', dosage: '500mg', frequency: 'TDS', durationDays: 5, instructions: 'After meals' },
    { drugName: 'Amoxicillin', dosage: '500mg', frequency: 'TDS', durationDays: 7, instructions: 'Complete full course' },
    { drugName: 'Metformin', dosage: '500mg', frequency: 'BD', durationDays: 30, instructions: 'With meals' },
    { drugName: 'Atorvastatin', dosage: '20mg', frequency: 'Nocte', durationDays: 30, instructions: 'At bedtime' },
    { drugName: 'Omeprazole', dosage: '20mg', frequency: 'Daily', durationDays: 14, instructions: '30 mins before breakfast' },
    { drugName: 'Losartan', dosage: '50mg', frequency: 'Daily', durationDays: 30, instructions: 'Morning' },
    { drugName: 'Amlodipine', dosage: '5mg', frequency: 'Daily', durationDays: 30, instructions: 'Morning' },
    { drugName: 'Aspirin', dosage: '75mg', frequency: 'Daily', durationDays: 30, instructions: 'After lunch' },
    { drugName: 'Cetirizine', dosage: '10mg', frequency: 'PRN', durationDays: 7, instructions: 'For allergic symptoms' },
    { drugName: 'Salbutamol Inhaler', dosage: '100mcg', frequency: 'PRN', durationDays: 30, instructions: '2 puffs as needed' },
    { drugName: 'Vitamin C', dosage: '500mg', frequency: 'Daily', durationDays: 14, instructions: 'Oral' },
    { drugName: 'Vitamin D3', dosage: '1000IU', frequency: 'Daily', durationDays: 30, instructions: 'With breakfast' },
    { drugName: 'Zinc Sulfate', dosage: '20mg', frequency: 'Daily', durationDays: 14, instructions: 'After meals' },
    { drugName: 'Folic Acid', dosage: '5mg', frequency: 'Daily', durationDays: 30, instructions: 'Morning' },
    { drugName: 'Multivitamin Complex', dosage: '1 Tab', frequency: 'Daily', durationDays: 30, instructions: 'With food' },
    { drugName: 'Calcium Carbonate', dosage: '500mg', frequency: 'BD', durationDays: 30, instructions: 'With meals' },
    { drugName: 'Domperidone', dosage: '10mg', frequency: 'TDS', durationDays: 5, instructions: 'Before food' },
    { drugName: 'Loratadine', dosage: '10mg', frequency: 'Daily', durationDays: 7, instructions: 'Morning' },
    { drugName: 'Dextromethorphan Syrup', dosage: '10ml', frequency: 'TDS', durationDays: 5, instructions: 'For dry cough' },
    { drugName: 'Chlorhexidine Mouthwash', dosage: '15ml', frequency: 'BD', durationDays: 7, instructions: 'Gargle after meals' },
  ];

  const longConsultation = {
    consultationId: 'CONS-2026-0812-EXTENDED',
    createdAt: new Date('2026-11-09T19:00:00Z'),
    diagnosis: 'Multimorbidity Management & Polypharmacy Review (Type 2 Diabetes Mellitus, Essential Hypertension, Dyslipidemia, Mild COPD)',
    icdCode: 'E11.9',
    icdDescription: 'Type 2 diabetes mellitus without complications',
    symptoms: ['Bilateral knee joint pain', 'Exertional dyspnea', 'Occasional morning headache', 'Dry cough', 'Fatigue'],
    notes: 'Comprehensive geriatric polypharmacy review conducted. Patient advised on adherence scheduling, hydration, avoiding NSAID overuse to preserve renal function, and monitoring blood glucose bi-weekly. Regular follow-up scheduled with local clinic.',
    followUpDate: new Date('2026-12-10'),
    patientNic: '199512345678',
    verificationUrl: 'https://medisync.chamodtharusha.com.lk/verify/tok-evidence-long',
    medications: longMeds,
  };

  const longUnlockedBytes = await generateConsultationSummaryPDF(longConsultation, patient, doctor, { unlockForTest: true });
  const longUnlockedPath = path.join(outDir, 'pdf_long_case_20_drugs.pdf');
  fs.writeFileSync(longUnlockedPath, Buffer.from(longUnlockedBytes));

  console.log('PDFs generated successfully. Rendering PNG screenshots with Playwright Chromium...');

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1200, height: 1600 } });
  const page = await context.newPage();

  // Load and screenshot short unlocked PDF via embed HTML wrapper
  const shortB64 = Buffer.from(shortUnlockedBytes).toString('base64');
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0;padding:0;overflow:hidden;"><iframe src="data:application/pdf;base64,${shortB64}" style="width:100vw;height:100vh;border:none;"></iframe></body></html>`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, 'pdf_short_case_page1.png') });

  // Load and screenshot long unlocked PDF via embed HTML wrapper
  const longB64 = Buffer.from(longUnlockedBytes).toString('base64');
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0;padding:0;overflow:hidden;"><iframe src="data:application/pdf;base64,${longB64}" style="width:100vw;height:100vh;border:none;"></iframe></body></html>`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, 'pdf_long_case_page1.png') });

  await browser.close();
  console.log('PDF verification evidence screenshots saved to docs/final/evidence/');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
