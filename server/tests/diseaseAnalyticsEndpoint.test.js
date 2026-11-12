'use strict';

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const Consultation = require('../src/models/Consultation');
const diseaseAnalyticsService = require('../src/services/diseaseAnalyticsService');
const SessionToken = require('../src/models/SessionToken');
const BanRecord = require('../src/models/BanRecord');
const Admin = require('../src/models/Admin');
const AuditLog = require('../src/models/AuditLog');

describe('Part 4: Per-Disease Surveillance Analytics & Autocomplete Endpoint', () => {
  const JWT_SECRET = 'offline-test-jwt-secret-at-least-32-chars-long';
  process.env.JWT_SECRET = JWT_SECRET;

  const adminId = '507f191e810c19729de860ea';
  const patientId = '507f191e810c19729de860eb';
  let adminToken, patientToken;
  let adminHash, patientHash;
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/admin', require('../src/routes/adminRoutes'));

    adminToken = jwt.sign({ id: adminId, role: 'admin' }, JWT_SECRET, { expiresIn: '1h', algorithm: 'HS256' });
    patientToken = jwt.sign({ id: patientId, role: 'patient' }, JWT_SECRET, { expiresIn: '1h', algorithm: 'HS256' });

    adminHash = crypto.createHash('sha256').update(adminToken).digest('hex');
    patientHash = crypto.createHash('sha256').update(patientToken).digest('hex');
  });

  beforeEach(() => {
    jest.spyOn(Admin, 'findById').mockReturnValue({
      select: () => ({
        lean: async () => ({
          _id: adminId,
          role: 'admin',
          isActive: true,
          isDeleted: false,
          mustChangePassword: false
        })
      })
    });

    jest.spyOn(SessionToken, 'findOne').mockImplementation(async (query) => {
      const hash = query?.tokenHash;
      if (hash === adminHash) {
        return {
          isValid: true,
          userId: adminId,
          userModel: 'Admin',
          logoutAt: null,
          expiredAt: new Date(Date.now() + 3600000),
          save: async () => {}
        };
      }
      if (hash === patientHash) {
        return {
          isValid: true,
          userId: patientId,
          userModel: 'Patient',
          logoutAt: null,
          expiredAt: new Date(Date.now() + 3600000),
          save: async () => {}
        };
      }
      return null;
    });

    jest.spyOn(BanRecord, 'findOne').mockResolvedValue(null);
    jest.spyOn(AuditLog, 'create').mockResolvedValue({});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Autocomplete Search Endpoint (GET /api/admin/analytics/diseases/search)', () => {
    it('returns empty data array when query is shorter than 2 characters', async () => {
      const res = await request(app)
        .get('/api/admin/analytics/diseases/search?q=a')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: [] });
    });

    it('returns matching ICD-10 and ICD-11 concepts for dengue', async () => {
      const res = await request(app)
        .get('/api/admin/analytics/diseases/search?q=dengue&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.some(d => d.version === 'ICD-10')).toBe(true);
      expect(res.body.data.some(d => d.version === 'ICD-11')).toBe(true);
      const icd10Dengue = res.body.data.find(d => d.code === 'A90');
      expect(icd10Dengue).toBeDefined();
      expect(icd10Dengue.displayName).toContain('Dengue');
    });

    it('supports Sinhala and Tamil disease search terms', async () => {
      const resSi = await request(app)
        .get(`/api/admin/analytics/diseases/search?q=${encodeURIComponent('ඩෙංගු')}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(resSi.status).toBe(200);
      expect(resSi.body.data.length).toBeGreaterThan(0);

      const resTa = await request(app)
        .get(`/api/admin/analytics/diseases/search?q=${encodeURIComponent('டெங்கு')}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(resTa.status).toBe(200);
      expect(resTa.body.data.length).toBeGreaterThan(0);
    });

    it('rejects unauthenticated with 401 and non-admin with 403', async () => {
      const unauth = await request(app)
        .get('/api/admin/analytics/diseases/search?q=dengue');
      expect(unauth.status).toBe(401);

      const patientReq = await request(app)
        .get('/api/admin/analytics/diseases/search?q=dengue')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(patientReq.status).toBe(403);
    });
  });

  describe('2. Disease Analytics Query Endpoint (GET /api/admin/analytics/diseases/:code)', () => {
    it('returns 400 for invalid date strings', async () => {
      const res = await request(app)
        .get('/api/admin/analytics/diseases/A90?from=invalid-date&to=2026-11-12')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid date format');
    });

    it('returns 400 when start date is after end date', async () => {
      const res = await request(app)
        .get('/api/admin/analytics/diseases/A90?from=2026-11-15&to=2026-11-10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('start date must be before or equal to end date');
    });

    it('returns 400 when date range exceeds 2 years', async () => {
      const res = await request(app)
        .get('/api/admin/analytics/diseases/A90?from=2023-01-01&to=2026-01-02')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('cannot exceed 2 years');
    });

    it('derives bucket size "hour" for ranges up to 72h', async () => {
      jest.spyOn(Consultation, 'aggregate').mockResolvedValueOnce([
        { byDistrict: [], byCalendarDay: [], byTimeBucket: [], total: [] }
      ]).mockResolvedValueOnce([]);

      const res = await request(app)
        .get('/api/admin/analytics/diseases/A90?from=2026-11-09T00:00:00Z&to=2026-11-12T00:00:00Z')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.range.bucket).toBe('hour');
    });

    it('derives bucket size "day" for ranges up to 92 days', async () => {
      jest.spyOn(Consultation, 'aggregate').mockResolvedValueOnce([
        { byDistrict: [], byCalendarDay: [], byTimeBucket: [], total: [] }
      ]).mockResolvedValueOnce([]);

      const res = await request(app)
        .get('/api/admin/analytics/diseases/A90?from=2026-10-01T00:00:00Z&to=2026-11-12T00:00:00Z')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.range.bucket).toBe('day');
    });

    it('derives bucket size "week" for ranges over 92 days', async () => {
      jest.spyOn(Consultation, 'aggregate').mockResolvedValueOnce([
        { byDistrict: [], byCalendarDay: [], byTimeBucket: [], total: [] }
      ]).mockResolvedValueOnce([]);

      const res = await request(app)
        .get('/api/admin/analytics/diseases/A90?from=2026-01-01T00:00:00Z&to=2026-11-12T00:00:00Z')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.range.bucket).toBe('week');
    });

    it('handles zero-data case with clear empty state message and zero summary tiles', async () => {
      jest.spyOn(Consultation, 'aggregate').mockResolvedValueOnce([
        { byDistrict: [], byCalendarDay: [], byTimeBucket: [], total: [] }
      ]).mockResolvedValueOnce([]);

      const res = await request(app)
        .get('/api/admin/analytics/diseases/A90?from=2026-11-01T00:00:00Z&to=2026-11-12T00:00:00Z')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.message).toBe('No verified cases for this disease in this period.');
      expect(res.body.data.summary.totalCases).toBe(0);
      expect(res.body.data.summary.districtsAffected).toBe(0);
      expect(res.body.data.summary.peakDay).toBeNull();
      expect(res.body.data.districts.length).toBe(25);
      expect(res.body.data.districts.every(d => d.cases === 0)).toBe(true);
      expect(res.body.data.provinces.length).toBe(9);
      expect(res.body.data.island.totalCases).toBe(0);
    });

    it('correctly calculates summary metrics, previous-period comparison, and district ranking', async () => {
      // Mock 12 cases in Gampaha and 3 in Colombo during current window
      // Mock 3 cases in previous window
      jest.spyOn(Consultation, 'aggregate')
        .mockResolvedValueOnce([
          {
            byDistrict: [
              { _id: 'Gampaha', count: 12 },
              { _id: 'Colombo', count: 3 }
            ],
            byCalendarDay: [
              { _id: '2026-11-10', count: 4 },
              { _id: '2026-11-11', count: 8 },
              { _id: '2026-11-12', count: 3 }
            ],
            byTimeBucket: [
              { _id: '2026-11-10', count: 4 },
              { _id: '2026-11-11', count: 8 },
              { _id: '2026-11-12', count: 3 }
            ],
            total: [{ count: 15 }]
          }
        ])
        .mockResolvedValueOnce([{ count: 3 }]); // 3 in previous window

      const res = await request(app)
        .get('/api/admin/analytics/diseases/A90?from=2026-11-10T00:00:00Z&to=2026-11-12T23:59:59Z&bucket=day')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const payload = res.body.data;
      expect(payload.summary.totalCases).toBe(15);
      expect(payload.summary.districtsAffected).toBe(2);
      expect(payload.summary.previousPeriodCases).toBe(3);
      expect(payload.summary.change).toBe(12);
      expect(payload.summary.changePct).toBe(400); // ((15-3)/3)*100
      expect(payload.summary.peakDay).toEqual({ date: '2026-11-11', count: 8 });

      // District breakdown
      expect(payload.districts[0].district).toBe('Gampaha');
      expect(payload.districts[0].cases).toBe(12);
      expect(payload.districts[0].population).toBe(2304833);
      expect(payload.districts[0].incidencePer100k).toBeGreaterThan(0);
      expect(payload.districts[1].district).toBe('Colombo');
      expect(payload.districts[1].cases).toBe(3);

      // Total districts returned is always all 25 Sri Lankan districts
      expect(payload.districts.length).toBe(25);

      // Provinces
      expect(payload.provinces.length).toBe(9);
      const western = payload.provinces.find(p => p.province === 'Western');
      expect(western.cases).toBe(15); // Gampaha 12 + Colombo 3

      // Island
      expect(payload.island.totalCases).toBe(15);
      expect(payload.island.districtsAffected).toBe(2);
    });

    it('reports changePct as "new" when previous period has zero cases', async () => {
      jest.spyOn(Consultation, 'aggregate')
        .mockResolvedValueOnce([
          {
            byDistrict: [{ _id: 'Kandy', count: 5 }],
            byCalendarDay: [{ _id: '2026-11-12', count: 5 }],
            byTimeBucket: [{ _id: '2026-11-12', count: 5 }],
            total: [{ count: 5 }]
          }
        ])
        .mockResolvedValueOnce([]); // 0 in previous period

      const res = await request(app)
        .get('/api/admin/analytics/diseases/J11?from=2026-11-10T00:00:00Z&to=2026-11-12T23:59:59Z')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.summary.totalCases).toBe(5);
      expect(res.body.data.summary.previousPeriodCases).toBe(0);
      expect(res.body.data.summary.changePct).toBe('new');
    });
  });
});
