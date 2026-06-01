const request = require('supertest');
const express = require('express');

// Mock external services
jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload_stream: jest.fn((options, callback) => {
        // Return a dummy stream that immediately calls the callback
        const { Writable } = require('stream');
        const stream = new Writable({
          write(chunk, encoding, next) {
            next();
          },
          final(next) {
            callback(null, { secure_url: 'https://res.cloudinary.com/demo/image/upload/v1234/test.pdf' });
            next();
          }
        });
        return stream;
      }),
    },
  },
}));

jest.mock('axios');
jest.mock('../src/utils/email', () => ({
  sendEmail: jest.fn().mockResolvedValue(true),
}));

// We need to mock the Mongoose models to avoid hitting the real database
const mockLabTest = {
  labTestId: 'LT-20260527-1234',
  patientNic: '123456789V',
  patientNic_bi: 'hash',
  patientName: 'John Doe',
  patientEmail: 'john@example.com',
  hospitalId: 'hosp123',
  testName: 'Blood Test',
  status: 'pending',
  statusHistory: [],
  reportPath: 'https://res.cloudinary.com/demo/image/upload/v1234/test.pdf',
  save: jest.fn().mockResolvedValue(true)
};

const mockPatient = {
  nic_bi: 'hash',
  name: 'John Doe',
  email: 'john@example.com'
};

jest.mock('../src/models/LabTest', () => ({
  create: jest.fn().mockResolvedValue(mockLabTest),
  findOne: jest.fn().mockResolvedValue(mockLabTest),
  find: jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    populate: jest.fn().mockResolvedValue([mockLabTest]),
  }),
}));

jest.mock('../src/models/Patient', () => ({
  findOne: jest.fn().mockResolvedValue(mockPatient),
}));

jest.mock('../src/models/Consultation', () => ({ find: jest.fn() }));
jest.mock('../src/models/Prescription', () => ({ find: jest.fn() }));

// Create a mock Express app to mount our routes
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mock the auth middleware to inject the requested role
jest.mock('../src/middleware/auth', () => {
  return (allowedRoles) => (req, res, next) => {
    // For testing, we read a special header to decide who the user is
    const mockRole = req.header('X-Mock-Role') || 'hospitalAdmin';
    if (!allowedRoles.includes(mockRole)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    // Inject mock user based on role
    if (mockRole === 'hospitalAdmin') {
      req.user = { userId: 'admin1', hospitalId: 'hosp123', role: 'hospitalAdmin' };
    } else if (mockRole === 'doctor') {
      req.user = { userId: 'doc1', email: 'doctor@test.com', name: 'Strange', role: 'doctor' };
    } else if (mockRole === 'patient') {
      req.user = { userId: 'pat1', nic: '123456789V', role: 'patient' };
    }
    next();
  };
});

const labRoutes = require('../src/routes/labRoutes');
app.use('/api', labRoutes);

// Import axios after mocking it to set up mock return values
const axios = require('axios');

describe('Zero-Trust Lab Module API', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockResolvedValue({ data: Buffer.from('mock encrypted pdf') });
    axios.get.mockResolvedValue({ data: Buffer.from('mock cloudinary pdf') });
  });

  it('1. POST /api/lab/accept - Should allow Hospital Admin to create a lab test', async () => {
    const res = await request(app)
      .post('/api/lab/accept')
      .set('X-Mock-Role', 'hospitalAdmin') // Mock JWT auth equivalent
      .send({
        nic: '123456789V',
        testName: 'Full Blood Count',
        testCategory: 'Haematology',
        urgency: 'routine'
      });

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Lab test registered successfully');
    expect(res.body.labTestId).toBe('LT-20260527-1234');
  });

  it('2. POST /api/lab/:labTestId/upload-report - Should mock Cloudinary upload and return 200', async () => {
    const res = await request(app)
      .post('/api/lab/LT-20260527-1234/upload-report')
      .set('X-Mock-Role', 'hospitalAdmin')
      .attach('report', Buffer.from('dummy pdf content'), 'test.pdf'); // Mock file upload via multer

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Report uploaded and encrypted successfully');
    expect(axios.post).toHaveBeenCalled(); // Should have called ML engine to encrypt
  });

  it('3. POST /api/lab/doctor/request-otp/:labTestId - Should successfully trigger the email function', async () => {
    const { sendEmail } = require('../src/utils/email');
    
    const res = await request(app)
      .post('/api/lab/doctor/request-otp/LT-20260527-1234')
      .set('X-Mock-Role', 'doctor');

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('OTP sent');
    
    // Verify sendEmail was called with the PATIENT's email
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const emailArgs = sendEmail.mock.calls[0][0];
    expect(emailArgs.to).toBe('john@example.com'); // Mock patient email
    expect(emailArgs.html).toContain('Dr. <strong>Strange</strong> is requesting access');
  });

  it('4. GET /api/lab/patient/download/:labTestId - Should allow patient to download the locked PDF', async () => {
    const res = await request(app)
      .get('/api/lab/patient/download/LT-20260527-1234')
      .set('X-Mock-Role', 'patient');

    expect(res.status).toBe(200);
    expect(res.header['content-type']).toBe('application/pdf');
    expect(res.header['content-disposition']).toContain('attachment; filename="LT-20260527-1234_encrypted_report.pdf"');
    
    // Verify we fetched from Cloudinary
    expect(axios.get).toHaveBeenCalledWith('https://res.cloudinary.com/demo/image/upload/v1234/test.pdf', expect.any(Object));
  });

});
