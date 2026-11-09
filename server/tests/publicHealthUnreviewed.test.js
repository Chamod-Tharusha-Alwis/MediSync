'use strict';
jest.mock('uuid', () => ({ v4: () => require('crypto').randomUUID() }));

const mongoose = require('mongoose');

describe('Task P11-F: Public Health 503 & Alerts 401 Fixes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/alerts/active is public and rate-limited', () => {
    test('alertRoutes exposes /active without authentication middleware requirement', () => {
      const alertRoutes = require('../src/routes/alertRoutes');
      const activeLayer = alertRoutes.stack.find(layer => layer.route && layer.route.path === '/active');
      expect(activeLayer).toBeDefined();
      expect(activeLayer.route.methods.get).toBe(true);

      // Verify layer stack contains rate limiter and controller, but not auth guard
      const middlewareNames = activeLayer.route.stack.map(s => s.name || s.handle.name);
      expect(activeLayer.route.stack.length).toBe(2);
      expect(middlewareNames).not.toContain('verifiedAuth');
    });

    test('getActiveAlerts returns empty data array for unauthenticated visitor without throwing 401', async () => {
      const alertController = require('../src/controllers/alertController');
      const req = { user: undefined, query: {} };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      await alertController.getActiveAlerts(req, res);
      expect(res.json).toHaveBeenCalledWith({ data: [] });
    });
  });

  describe('GET /api/public/health-stats returns 200 with 0 verified and awaitingReview count', () => {
    const reporting = require('../src/services/publicHealthStats');

    test('aggregatePublicCases returns state ok and awaitingReviewCount for unreviewed real consultations', () => {
      const now = new Date('2026-11-04T12:00:00.000Z');
      const unreviewedRows = [
        {
          _id: '000000000000000000000001',
          patientId: '000000000000000000001001',
          createdAt: new Date('2026-11-03T10:00:00Z'),
          district: 'Colombo',
          icdCode: 'A90',
          icdVersion: 'ICD-10'
          // surveillanceVerification is undefined
        },
        {
          _id: '000000000000000000000002',
          patientId: '000000000000000000001002',
          createdAt: new Date('2026-11-03T11:00:00Z'),
          district: 'Gampaha',
          icdCode: 'A90',
          icdVersion: 'ICD-10',
          surveillanceVerification: { status: 'pending' }
        }
      ];

      const result = reporting.aggregatePublicCases(unreviewedRows, { now });
      expect(result.totalCases).toBe(0);
      expect(result.verifiedCases).toBe(0);
      expect(result.awaitingReviewCount).toBe(2);
      expect(result.state).toBe('awaiting_review');
      expect(result.byDistrict).toEqual([]);
      expect(result.byDisease).toEqual([]);
      expect(result.trend).toHaveLength(30);
    });
  });

  describe('Admin surveillance review interface (F6)', () => {
    const adminController = require('../src/controllers/adminController');
    const Consultation = require('../src/models/Consultation');

    test('getPendingSurveillanceConsultations retrieves unreviewed records', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([
          { _id: 'c1', district: 'Colombo', diagnosis: 'Dengue' }
        ])
      };
      jest.spyOn(Consultation, 'find').mockReturnValue(mockQuery);

      const req = { user: { id: 'admin1', role: 'admin' } };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      await adminController.getPendingSurveillanceConsultations(req, res);
      expect(res.json).toHaveBeenCalledWith({
        data: [{ _id: 'c1', district: 'Colombo', diagnosis: 'Dengue' }]
      });
    });

    test('reviewSurveillanceConsultation updates verification status to verified', async () => {
      const mockConsultation = {
        _id: new mongoose.Types.ObjectId(),
        district: 'Gampaha',
        createdAt: new Date('2026-11-01'),
        save: jest.fn().mockResolvedValue(true)
      };
      jest.spyOn(Consultation, 'findById').mockResolvedValue(mockConsultation);

      const req = {
        params: { id: String(mockConsultation._id) },
        body: { status: 'verified', diagnosisStatus: 'confirmed' },
        user: { id: 'admin1', role: 'admin' }
      };
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis()
      };

      await adminController.reviewSurveillanceConsultation(req, res);
      expect(mockConsultation.save).toHaveBeenCalled();
      expect(mockConsultation.surveillanceVerification).toMatchObject({
        status: 'verified',
        diagnosisStatus: 'confirmed',
        source: 'clinical_review',
        verifiedBy: 'admin1'
      });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        message: expect.stringContaining('verified')
      }));
    });
  });
});
