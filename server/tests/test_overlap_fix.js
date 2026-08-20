const fs = require('fs');
const path = require('path');
const pdfGenerator = require('../src/utils/pdfGenerator');

// Initialize master key in global for versioned encryption
global.ENCRYPTION_KEYS = { 1: 'MediSync#2026_Secure_Key_32bytes!' };
global.ACTIVE_KEY_VERSION = 1;

async function runTest() {
  console.log('Generating e-prescription PDF with long dosage strings...');

  const prescriptionData = [
    {
      drugName: 'Paracetamol 500mg',
      dosage: '500 mg oral every 6 hours as needed (Max 4g/day)',
      frequency: 'TDS',
      durationDays: 5,
      instructions: 'Take after meals with plenty of water',
    },
    {
      drugName: 'Oral Rehydration Salts (ORS)',
      dosage: '1 sachet in 1L water, sip frequently',
      frequency: 'TDS',
      durationDays: 3,
      instructions: 'Keep refrigerated after mixing',
    },
    {
      drugName: 'Amoxicillin / Clavulanate 625mg',
      dosage: '1 tablet oral every 8 hours consistently',
      frequency: 'Every 8 hours',
      durationDays: 7,
      instructions: 'Complete the full course even if feeling better',
    }
  ];

  const pdfBuffer = await pdfGenerator.generateLockedPrescription(
    prescriptionData,
    'John Doe',
    '981234567V',
    '1990-05-15',
    'Dr. Aruna Perera',
    'General Medicine & Outpatient Clinic',
    'Male',
    ['Complete Blood Count (CBC)', 'Dengue NS1 Antigen Test'],
    new Date(Date.now() + 7 * 86400000),
    'CONS-20260727-9912'
  );

  const outPath = path.join(__dirname, 'test_overlap_fixed_output.pdf');
  fs.writeFileSync(outPath, pdfBuffer);
  console.log(`✅ Successfully generated encrypted PDF at: ${outPath}`);
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
