'use strict';

/**
 * server/tests/outbreakApprovalDelivery.test.js
 *
 * Regression suite for Fix 1:
 * - Approving with 'none' (Dashboard Only) sets alert to Active.
 * - Approving with 'district' emails district users and sets alert to Active.
 * - Approving with 'national' requires confirmation disease name.
 * - OUTBREAK_EMAIL_DELIVERY_ENABLED kill switch allows approval even when disabled.
 * - Email failure does not roll back approval.
 * - AuditLog captures approval details and email counts.
 * - Recipient preview returns counts.
 */

jest.mock('uuid', () => ({ v4: () => 'uuid-123' }));
const mongoose = require('mongoose');
const adminController = require('../src/controllers/adminController');
const OutbreakAlert = require('../src/models/OutbreakAlert');
const AuditLog = require('../src/models/AuditLog');
const surveillanceService = require('../src/services/surveillanceService');
const emailService = require('../src/utils/emailService');

jest.mock('../src/models/OutbreakAlert');
jest.mock('../src/models/AuditLog');
jest.mock('../src/utils/emailService');
jest.mock('../src/services/notificationService', () => ({
  notifyOutbreakAlert: jest.fn().mockResolvedValue({}),
}));

describe('Fix 1 — Outbreak Alert Approval & Scoped Notification Delivery', () => {
  const dummyAlertId = new mongoose.Types.ObjectId();
  const mockAlertDoc = {
    _id: dummyAlertId,
    disease: 'Dengue',
    location: 'Gampaha',
    district: 'Gampaha',
    severity: 'Critical',
    status: 'Pending',
    surveillancePolicy: surveillanceService.POLICY,
    isSimulation: false,
    isDemoData: false,
    save: jest.fn().mockResolvedValue(true),
  };

  const mockAdminUser = {
    id: new mongoose.Types.ObjectId().toString(),
    role: 'admin',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OUTBREAK_EMAIL_DELIVERY_ENABLED = 'true';
    OutbreakAlert.findById = jest.fn().mockResolvedValue({ ...mockAlertDoc });
    AuditLog.create = jest.fn().mockResolvedValue({});
  });

  afterAll(() => {
    delete process.env.OUTBREAK_EMAIL_DELIVERY_ENABLED;
  });

  test('1. Approving with No Emails (Dashboard Only) succeeds and sets status to Active', async () => {
    const updatedAlert = { ...mockAlertDoc, status: 'Active', emailScope: 'none' };
    OutbreakAlert.findOneAndUpdate = jest.fn().mockResolvedValue(updatedAlert);

    const req = {
      params: { id: dummyAlertId.toString() },
      body: { emailScope: 'none' },
      user: mockAdminUser,
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await adminController.approveAlert(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Review recorded'),
        data: expect.objectContaining({ status: 'Active', emailScope: 'none' }),
      })
    );
    expect(emailService.sendOutbreakAlert).not.toHaveBeenCalled();
  });

  test('2. Approving with District Only emails district users and sets status to Active', async () => {
    const updatedAlert = { ...mockAlertDoc, status: 'Active', emailScope: 'district' };
    OutbreakAlert.findOneAndUpdate = jest.fn().mockResolvedValue(updatedAlert);

    const delivery = require('../src/services/outbreakNotificationDelivery');
    jest.spyOn(delivery, 'resolveOutbreakRecipients').mockResolvedValue({
      recipients: [{ email: 'doc@gampaha.lk', role: 'doctor', district: 'Gampaha' }],
      totalFound: 1,
      capped: false,
      district: 'Gampaha',
      maxCap: 100,
    });
    jest.spyOn(delivery, 'sendOutbreakAdvisoryEmail').mockResolvedValue({
      sentCount: 1,
      failedCount: 0,
      errors: [],
    });

    const req = {
      params: { id: dummyAlertId.toString() },
      body: { emailScope: 'district' },
      user: mockAdminUser,
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await adminController.approveAlert(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'Active' }),
        emailDelivery: expect.objectContaining({
          attempted: true,
          sentCount: 1,
          failedCount: 0,
        }),
      })
    );

    expect(AuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ALERT_APPROVED',
        details: expect.objectContaining({
          emailScope: 'district',
          sentCount: 1,
        }),
      })
    );

    delivery.resolveOutbreakRecipients.mockRestore();
    delivery.sendOutbreakAdvisoryEmail.mockRestore();
  });

  test('3. Kill switch OUTBREAK_EMAIL_DELIVERY_ENABLED=false does not fail approval, marks as dashboard-only', async () => {
    process.env.OUTBREAK_EMAIL_DELIVERY_ENABLED = 'false';

    const updatedAlert = { ...mockAlertDoc, status: 'Active', emailScope: 'none' };
    OutbreakAlert.findOneAndUpdate = jest.fn().mockResolvedValue(updatedAlert);

    const req = {
      params: { id: dummyAlertId.toString() },
      body: { emailScope: 'district' },
      user: mockAdminUser,
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await adminController.approveAlert(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('External email delivery is disabled; alert activated as dashboard-only'),
        data: expect.objectContaining({ status: 'Active' }),
        emailDelivery: expect.objectContaining({
          skipped: true,
          reason: 'OUTBREAK_EMAIL_DELIVERY_DISABLED',
        }),
      })
    );
  });

  test('4. Nationwide approval without typing disease name fails with 400', async () => {
    const req = {
      params: { id: dummyAlertId.toString() },
      body: { emailScope: 'national', confirmationDisease: 'WrongName' },
      user: mockAdminUser,
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await adminController.approveAlert(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'NATIONWIDE_CONFIRMATION_REQUIRED',
      })
    );
  });

  test('5. Nationwide approval with matching disease name succeeds', async () => {
    const updatedAlert = { ...mockAlertDoc, status: 'Active', emailScope: 'national' };
    OutbreakAlert.findOneAndUpdate = jest.fn().mockResolvedValue(updatedAlert);

    const delivery = require('../src/services/outbreakNotificationDelivery');
    jest.spyOn(delivery, 'resolveOutbreakRecipients').mockResolvedValue({
      recipients: [{ email: 'national@medisync.lk', role: 'doctor', district: 'National' }],
      totalFound: 1,
      capped: false,
      district: 'National',
      maxCap: 100,
    });
    jest.spyOn(delivery, 'sendOutbreakAdvisoryEmail').mockResolvedValue({
      sentCount: 1,
      failedCount: 0,
      errors: [],
    });

    const req = {
      params: { id: dummyAlertId.toString() },
      body: { emailScope: 'national', confirmationDisease: 'Dengue' },
      user: mockAdminUser,
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await adminController.approveAlert(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'Active' }),
      })
    );

    delivery.resolveOutbreakRecipients.mockRestore();
    delivery.sendOutbreakAdvisoryEmail.mockRestore();
  });

  test('6. Email dispatch failure does NOT roll back approval', async () => {
    const updatedAlert = { ...mockAlertDoc, status: 'Active', emailScope: 'district' };
    OutbreakAlert.findOneAndUpdate = jest.fn().mockResolvedValue(updatedAlert);

    const delivery = require('../src/services/outbreakNotificationDelivery');
    jest.spyOn(delivery, 'resolveOutbreakRecipients').mockResolvedValue({
      recipients: [{ email: 'fail@gampaha.lk', role: 'doctor', district: 'Gampaha' }],
      totalFound: 1,
      capped: false,
      district: 'Gampaha',
      maxCap: 100,
    });
    jest.spyOn(delivery, 'sendOutbreakAdvisoryEmail').mockRejectedValue(new Error('SMTP_CONNECTION_REFUSED'));

    const req = {
      params: { id: dummyAlertId.toString() },
      body: { emailScope: 'district' },
      user: mockAdminUser,
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await adminController.approveAlert(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'Active' }),
        emailDelivery: expect.objectContaining({
          attempted: true,
          failedCount: 1,
        }),
      })
    );

    delivery.resolveOutbreakRecipients.mockRestore();
    delivery.sendOutbreakAdvisoryEmail.mockRestore();
  });

  test('7. Recipient preview endpoint returns eligible audience and cap', async () => {
    const delivery = require('../src/services/outbreakNotificationDelivery');
    jest.spyOn(delivery, 'resolveOutbreakRecipients').mockResolvedValue({
      recipients: Array(15).fill({ email: 'u@gampaha.lk' }),
      totalFound: 15,
      capped: false,
      district: 'Gampaha',
      maxCap: 100,
    });

    const req = {
      params: { id: dummyAlertId.toString() },
      query: { scope: 'district' },
      user: mockAdminUser,
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await adminController.previewOutbreakRecipients(req, res);

    expect(res.json).toHaveBeenCalledWith({
      scope: 'district',
      district: 'Gampaha',
      recipientCount: 15,
      totalEligible: 15,
      capped: false,
      maxCap: 100,
      deliveryEnabled: true,
    });

    delivery.resolveOutbreakRecipients.mockRestore();
  });
});
