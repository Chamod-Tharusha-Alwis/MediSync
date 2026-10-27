'use strict';
/**
 * MediSync Standalone In-Memory Mock API Server
 * 
 * Strict Zero-Database Security Profile:
 * - Listens ONLY on 127.0.0.1:5100.
 * - Zero MongoDB / Atlas connections (no database driver loaded).
 * - Zero Redis / Vault / SMTP / SMS / Cloudinary / external egress.
 * - Zero production credentials loaded.
 * - Serves rich synthetic in-memory demo data for all five healthcare roles.
 * - Exposes verified process identity on GET /api/qa/identity.
 */

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

// Generate unique runtime run nonce for process identity verification
const RUN_NONCE = crypto.randomBytes(24).toString('hex');
const START_TIME = new Date().toISOString();

const app = express();

app.use(express.json());
app.use(cors({
  origin: 'http://127.0.0.1:3100',
  credentials: true
}));

// Process Identity & QA Status
app.get('/api/qa/identity', (req, res) => {
  res.json({
    status: 'READY',
    mode: 'MOCK_IN_MEMORY',
    port: 5100,
    host: '127.0.0.1',
    processId: process.pid,
    nonce: RUN_NONCE,
    startedAt: START_TIME,
    database: null,
    externalIntegrations: false
  });
});

app.get('/api/qa/status', (req, res) => {
  res.json({
    status: 'READY',
    mode: 'MOCK',
    owner: `mock-${RUN_NONCE.slice(0, 8)}`,
    readOnly: true,
    frozen: false
  });
});

// Synthetic in-memory state
const MOCK_USERS = {
  admin: {
    id: 'u_admin_01',
    _id: 'u_admin_01',
    name: 'Sarah Jenkins',
    fullName: 'Sarah Jenkins',
    email: 'admin@medisync.local',
    role: 'admin',
    isSuperAdmin: true,
    isActive: true,
    department: 'Health Informatics & Governance'
  },
  doctor: {
    id: 'u_doc_01',
    _id: 'u_doc_01',
    name: 'Dr. Kasun Fernando',
    fullName: 'Dr. Kasun Fernando',
    email: 'doctor@medisync.local',
    role: 'doctor',
    doctorId: 'DOC-SLMC-49281',
    licenseNo: 'SLMC-49281',
    specialty: 'Internal Medicine',
    qualification: 'MBBS, MD (Medicine), MRCP',
    hospitals: ['National Hospital of Sri Lanka'],
    isActive: true,
    isVerified: true
  },
  patient: {
    id: 'u_pat_01',
    _id: 'u_pat_01',
    name: 'Chamara Silva',
    fullName: 'Chamara Silva',
    email: 'patient@medisync.local',
    role: 'patient',
    nic: '199012345671',
    patientNic_bi: 'c0b8934fa793d25bb5ec9630c14da17e082199852fecbb973909772d6ffb480b',
    dateOfBirth: '1990-05-14',
    gender: 'Male',
    district: 'Colombo',
    bloodGroup: 'O+',
    allergies: ['Amoxicillin', 'Penicillin'],
    chronicConditions: ['Mild Essential Hypertension'],
    emergencyContact: {
      name: 'Nimal Silva',
      phone: '0771234567',
      relationship: 'Brother'
    }
  },
  pharmacist: {
    id: 'u_pharm_01',
    _id: 'u_pharm_01',
    name: 'Priyanka Perera',
    fullName: 'Priyanka Perera',
    email: 'pharmacist@medisync.local',
    role: 'pharmacist',
    pharmacyId: 'ph_colombo_01',
    pharmacyName: 'Central Dispensary Colombo',
    licenseNo: 'SLPC-PH-8821',
    isActive: true
  },
  hospital_admin: {
    id: 'u_hosp_01',
    _id: 'u_hosp_01',
    name: 'Dr. Mohan De Silva',
    fullName: 'Dr. Mohan De Silva',
    email: 'hospital@medisync.local',
    role: 'hospital_admin',
    hospitalId: 'hosp_colombo_gen',
    hospitalName: 'Colombo General Hospital',
    district: 'Colombo',
    isActive: true
  }
};

const MOCK_INVENTORY = [
  { id: 'inv_1', drug: 'Paracetamol 500mg', brand: 'Panadol', category: 'Analgesics', stock: 450, unit: 'tablets', reorderLevel: 100, status: 'In Stock' },
  { id: 'inv_2', drug: 'Amoxicillin 500mg', brand: 'Amoxil', category: 'Antibiotics', stock: 120, unit: 'capsules', reorderLevel: 50, status: 'In Stock' },
  { id: 'inv_3', drug: 'Metformin 500mg', brand: 'Glucophage', category: 'Antidiabetic', stock: 380, unit: 'tablets', reorderLevel: 80, status: 'In Stock' },
  { id: 'inv_4', drug: 'Atorvastatin 20mg', brand: 'Lipitor', category: 'Cardiovascular', stock: 24, unit: 'tablets', reorderLevel: 40, status: 'Low Stock' },
  { id: 'inv_5', drug: 'Omeprazole 20mg', brand: 'Losec', category: 'Gastrointestinal', stock: 310, unit: 'capsules', reorderLevel: 60, status: 'In Stock' }
];

let mockPrescriptions = [
  {
    _id: 'rx_101',
    prescriptionId: 'RX-2026-00101',
    patientNic: '199012345671',
    patientName: 'Chamara Silva',
    doctorName: 'Dr. Kasun Fernando',
    doctorId: 'DOC-SLMC-49281',
    date: '2026-10-17',
    status: 'issued',
    medications: [
      { name: 'Paracetamol 500mg', dosage: '500mg', frequency: 'TDS (Three times daily)', durationDays: 5, quantity: 15, instructions: 'After meals' },
      { name: 'Cetirizine 10mg', dosage: '10mg', frequency: 'Nocte (At night)', durationDays: 5, quantity: 5, instructions: 'Before sleep' }
    ]
  }
];

let activeOtpSessions = new Map();

// ─── AUTH ENDPOINTS ──────────────────────────────────────────────────────────

app.post(['/api/auth/login', '/api/patient/login', '/api/hospital/login', '/api/pharmacy/login', '/api/admin/login', '/api/doctor/login'], (req, res) => {
  const { email, role: requestedRole } = req.body;
  let targetRole = requestedRole;
  if (!targetRole) {
    if (req.path.includes('patient')) targetRole = 'patient';
    else if (req.path.includes('doctor')) targetRole = 'doctor';
    else if (req.path.includes('hospital')) targetRole = 'hospital_admin';
    else if (req.path.includes('pharmacy')) targetRole = 'pharmacist';
    else if (req.path.includes('admin')) targetRole = 'admin';
    else targetRole = 'doctor';
  }

  const user = MOCK_USERS[targetRole] || MOCK_USERS.doctor;
  const token = `mock-jwt-${targetRole}-${Date.now()}`;

  res.json({
    status: 'success',
    mode: 'MOCK',
    token,
    accessToken: token,
    refreshToken: `mock-refresh-${targetRole}`,
    userRole: user.role,
    role: user.role,
    user,
    data: {
      accessToken: token,
      refreshToken: `mock-refresh-${targetRole}`,
      user,
      role: user.role
    }
  });
});

app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization || '';
  let role = 'doctor';
  if (authHeader.includes('admin')) role = 'admin';
  else if (authHeader.includes('patient')) role = 'patient';
  else if (authHeader.includes('pharmacist')) role = 'pharmacist';
  else if (authHeader.includes('hospital')) role = 'hospital_admin';

  res.json({
    status: 'success',
    mode: 'MOCK',
    user: MOCK_USERS[role]
  });
});

app.post('/api/auth/refresh', (req, res) => {
  res.json({
    status: 'success',
    mode: 'MOCK',
    accessToken: `mock-jwt-refreshed-${Date.now()}`
  });
});

app.post('/api/auth/logout', (req, res) => {
  res.json({ status: 'success', mode: 'MOCK', message: 'Logged out cleanly.' });
});

app.post('/api/auth/forgot-password', (req, res) => {
  res.json({ status: 'success', mode: 'MOCK', message: 'Mock password reset link dispatched.' });
});

// ─── DOCTOR ENDPOINTS ────────────────────────────────────────────────────────

app.get('/api/doctor/stats', (req, res) => {
  res.json({
    status: 'success',
    mode: 'MOCK',
    data: {
      todayConsultations: 8,
      activeRx: 14,
      totalPatients: 45,
      pendingFollowUps: 3
    }
  });
});

app.get('/api/doctor/profile', (req, res) => {
  res.json({
    status: 'success',
    mode: 'MOCK',
    data: MOCK_USERS.doctor
  });
});

app.post('/api/patient/request-access', (req, res) => {
  const { patientNic } = req.body;
  const sessionId = `mock-otp-session-${Date.now()}`;
  activeOtpSessions.set(sessionId, { patientNic, otp: '123456', createdAt: Date.now() });

  res.json({
    status: 'success',
    mode: 'MOCK',
    sessionId,
    message: 'OTP sent to registered patient contact (Synthetic OTP: 123456)'
  });
});

app.post('/api/patient/verify-access', (req, res) => {
  const { sessionId, otp } = req.body;
  const session = activeOtpSessions.get(sessionId);

  if (otp !== '123456' && (!session || session.otp !== otp)) {
    return res.status(400).json({ error: 'Invalid or expired OTP' });
  }

  const patient = MOCK_USERS.patient;
  const accessToken = `mock-patient-access-token-${Date.now()}`;

  res.json({
    status: 'success',
    mode: 'MOCK',
    accessToken,
    patient,
    data: {
      accessToken,
      patient
    }
  });
});

app.get(['/api/patient/:nic', '/api/patient/:nic/profile'], (req, res) => {
  res.json({
    status: 'success',
    mode: 'MOCK',
    data: MOCK_USERS.patient
  });
});

app.get('/api/patient/:nic/timeline', (req, res) => {
  res.json({
    status: 'success',
    mode: 'MOCK',
    data: [
      {
        type: 'consultation',
        date: '2026-10-10',
        data: {
          _id: 'con_1',
          consultationId: 'CON-2026-001',
          doctorName: 'Dr. Kasun Fernando',
          diagnosis: 'Acute Viral Rhinitis',
          followUpDate: '2026-11-15T00:00:00.000Z',
          notes: 'Mild fever, clear rhinorrhea. Advised hydration and symptomatic relief.',
          prescriptions: []
        }
      },
      {
        type: 'prescription',
        date: '2026-10-10',
        data: {
          _id: 'rx_101',
          prescriptionId: 'RX-2026-00101',
          status: 'pending',
          expiresAt: '2026-11-10T00:00:00.000Z',
          medications: [
            { name: 'Paracetamol 500mg', dosage: '500mg', frequency: 'TDS', durationDays: 5, quantity: 15 }
          ]
        }
      }
    ]
  });
});

app.post(['/api/doctor/predict-disease', '/api/doctor/ai-suggest', '/api/ml/symptoms/predict'], (req, res) => {
  const { symptoms = [] } = req.body;
  const text = symptoms.join(' ').toLowerCase();

  let predictions = [
    { disease: 'Acute Bronchitis', confidence: 84.5, icd_code: 'CA20', urgency: 'moderate', recommended_tests: ['Chest X-Ray', 'CBC'] },
    { disease: 'Upper Respiratory Tract Infection', confidence: 71.2, icd_code: 'CA00', urgency: 'low', recommended_tests: ['Symptom monitoring'] }
  ];

  if (text.includes('fever') && text.includes('headache') && (text.includes('rash') || text.includes('joint'))) {
    predictions = [
      { disease: 'Dengue Fever', confidence: 91.0, icd_code: '1D20', urgency: 'high', recommended_tests: ['Dengue NS1 Antigen', 'FBC (Platelet count)', 'SGOT/SGPT'] },
      { disease: 'Viral Influenza', confidence: 62.4, icd_code: '1E30', urgency: 'moderate', recommended_tests: ['Rapid Influenza Diagnostic Test'] }
    ];
  }

  res.json({
    status: 'success',
    mode: 'MOCK',
    predictions,
    disclaimer: 'Clinical decision-support only. Must be confirmed by licensed medical practitioner.'
  });
});

app.get('/api/drugs/icd/search', (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const codes = [
    { code: 'CA20', title: 'Acute Bronchitis', version: 'icd11' },
    { code: '1D20', title: 'Dengue without warning signs', version: 'icd11' },
    { code: '1D21', title: 'Dengue with warning signs', version: 'icd11' },
    { code: '1E30', title: 'Influenza due to identified virus', version: 'icd11' },
    { code: 'BA00', title: 'Essential Hypertension', version: 'icd11' },
    { code: 'J20.9', title: 'Acute Bronchitis, unspecified', version: 'icd10' },
    { code: 'A90', title: 'Dengue Fever', version: 'icd10' },
    { code: 'I10', title: 'Essential (primary) hypertension', version: 'icd10' }
  ];

  const results = q ? codes.filter(c => c.title.toLowerCase().includes(q) || c.code.toLowerCase().includes(q)) : codes;
  res.json({
    status: 'success',
    mode: 'MOCK',
    data: results
  });
});

app.post('/api/drugs/interactions', (req, res) => {
  const { drugs = [] } = req.body;
  const names = drugs.map(d => String(d).toLowerCase());
  const conflicts = [];

  if (names.some(n => n.includes('warfarin')) && names.some(n => n.includes('aspirin'))) {
    conflicts.push({
      drugA: 'Warfarin',
      drugB: 'Aspirin',
      severity: 'Major',
      description: 'Concurrent use markedly increases the risk of severe gastrointestinal hemorrhage.'
    });
  }

  res.json({
    status: 'success',
    mode: 'MOCK',
    hasInteractions: conflicts.length > 0,
    interactions: conflicts,
    disclaimer: 'Formulary interaction check based on verified clinical reference monographs.'
  });
});

app.post(['/api/doctor/consultation', '/api/doctor/consultations'], (req, res) => {
  res.json({
    status: 'success',
    mode: 'MOCK',
    data: {
      consultationId: `CON-2026-${Date.now().toString().slice(-5)}`,
      status: 'active',
      savedAt: new Date().toISOString()
    }
  });
});

// ─── PHARMACY ENDPOINTS ──────────────────────────────────────────────────────

app.get('/api/pharmacy/inventory', (req, res) => {
  res.json({
    status: 'success',
    mode: 'MOCK',
    data: MOCK_INVENTORY
  });
});

app.get(['/api/pharmacy/prescriptions/pending/:nic', '/api/pharmacy/prescriptions/pending'], (req, res) => {
  res.json({
    status: 'success',
    mode: 'MOCK',
    data: mockPrescriptions
  });
});

app.post('/api/pharmacy/dispense', (req, res) => {
  const { prescriptionId, items = [] } = req.body;
  const rx = mockPrescriptions.find(p => p.prescriptionId === prescriptionId || p._id === prescriptionId);
  if (rx) rx.status = 'dispensed';

  res.json({
    status: 'success',
    mode: 'MOCK',
    message: 'Prescription dispensed and inventory adjusted atomically.',
    dispensedAt: new Date().toISOString()
  });
});

app.get('/api/pharmacy/history', (req, res) => {
  res.json({
    status: 'success',
    mode: 'MOCK',
    data: [
      { id: 'disp_1', prescriptionId: 'RX-2026-00098', patientName: 'N. Perera', pharmacist: 'Priyanka Perera', date: '2026-10-17 14:30', totalItems: 2, status: 'Dispensed' }
    ]
  });
});

app.get('/api/pharmacy/analytics/restock', (req, res) => {
  res.json({
    status: 'success',
    mode: 'MOCK',
    data: {
      criticalItems: 1,
      turnoverRate: '8.4%',
      predictedShortages: [{ drug: 'Atorvastatin 20mg', daysRemaining: 3 }]
    }
  });
});

app.get('/api/pharmacy/restock-alerts', (req, res) => {
  res.json({
    status: 'success',
    mode: 'MOCK',
    district: 'Colombo',
    drugsAnalyzed: 14,
    alerts: [
      {
        id: 'al_1',
        drugName: 'Paracetamol 500mg',
        status: 'Critical',
        trend: '+45%',
        message: 'Surge in regional fever presentations triggering higher dispensing rates.',
        baselineDailyAvg: 120,
        recentDailyAvg: 174
      },
      {
        id: 'al_2',
        drugName: 'Amoxicillin 500mg',
        status: 'Warning',
        trend: '+22%',
        message: 'Moderate increase in respiratory presentations.',
        baselineDailyAvg: 60,
        recentDailyAvg: 73
      }
    ],
    data: [
      { id: 'al_1', drug: 'Paracetamol 500mg', drugName: 'Paracetamol 500mg', currentStock: 24, threshold: 40, urgency: 'Critical', status: 'Critical' }
    ]
  });
});

app.get('/api/pharmacy/staff', (req, res) => {
  res.json({
    status: 'success',
    mode: 'MOCK',
    data: [
      { id: 'st_1', fullName: 'Priyanka Perera', role: 'pharmacist', licenseNo: 'SLPC-PH-8821', isActive: true },
      { id: 'st_2', fullName: 'Nuwan Jayasinghe', role: 'dispenser', licenseNo: 'SLPC-DISP-4102', isActive: true }
    ]
  });
});

// ─── HOSPITAL ENDPOINTS ──────────────────────────────────────────────────────

app.get('/api/hospital/profile', (req, res) => {
  res.json({
    status: 'success',
    mode: 'MOCK',
    data: MOCK_USERS.hospital_admin
  });
});

app.get('/api/hospital/staff', (req, res) => {
  res.json({
    status: 'success',
    mode: 'MOCK',
    data: [
      { id: 'doc_1', fullName: 'Dr. Kasun Fernando', specialty: 'Internal Medicine', licenseNo: 'SLMC-49281', status: 'Active' },
      { id: 'doc_2', fullName: 'Dr. Anoma Wijesekara', specialty: 'Pediatrics', licenseNo: 'SLMC-51092', status: 'Active' }
    ]
  });
});

app.get('/api/hospital/stats', (req, res) => {
  res.json({
    status: 'success',
    mode: 'MOCK',
    data: {
      totalDoctors: 42,
      activeWards: 16,
      bedOccupancyRate: '78.5%',
      pendingLabOrders: 7
    }
  });
});

app.get('/api/lab/hospital/all', (req, res) => {
  res.json([
    { id: 'lab_1', testName: 'Complete Blood Count', patientName: 'Chamara Silva', orderedBy: 'Dr. Kasun Fernando', status: 'sample_collected', priority: 'Routine' },
    { id: 'lab_2', testName: 'Dengue NS1 Antigen', patientName: 'M. K. Bandara', orderedBy: 'Dr. Anoma Wijesekara', status: 'ordered', priority: 'Urgent' }
  ]);
});

app.post('/api/hospital/doctors/link', (req, res) => {
  res.json({
    status: 'success',
    mode: 'MOCK',
    message: 'Doctor roster link verified and registered.'
  });
});

// ─── ADMINISTRATOR ENDPOINTS ─────────────────────────────────────────────────

app.get('/api/admin/stats', (req, res) => {
  res.json({
    status: 'success',
    mode: 'MOCK',
    data: {
      totalUsers: 148,
      verifiedDoctors: 34,
      registeredHospitals: 12,
      registeredPharmacies: 18,
      activeAlerts: 1
    }
  });
});

app.get('/api/admin/users', (req, res) => {
  res.json({
    status: 'success',
    mode: 'MOCK',
    data: [
      { _id: 'u1', id: 'u1', name: 'Dr. Kasun Fernando', fullName: 'Dr. Kasun Fernando', email: 'kasun@medisync.local', role: 'doctor', isActive: true, isVerified: true, registeredAt: '2026-01-12' },
      { _id: 'u2', id: 'u2', name: 'Chamara Silva', fullName: 'Chamara Silva', email: 'chamara@medisync.local', role: 'patient', isActive: true, isVerified: true, registeredAt: '2026-02-04' },
      { _id: 'u3', id: 'u3', name: 'Priyanka Perera', fullName: 'Priyanka Perera', email: 'priyanka@medisync.local', role: 'pharmacist', isActive: true, isVerified: true, registeredAt: '2026-02-18' },
      { _id: 'u4', id: 'u4', name: 'Colombo General Hospital', fullName: 'Colombo General Hospital', email: 'admin@cgh.medisync.local', role: 'hospital_admin', isActive: true, isVerified: true, registeredAt: '2026-01-01' }
    ],
    pagination: {
      total: 4,
      page: 1,
      pages: 1
    }
  });
});

app.put('/api/admin/users/toggle', (req, res) => {
  res.json({
    status: 'success',
    mode: 'MOCK',
    message: 'User status successfully toggled.'
  });
});

app.get('/api/admin/audit-logs', (req, res) => {
  res.json({
    status: 'success',
    mode: 'MOCK',
    data: [
      { id: 'aud_1', timestamp: '2026-10-18T07:15:00Z', actor: 'Sarah Jenkins (Admin)', action: 'USER_VERIFY', target: 'Dr. Kasun Fernando', details: 'Verified SLMC medical credentials', ipAddress: '127.0.0.1' },
      { id: 'aud_2', timestamp: '2026-10-18T07:10:00Z', actor: 'Dr. Kasun Fernando', action: 'PATIENT_ACCESS_GRANTED', target: 'Chamara Silva (NIC: 199012345671)', details: 'OTP Consent Verified', ipAddress: '127.0.0.1' },
      { id: 'aud_3', timestamp: '2026-10-18T06:50:00Z', actor: 'Priyanka Perera (Pharmacist)', action: 'MEDICATION_DISPENSED', target: 'RX-2026-00098', details: 'Dispensed Paracetamol 500mg', ipAddress: '127.0.0.1' }
    ]
  });
});

app.get(['/api/alerts/active', '/api/alerts'], (req, res) => {
  res.json({
    status: 'success',
    mode: 'MOCK',
    data: [
      {
        id: 'alt_1',
        title: 'Monsoon Dengue Vigilance — Western Province',
        severity: 'high',
        disease: 'Dengue',
        district: 'Colombo',
        details: 'Elevated vector breeding indexes reported following inter-monsoonal showers. Clinicians advised to perform early NS1 antigen screening.',
        issuedAt: '2026-10-15'
      }
    ]
  });
});

// ─── PUBLIC DIRECTORIES ──────────────────────────────────────────────────────

app.get('/api/public/doctors', (req, res) => {
  res.json({
    status: 'success',
    mode: 'MOCK',
    data: [
      {
        _id: 'pd_1',
        id: 'pd_1',
        name: 'Dr. Kasun Fernando',
        fullName: 'Dr. Kasun Fernando',
        specialty: 'Internal Medicine',
        specialization: 'Internal Medicine',
        hospital: 'Colombo General Hospital',
        hospitals: ['Colombo General Hospital'],
        district: 'Colombo',
        averageRating: 4.9,
        ratingCount: 120,
        isSynthetic: true,
        syntheticLabel: 'Verified Doctor'
      },
      {
        _id: 'pd_2',
        id: 'pd_2',
        name: 'Dr. Anoma Wijesekara',
        fullName: 'Dr. Anoma Wijesekara',
        specialty: 'Pediatrics',
        specialization: 'Pediatrics',
        hospital: 'Lady Ridgeway Hospital',
        hospitals: ['Lady Ridgeway Hospital'],
        district: 'Colombo',
        averageRating: 4.8,
        ratingCount: 88,
        isSynthetic: true,
        syntheticLabel: 'Verified Doctor'
      }
    ]
  });
});

app.get('/api/public/hospitals', (req, res) => {
  res.json({
    status: 'success',
    mode: 'MOCK',
    data: [
      { id: 'ph_1', name: 'National Hospital of Sri Lanka', district: 'Colombo', type: 'Tertiary Care', contact: '0112691111' },
      { id: 'ph_2', name: 'Colombo General Hospital', district: 'Colombo', type: 'General', contact: '0112693510' }
    ]
  });
});

app.get('/api/public/pharmacies', (req, res) => {
  res.json({
    status: 'success',
    mode: 'MOCK',
    data: [
      { id: 'pp_1', name: 'Central Dispensary Colombo', district: 'Colombo', address: '124 Hospital Road, Colombo 07', contact: '0112445566' }
    ]
  });
});

app.get('/api/public-health', (req, res) => {
  res.json({
    status: 'success',
    mode: 'MOCK',
    data: {
      surveillanceSummary: 'National epidemiological baseline steady. Western Province Dengue watch active.',
      activeOutbreaks: 1
    }
  });
});

// ─── CATCH-ALL SAFE MOCK HANDLER ─────────────────────────────────────────────

app.use('/api', (req, res) => {
  res.json({
    status: 'success',
    mode: 'MOCK',
    message: `Synthetic in-memory response for ${req.method} ${req.path}`,
    data: []
  });
});

// Bind STRICTLY to 127.0.0.1:5100
const server = app.listen(5100, '127.0.0.1', () => {
  console.log(`[MEDISYNC_MOCK_READY] loopback=http://127.0.0.1:5100 | database=NONE | pid=${process.pid} | nonce=${RUN_NONCE}`);
});

process.on('SIGINT', () => {
  console.log('[MEDISYNC_MOCK_SHUTDOWN] Terminating mock API server cleanly.');
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  console.log('[MEDISYNC_MOCK_SHUTDOWN] Terminating mock API server cleanly.');
  server.close(() => process.exit(0));
});
