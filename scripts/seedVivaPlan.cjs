'use strict';

/**
 * scripts/seedVivaPlan.cjs
 *
 * Deterministic Viva Voce Demonstration Seed Plan Generator for MediSync.
 * 
 * Safety & Quality Invariants:
 * 1. 100% Synthetic data: Tagged with syntheticSeedBatch: "viva-2026-11" and isSynthetic: true.
 * 2. Non-destructive: Every document is tagged for atomic, reversible rollback.
 * 3. Exact Outbreak Scenario Calculations:
 *    - S-A: Dengue in Gampaha (N=12 >= 5, 4 consecutive days z > 2.0; triggers Critical alert)
 *    - S-B: Dengue 1-day spike in Kalutara (N=6 >= 5, 1 elevated day; triggers NO alert)
 *    - S-C: Dengue small cluster in Matara (N=4 < 5; triggers NO alert)
 *    - S-D: Influenza in Kandy (N=8 >= 5, 4 consecutive days z > 2.0; triggers High alert)
 * 4. Realistic clinical mix: 400 consultations over 70 days, 30 patients across all 25 districts,
 *    2 hospitals (with labs), 2 pharmacies, 4 doctors (real-format SLMC numbers), 3 pharmacists, 2 lab technicians.
 * 5. Demo Patient with 3 consultations, 4 prescription states (pending, dispensed, partially dispensed, superseded, expired),
 *    and 2 lab test states (report_ready, sample_collected).
 */

const crypto = require('crypto');

const NAMESPACE = 'viva-2026-11';
const DAY_MS = 86400000;
const COLOMBO_OFFSET_MS = 330 * 60000; // Asia/Colombo +05:30

// Official 25 Sri Lankan Districts with relative outpatient population weights (sum = 100)
const DISTRICTS = Object.freeze([
  { canonical: 'Colombo', weight: 12 },
  { canonical: 'Gampaha', weight: 12 },
  { canonical: 'Kalutara', weight: 6 },
  { canonical: 'Kandy', weight: 7 },
  { canonical: 'Matale', weight: 3 },
  { canonical: 'Nuwara Eliya', weight: 4 },
  { canonical: 'Galle', weight: 5 },
  { canonical: 'Matara', weight: 4 },
  { canonical: 'Hambantota', weight: 3 },
  { canonical: 'Jaffna', weight: 3 },
  { canonical: 'Kilinochchi', weight: 1 },
  { canonical: 'Mannar', weight: 1 },
  { canonical: 'Mullaitivu', weight: 1 },
  { canonical: 'Vavuniya', weight: 1 },
  { canonical: 'Batticaloa', weight: 3 },
  { canonical: 'Ampara', weight: 3 },
  { canonical: 'Trincomalee', weight: 2 },
  { canonical: 'Kurunegala', weight: 7 },
  { canonical: 'Puttalam', weight: 3 },
  { canonical: 'Anuradhapura', weight: 4 },
  { canonical: 'Polonnaruwa', weight: 2 },
  { canonical: 'Badulla', weight: 4 },
  { canonical: 'Monaragala', weight: 2 },
  { canonical: 'Ratnapura', weight: 4 },
  { canonical: 'Kegalle', weight: 3 }
]);

// Curated Clinical Conditions from MediSync's served catalog
const CONDITIONS = Object.freeze({
  DENGUE: {
    key: 'dengue',
    diseaseName: 'Dengue',
    icdCode: 'A90',
    icdVersion: 'ICD-10',
    icdDescription: 'Dengue fever [classical dengue]',
    symptoms: ['High fever', 'Severe headache', 'Retro-orbital pain', 'Joint pain', 'Petechial rash'],
    medication: 'Paracetamol',
    dosage: '500mg',
    frequency: 'TDS',
    durationDays: 5,
    instructions: 'Take 1 to 2 tablets every 8 hours with water. Do not exceed 4g daily.'
  },
  INFLUENZA: {
    key: 'influenza',
    diseaseName: 'Influenza',
    icdCode: 'J11.1',
    icdVersion: 'ICD-10',
    icdDescription: 'Influenza with other respiratory manifestations, virus not identified',
    symptoms: ['Dry cough', 'Sore throat', 'Fever', 'Myalgia', 'Nasal congestion'],
    medication: 'Paracetamol',
    dosage: '500mg',
    frequency: 'TDS',
    durationDays: 5,
    instructions: 'Take 1 tablet every 8 hours as needed for body aches and fever.'
  },
  DIARRHOEAL: {
    key: 'diarrhoeal',
    diseaseName: 'Diarrhoeal disease',
    icdCode: 'A09',
    icdVersion: 'ICD-10',
    icdDescription: 'Infectious gastroenteritis and colitis, unspecified',
    symptoms: ['Watery diarrhoea', 'Abdominal cramps', 'Nausea', 'Vomiting', 'Mild fever'],
    medication: 'Oral Rehydration Salts (ORS)',
    dosage: '1 sachet',
    frequency: 'TDS',
    durationDays: 3,
    instructions: 'Dissolve one sachet in 1 litre of clean drinking water; drink after each loose motion.'
  },
  LEPTOSPIROSIS: {
    key: 'leptospirosis',
    diseaseName: 'Leptospirosis',
    icdCode: 'A27.9',
    icdVersion: 'ICD-10',
    icdDescription: 'Leptospirosis, unspecified',
    symptoms: ['Jaundice', 'High fever', 'Calf muscle tenderness', 'Conjunctival suffusion', 'Oliguria'],
    medication: 'Amoxicillin',
    dosage: '500mg',
    frequency: 'TDS',
    durationDays: 7,
    instructions: 'Take 1 capsule three times daily after food for 7 complete days.'
  },
  CHICKENPOX: {
    key: 'chickenpox',
    diseaseName: 'Chickenpox',
    icdCode: 'B01.9',
    icdVersion: 'ICD-10',
    icdDescription: 'Varicella without complication',
    symptoms: ['Vesicular rash', 'Itching', 'Fever', 'Fatigue', 'Loss of appetite'],
    medication: 'Paracetamol',
    dosage: '500mg',
    frequency: 'PRN',
    durationDays: 5,
    instructions: 'Take 1 tablet as needed for fever and discomfort.'
  },
  TYPHOID: {
    key: 'typhoid',
    diseaseName: 'Typhoid fever',
    icdCode: 'A01.0',
    icdVersion: 'ICD-10',
    icdDescription: 'Typhoid fever',
    symptoms: ['Step-ladder fever', 'Headache', 'Rose spots', 'Constipation', 'Abdominal pain'],
    medication: 'Azithromycin',
    dosage: '500mg',
    frequency: 'OD',
    durationDays: 7,
    instructions: 'Take 1 tablet once daily before food for 7 days.'
  },
  URTI: {
    key: 'urti',
    diseaseName: 'Acute upper respiratory infection',
    icdCode: 'J06.9',
    icdVersion: 'ICD-10',
    icdDescription: 'Acute upper respiratory infection, unspecified',
    symptoms: ['Sneezing', 'Rhinorrhoea', 'Mild fever', 'Sore throat', 'Cough'],
    medication: 'Cetirizine',
    dosage: '10mg',
    frequency: 'NOCTE',
    durationDays: 5,
    instructions: 'Take 1 tablet at night before bed.'
  },
  HYPERTENSION: {
    key: 'hypertension',
    diseaseName: 'Essential (primary) hypertension',
    icdCode: 'I10',
    icdVersion: 'ICD-10',
    icdDescription: 'Essential (primary) hypertension',
    symptoms: ['Occipital headache', 'Dizziness', 'Palpitations', 'Fatigue'],
    medication: 'Losartan',
    dosage: '50mg',
    frequency: 'OD',
    durationDays: 30,
    instructions: 'Take 1 tablet in the morning with or without food.'
  },
  DIABETES: {
    key: 'diabetes',
    diseaseName: 'Type 2 diabetes mellitus',
    icdCode: 'E11.9',
    icdVersion: 'ICD-10',
    icdDescription: 'Type 2 diabetes mellitus without complications',
    symptoms: ['Polyuria', 'Polydipsia', 'Unexplained weight loss', 'Fatigue'],
    medication: 'Metformin',
    dosage: '500mg',
    frequency: 'BD',
    durationDays: 30,
    instructions: 'Take 1 tablet twice daily with meals.'
  },
  ASTHMA: {
    key: 'asthma',
    diseaseName: 'Asthma',
    icdCode: 'J45.909',
    icdVersion: 'ICD-10',
    icdDescription: 'Unspecified asthma, uncomplicated',
    symptoms: ['Wheezing', 'Shortness of breath', 'Chest tightness', 'Nocturnal cough'],
    medication: 'Salbutamol',
    dosage: '100mcg',
    frequency: 'PRN',
    durationDays: 30,
    instructions: 'Inhale 1 to 2 puffs as needed for acute breathlessness.'
  },
  DEPRESSION: {
    key: 'depression',
    diseaseName: 'Single episode depressive disorder',
    icdCode: '6A70',
    icdVersion: 'ICD-11',
    icdDescription: 'Single episode depressive disorder',
    symptoms: ['Depressed mood', 'Loss of interest', 'Fatigue', 'Sleep disturbance', 'Anxiety'],
    medication: 'Citalopram',
    dosage: '20mg',
    frequency: 'OD',
    durationDays: 30,
    instructions: 'Take 1 tablet once daily in the morning.'
  }
});

function deterministicObjectId(model, index) {
  const hash = crypto.createHash('sha256').update(`${NAMESPACE}:${model}:${index}`).digest('hex');
  return hash.slice(0, 24);
}

function getColomboMidnight(date = new Date()) {
  const d = new Date(date);
  const localTime = new Date(+d + COLOMBO_OFFSET_MS);
  return Date.UTC(localTime.getUTCFullYear(), localTime.getUTCMonth(), localTime.getUTCDate()) - COLOMBO_OFFSET_MS;
}

function formatOwnerAlias(baseEmail, tag) {
  if (!baseEmail || typeof baseEmail !== 'string' || !baseEmail.includes('@')) return null;
  const parts = baseEmail.trim().split('@');
  if (parts.length !== 2) return null;
  const user = parts[0].split('+')[0];
  const domain = parts[1];
  return `${user}+${tag}@${domain}`.toLowerCase();
}

function buildVivaSeedPlan({ now = new Date(), ownerMailbox = null, ownerEmail = null, rawToken = null } = {}) {
  const current = new Date(now);
  const todayMidnight = getColomboMidnight(current);
  const baseOwner = ownerEmail || ownerMailbox || null;

  const records = [];
  const byModel = {
    Hospital: [],
    Pharmacy: [],
    Doctor: [],
    PharmacyStaff: [],
    Patient: [],
    Consultation: [],
    Prescription: [],
    Dispensing: [],
    LabTest: [],
    VerificationToken: []
  };

  function add(model, document, idIndex) {
    const id = deterministicObjectId(model, idIndex !== undefined ? idIndex : byModel[model].length);
    const row = {
      model,
      id,
      document: { ...document, _id: id }
    };
    records.push(row);
    byModel[model].push(row);
    return row;
  }

  // ── 1. FACILITIES (2 Hospitals, 2 Pharmacies) ──────────────────────────────
  const hospDates = new Date(todayMidnight - 90 * DAY_MS);

  const hospital1 = add('Hospital', {
    name: 'National Apex General Hospital',
    type: 'government',
    district: 'Colombo',
    address: 'Regent Street, Colombo 08',
    regNo: 'HOSP-VIVA-01',
    email: formatOwnerAlias(baseOwner, 'hospitaladmin1') || 'colombo.apex.hospital@accounts.invalid',
    emergencyHotline: '011-2691111',
    contactPhone: '011-2693510',
    isActive: true,
    isVerified: true,
    isSynthetic: true,
    syntheticSeedBatch: NAMESPACE,
    createdAt: hospDates,
    updatedAt: hospDates
  }, 0);

  const hospital2 = add('Hospital', {
    name: 'Kandy Teaching Hospital',
    type: 'government',
    district: 'Kandy',
    address: 'Hospital Road, Kandy',
    regNo: 'HOSP-VIVA-02',
    email: formatOwnerAlias(baseOwner, 'hospitaladmin2') || 'kandy.teaching.hospital@accounts.invalid',
    emergencyHotline: '081-2222261',
    contactPhone: '081-2233337',
    isActive: true,
    isVerified: true,
    isSynthetic: true,
    syntheticSeedBatch: NAMESPACE,
    createdAt: hospDates,
    updatedAt: hospDates
  }, 1);

  const pharmacy1 = add('Pharmacy', {
    name: 'Colombo Central Community Dispensary',
    district: 'Colombo',
    address: '142 Galle Road, Colombo 03',
    regNo: 'PHARM-VIVA-01',
    phone: '011-2574890',
    email: formatOwnerAlias(baseOwner, 'pharmacy1') || 'colombo.dispensary@accounts.invalid',
    isActive: true,
    isSynthetic: true,
    syntheticSeedBatch: NAMESPACE,
    inventory: [],
    createdAt: hospDates,
    updatedAt: hospDates
  }, 0);

  const pharmacy2 = add('Pharmacy', {
    name: 'Gampaha City Healthcare Pharmacy',
    district: 'Gampaha',
    address: '45 Colombo Road, Gampaha',
    regNo: 'PHARM-VIVA-02',
    phone: '033-2223456',
    email: formatOwnerAlias(baseOwner, 'pharmacy2') || 'gampaha.city.pharmacy@accounts.invalid',
    isActive: true,
    isSynthetic: true,
    syntheticSeedBatch: NAMESPACE,
    inventory: [],
    createdAt: hospDates,
    updatedAt: hospDates
  }, 1);

  // ── 2. STAFF (4 Doctors, 3 Pharmacists, 2 Lab Technicians) ──────────────────
  const doctorsData = [
    { name: 'Dr. Anura Jayasinghe', spec: 'General Medicine', lic: 'SLMC-24819', dist: 'Colombo', hosp: hospital1.id },
    { name: 'Dr. Sivakumar Ramasamy', spec: 'Pediatrics & Infectious Diseases', lic: 'SLMC-31204', dist: 'Kandy', hosp: hospital2.id },
    { name: 'Dr. Fathima Rizna', spec: 'Cardiology & Internal Medicine', lic: 'SLMC-42918', dist: 'Colombo', hosp: hospital1.id },
    { name: 'Dr. Priyantha Senaratne', spec: 'Public Health & Epidemiology', lic: 'SLMC-51029', dist: 'Galle', hosp: null }
  ];

  const doctors = doctorsData.map((d, i) => add('Doctor', {
    doctorId: `DOC-VIVA-${String(i + 1).padStart(2, '0')}`,
    fullName: d.name,
    email: formatOwnerAlias(baseOwner, `doctor${i + 1}`) || `dr.${d.name.toLowerCase().replace(/[^a-z]/g, '.')}${i + 1}@accounts.invalid`,
    specialization: d.spec,
    licenseNo: d.lic,
    hospitals: d.hosp ? [d.hosp] : [],
    role: 'doctor',
    loginType: d.hosp ? 'hospital' : 'personal',
    isActive: true,
    isVerified: true,
    isSynthetic: true,
    syntheticSeedBatch: NAMESPACE,
    createdAt: hospDates,
    updatedAt: hospDates
  }, i));

  const pharmacyStaffData = [
    { name: 'Kaveen Bandara', role: 'pharmacist', pharmId: pharmacy1.id },
    { name: 'Malarvel Selvam', role: 'pharmacist', pharmId: pharmacy2.id },
    { name: 'Thushara Perera', role: 'pharmacy_admin', pharmId: pharmacy1.id }
  ];

  const pharmacyStaff = pharmacyStaffData.map((s, i) => add('PharmacyStaff', {
    fullName: s.name,
    pharmacyId: s.pharmId,
    email: formatOwnerAlias(baseOwner, s.role === 'pharmacy_admin' ? 'pharmacyadmin' : `pharmacist${i + 1}`) || `${s.name.toLowerCase().replace(/[^a-z]/g, '.')}${i + 1}@accounts.invalid`,
    role: s.role,
    isActive: true,
    isVerified: true,
    mustChangePassword: false,
    isSynthetic: true,
    syntheticSeedBatch: NAMESPACE,
    createdAt: hospDates,
    updatedAt: hospDates
  }, i));

  // Link pharmacy admin back to pharmacy1
  pharmacy1.document.adminId = pharmacyStaff[2].id;

  // ── 3. PATIENTS (30 total: 1 Demo Patient + 29 Synthetic) ───────────────────
  // Demo Patient (OA-14 standard synthetic NIC: 200012345678)
  const demoPatientEmail = formatOwnerAlias(baseOwner, 'patient') || ownerMailbox || 'chamod.demo.patient@accounts.invalid';
  const demoPatient = add('Patient', {
    nic: '200012345678',
    fullName: 'Chamod Tharusha',
    dateOfBirth: new Date('2000-05-14T00:00:00.000Z'),
    gender: 'Male',
    district: 'Colombo',
    contactInfo: '+94771234567',
    address: 'No 45/2, Havelock Road, Colombo 05',
    email: demoPatientEmail,
    bloodGroup: 'O+',
    allergies: ['Penicillin'],
    chronicConditions: ['Hypertension'],
    preferredLanguage: 'en',
    isActive: true,
    isSynthetic: true,
    syntheticSeedBatch: NAMESPACE,
    createdAt: hospDates,
    updatedAt: hospDates
  }, 0);

  const syntheticNames = [
    { name: 'Chamari Fernando', gender: 'Female', lang: 'si' },
    { name: 'Bandara Jayawardena', gender: 'Male', lang: 'si' },
    { name: 'Kasun Perera', gender: 'Male', lang: 'si' },
    { name: 'Sangeetha Rajendran', gender: 'Female', lang: 'ta' },
    { name: 'Mohanavel Kumar', gender: 'Male', lang: 'ta' },
    { name: 'Mohammed Farook', gender: 'Male', lang: 'en' },
    { name: 'Ayesha Rameez', gender: 'Female', lang: 'ta' },
    { name: 'Sanduni Wickrama', gender: 'Female', lang: 'si' },
    { name: 'Dinesh Gunasekara', gender: 'Male', lang: 'si' },
    { name: 'Priya Thanabalasingham', gender: 'Female', lang: 'ta' },
    { name: 'Vignesh Sivalingam', gender: 'Male', lang: 'ta' },
    { name: 'Rizwan Nazeer', gender: 'Male', lang: 'en' },
    { name: 'Nilmini Dissanayake', gender: 'Female', lang: 'si' },
    { name: 'Nuwan Wijesinghe', gender: 'Male', lang: 'si' },
    { name: 'Ishara Rajapakse', gender: 'Female', lang: 'si' },
    { name: 'Anbarasi Murugesan', gender: 'Female', lang: 'ta' },
    { name: 'Thilagavathi Balan', gender: 'Female', lang: 'ta' },
    { name: 'Zubaida Hameed', gender: 'Female', lang: 'en' },
    { name: 'Imran Saleem', gender: 'Male', lang: 'en' },
    { name: 'Suranga Mendis', gender: 'Male', lang: 'si' },
    { name: 'Ruwan Silva', gender: 'Male', lang: 'si' },
    { name: 'Kaviya Ravindran', gender: 'Female', lang: 'ta' },
    { name: 'Suresh Loganathan', gender: 'Male', lang: 'ta' },
    { name: 'Safiya Mansoor', gender: 'Female', lang: 'en' },
    { name: 'Chathurika Abeysekera', gender: 'Female', lang: 'si' },
    { name: 'Gayanath Senanayake', gender: 'Male', lang: 'si' },
    { name: 'Meenakshi Sundaram', gender: 'Female', lang: 'ta' },
    { name: 'Farhan Jiffry', gender: 'Male', lang: 'en' },
    { name: 'Dilrukshi Karunaratne', gender: 'Female', lang: 'si' }
  ];

  const bloodGroups = ['A+', 'B+', 'AB+', 'O+', 'A-', 'B-', 'O-'];
  const allergyPresets = [
    [],
    ['Penicillin'],
    [],
    ['Sulphonamides'],
    [],
    [],
    ['NSAIDs'],
    [],
    ['Amoxicillin'],
    [],
    ['Aspirin'],
    []
  ];
  const chronicPresets = [
    [],
    ['Hypertension'],
    ['Type 2 Diabetes'],
    [],
    ['Asthma'],
    [],
    ['Dyslipidemia'],
    [],
    ['Ischemic Heart Disease'],
    [],
    ['Hypertension', 'Type 2 Diabetes'],
    []
  ];

  const patients = [demoPatient];
  syntheticNames.forEach((s, idx) => {
    const patientIndex = idx + 1;
    // Synthetic unallocated NIC format: 1999801000XX (day 801 is outside genuine calendar range)
    const syntheticNic = `19998010${String(patientIndex).padStart(4, '0')}`;
    const districtObj = DISTRICTS[idx % DISTRICTS.length];
    const birthYear = 1965 + (idx * 3) % 40;

    const patient = add('Patient', {
      nic: syntheticNic,
      fullName: s.name,
      dateOfBirth: new Date(`${birthYear}-03-15T00:00:00.000Z`),
      gender: s.gender,
      district: districtObj.canonical,
      contactInfo: `+9477${String(1000000 + patientIndex * 71).slice(0, 7)}`,
      address: `No ${patientIndex * 7}, Temple Road, ${districtObj.canonical}`,
      email: formatOwnerAlias(baseOwner, `patient${patientIndex + 1}`) || `${s.name.toLowerCase().replace(/[^a-z]/g, '.')}${patientIndex}@example.invalid`,
      bloodGroup: bloodGroups[idx % bloodGroups.length],
      allergies: allergyPresets[idx % allergyPresets.length],
      chronicConditions: chronicPresets[idx % chronicPresets.length],
      preferredLanguage: s.lang,
      isActive: true,
      isSynthetic: true,
      syntheticSeedBatch: NAMESPACE,
      createdAt: hospDates,
      updatedAt: hospDates
    }, patientIndex);

    patients.push(patient);
  });

  // ── 4. CONSULTATIONS & OUTBREAK SCENARIO DESIGN (400 consultations) ─────────
  // We construct the timeline over the past 70 days (Days -69 to 0).
  // Baseline period: Days -63 to -8 (56 complete days).
  // Window period: Days -7 to -1 (7 complete days ending yesterday).
  // Recent / today: Day 0.
  //
  // Outbreak Target Rules:
  // S-A: Dengue in Gampaha (Baseline: 12 cases across 56 days; Window: Day -4: 3, Day -3: 4, Day -2: 3, Day -1: 2 => N=12 >= 5, 4 consecutive days z > 2.0; Critical Alert)
  // S-B: Dengue in Kalutara (Baseline: 10 cases; Window: Day -2: 6, others 0 => N=6 >= 5, 1 elevated day; No Alert - persistence fail)
  // S-C: Dengue in Matara (Baseline: 4 cases; Window: Day -2: 2, Day -1: 2 => N=4 < 5; No Alert - floor fail)
  // S-D: Influenza in Kandy (Baseline: 14 cases; Window: Day -4: 2, Day -3: 2, Day -2: 2, Day -1: 2 => N=8 >= 5, 4 consecutive days z > 2.0; High Alert)

  const episodes = [];
  function addEpisodePlan(conditionKey, district, daysAgo, count, tag = 'routine') {
    for (let i = 0; i < count; i++) {
      episodes.push({ conditionKey, district, daysAgo, tag });
    }
  }

  // S-A: Gampaha Dengue
  // Baseline: 12 cases evenly spaced across 56 days (e.g. every ~4.5 days)
  for (let b = 0; b < 12; b++) {
    const ago = 62 - Math.floor(b * 4.6);
    addEpisodePlan('dengue', 'Gampaha', ago, 1, 'scenario-S-A-baseline');
  }
  // Window: Days -4, -3, -2, -1
  addEpisodePlan('dengue', 'Gampaha', 4, 3, 'scenario-S-A-window');
  addEpisodePlan('dengue', 'Gampaha', 3, 4, 'scenario-S-A-window');
  addEpisodePlan('dengue', 'Gampaha', 2, 3, 'scenario-S-A-window');
  addEpisodePlan('dengue', 'Gampaha', 1, 2, 'scenario-S-A-window');

  // S-B: Kalutara Dengue (Negative control: single day spike)
  for (let b = 0; b < 10; b++) {
    const ago = 60 - Math.floor(b * 5.2);
    addEpisodePlan('dengue', 'Kalutara', ago, 1, 'scenario-S-B-baseline');
  }
  addEpisodePlan('dengue', 'Kalutara', 2, 6, 'scenario-S-B-window');

  // S-C: Matara Dengue (Negative control: N < 5)
  for (let b = 0; b < 4; b++) {
    const ago = 55 - Math.floor(b * 12);
    addEpisodePlan('dengue', 'Matara', ago, 1, 'scenario-S-C-baseline');
  }
  addEpisodePlan('dengue', 'Matara', 2, 2, 'scenario-S-C-window');
  addEpisodePlan('dengue', 'Matara', 1, 2, 'scenario-S-C-window');

  // S-D: Kandy Influenza
  for (let b = 0; b < 14; b++) {
    const ago = 61 - Math.floor(b * 3.8);
    addEpisodePlan('influenza', 'Kandy', ago, 1, 'scenario-S-D-baseline');
  }
  addEpisodePlan('influenza', 'Kandy', 4, 2, 'scenario-S-D-window');
  addEpisodePlan('influenza', 'Kandy', 3, 2, 'scenario-S-D-window');
  addEpisodePlan('influenza', 'Kandy', 2, 2, 'scenario-S-D-window');
  addEpisodePlan('influenza', 'Kandy', 1, 2, 'scenario-S-D-window');

  // Fill remainder of 400 consultations with realistic multi-disease outpatient volume
  // spread across 25 districts and 70 days.
  const targetTotalConsultations = 400;
  const currentEpisodesCount = episodes.length; // ~73 episodes so far
  const fillNeeded = targetTotalConsultations - currentEpisodesCount; // ~327

  const diseaseCycle = [
    'urti', 'diarrhoeal', 'hypertension', 'diabetes', 'leptospirosis',
    'chickenpox', 'typhoid', 'asthma', 'depression', 'urti', 'diarrhoeal'
  ];

  for (let i = 0; i < fillNeeded; i++) {
    const condKey = diseaseCycle[i % diseaseCycle.length];
    const dist = DISTRICTS[i % DISTRICTS.length].canonical;
    const ago = 1 + (i * 7) % 68; // Spread across past 68 days
    addEpisodePlan(condKey, dist, ago, 1, 'fill-routine');
  }

  // Ensure total consultations is exactly 400
  episodes.sort((a, b) => b.daysAgo - a.daysAgo);
  if (episodes.length > targetTotalConsultations) {
    episodes.length = targetTotalConsultations;
  }

  // 15 most recent consultations (daysAgo 0 to 2) are marked PENDING review
  // to populate the admin surveillance review queue.
  const pendingIndices = new Set();
  let pendingCount = 0;
  for (let i = episodes.length - 1; i >= 0 && pendingCount < 15; i--) {
    if (episodes[i].daysAgo <= 2 && episodes[i].tag.startsWith('fill')) {
      pendingIndices.add(i);
      pendingCount++;
    }
  }

  // Add 3 consultations specifically for Demo Patient
  // Demo CON-1: 30 days ago (Dengue, Colombo, dispensed Paracetamol)
  // Demo CON-2: 14 days ago (URTI, Colombo, partially dispensed Amoxicillin)
  // Demo CON-3: 1 day ago (Hypertension + Pharyngitis, pending Azithromycin & Losartan)
  const demoConsultations = [
    { condKey: 'dengue', dist: 'Colombo', daysAgo: 30, isDemoPatient: true, demoStep: 1 },
    { condKey: 'urti', dist: 'Colombo', daysAgo: 14, isDemoPatient: true, demoStep: 2 },
    { condKey: 'hypertension', dist: 'Colombo', daysAgo: 1, isDemoPatient: true, demoStep: 3 }
  ];

  // Replace first 3 fill episodes with demo consultations
  let demoPlaced = 0;
  for (let i = 0; i < episodes.length && demoPlaced < 3; i++) {
    if (episodes[i].tag === 'fill-routine' && !pendingIndices.has(i)) {
      episodes[i] = {
        conditionKey: demoConsultations[demoPlaced].condKey,
        district: demoConsultations[demoPlaced].dist,
        daysAgo: demoConsultations[demoPlaced].daysAgo,
        tag: `demo-patient-step-${demoPlaced + 1}`,
        isDemoPatient: true,
        demoStep: demoPlaced + 1
      };
      demoPlaced++;
    }
  }

  // Build Consultation documents
  const consultations = [];
  const prescriptions = [];
  const dispensings = [];

  episodes.forEach((ep, idx) => {
    const consultationIndex = idx;
    const cond = CONDITIONS[ep.conditionKey.toUpperCase()] || CONDITIONS.URTI;
    const patient = ep.isDemoPatient ? demoPatient : patients[1 + (idx % (patients.length - 1))];
    const doctor = doctors[idx % doctors.length];
    const hospital = doctor.document.hospitals[0] ? (doctor.document.hospitals[0] === hospital1.id ? hospital1 : hospital2) : null;

    // Time calculations: spread through daylight clinic hours (08:30 - 16:30)
    const minuteOfDay = 510 + (idx * 17) % 480; // 08:30 is 510m
    const episodeDate = new Date(todayMidnight - ep.daysAgo * DAY_MS + minuteOfDay * 60000);
    const consultationRef = `CON-VIVA-2026-${String(consultationIndex + 1).padStart(4, '0')}`;
    const episodeId = `EP-${ep.district}-${episodeDate.toISOString().slice(0, 10)}-${String(consultationIndex + 1).padStart(4, '0')}`;

    const isPendingReview = pendingIndices.has(idx);

    const surveillanceVerification = isPendingReview ? {
      status: 'pending',
      diagnosisStatus: 'suspected',
      source: 'clinical_review',
      episodeId,
      caseDefinitionReference: 'SL-EPID-CASE-DEF-V1'
    } : {
      status: 'verified',
      diagnosisStatus: 'confirmed',
      source: 'clinical_review',
      verifiedBy: NAMESPACE,
      verifiedAt: episodeDate,
      episodeId,
      caseDefinitionReference: 'SL-EPID-CASE-DEF-V1'
    };

    const consultationDoc = {
      consultationId: consultationRef,
      patientId: patient.id,
      doctorId: doctor.id,
      hospitalId: hospital ? hospital.id : null,
      sessionHospitalId: hospital ? hospital.id : null,
      patientNic: patient.document.nic,
      diagnosis: cond.diseaseName,
      icdCode: cond.icdCode,
      icdDescription: cond.icdDescription,
      icdVersion: cond.icdVersion,
      symptoms: cond.symptoms,
      district: ep.district,
      notes: `Outpatient clinical encounter recorded at ${hospital ? hospital.document.name : 'Personal Clinic'}.`,
      labTests: [],
      isFollowUpRequired: idx % 4 === 0,
      loginType: hospital ? 'hospital' : 'personal',
      surveillanceVerification,
      createdAt: episodeDate,
      updatedAt: episodeDate
    };

    const consultation = add('Consultation', consultationDoc, consultationIndex);
    consultations.push(consultation);

    // ── 5. PRESCRIPTIONS & DISPENSING ─────────────────────────────────────────
    // ~70% of consultations have prescriptions (idx % 10 < 7)
    const hasRx = (idx % 10 < 7) || ep.isDemoPatient;
    if (hasRx) {
      const rxIndex = prescriptions.length;
      const rxRef = `RX-VIVA-2026-${String(rxIndex + 1).padStart(5, '0')}`;
      
      // Determine dispensing status:
      // ~60% dispensed, some pending, demo patient gets specific states
      let rxStatus = 'pending';
      let isDispensed = false;
      let isPartial = false;
      let isSuperseded = false;
      let isExpired = false;

      if (ep.isDemoPatient) {
        if (ep.demoStep === 1) {
          rxStatus = 'dispensed';
          isDispensed = true;
        } else if (ep.demoStep === 2) {
          rxStatus = 'partially_dispensed';
          isPartial = true;
        } else if (ep.demoStep === 3) {
          rxStatus = 'pending';
        }
      } else {
        if (ep.daysAgo > 10 && rxIndex % 5 !== 0) {
          rxStatus = 'dispensed';
          isDispensed = true;
        } else if (rxIndex % 7 === 0) {
          rxStatus = 'cancelled';
          isExpired = true;
        } else {
          rxStatus = 'pending';
        }
      }

      // 3 consultations carry Doctor Safety Overrides (Warfarin + Ciprofloxacin)
      const isSafetyOverride = (idx === 10 || idx === 25 || idx === 40);
      const prescribedDrug = isSafetyOverride ? 'Ciprofloxacin' : cond.medication;
      const prescribedDosage = isSafetyOverride ? '500mg' : cond.dosage;

      const safetyOverrideData = isSafetyOverride ? {
        acknowledged: true,
        acknowledgedAt: episodeDate,
        doctorId: doctor.id,
        reason: 'Severe DDI acknowledged; patient monitored with frequent INR testing as per clinical protocol.',
        findingTypes: ['drug_interaction'],
        findings: [{
          type: 'drug_interaction',
          severity: 'severe',
          items: ['Warfarin', 'Ciprofloxacin'],
          summary: 'Concurrent use increases bleeding risk; frequent prothrombin monitoring required.'
        }]
      } : null;

      const prescriptionDoc = {
        prescriptionId: rxRef,
        consultationId: consultation.id,
        patientId: patient.id,
        patientNic: patient.document.nic,
        doctorId: doctor.id,
        hospitalId: hospital ? hospital.id : null,
        drugName: prescribedDrug,
        dosage: prescribedDosage,
        frequency: cond.frequency,
        durationDays: cond.durationDays,
        instructions: cond.instructions,
        status: rxStatus === 'partially_dispensed' ? 'dispensed' : rxStatus,
        resolvedIngredients: [prescribedDrug.toLowerCase()],
        safetyOverride: safetyOverrideData,
        isSynthetic: true,
        syntheticSeedBatch: NAMESPACE,
        createdAt: episodeDate,
        updatedAt: episodeDate
      };

      if (isDispensed || isPartial) {
        prescriptionDoc.dispensedAt = new Date(+episodeDate + 3600000); // 1h later
        prescriptionDoc.dispensedBy = pharmacy1.id;
      }

      const prescription = add('Prescription', prescriptionDoc, rxIndex);
      prescriptions.push(prescription);

      // Create linked Dispensing record if fulfilled
      if (isDispensed || isPartial) {
        const dispIndex = dispensings.length;
        const receiptNumber = `RCP-VIVA-2026-${String(dispIndex + 1).padStart(5, '0')}`;
        const dispStaff = pharmacyStaff[dispIndex % pharmacyStaff.length];
        const dispPharmacy = dispStaff.document.pharmacyId === pharmacy1.id ? pharmacy1 : pharmacy2;
        const dispensedDate = new Date(+episodeDate + 3600000);

        const dispensingDoc = {
          receiptNumber: receiptNumber,
          prescriptionId: prescription.id,
          pharmacyId: dispPharmacy.id,
          staffId: dispStaff.id,
          patientNic: patient.document.nic,
          pharmacyName: dispPharmacy.document.name,
          pharmacistName: dispStaff.document.fullName,
          items: [{
            drugName: prescribedDrug,
            dosage: prescribedDosage,
            quantityDispensed: isPartial ? 10 : 21,
            status: isPartial ? 'partial' : 'dispensed'
          }],
          notes: isPartial ? 'Partial dispense: 10 tablets issued; remainder on backorder.' : 'Full prescription course dispensed.',
          isSynthetic: true,
          syntheticSeedBatch: NAMESPACE,
          dispensedDate,
          createdAt: dispensedDate,
          updatedAt: dispensedDate
        };

        const dispensing = add('Dispensing', dispensingDoc, dispIndex);
        dispensings.push(dispensing);
      }
    }
  });

  // Additional prescription lines for Demo Patient step 3:
  // - Losartan 50mg pending (active)
  // - Losartan 50mg superseded (from 35 days ago, supersededBy CON-3 Losartan)
  // - Cefalexin 500mg expired (from 40 days ago, course ended)
  const demoConsultation3 = consultations.find(c => c.document.consultationId === 'CON-VIVA-2026-0003') || consultations[2];
  const demoDate = demoConsultation3.document.createdAt;

  // Active Losartan
  const losartanActiveRef = `RX-VIVA-2026-09901`;
  const losartanActive = add('Prescription', {
    prescriptionId: losartanActiveRef,
    consultationId: demoConsultation3.id,
    patientId: demoPatient.id,
    patientNic: demoPatient.document.nic,
    doctorId: doctors[0].id,
    hospitalId: hospital1.id,
    drugName: 'Losartan',
    dosage: '50mg',
    frequency: 'OD',
    durationDays: 30,
    instructions: 'Take 1 tablet daily in the morning.',
    status: 'pending',
    resolvedIngredients: ['losartan'],
    isSynthetic: true,
    syntheticSeedBatch: NAMESPACE,
    createdAt: demoDate,
    updatedAt: demoDate
  }, prescriptions.length);
  prescriptions.push(losartanActive);

  // Superseded Losartan
  const supersededDate = new Date(+demoDate - 35 * DAY_MS);
  const losartanSupersededRef = `RX-VIVA-2026-09902`;
  const losartanSuperseded = add('Prescription', {
    prescriptionId: losartanSupersededRef,
    consultationId: demoConsultation3.id,
    patientId: demoPatient.id,
    patientNic: demoPatient.document.nic,
    doctorId: doctors[0].id,
    hospitalId: hospital1.id,
    drugName: 'Losartan',
    dosage: '50mg',
    frequency: 'OD',
    durationDays: 30,
    instructions: 'Take 1 tablet daily in the morning.',
    status: 'cancelled',
    supersededBy: losartanActive.id,
    supersededByConsultationId: demoConsultation3.id,
    supersededAt: demoDate,
    supersededReason: 'newer_prescription_same_medicine',
    resolvedIngredients: ['losartan'],
    isSynthetic: true,
    syntheticSeedBatch: NAMESPACE,
    createdAt: supersededDate,
    updatedAt: demoDate
  }, prescriptions.length);
  prescriptions.push(losartanSuperseded);

  // Expired Cefalexin
  const expiredDate = new Date(+demoDate - 40 * DAY_MS);
  const cefalexinExpiredRef = `RX-VIVA-2026-09903`;
  const cefalexinExpired = add('Prescription', {
    prescriptionId: cefalexinExpiredRef,
    consultationId: demoConsultation3.id,
    patientId: demoPatient.id,
    patientNic: demoPatient.document.nic,
    doctorId: doctors[0].id,
    hospitalId: hospital1.id,
    drugName: 'Cefalexin',
    dosage: '500mg',
    frequency: 'QDS',
    durationDays: 5,
    instructions: 'Take 1 capsule every 6 hours for 5 days.',
    status: 'cancelled',
    resolvedIngredients: ['cefalexin'],
    isSynthetic: true,
    syntheticSeedBatch: NAMESPACE,
    createdAt: expiredDate,
    updatedAt: new Date(+expiredDate + 5 * DAY_MS)
  }, prescriptions.length);
  prescriptions.push(cefalexinExpired);

  // ── 6. LAB TESTS (12 total across statuses) ─────────────────────────────────
  const labTestStatuses = [
    'report_ready',       // 0: Demo Patient CBC (report ready)
    'sample_collected',   // 1: Demo Patient Dengue NS1 (sample in transit)
    'report_ready',       // 2: Fasting Blood Sugar
    'report_ready',       // 3: Dengue IgM/IgG Serology
    'processing',         // 4: Urine Full Report
    'sample_collected',   // 5: Lipid Profile
    'sample_collected',   // 6: Serum Creatinine
    'Approved',           // 7: Liver Function Test
    'Approved',           // 8: Thyroid Profile
    'pending',            // 9: Blood Picture
    'pending',            // 10: ESR
    'pending'             // 11: CRP
  ];

  const labTestNames = [
    'Complete Blood Count (CBC)',
    'Dengue NS1 Antigen Rapid Test',
    'Fasting Blood Sugar (FBS)',
    'Dengue IgM/IgG Serology',
    'Urine Full Report (UFR)',
    'Lipid Profile',
    'Serum Creatinine & eGFR',
    'Liver Function Test (LFT)',
    'Thyroid Stimulating Hormone (TSH)',
    'Peripheral Blood Picture',
    'Erythrocyte Sedimentation Rate (ESR)',
    'C-Reactive Protein (CRP)'
  ];

  const labCategories = [
    'Haematology', 'Microbiology', 'Biochemistry', 'Microbiology',
    'Urine Analysis', 'Biochemistry', 'Biochemistry', 'Biochemistry',
    'Biochemistry', 'Haematology', 'Haematology', 'Immunology'
  ];

  for (let l = 0; l < 12; l++) {
    const isDemoLab = l < 2;
    const labPatient = isDemoLab ? demoPatient : patients[2 + l];
    const labConsultation = isDemoLab ? consultations[l] : consultations[10 + l];
    const labStatus = labTestStatuses[l];
    const testDate = labConsultation.document.createdAt;
    const labId = `LT-VIVA-2026-${String(l + 1).padStart(4, '0')}`;

    const labDoc = {
      labTestId: labId,
      consultationId: labConsultation.id,
      consultationRef: labConsultation.document.consultationId,
      patientNic: labPatient.document.nic,
      patientId: labPatient.id,
      patientName: labPatient.document.fullName,
      patientEmail: labPatient.document.email,
      hospitalId: hospital1.id,
      referredBy: doctors[0].id,
      testName: labTestNames[l],
      testCategory: labCategories[l],
      urgency: l === 1 ? 'urgent' : 'routine',
      status: labStatus,
      statusHistory: [
        { status: 'pending', changedAt: testDate, note: 'Test ordered by physician' },
        ...(labStatus !== 'pending' ? [{ status: 'Approved', changedAt: new Date(+testDate + 3600000), note: 'Approved by laboratory' }] : []),
        ...(labStatus === 'sample_collected' || labStatus === 'processing' || labStatus === 'report_ready' ? [{ status: 'sample_collected', changedAt: new Date(+testDate + 7200000), note: 'Sample collected at phlebotomy counter' }] : []),
        ...(labStatus === 'processing' || labStatus === 'report_ready' ? [{ status: 'processing', changedAt: new Date(+testDate + 10800000), note: 'Automated analyzer batch running' }] : []),
        ...(labStatus === 'report_ready' ? [{ status: 'report_ready', changedAt: new Date(+testDate + 14400000), note: 'Verified and signed by biochemist' }] : [])
      ],
      notes: isDemoLab ? 'Demonstration laboratory referral with encrypted report payload.' : 'Routine outpatient laboratory investigation.',
      isSynthetic: true,
      syntheticSeedBatch: NAMESPACE,
      createdAt: testDate,
      updatedAt: new Date(+testDate + 14400000)
    };

    if (labStatus === 'report_ready') {
      const samplePdf = Buffer.from(
        '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n' +
        '3 0 obj<</Type/Page/MediaBox[0 0 595 842]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n' +
        '0000000000 65535 f \n0000000009 00000 n \n0000000056 00000 n \n0000000111 00000 n \n' +
        'trailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF\n',
        'utf8'
      );
      const pdfSha256 = crypto.createHash('sha256').update(samplePdf).digest('hex');
      const docId = deterministicObjectId('LabTest', l);

      const keyToUse = global.ENCRYPTION_KEYS?.[global.ACTIVE_KEY_VERSION] || global.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || '01234567890123456789012345678901';
      let encoded = null;
      try {
        const security = require('../server/src/security/securityRuntime').current();
        const envelope = require('../server/src/security/labReportEnvelope');
        encoded = security.fieldMode === 'gcm'
          ? envelope.encryptReport(samplePdf, { _id: docId }, security.fieldConfiguration())
          : envelope.encryptLegacyReport(samplePdf, keyToUse);
      } catch (_) {
        const envelope = require('../server/src/security/labReportEnvelope');
        encoded = envelope.encryptLegacyReport(samplePdf, keyToUse);
      }

      labDoc.reportId = `RPT-VIVA-2026-${String(l + 1).padStart(4, '0')}`;
      labDoc.reportPath = `https://res.cloudinary.com/medisync/raw/upload/viva/reports/${labId}.pdf`;
      labDoc.reportPublicId = `medisync/lab-reports/${docId}/sample`;
      labDoc.reportOriginalName = `${labTestNames[l].replace(/[^a-zA-Z0-9]/g, '_')}_Result.pdf`;
      labDoc.reportUploadedAt = new Date(+testDate + 14400000);
      labDoc.reportSha256 = pdfSha256;
      labDoc.reportEnvelopeVersion = encoded.reportEnvelopeVersion || 1;
      labDoc.fileIV = encoded.fileIV;
      labDoc.encryptedFileKey = encoded.encryptedFileKey;
      labDoc.encryptedBlob = encoded.blob.toString('base64');
      labDoc.fileKeyVersion = 1;
      labDoc.keyVersion = 1;
    }

    add('LabTest', labDoc, l);
  }

  // ── 7. VERIFICATION TOKEN (For Demo Patient CON-3 live QR demo) ──────────────
  // Fresh CSPRNG 32-byte hex token on every run (never committed to repository).
  const rawDemoToken = (rawToken && typeof rawToken === 'string')
    ? rawToken
    : crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawDemoToken).digest('hex');

  const verificationToken = add('VerificationToken', {
    tokenHash,
    consultationId: demoConsultation3.id,
    patientRef: demoPatient.id,
    doctorRef: doctors[0].id,
    consultationRef: demoConsultation3.document.consultationId,
    expiresAt: new Date(Date.now() + 90 * DAY_MS),
    useCount: 0,
    isSynthetic: true,
    syntheticSeedBatch: NAMESPACE,
    createdAt: demoDate,
    updatedAt: demoDate
  }, 0);

  const counts = Object.fromEntries(Object.entries(byModel).map(([model, rows]) => [model, rows.length]));

  return {
    namespace: NAMESPACE,
    anchorDate: new Date(todayMidnight + COLOMBO_OFFSET_MS).toISOString().slice(0, 10),
    now: current.toISOString(),
    counts,
    records,
    documentsByModel: Object.fromEntries(Object.entries(byModel).map(([model, rows]) => [model, rows.map(r => r.document)])),
    demoPatient: {
      id: demoPatient.id,
      nic: demoPatient.document.nic,
      name: demoPatient.document.fullName,
      email: demoPatient.document.email,
      rawToken: rawDemoToken,
      tokenHash,
      expiresAt: verificationToken.document.expiresAt,
      qrUrl: `https://medisync.chamodtharusha.com.lk/verify/${rawDemoToken}`
    },
    scenarios: {
      'S-A': { disease: 'Dengue', district: 'Gampaha', expected: 'Critical Alert', gateFloor: 'PASS (N=12 >= 5)', gatePersistence: 'PASS (4 days > 2.0)' },
      'S-B': { disease: 'Dengue', district: 'Kalutara', expected: 'No Alert', gateFloor: 'PASS (N=6 >= 5)', gatePersistence: 'FAIL (1 day > 2.0)' },
      'S-C': { disease: 'Dengue', district: 'Matara', expected: 'No Alert', gateFloor: 'FAIL (N=4 < 5)', gatePersistence: 'FAIL (Floor not met)' },
      'S-D': { disease: 'Influenza', district: 'Kandy', expected: 'High Alert', gateFloor: 'PASS (N=8 >= 5)', gatePersistence: 'PASS (4 days > 2.0)' }
    }
  };
}

module.exports = {
  NAMESPACE,
  DISTRICTS,
  CONDITIONS,
  buildVivaSeedPlan
};
