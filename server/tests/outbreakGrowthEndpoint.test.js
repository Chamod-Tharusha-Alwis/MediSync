'use strict';

const request = require('supertest');
const express = require('express');
const { computeGrowthFromCases } = require('../src/services/surveillanceService');
const jwt = require('jsonwebtoken');

describe('Fix G: Outbreak 72-Hour Growth Telemetry & Endpoint', () => {
  const baseDate = new Date('2026-11-12T12:00:00.000Z');
  const DAY = 86400000;
  const JWT_SECRET = 'offline-test-jwt-secret-at-least-32-chars-long';
  process.env.JWT_SECRET = JWT_SECRET;

  let app;
  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/admin', require('../src/routes/adminRoutes'));
  });

  function makeCase(district, disease, hoursAgo) {
    return {
      _id: `test-case-${district}-${disease}-${hoursAgo}`,
      disease,
      diseaseId: disease,
      district,
      createdAt: new Date(baseDate.getTime() - hoursAgo * 3600000).toISOString(),
      time: baseDate.getTime() - hoursAgo * 3600000
    };
  }

  describe('1. Growth Metric Computation Logic', () => {
    it('computes correct 72h current vs previous windows and handles zero previous cases with "new"', () => {
      const cases = [
        // Gampaha Dengue: 5 cases in current 72h (e.g. 10h, 20h, 30h, 40h, 50h ago), 2 in previous 72h (80h, 100h ago)
        makeCase('Gampaha', 'Dengue', 10),
        makeCase('Gampaha', 'Dengue', 20),
        makeCase('Gampaha', 'Dengue', 30),
        makeCase('Gampaha', 'Dengue', 40),
        makeCase('Gampaha', 'Dengue', 50),
        makeCase('Gampaha', 'Dengue', 80),
        makeCase('Gampaha', 'Dengue', 100),

        // Kandy Influenza: 3 cases in current 72h (12h, 24h, 36h ago), 0 in previous 72h (brand new cluster!)
        makeCase('Kandy', 'Influenza', 12),
        makeCase('Kandy', 'Influenza', 24),
        makeCase('Kandy', 'Influenza', 36),

        // Colombo Dengue: 4 cases in current 72h, 4 cases in previous 72h (flat trend)
        makeCase('Colombo', 'Dengue', 5),
        makeCase('Colombo', 'Dengue', 15),
        makeCase('Colombo', 'Dengue', 25),
        makeCase('Colombo', 'Dengue', 35),
        makeCase('Colombo', 'Dengue', 75),
        makeCase('Colombo', 'Dengue', 85),
        makeCase('Colombo', 'Dengue', 95),
        makeCase('Colombo', 'Dengue', 105),
      ];

      const res = computeGrowthFromCases({ cases, windowHours: 72, now: baseDate });

      expect(res.window).toBe('72h');
      expect(res.windowHours).toBe(72);
      expect(Array.isArray(res.districts)).toBe(true);
      expect(Array.isArray(res.island)).toBe(true);

      // Find Gampaha Dengue
      const gampaha = res.districts.find(d => d.district === 'Gampaha' && d.disease === 'Dengue');
      expect(gampaha).toBeDefined();
      expect(gampaha.currentCases).toBe(5);
      expect(gampaha.previousCases).toBe(2);
      expect(gampaha.absoluteChange).toBe(3);
      // ((5 - 2) / 2) * 100 = 150.0%
      expect(gampaha.percentChange).toBe(150.0);
      expect(gampaha.hasPopulation).toBe(true);
      expect(gampaha.population).toBe(2304833);

      // Find Kandy Influenza (previous = 0 -> "new")
      const kandy = res.districts.find(d => d.district === 'Kandy' && d.disease === 'Influenza');
      expect(kandy).toBeDefined();
      expect(kandy.currentCases).toBe(3);
      expect(kandy.previousCases).toBe(0);
      expect(kandy.absoluteChange).toBe(3);
      expect(kandy.percentChange).toBe('new');

      // Find Colombo Dengue (flat trend)
      const colombo = res.districts.find(d => d.district === 'Colombo' && d.disease === 'Dengue');
      expect(colombo).toBeDefined();
      expect(colombo.currentCases).toBe(4);
      expect(colombo.previousCases).toBe(4);
      expect(colombo.absoluteChange).toBe(0);
      expect(colombo.percentChange).toBe(0.0);
    });

    it('guarantees island total equals the sum of constituent districts for each disease', () => {
      const cases = [
        makeCase('Gampaha', 'Dengue', 10),
        makeCase('Colombo', 'Dengue', 20),
        makeCase('Kalutara', 'Dengue', 30),
        makeCase('Gampaha', 'Dengue', 80),
        makeCase('Colombo', 'Dengue', 90),
      ];

      const res = computeGrowthFromCases({ cases, windowHours: 72, now: baseDate });
      const islandDengue = res.island.find(i => i.disease === 'Dengue');
      expect(islandDengue).toBeDefined();

      const districtDengue = res.districts.filter(d => d.disease === 'Dengue');
      const sumCurrent = districtDengue.reduce((acc, d) => acc + d.currentCases, 0);
      const sumPrevious = districtDengue.reduce((acc, d) => acc + d.previousCases, 0);

      expect(islandDengue.currentCases).toBe(sumCurrent);
      expect(islandDengue.previousCases).toBe(sumPrevious);
      expect(islandDengue.currentCases).toBe(3);
      expect(islandDengue.previousCases).toBe(2);
      expect(islandDengue.absoluteChange).toBe(1);
    });
  });

  describe('2. Endpoint Authorization & Response Contract', () => {
    const SessionToken = require('../src/models/SessionToken');
    const BanRecord = require('../src/models/BanRecord');
    const accountState = require('../src/security/accountState');
    const crypto = require('crypto');

    const adminId = '507f191e810c19729de860ea';
    const patientId = '507f191e810c19729de860eb';
    let adminToken, patientToken;
    let adminHash, patientHash;

    beforeEach(() => {
      const Admin = require('../src/models/Admin');
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

      const secret = process.env.JWT_SECRET;
      adminToken = jwt.sign({ id: adminId, role: 'admin' }, secret, { expiresIn: '1h', algorithm: 'HS256' });
      patientToken = jwt.sign({ id: patientId, role: 'patient' }, secret, { expiresIn: '1h', algorithm: 'HS256' });

      adminHash = crypto.createHash('sha256').update(adminToken).digest('hex');
      patientHash = crypto.createHash('sha256').update(patientToken).digest('hex');

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

      const AuditLog = require('../src/models/AuditLog');
      jest.spyOn(AuditLog, 'create').mockResolvedValue({});
      jest.spyOn(BanRecord, 'findOne').mockResolvedValue(null);

      jest.spyOn(accountState, 'readAccount').mockImplementation(async (identity) => {
        if (identity.role === 'admin') {
          return {
            _id: identity.id,
            role: 'admin',
            isActive: true,
            isDeleted: false,
            mustChangePassword: false
          };
        }
        if (identity.role === 'patient') {
          return {
            _id: identity.id,
            role: 'patient',
            isActive: true,
            isDeleted: false,
            mustChangePassword: false
          };
        }
        return null;
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/admin/outbreak/growth');
      expect(res.status).toBe(401);
    });

    it('rejects non-admin role with 403', async () => {
      const res = await request(app)
        .get('/api/admin/outbreak/growth')
        .set('Authorization', `Bearer ${patientToken}`);
      expect(res.status).toBe(403);
    });

    it('allows admin role and returns 72h growth telemetry structure', async () => {
      const surveillanceService = require('../src/services/surveillanceService');
      jest.spyOn(surveillanceService, 'calculateGrowthMetrics').mockResolvedValue({
        window: '72h',
        windowHours: 72,
        asOf: new Date().toISOString(),
        districts: [],
        island: []
      });

      const res = await request(app)
        .get('/api/admin/outbreak/growth?window=72h')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.window).toBe('72h');
      expect(Array.isArray(res.body.districts)).toBe(true);
      expect(Array.isArray(res.body.island)).toBe(true);
    });
  });
});
