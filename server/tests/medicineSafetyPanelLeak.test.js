'use strict';

const mongoose = require('mongoose');
const { checkMedicineSafety } = require('../src/controllers/prescriptionController');
const Patient = require('../src/models/Patient');
const Prescription = require('../src/models/Prescription');

describe('Fix B: Medicine Safety Ciphertext Leak & Active Prescription Boundary', () => {
  const patientId = new mongoose.Types.ObjectId().toHexString();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('no response string contains ciphertext pattern even with malformed or encrypted inputs', async () => {
    const ciphertextToken = 'enc:abcdef1234567890abcdef1234567890:deadbeef';
    const gcmToken = 'gcm1.a1b2c3d4e5f60718293a4b5c6d7e8f90.12345678';
    const ivToken = '0123456789abcdef0123456789abcdef:fedcba9876543210';

    jest.spyOn(Patient, 'findById').mockResolvedValue({
      _id: patientId,
      allergies: [],
      decryptFieldsSync: jest.fn(),
    });

    const mockEncryptedRx = {
      _id: new mongoose.Types.ObjectId().toHexString(),
      drugName: ciphertextToken,
      medications: [{ name: gcmToken, dosage: '10mg' }],
      consultationRef: 'CON-CIPHER',
      decryptFieldsSync: jest.fn(), // leaves ciphertext
    };

    const findSpy = jest.spyOn(Prescription, 'find').mockResolvedValue([mockEncryptedRx]);

    const req = {
      body: {
        patientId,
        medications: [{ name: ivToken, dosage: '500mg' }, { name: 'UnknownDrugX1' }, { name: 'UnknownDrugX2' }],
      },
      user: { id: 'doc-1', role: 'doctor' },
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await checkMedicineSafety(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const jsonOutput = JSON.stringify(res.json.mock.calls[0][0]);

    // Assert that no string matches ciphertext patterns anywhere in the JSON response
    const leakedPattern = /"(?:gcm1\.|enc:|[0-9a-f]{32}:[0-9a-f]+)[^"]*"/i;
    expect(leakedPattern.test(jsonOutput)).toBe(false);

    // Verify Prescription.find only queries pending or issued (excluding dispensed)
    expect(findSpy).toHaveBeenCalledWith(expect.objectContaining({
      patientId,
      status: { $in: ['pending', 'issued'] },
      supersededBy: null,
    }));
  });

  test('Warfarin + Ciprofloxacin triggers major interaction warning and excludes dispensed rx', async () => {
    jest.spyOn(Patient, 'findById').mockResolvedValue({
      _id: patientId,
      allergies: [],
      decryptFieldsSync: jest.fn(),
    });

    const activeRx = {
      _id: new mongoose.Types.ObjectId().toHexString(),
      drugName: 'Warfarin',
      medications: [{ name: 'Warfarin', dosage: '5mg' }],
      consultationRef: 'CON-ACTIVE-1',
      decryptFieldsSync: jest.fn(),
    };

    const findSpy = jest.spyOn(Prescription, 'find').mockResolvedValue([activeRx]);

    const req = {
      body: {
        patientId,
        medications: [{ name: 'Ciprofloxacin', dosage: '500mg' }],
      },
      user: { id: 'doc-1', role: 'doctor' },
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await checkMedicineSafety(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const data = res.json.mock.calls[0][0];

    // Must find major drug interaction between Ciprofloxacin and Warfarin
    const ddi = data.findings.find(f => f.type === 'drug_interaction');
    expect(ddi).toBeDefined();
    expect(data.requiresAcknowledgment).toBe(true);

    // Status query excludes historical dispensed records
    const queryFilter = findSpy.mock.calls[0][0];
    expect(queryFilter.status.$in).not.toContain('dispensed');
  });

  test('multiple unresolvable medicines return single capped summary line', async () => {
    const { computeClinicalFindings } = require('../src/utils/clinicalSafetyValidator');
    const result = computeClinicalFindings({
      medications: [
        'UnregisteredPharmaAlpha',
        'UnregisteredPharmaBeta',
        'UnregisteredPharmaGamma',
        'UnregisteredPharmaDelta',
      ],
      patientAllergies: [],
      activePrescriptions: [],
    });

    const incompleteFindings = result.findings.filter(f => f.type === 'incomplete_verification');
    expect(incompleteFindings.length).toBe(1);
    expect(incompleteFindings[0].summary).toMatch(/Interaction checking incomplete for 4 co-prescribed medicines/);
  });
});
