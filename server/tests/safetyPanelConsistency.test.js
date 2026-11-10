'use strict';

const mongoose = require('mongoose');
const { computeClinicalFindings } = require('../src/utils/clinicalSafetyValidator');
const { checkMedicineSafety } = require('../src/controllers/prescriptionController');
const Patient = require('../src/models/Patient');
const Prescription = require('../src/models/Prescription');

describe('R0.4 Safety Panel Consistency Suite', () => {
  const patientId = new mongoose.Types.ObjectId();
  const activeConsultationRef = 'CON-2026-0042';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('names conflicts explicitly between new prescription and active medication', () => {
    const findings = computeClinicalFindings({
      medications: [{ name: 'Ciprofloxacin 500mg', dosage: '500mg', frequency: 'BD', durationDays: 5 }],
      patientAllergies: [],
      activePrescriptions: [
        {
          drugName: 'Warfarin 5mg',
          reference: activeConsultationRef,
          consultationRef: activeConsultationRef,
        },
      ],
    });

    expect(findings.findings.length).toBeGreaterThan(0);
    const ddi = findings.findings.find((f) => f.type === 'drug_interaction');
    expect(ddi).toBeDefined();
    expect(ddi.summary).toMatch(/Ciprofloxacin.*\(this prescription\) vs Warfarin.*\(active, CON-2026-0042\)/);
    expect(findings.requiresAcknowledgment).toBe(true);
    expect(findings.maxSeverity).toMatch(/severe|critical/);
  });

  test('checkMedicineSafety server endpoint returns findings consistent with computeClinicalFindings', async () => {
    const mockPatient = {
      _id: patientId,
      nic: '199012345678',
      allergies: ['Penicillin'],
      decryptFieldsSync: jest.fn(),
    };

    const mockActiveRx = [
      {
        _id: new mongoose.Types.ObjectId(),
        patientId,
        drugName: 'Warfarin',
        dosage: '5mg',
        frequency: 'OD',
        consultationRef: activeConsultationRef,
        prescriptionId: 'RX-999',
      },
    ];

    jest.spyOn(Patient, 'findById').mockResolvedValue(mockPatient);
    jest.spyOn(Prescription, 'find').mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockActiveRx),
      }),
    });

    const newMedications = [
      { name: 'Ciprofloxacin 500mg', dosage: '500mg', frequency: 'BD', durationDays: 5 },
    ];

    // Direct computation
    const directResult = computeClinicalFindings({
      medications: newMedications,
      patientAllergies: mockPatient.allergies,
      activePrescriptions: [
        {
          drugName: 'Warfarin',
          reference: activeConsultationRef,
          consultationRef: activeConsultationRef,
        },
      ],
    });

    // Server endpoint
    const req = {
      body: {
        medications: newMedications,
        patientId: String(patientId),
      },
      user: { id: 'doc-1', role: 'doctor' },
    };

    let responseData = null;
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn((data) => {
        responseData = data;
        return res;
      }),
    };

    await checkMedicineSafety(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(responseData).toBeDefined();
    expect(responseData.hasWarnings).toBe(true);
    expect(responseData.hasActionableWarnings).toBe(true);

    // Verify finding hashes and types match
    expect(responseData.findingsHash).toBe(directResult.findingsHash);
    expect(responseData.maxSeverity).toBe(directResult.maxSeverity);
    expect(responseData.requiresAcknowledgment).toBe(directResult.requiresAcknowledgment);

    // Check that conflict name is present in response
    const conflictWarning = responseData.warnings.find(
      (w) => w.summary?.includes('Ciprofloxacin') && w.summary?.includes('Warfarin')
    );
    expect(conflictWarning).toBeDefined();
    expect(conflictWarning.summary).toContain('CON-2026-0042');

    // Verify no duplicated warnings exist
    const summaries = responseData.warnings.map((w) => w.summary || w.message);
    const uniqueSummaries = new Set(summaries);
    expect(summaries.length).toBe(uniqueSummaries.size);
  });

  test('never reports "no interactions" when an interaction exists', () => {
    const findings = computeClinicalFindings({
      medications: [
        { name: 'Aspirin 75mg', dosage: '75mg', frequency: 'OD' },
        { name: 'Warfarin 5mg', dosage: '5mg', frequency: 'OD' },
      ],
      patientAllergies: [],
      activePrescriptions: [],
    });

    expect(findings.hasActionableWarnings).toBe(true);
    expect(findings.findings.some((f) => f.type === 'drug_interaction')).toBe(true);
  });
});
