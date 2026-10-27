require('./helpers/qaEnvironment');
const qa = require('./helpers/ownedFixtures');
jest.mock('uuid',()=>({v4:()=>require('crypto').randomUUID()}));

global.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
global.ENCRYPTION_KEYS = { '1': process.env.ENCRYPTION_KEY };
global.ACTIVE_KEY_VERSION = 1;

const crypto = require('crypto');
const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const { connectAutomatedTestDB } = require('../src/config/dbGuard');
const { drugs: catalogDrugs, interactions: rawInteractions } = require('../src/utils/loadDatasets');
const {
  REVIEWED_SYNONYMS,
  DRUG_ALLERGY_CLASSES,
  resolveSingleIngredient,
  parseMedicationEntry,
  analyzeMedicationSafety,
  checkAllergyConflict
} = require('../src/utils/ingredientResolver');

const Doctor = require('../src/models/Doctor');
const Patient = require('../src/models/Patient');
const Prescription = require('../src/models/Prescription');
const Pharmacy = require('../src/models/Pharmacy');
const PharmacyStaff = require('../src/models/PharmacyStaff');
const Dispensing = require('../src/models/Dispensing');
const SessionToken = require('../src/models/SessionToken');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/drugs', require('../src/routes/drugRoutes'));
  app.use('/api/prescription', require('../src/routes/prescriptionRoutes'));
  app.use('/api/pharmacy', require('../src/routes/pharmacyRoutes'));
  return app;
}

describe('Stage 5 — Broad Medicine Catalog & Medication Safety Suite', () => {
  let app;
  let doctorToken;
  let pharmacistToken;
  let testDoctorSessionId;
  let testPharmSessionId;

  let testDoctor;
  let testPatient;
  let testPharmacy;
  let testPharmacist;

  // Track created documents for surgical teardown
  const createdPrescriptionIds = [];
  const createdDispensingIds = [];
  let originalStockValue = null;
  let trackedPharmacyId = null;

  beforeAll(async () => {
    await connectAutomatedTestDB();
    app = buildApp();

    // 1. Fetch synthetic test doctor
    testDoctor = await qa.clone(Doctor, { email: 'dr.silva@demo.medisync.local' });
    if (!testDoctor) throw new Error('No synthetic demo doctor found');

    doctorToken = jwt.sign(
      { id: testDoctor._id.toString(), email: testDoctor.email, role: 'doctor', isVerified: true },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const docHash = crypto.createHash('sha256').update(doctorToken).digest('hex');
    const docSession = await SessionToken.create({
      userId: testDoctor._id,
      userModel: 'Doctor',
      tokenHash: docHash,
      isValid: true,
      expiredAt: new Date(Date.now() + 3600 * 1000)
    });
    testDoctorSessionId = docSession._id;

    // 2. Fetch synthetic test patient with known allergies
    testPatient = await qa.clone(Patient, { email: 'kamal.patient@demo.medisync.local' });
    if (!testPatient) throw new Error('No synthetic demo patient found');

    // 3. Fetch synthetic pharmacist and pharmacy
    const ownedPharmacy = await qa.clone(Pharmacy, {regNo:'PH-DEMO-001'});
    testPharmacist = await qa.clone(PharmacyStaff, {email:'pharmacy.admin@demo.medisync.local'}, {pharmacyId:ownedPharmacy._id});
    testPharmacist = await PharmacyStaff.findById(testPharmacist._id).populate('pharmacyId');
    if (!testPharmacist) throw new Error('No synthetic demo pharmacist found');

    testPharmacy = testPharmacist.pharmacyId;
    if (!testPharmacy) throw new Error('Pharmacist is not linked to a pharmacy');
    trackedPharmacyId = testPharmacy._id;

    pharmacistToken = jwt.sign(
      {
        id: testPharmacist._id.toString(),
        email: testPharmacist.email,
        role: testPharmacist.role || 'pharmacist',
        pharmacyId: testPharmacy._id.toString()
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const pharmHash = crypto.createHash('sha256').update(pharmacistToken).digest('hex');
    const pharmSession = await SessionToken.create({
      userId: testPharmacist._id,
      userModel: 'PharmacyStaff',
      tokenHash: pharmHash,
      isValid: true,
      expiredAt: new Date(Date.now() + 3600 * 1000)
    });
    testPharmSessionId = pharmSession._id;
  });

  afterAll(async () => { try { await qa.cleanup(); } finally { await mongoose.disconnect(); } });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Dataset Audit & In-Memory Index Verification
  // ─────────────────────────────────────────────────────────────────────────────
  test('1. Drugs and interactions datasets load correctly with expected scale', () => {
    expect(Array.isArray(catalogDrugs)).toBe(true);
    expect(catalogDrugs.length).toBe(3000);

    expect(Array.isArray(rawInteractions)).toBe(true);
    expect(rawInteractions.length).toBeGreaterThan(190000);

    const sampleDrug = catalogDrugs[0];
    expect(sampleDrug).toHaveProperty('name');
    expect(sampleDrug).toHaveProperty('genericName');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Pharmacopoeial Synonym & Multi-Ingredient Resolution
  // ─────────────────────────────────────────────────────────────────────────────
  test('2. Resolves reviewed INN/BAN chemical synonyms and combination products', () => {
    // Synonym mapping: paracetamol -> acetaminophen
    const paraRes = resolveSingleIngredient('paracetamol');
    expect(paraRes.resolved).toBe(true);
    expect(paraRes.canonical).toBe('acetaminophen');

    // Synonym mapping: amoxycillin -> amoxicillin
    const amoxRes = resolveSingleIngredient('amoxycillin');
    expect(amoxRes.resolved).toBe(true);
    expect(amoxRes.canonical).toBe('amoxicillin');

    // Synonym mapping: frusemide -> furosemide
    const fruRes = resolveSingleIngredient('frusemide');
    expect(fruRes.resolved).toBe(true);
    expect(fruRes.canonical).toBe('furosemide');

    // Combination parsing: Augmentin / Co-Amoxiclav
    const parsedAugmentin = parseMedicationEntry('Amoxicillin + Clavulanic Acid 625mg');
    expect(parsedAugmentin.valid).toBe(true);
    expect(parsedAugmentin.allIngredientsNormalized.length).toBeGreaterThanOrEqual(1);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Pairwise Drug-Drug Interaction Detection
  // ─────────────────────────────────────────────────────────────────────────────
  test('3. Detects high-risk drug-drug interactions accurately via API', async () => {
    // High-risk combination: Warfarin + Aspirin
    const res = await request(app)
      .post('/api/drugs/interactions')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ drugs: ['Warfarin 5mg', 'Aspirin 75mg'] });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('hasInteraction', true);
    expect(res.body.data.warnings.length).toBeGreaterThan(0);

    const warning = res.body.data.warnings[0];
    expect(warning.type).toBe('drug_interaction');
    expect(['high', 'major', 'moderate']).toContain(warning.severity);

    // Safe combination: Paracetamol + Cetirizine (no severe interaction)
    const safeRes = await request(app)
      .post('/api/drugs/interactions')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ drugs: ['Paracetamol 500mg', 'Cetirizine 10mg'] });

    expect(safeRes.status).toBe(200);
    expect(safeRes.body.data.warnings.filter(w => w.type === 'drug_interaction')).toHaveLength(0);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Duplicate Active Ingredient Detection
  // ─────────────────────────────────────────────────────────────────────────────
  test('4. Flags duplicate active ingredients across brand and combination products', async () => {
    // Paracetamol tablet + Paracetamol syrup
    const dupRes = await request(app)
      .post('/api/drugs/interactions')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ drugs: ['Paracetamol 500mg Tablet', 'Paracetamol 250mg Suspension'] });

    expect(dupRes.status).toBe(200);
    expect(dupRes.body.data).toHaveProperty('hasInteraction', true);
    expect(dupRes.body.data.duplicateIngredients.length).toBeGreaterThan(0);

    const dup = dupRes.body.data.duplicateIngredients[0];
    expect(dup.type).toBe('duplicate_ingredient');
    expect(dup.severity).toBe('high');
    expect(dup.description).toMatch(/duplicate active ingredient/i);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Class-Level Allergy Cross-Reactivity & Prescription Blocking
  // ─────────────────────────────────────────────────────────────────────────────
  test('5. Blocks prescriptions for direct allergy and pharmacological class cross-reactivity', async () => {
    // Temporarily set test patient allergies to Penicillin and Sulfa
    testPatient.allergies = ['Penicillin', 'Sulfa'];
    await testPatient.save();

    // 5A: Class cross-reactivity — Allergic to "Penicillin", Doctor prescribes "Amoxicillin 500mg"
    const amoxRes = await request(app)
      .post('/api/prescription/issue')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        patientNic: testPatient.nic,
        drugName: 'Amoxicillin 500mg',
        dosage: '500mg',
        frequency: 'TDS',
        durationDays: 5
      });

    expect(amoxRes.status).toBe(400);
    expect(amoxRes.body.error).toBe('ALLERGY_CONFLICT');
    expect(amoxRes.body).toHaveProperty('conflicts');
    expect(amoxRes.body.conflicts.some(c => c.type === 'class_cross_reactivity' || c.type === 'direct_match')).toBe(true);

    // 5B: Class cross-reactivity — Allergic to "Sulfa", Doctor prescribes "Cotrimoxazole 960mg"
    const sulfaRes = await request(app)
      .post('/api/prescription/issue')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        patientNic: testPatient.nic,
        drugName: 'Cotrimoxazole 960mg',
        dosage: '960mg',
        frequency: 'BD',
        durationDays: 7
      });

    expect(sulfaRes.status).toBe(400);
    expect(sulfaRes.body.error).toBe('ALLERGY_CONFLICT');

    // 5C: Non-allergic prescription — Doctor prescribes "Paracetamol 500mg" (should succeed)
    const safeRxRes = await request(app)
      .post('/api/prescription/issue')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        patientNic: testPatient.nic,
        drugName: 'Paracetamol 500mg',
        dosage: '500mg',
        frequency: 'TDS',
        durationDays: 3
      });

    expect(safeRxRes.status).toBe(201);
    expect(safeRxRes.body).toHaveProperty('prescriptionId');
    createdPrescriptionIds.push(safeRxRes.body._id || safeRxRes.body.prescriptionId);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Pharmacy Dispensing & Inventory Stock Decrement
  // ─────────────────────────────────────────────────────────────────────────────
  test('6. Pharmacist dispenses prescription and decrements pharmacy inventory accurately', async () => {
    // Find or initialize Paracetamol item in pharmacy inventory
    let pharmDoc = await Pharmacy.findById(trackedPharmacyId);
    // The university pharmacy's starting stock is not part of this assertion.
    // Establish one known item on the owned pharmacy clone only.
    pharmDoc.inventory = pharmDoc.inventory.filter(i => i.drugName.toLowerCase().trim() !== 'paracetamol 500mg');
    pharmDoc.inventory.push({ drugName: 'Paracetamol 500mg', stock: 200, reorderLevel: 50, unit: 'tablets' });
    await pharmDoc.save();
    pharmDoc = await Pharmacy.findById(trackedPharmacyId);
    const invItem = pharmDoc.inventory.find(i => i.drugName.toLowerCase().trim() === 'paracetamol 500mg');

    originalStockValue = invItem.stock;
    const initialStock = invItem.stock;
    const dispenseQty = 10;

    // Create a fresh pending prescription to dispense
    const testRx = await Prescription.create({
      patientNic: testPatient.nic,
      patientId: testPatient._id,
      drugName: 'Paracetamol 500mg',
      dosage: '500mg',
      frequency: 'TDS',
      durationDays: 3,
      expiresAt: new Date(Date.now() + 7 * 86400000),
      status: 'pending',
      doctorId: testDoctor._id
    });
    createdPrescriptionIds.push(testRx._id);

    // Dispense the prescription via /api/pharmacy/dispense
    const dispenseRes = await request(app)
      .post('/api/pharmacy/dispense')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({
        prescriptionId: testRx.prescriptionId,
        patientNic: testPatient.nic,
        items: [
          {
            drugName: 'Paracetamol 500mg',
            dosage: '500mg',
            quantityDispensed: dispenseQty,
            status: 'dispensed'
          }
        ],
        notes: 'Stage 5 Automated Verification Dispensing'
      });

    if (![200, 201].includes(dispenseRes.status)) {
      throw new Error(`Dispensing returned ${dispenseRes.status}: ${dispenseRes.body.code || 'NO_CODE'} ${dispenseRes.body.error || 'NO_ERROR'}`);
    }
    expect([200, 201]).toContain(dispenseRes.status);
    const receiptNo = dispenseRes.body.data?.receiptNumber || dispenseRes.body.receiptNumber;
    expect(receiptNo).toBeDefined();

    // Track created dispensing document for teardown
    const createdDisp = await Dispensing.findOne({ receiptNumber: receiptNo });
    if (createdDisp) createdDispensingIds.push(createdDisp._id);

    // Verify inventory was decremented by exact quantity
    const updatedPharm = await Pharmacy.findById(trackedPharmacyId);
    const updatedItem = updatedPharm.inventory.find(i => i.drugName.toLowerCase().trim() === 'paracetamol 500mg');
    expect(updatedItem.stock).toBe(Math.max(0, initialStock - dispenseQty));

    // Verify prescription status updated to 'dispensed'
    const updatedRx = await Prescription.findById(testRx._id);
    expect(updatedRx.status).toBe('dispensed');

    // Duplicate dispensing prevention
    const duplicateRes = await request(app)
      .post('/api/pharmacy/dispense')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({
        prescriptionId: testRx.prescriptionId,
        patientNic: testPatient.nic,
        items:[{drugName:'Paracetamol 500mg',quantityDispensed:dispenseQty,unit:'tablets'}]
      });

    expect(duplicateRes.status).toBe(400);
    expect(duplicateRes.body.code).toBe('ALREADY_DISPENSED');
  });
});
