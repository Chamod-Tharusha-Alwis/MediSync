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
const emailService = require('../src/utils/emailService');

const Admin = require('../src/models/Admin');
const Doctor = require('../src/models/Doctor');
const Patient = require('../src/models/Patient');
const OutbreakAlert = require('../src/models/OutbreakAlert');
const BroadcastMessage = require('../src/models/BroadcastMessage');
const Notification = require('../src/models/Notification');
const SessionToken = require('../src/models/SessionToken');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/admin', require('../src/routes/adminRoutes'));
  app.use('/api/alert', require('../src/routes/alertRoutes'));
  return app;
}

describe('Stage 6 — Multi-Disease Outbreak Monitoring & Broadcast Safety Suite', () => {
  let app;
  let adminToken;
  let doctorToken;
  let adminSessionId;
  let doctorSessionId;

  let testAdmin;
  let testDoctor;

  const createdAlertIds = [];
  const createdBroadcastIds = [];
  const createdNotificationIds = [];

  beforeAll(async () => {
    await connectAutomatedTestDB();
    app = buildApp();

    // 1. Fetch synthetic Admin
    testAdmin = await qa.clone(Admin, {email:'superadmin@demo.medisync.local'});
    if (!testAdmin) throw new Error('No synthetic demo admin found');

    adminToken = jwt.sign(
      { id: testAdmin._id.toString(), email: testAdmin.email, role: testAdmin.role || 'admin', isVerified: true },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const adminHash = crypto.createHash('sha256').update(adminToken).digest('hex');
    const aSession = await SessionToken.create({
      userId: testAdmin._id,
      userModel: 'Admin',
      tokenHash: adminHash,
      isValid: true,
      expiredAt: new Date(Date.now() + 3600 * 1000)
    });
    adminSessionId = aSession._id;

    // 2. Fetch synthetic Doctor (non-admin for RBAC tests)
    testDoctor = await qa.clone(Doctor, { email: 'dr.silva@demo.medisync.local' });
    if (!testDoctor) throw new Error('No synthetic demo doctor found');

    doctorToken = jwt.sign(
      { id: testDoctor._id.toString(), email: testDoctor.email, role: 'doctor', isVerified: true },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const docHash = crypto.createHash('sha256').update(doctorToken).digest('hex');
    const dSession = await SessionToken.create({
      userId: testDoctor._id,
      userModel: 'Doctor',
      tokenHash: docHash,
      isValid: true,
      expiredAt: new Date(Date.now() + 3600 * 1000)
    });
    doctorSessionId = dSession._id;
  });

  afterAll(async () => { try { await qa.cleanup(); } finally { await mongoose.disconnect(); } });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Tripartite Surveillance Taxonomy: Danger vs Outbreak Risk vs Priority
  // ─────────────────────────────────────────────────────────────────────────────
  test('1. Outbreak alerts record Disease Danger, Outbreak Risk, and Response Priority', async () => {
    // High Danger disease (Dengue) + High Surge
    const highAlert = await OutbreakAlert.create({
      isSimulation:true,isDemoData:true,surveillancePolicy:require('../src/services/surveillanceService').POLICY,
      disease: 'Dengue',
      location: 'Colombo',
      affectedCount: 45,
      severity: 'High',
      dangerLevel: 'High',
      riskLevel: 'High',
      responsePriority: 'P1-Critical',
      status: 'Pending',
      message: 'Surge in Dengue cases detected in Colombo district.'
    });
    createdAlertIds.push(highAlert._id);

    expect(highAlert.dangerLevel).toBe('High');
    expect(highAlert.riskLevel).toBe('High');
    expect(highAlert.responsePriority).toBe('P1-Critical');
    expect(highAlert.status).toBe('Pending');

    // Medium Danger disease (Gastroenteritis) + Medium Surge
    const medAlert = await OutbreakAlert.create({
      isSimulation:true,isDemoData:true,surveillancePolicy:require('../src/services/surveillanceService').POLICY,
      disease: 'Gastroenteritis',
      location: 'Kandy',
      affectedCount: 35,
      severity: 'Moderate',
      dangerLevel: 'Medium',
      riskLevel: 'Medium',
      responsePriority: 'P3-Moderate',
      status: 'Pending',
      message: 'Elevated Gastroenteritis cases detected in Kandy district.'
    });
    createdAlertIds.push(medAlert._id);

    expect(medAlert.dangerLevel).toBe('Medium');
    expect(medAlert.riskLevel).toBe('Medium');
    expect(medAlert.responsePriority).toBe('P3-Moderate');

    // Low Danger disease (Common Cold) — Capped severity
    const lowAlert = await OutbreakAlert.create({
      isSimulation:true,isDemoData:true,surveillancePolicy:require('../src/services/surveillanceService').POLICY,
      disease: 'Common Cold',
      location: 'Galle',
      affectedCount: 120,
      severity: 'Moderate',
      dangerLevel: 'Low',
      riskLevel: 'Medium',
      responsePriority: 'P4-Advisory',
      status: 'Pending',
      message: 'Seasonal increase in Common Cold cases reported in Galle.'
    });
    createdAlertIds.push(lowAlert._id);

    expect(lowAlert.dangerLevel).toBe('Low');
    expect(lowAlert.severity).not.toBe('Critical');
    expect(lowAlert.responsePriority).toBe('P4-Advisory');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Outbreak Alert Approval & Lifecycle Transitions
  // ─────────────────────────────────────────────────────────────────────────────
  test('2. Admin approves pending alert to Active, then transitions to Resolved', async () => {
    const testAlert = await OutbreakAlert.create({
      isSimulation:true,isDemoData:true,surveillancePolicy:require('../src/services/surveillanceService').POLICY,
      disease: 'Cholera',
      location: 'Kalutara',
      affectedCount: 15,
      severity: 'High',
      dangerLevel: 'High',
      riskLevel: 'High',
      responsePriority: 'P1-Critical',
      status: 'Pending',
      message: 'Urgent: Waterborne Cholera cluster reported in Kalutara.'
    });
    createdAlertIds.push(testAlert._id);

    // 2A: Non-admin attempt to approve alert should be blocked (403)
    const nonAdminApprove = await request(app)
      .put(`/api/admin/outbreak/${testAlert._id}/approve`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ emailScope: 'none' });

    expect(nonAdminApprove.status).toBe(403);

    // 2B: Admin approves alert (transitions from Pending -> Active)
    emailService.__clearCapturedTestEmails();
    const adminApprove = await request(app)
      .put(`/api/admin/outbreak/${testAlert._id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ emailScope: 'none' });

    expect(adminApprove.status).toBe(200);
    expect(adminApprove.body).toHaveProperty('data');
    expect(adminApprove.body.data.status).toBe('Active');

    expect(emailService.__getCapturedTestEmails()).toHaveLength(0);
    // Verify DB update
    const activeAlert = await OutbreakAlert.findById(testAlert._id);
    expect(activeAlert.status).toBe('Active');
    expect(activeAlert.approvedBy).toBeDefined();

    // 2C: Admin resolves alert (transitions from Active -> Resolved)
    const resolveRes = await request(app)
      .put(`/api/admin/outbreak/${testAlert._id}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'resolve' });

    expect(resolveRes.status).toBe(200);
    const resolvedAlert = await OutbreakAlert.findById(testAlert._id);
    expect(resolvedAlert.status).toBe('Resolved');
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Public Health Broadcast Safety & Mocked Notification Dispatch
  // ─────────────────────────────────────────────────────────────────────────────
  test('3. Enforces Admin RBAC for public health broadcasts and dispatches safely via mock', async () => {
    // 3A: Non-admin role (doctor) cannot broadcast public health alert
    const unauthorizedBroadcast = await request(app)
      .post('/api/alert/broadcast')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        district: 'Colombo',
        title: 'Unauthorized Alert',
        message: 'This should fail RBAC authorization.'
      });

    expect(unauthorizedBroadcast.status).toBe(403);

    // 3B: Admin broadcasts public health alert
    emailService.__clearCapturedTestEmails();
    const broadcastRes = await request(app)
      .post('/api/alert/broadcast')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        district: 'Colombo',
        title: 'Public Health Vector Control Advisory',
        message: 'Intensified mosquito fogging and larval inspection scheduled across Colombo district.',
        targetRole: 'patient',
        zScore: 2.5
      });

    // The repaired delivery gate must reject even authorized broadcast attempts.
    expect(broadcastRes.status).toBe(409);
    expect(broadcastRes.body.error).toMatch(/disabled/i);
    expect(emailService.__getCapturedTestEmails()).toHaveLength(0);
    expect(await BroadcastMessage.countDocuments({phase5xOwner:qa.owner})).toBe(0);
    expect(await Notification.countDocuments({phase5xOwner:qa.owner})).toBe(0);
  });
});
