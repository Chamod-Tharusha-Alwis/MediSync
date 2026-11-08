'use strict';

jest.mock('uuid', () => ({ v4: () => 'mock-uuid-test' }));

const mongoose = require('mongoose');
const surveillanceService = require('../src/services/surveillanceService');
const adminController = require('../src/controllers/adminController');
const alertController = require('../src/controllers/alertController');
const OutbreakAlert = require('../src/models/OutbreakAlert');
const Admin = require('../src/models/Admin');
const AuditLog = require('../src/models/AuditLog');

describe('Task B — Outbreak Alert Lifecycle, Authorization & Audit Logging', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. canReviewSimulation authorization logic', () => {
    test('allows real active admin without any synthetic flags', async () => {
      const adminId = new mongoose.Types.ObjectId().toString();
      jest.spyOn(Admin.collection, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(adminId),
        role: 'admin',
        isActive: true,
        // Notice: ZERO synthetic flags here (real production admin)
      });

      const allowed = await surveillanceService.canReviewSimulation({
        id: adminId,
        role: 'admin'
      });
      expect(allowed).toBe(true);
    });

    test('allows super_admin and health_officer roles', async () => {
      const superAdminId = new mongoose.Types.ObjectId().toString();
      jest.spyOn(Admin.collection, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(superAdminId),
        role: 'super_admin',
        isActive: true
      });

      expect(await surveillanceService.canReviewSimulation({ id: superAdminId, role: 'super_admin' })).toBe(true);
      expect(await surveillanceService.canReviewSimulation({ id: superAdminId, role: 'health_officer' })).toBe(true);
    });

    test('rejects deactivated/inactive admin accounts', async () => {
      const inactiveAdminId = new mongoose.Types.ObjectId().toString();
      jest.spyOn(Admin.collection, 'findOne').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(inactiveAdminId),
        role: 'admin',
        isActive: false
      });

      const allowed = await surveillanceService.canReviewSimulation({
        id: inactiveAdminId,
        role: 'admin'
      });
      expect(allowed).toBe(false);
    });

    test('rejects non-administrative roles (doctor, patient, pharmacist)', async () => {
      expect(await surveillanceService.canReviewSimulation({ id: '123', role: 'doctor' })).toBe(false);
      expect(await surveillanceService.canReviewSimulation({ id: '123', role: 'patient' })).toBe(false);
      expect(await surveillanceService.canReviewSimulation({ id: '123', role: 'pharmacist' })).toBe(false);
    });

    test('allows synthetic reviewer user even in offline/mock environment', async () => {
      const allowed = await surveillanceService.canReviewSimulation({
        id: 'mock-synthetic-id',
        role: 'admin',
        isSynthetic: true
      });
      expect(allowed).toBe(true);
    });
  });

  describe('2. verifyAlertStatus (Confirm and False Alarm)', () => {
    test('confirms an active alert and records ALERT_CONFIRMED audit log', async () => {
      const alertId = new mongoose.Types.ObjectId().toString();
      const mockAlert = {
        _id: alertId,
        disease: 'Dengue Fever',
        status: 'Active',
        feedbackStatus: 'unverified',
        surveillancePolicy: surveillanceService.POLICY,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(OutbreakAlert, 'findById').mockResolvedValue(mockAlert);
      const auditSpy = jest.spyOn(AuditLog, 'create').mockResolvedValue(true);

      const req = {
        params: { id: alertId },
        body: { feedbackStatus: 'confirmed' },
        user: { id: 'admin-1', role: 'admin' }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await alertController.verifyAlertStatus(req, res);

      expect(mockAlert.feedbackStatus).toBe('confirmed');
      expect(mockAlert.status).toBe('Active');
      expect(mockAlert.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Alert feedback recorded successfully'
      }));
      expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
        actorId: 'admin-1',
        actorRole: 'admin',
        action: 'ALERT_CONFIRMED',
        accessedNic: alertId
      }));
    });

    test('marks active alert as false alarm (auto-resolves) and records ALERT_FALSE_ALARM audit log', async () => {
      const alertId = new mongoose.Types.ObjectId().toString();
      const mockAlert = {
        _id: alertId,
        disease: 'Cholera',
        status: 'Active',
        feedbackStatus: 'unverified',
        surveillancePolicy: surveillanceService.POLICY,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(OutbreakAlert, 'findById').mockResolvedValue(mockAlert);
      const auditSpy = jest.spyOn(AuditLog, 'create').mockResolvedValue(true);

      const req = {
        params: { id: alertId },
        body: { feedbackStatus: 'false_positive' },
        user: { id: 'admin-1', role: 'admin' }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await alertController.verifyAlertStatus(req, res);

      expect(mockAlert.feedbackStatus).toBe('false_positive');
      expect(mockAlert.status).toBe('Resolved');
      expect(mockAlert.save).toHaveBeenCalled();
      expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
        action: 'ALERT_FALSE_ALARM',
        accessedNic: alertId
      }));
    });

    test('rejects feedback on an already Resolved or Dismissed alert with 409', async () => {
      const alertId = new mongoose.Types.ObjectId().toString();
      const mockAlert = {
        _id: alertId,
        status: 'Resolved',
        feedbackStatus: 'confirmed',
        surveillancePolicy: surveillanceService.POLICY
      };

      jest.spyOn(OutbreakAlert, 'findById').mockResolvedValue(mockAlert);

      const req = {
        params: { id: alertId },
        body: { feedbackStatus: 'confirmed' },
        user: { id: 'admin-1', role: 'admin' }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await alertController.verifyAlertStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Alert is already in a terminal state.'
      }));
    });

    test('rejects invalid feedback status with 400', async () => {
      const req = {
        params: { id: 'alert-1' },
        body: { feedbackStatus: 'invalid_status' },
        user: { id: 'admin-1', role: 'admin' }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await alertController.verifyAlertStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Invalid feedback status'
      }));
    });
  });

  describe('3. resolveAlert (Resolve after Confirm and Dismiss)', () => {
    test('successfully resolves a Confirmed alert and records ALERT_RESOLVED audit log', async () => {
      const alertId = new mongoose.Types.ObjectId().toString();
      const mockAlert = {
        _id: alertId,
        disease: 'Dengue Fever',
        status: 'Active',
        feedbackStatus: 'confirmed',
        surveillancePolicy: surveillanceService.POLICY,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(OutbreakAlert, 'findById').mockResolvedValue(mockAlert);
      const auditSpy = jest.spyOn(AuditLog, 'create').mockResolvedValue(true);

      const req = {
        params: { id: alertId },
        body: { action: 'resolve' },
        user: { id: 'admin-colombo', role: 'admin' }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await adminController.resolveAlert(req, res);

      expect(mockAlert.status).toBe('Resolved');
      expect(mockAlert.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Alert resolved successfully'
      }));
      expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
        actorId: 'admin-colombo',
        actorRole: 'admin',
        action: 'ALERT_RESOLVED',
        accessedNic: alertId
      }));
    });

    test('successfully dismisses an alert and records ALERT_DISMISSED audit log', async () => {
      const alertId = new mongoose.Types.ObjectId().toString();
      const mockAlert = {
        _id: alertId,
        disease: 'Influenza',
        status: 'Active',
        feedbackStatus: 'unverified',
        surveillancePolicy: surveillanceService.POLICY,
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(OutbreakAlert, 'findById').mockResolvedValue(mockAlert);
      const auditSpy = jest.spyOn(AuditLog, 'create').mockResolvedValue(true);

      const req = {
        params: { id: alertId },
        body: { action: 'dismiss' },
        user: { id: 'admin-1', role: 'admin' }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await adminController.resolveAlert(req, res);

      expect(mockAlert.status).toBe('Dismissed');
      expect(mockAlert.save).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Alert dismissed successfully'
      }));
      expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
        action: 'ALERT_DISMISSED',
        accessedNic: alertId
      }));
    });

    test('rejects resolving an already Resolved or Dismissed alert with 409', async () => {
      const alertId = new mongoose.Types.ObjectId().toString();
      const mockAlert = {
        _id: alertId,
        status: 'Resolved',
        feedbackStatus: 'confirmed',
        surveillancePolicy: surveillanceService.POLICY
      };

      jest.spyOn(OutbreakAlert, 'findById').mockResolvedValue(mockAlert);

      const req = {
        params: { id: alertId },
        body: { action: 'resolve' },
        user: { id: 'admin-1', role: 'admin' }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await adminController.resolveAlert(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Alert is already in a terminal state.'
      }));
    });

    test('rejects invalid action with 400', async () => {
      const alertId = new mongoose.Types.ObjectId().toString();
      const mockAlert = {
        _id: alertId,
        status: 'Active',
        feedbackStatus: 'unverified',
        surveillancePolicy: surveillanceService.POLICY
      };

      jest.spyOn(OutbreakAlert, 'findById').mockResolvedValue(mockAlert);

      const req = {
        params: { id: alertId },
        body: { action: 'explode' },
        user: { id: 'admin-1', role: 'admin' }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await adminController.resolveAlert(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Invalid resolution action.'
      }));
    });

    test('rejects non-admin role with 403', async () => {
      const alertId = new mongoose.Types.ObjectId().toString();
      const mockAlert = {
        _id: alertId,
        status: 'Active',
        feedbackStatus: 'unverified',
        surveillancePolicy: surveillanceService.POLICY
      };
      jest.spyOn(OutbreakAlert, 'findById').mockResolvedValue(mockAlert);

      const req = {
        params: { id: alertId },
        body: { action: 'resolve' },
        user: { id: 'user-doc', role: 'doctor' }
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      await adminController.resolveAlert(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Administrator review required.'
      }));
    });
  });
});
