'use strict';

const mongoose = require('mongoose');
const PharmacyStaff = require('../src/models/PharmacyStaff');
const Patient = require('../src/models/Patient');
const Dispensing = require('../src/models/Dispensing');
const pharmacyController = require('../src/controllers/pharmacyController');

describe('P11-A4: Pharmacy History and Receipt NIC Privacy', () => {
  const staffId = new mongoose.Types.ObjectId();
  const pharmacyId = new mongoose.Types.ObjectId();
  const prescriptionId = new mongoose.Types.ObjectId();
  const patientNic = '199512345678';
  const patientFullName = 'Chamod Patient';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('getDispensingHistory returns patientName and strips all patientNic / nic plaintext fields', async () => {
    jest.spyOn(PharmacyStaff, 'findById').mockResolvedValue({
      _id: staffId,
      pharmacyId,
      role: 'pharmacist',
      isActive: true
    });

    const mockDispensingRecord = {
      _id: new mongoose.Types.ObjectId(),
      receiptNumber: 'REC-PRIVACY-01',
      prescriptionId: {
        _id: prescriptionId,
        prescriptionId: 'RX-PRIVACY-01',
        consultationRef: 'CON-123456',
        drugName: 'Amoxicillin 500mg',
        status: 'dispensed',
        isOTC: false,
        patientNic,
        doctorId: { fullName: 'Dr. Silva' }
      },
      patientNic,
      pharmacyId,
      staffId: { fullName: 'Sunil Pharmacist', role: 'pharmacist' },
      items: [{
        drugName: 'Amoxicillin 500mg',
        dosage: '500mg TDS',
        quantityDispensed: 15,
        unit: 'tablets',
        status: 'dispensed'
      }]
    };

    const mockQuery = {
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([mockDispensingRecord])
    };
    jest.spyOn(Dispensing, 'find').mockReturnValue(mockQuery);
    jest.spyOn(Dispensing, 'countDocuments').mockResolvedValue(1);

    const mockPatient = {
      nic: patientNic,
      fullName: patientFullName,
      decryptFieldsSync: jest.fn()
    };
    jest.spyOn(Patient, 'find').mockResolvedValue([mockPatient]);

    const req = {
      user: { id: staffId.toString() },
      query: { page: '1', limit: '10' }
    };
    let responseData;
    const res = {
      json: jest.fn(data => { responseData = data; })
    };

    await pharmacyController.getDispensingHistory(req, res);

    expect(res.json).toHaveBeenCalled();
    expect(responseData).toBeDefined();
    expect(Array.isArray(responseData.data)).toBe(true);
    expect(responseData.data.length).toBe(1);

    const record = responseData.data[0];
    expect(record.patientName).toBe(patientFullName);
    expect(record.patientNic).toBeUndefined();
    expect(record.nic).toBeUndefined();
    expect(record.patientNic_bi).toBeUndefined();
    expect(record.nicHash).toBeUndefined();
    if (record.prescriptionId && typeof record.prescriptionId === 'object') {
      expect(record.prescriptionId.patientNic).toBeUndefined();
    }
  });

  test('getReceipt returns patientName and strips all patientNic / nic plaintext fields', async () => {
    const mockSelect = {
      select: jest.fn().mockResolvedValue({
        _id: staffId,
        pharmacyId,
        role: 'pharmacist',
        isActive: true
      })
    };
    jest.spyOn(PharmacyStaff, 'findById').mockReturnValue(mockSelect);

    const mockDispensingRecord = {
      _id: new mongoose.Types.ObjectId(),
      receiptNumber: 'REC-PRIVACY-01',
      prescriptionId: {
        _id: prescriptionId,
        prescriptionId: 'RX-PRIVACY-01',
        consultationRef: 'CON-123456',
        drugName: 'Amoxicillin 500mg',
        status: 'dispensed',
        isOTC: false,
        patientNic,
        doctorId: { fullName: 'Dr. Silva' }
      },
      patientNic,
      pharmacyId: { name: 'City Care Pharmacy', address: '123 Main St', phone: '0112345678' },
      staffId: { fullName: 'Sunil Pharmacist', role: 'pharmacist' },
      items: [{
        drugName: 'Amoxicillin 500mg',
        dosage: '500mg TDS',
        quantityDispensed: 15,
        unit: 'tablets',
        status: 'dispensed'
      }],
      toObject: function() { return { ...this }; }
    };

    const mockFindOneQuery = {
      populate: jest.fn().mockReturnThis()
    };
    // 3 populates in chain
    mockFindOneQuery.populate
      .mockReturnValueOnce(mockFindOneQuery)
      .mockReturnValueOnce(mockFindOneQuery)
      .mockResolvedValueOnce(mockDispensingRecord);

    jest.spyOn(Dispensing, 'findOne').mockReturnValue(mockFindOneQuery);

    const mockPatient = {
      nic: patientNic,
      fullName: patientFullName,
      decryptFieldsSync: jest.fn()
    };
    jest.spyOn(Patient, 'find').mockResolvedValue([mockPatient]);

    const req = {
      params: { receiptNo: 'REC-PRIVACY-01' },
      user: { id: staffId.toString() }
    };
    let responseData;
    const res = {
      json: jest.fn(data => { responseData = data; }),
      status: jest.fn().mockReturnThis()
    };

    await pharmacyController.getReceipt(req, res);

    expect(res.json).toHaveBeenCalled();
    expect(responseData).toBeDefined();
    const receipt = responseData.data;
    expect(receipt.patientName).toBe(patientFullName);
    expect(receipt.patientNic).toBeUndefined();
    expect(receipt.nic).toBeUndefined();
    expect(receipt.patientNic_bi).toBeUndefined();
    expect(receipt.nicHash).toBeUndefined();
    if (receipt.prescriptionId && typeof receipt.prescriptionId === 'object') {
      expect(receipt.prescriptionId.patientNic).toBeUndefined();
    }
  });
});
