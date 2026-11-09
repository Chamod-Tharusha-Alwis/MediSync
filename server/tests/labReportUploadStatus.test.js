'use strict';
const crypto = require('crypto');
const path = require('path');

// Helper to construct mock res
function mockResponse() {
  const res = {};
  res.statusCode = 200;
  res.body = null;
  res.status = jest.fn(code => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn(payload => {
    res.body = payload;
    return res;
  });
  return res;
}

describe('Lab Report Upload Idempotency & Status Propagation (P11-B)', () => {
  const hospitalId = '000000000000000000000001';
  const labTestId = 'LT-20261109-4514';
  const validPdfBuffer = Buffer.from('%PDF-1.4 synthetic lab report content ' + crypto.randomBytes(16).toString('hex'));
  const validPdfSha256 = crypto.createHash('sha256').update(validPdfBuffer).digest('hex');

  let labController;
  const originalKeys = global.ENCRYPTION_KEYS;
  const originalActive = global.ACTIVE_KEY_VERSION;

  beforeAll(() => {
    global.ACTIVE_KEY_VERSION = 1;
    global.ENCRYPTION_KEYS = { '1': crypto.randomBytes(32).toString('hex') };
    global.ENCRYPTION_KEY = global.ENCRYPTION_KEYS['1'];
  });

  afterAll(() => {
    global.ENCRYPTION_KEYS = originalKeys;
    global.ACTIVE_KEY_VERSION = originalActive;
  });

  beforeEach(() => {
    jest.resetModules();
    const recipientLanguageService = require('../src/services/recipientLanguageService');
    jest.spyOn(recipientLanguageService, 'clinicalPatientForRecord').mockResolvedValue({
      email: 'patient@example.com',
      fullName: 'Test Patient'
    });
    labController = require('../src/controllers/labController');
  });

  test('re-uploading identical PDF buffer returns 200 with idempotent flag', async () => {
    const existingTest = {
      _id: '507f1f77bcf86cd799439011',
      labTestId,
      hospitalId,
      status: 'report_ready',
      reportPublicId: 'medisync/lab-reports/507f1f77bcf86cd799439011/abc123',
      reportSha256: validPdfSha256,
      save: jest.fn()
    };

    const LabTestModel = require('../src/models/LabTest');
    jest.spyOn(LabTestModel, 'findOne').mockResolvedValue(existingTest);

    const req = {
      user: { id: hospitalId, role: 'hospital_admin' },
      params: { labTestId },
      file: {
        buffer: validPdfBuffer,
        originalname: 'report.pdf'
      }
    };
    const res = mockResponse();

    await labController.uploadReport(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.body).toMatchObject({
      message: expect.stringContaining('idempotent'),
      idempotent: true,
      labTestId,
      status: 'report_ready'
    });
    expect(existingTest.save).not.toHaveBeenCalled();
  });

  test('uploading a different PDF to an already completed test returns 409 REPORT_ALREADY_EXISTS', async () => {
    const existingTest = {
      _id: '507f1f77bcf86cd799439011',
      labTestId,
      hospitalId,
      status: 'report_ready',
      reportPublicId: 'medisync/lab-reports/507f1f77bcf86cd799439011/abc123',
      reportSha256: validPdfSha256
    };

    const LabTestModel = require('../src/models/LabTest');
    jest.spyOn(LabTestModel, 'findOne').mockResolvedValue(existingTest);

    const differentPdfBuffer = Buffer.from('%PDF-1.4 different report content ' + crypto.randomBytes(16).toString('hex'));

    const req = {
      user: { id: hospitalId, role: 'hospital_admin' },
      params: { labTestId },
      file: {
        buffer: differentPdfBuffer,
        originalname: 'different_report.pdf'
      }
    };
    const res = mockResponse();

    await labController.uploadReport(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.body).toMatchObject({
      error: 'REPORT_ALREADY_EXISTS',
      message: 'A report is already attached to this test.'
    });
  });

  test('uploading non-PDF file returns 400 INVALID_PDF', async () => {
    const existingTest = {
      _id: '507f1f77bcf86cd799439011',
      labTestId,
      hospitalId,
      status: 'Approved'
    };

    const LabTestModel = require('../src/models/LabTest');
    jest.spyOn(LabTestModel, 'findOne').mockResolvedValue(existingTest);

    const req = {
      user: { id: hospitalId, role: 'hospital_admin' },
      params: { labTestId },
      file: {
        buffer: Buffer.from('NOT A PDF FILE'),
        originalname: 'malformed.txt'
      }
    };
    const res = mockResponse();

    await labController.uploadReport(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toMatchObject({
      error: 'INVALID_PDF',
      message: 'Invalid PDF file'
    });
  });

  test('uploading report to an unapproved pending test returns 409 LAB_TEST_NOT_APPROVED', async () => {
    const pendingTest = {
      _id: '507f1f77bcf86cd799439011',
      labTestId,
      hospitalId,
      status: 'pending'
    };

    const LabTestModel = require('../src/models/LabTest');
    jest.spyOn(LabTestModel, 'findOne').mockResolvedValue(pendingTest);

    const req = {
      user: { id: hospitalId, role: 'hospital_admin' },
      params: { labTestId },
      file: {
        buffer: validPdfBuffer,
        originalname: 'report.pdf'
      }
    };
    const res = mockResponse();

    await labController.uploadReport(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.body).toMatchObject({
      error: 'LAB_TEST_NOT_APPROVED',
      message: 'Lab test must be approved before report upload'
    });
  });

  test('first upload to an approved test successfully records reportSha256 and transitions to report_ready', async () => {
    const approvedTest = {
      _id: '507f1f77bcf86cd799439011',
      labTestId,
      hospitalId,
      status: 'Approved',
      statusHistory: [],
      patientId: '507f1f77bcf86cd799439099',
      patientNic: '199012345678',
      testName: 'Full Blood Count',
      save: jest.fn().mockResolvedValue(true)
    };

    const LabTestModel = require('../src/models/LabTest');
    jest.spyOn(LabTestModel, 'findOne').mockResolvedValue(approvedTest);

    const cloudinary = require('cloudinary').v2;
    jest.spyOn(cloudinary.uploader, 'upload_stream').mockImplementation((options, callback) => ({
      end() {
        callback(null, {
          public_id: options.public_id,
          secure_url: 'https://res.cloudinary.com/synthetic/' + options.public_id
        });
      }
    }));

    const labCommitService = require('../src/services/labCommitService');
    jest.spyOn(labCommitService, 'saveLabChange').mockResolvedValue(true);

    const emailService = require('../src/utils/emailService');
    jest.spyOn(emailService, 'sendLabReportAvailableEmail').mockResolvedValue(true);
    jest.spyOn(emailService, 'sendEmail').mockResolvedValue(true);

    const req = {
      user: { id: hospitalId, role: 'hospital_admin' },
      params: { labTestId },
      file: {
        buffer: validPdfBuffer,
        originalname: 'fbc_report.pdf'
      },
      app: { get: () => null }
    };
    const res = mockResponse();

    await labController.uploadReport(req, res);

    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(approvedTest.status).toBe('report_ready');
    expect(approvedTest.reportSha256).toBe(validPdfSha256);
    expect(approvedTest.reportOriginalName).toBe('fbc_report.pdf');
    expect(approvedTest.reportUploadedAt).toBeInstanceOf(Date);
  });
});
