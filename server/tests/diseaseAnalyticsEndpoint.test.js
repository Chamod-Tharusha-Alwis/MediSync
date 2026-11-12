'use strict';

const Consultation = require('../src/models/Consultation');
const analyticsController = require('../src/controllers/analyticsController');
const diseaseAnalyticsService = require('../src/services/diseaseAnalyticsService');

describe('Part 4: Per-Disease Surveillance Analytics & Autocomplete Endpoint', () => {
  const adminId = '507f191e810c19729de860ea';
  const adminUser = { id: adminId, role: 'admin' };
  const patientUser = { id: '507f191e810c19729de860eb', role: 'patient' };

  function mockResponse() {
    const res = {
      statusCode: 200,
      status(code) {
        res.statusCode = code;
        return res;
      },
      json(payload) {
        res.body = payload;
        return res;
      }
    };
    return res;
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Autocomplete Search Endpoint (GET /api/admin/analytics/diseases/search)', () => {
    it('returns empty data array when query is shorter than 2 characters', async () => {
      const req = { query: { q: 'a' }, user: adminUser };
      const res = mockResponse();

      await analyticsController.searchDiseases(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ data: [] });
    });

    it('returns matching ICD-10 and ICD-11 concepts for dengue', async () => {
      const req = { query: { q: 'dengue', limit: '10' }, user: adminUser };
      const res = mockResponse();

      await analyticsController.searchDiseases(req, res);

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.some(d => d.version === 'ICD-10')).toBe(true);
      expect(res.body.data.some(d => d.version === 'ICD-11')).toBe(true);
      const icd10Dengue = res.body.data.find(d => d.code === 'A90');
      expect(icd10Dengue).toBeDefined();
      expect(icd10Dengue.displayName).toContain('Dengue');
    });

    it('supports Sinhala and Tamil disease search terms', async () => {
      const reqSi = { query: { q: 'ඩෙංගු' }, user: adminUser };
      const resSi = mockResponse();
      await analyticsController.searchDiseases(reqSi, resSi);
      expect(resSi.statusCode).toBe(200);
      expect(resSi.body.data.length).toBeGreaterThan(0);

      const reqTa = { query: { q: 'டெங்கு' }, user: adminUser };
      const resTa = mockResponse();
      await analyticsController.searchDiseases(reqTa, resTa);
      expect(resTa.statusCode).toBe(200);
      expect(resTa.body.data.length).toBeGreaterThan(0);
    });

    it('rejects unauthenticated or non-admin with 403', async () => {
      const unauthReq = { query: { q: 'dengue' }, user: undefined };
      const unauthRes = mockResponse();
      await analyticsController.searchDiseases(unauthReq, unauthRes);
      expect(unauthRes.statusCode).toBe(403);

      const patientReq = { query: { q: 'dengue' }, user: patientUser };
      const patientRes = mockResponse();
      await analyticsController.searchDiseases(patientReq, patientRes);
      expect(patientRes.statusCode).toBe(403);
    });
  });

  describe('2. Disease Analytics Query Endpoint (GET /api/admin/analytics/diseases/:code)', () => {
    it('returns 400 for invalid date strings', async () => {
      const req = {
        params: { code: 'A90' },
        query: { from: 'invalid-date', to: '2026-11-12' },
        user: adminUser
      };
      const res = mockResponse();

      await analyticsController.getDiseaseAnalytics(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('Invalid date format');
    });

    it('returns 400 when start date is after end date', async () => {
      const req = {
        params: { code: 'A90' },
        query: { from: '2026-11-15', to: '2026-11-10' },
        user: adminUser
      };
      const res = mockResponse();

      await analyticsController.getDiseaseAnalytics(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('start date must be before or equal to end date');
    });

    it('returns 400 when date range exceeds 2 years', async () => {
      const req = {
        params: { code: 'A90' },
        query: { from: '2023-01-01', to: '2026-01-02' },
        user: adminUser
      };
      const res = mockResponse();

      await analyticsController.getDiseaseAnalytics(req, res);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toContain('cannot exceed 2 years');
    });

    it('derives bucket size "hour" for ranges up to 72h', async () => {
      jest.spyOn(Consultation, 'aggregate').mockResolvedValueOnce([
        { byDistrict: [], byCalendarDay: [], byTimeBucket: [], total: [] }
      ]).mockResolvedValueOnce([]);

      const req = {
        params: { code: 'A90' },
        query: { from: '2026-11-09T00:00:00Z', to: '2026-11-12T00:00:00Z' },
        user: adminUser
      };
      const res = mockResponse();

      await analyticsController.getDiseaseAnalytics(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.range.bucket).toBe('hour');
    });

    it('derives bucket size "day" for ranges up to 92 days', async () => {
      jest.spyOn(Consultation, 'aggregate').mockResolvedValueOnce([
        { byDistrict: [], byCalendarDay: [], byTimeBucket: [], total: [] }
      ]).mockResolvedValueOnce([]);

      const req = {
        params: { code: 'A90' },
        query: { from: '2026-10-01T00:00:00Z', to: '2026-11-12T00:00:00Z' },
        user: adminUser
      };
      const res = mockResponse();

      await analyticsController.getDiseaseAnalytics(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.range.bucket).toBe('day');
    });

    it('derives bucket size "week" for ranges over 92 days', async () => {
      jest.spyOn(Consultation, 'aggregate').mockResolvedValueOnce([
        { byDistrict: [], byCalendarDay: [], byTimeBucket: [], total: [] }
      ]).mockResolvedValueOnce([]);

      const req = {
        params: { code: 'A90' },
        query: { from: '2026-01-01T00:00:00Z', to: '2026-11-12T00:00:00Z' },
        user: adminUser
      };
      const res = mockResponse();

      await analyticsController.getDiseaseAnalytics(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.range.bucket).toBe('week');
    });

    it('handles zero-data case with clear empty state message and zero summary tiles', async () => {
      jest.spyOn(Consultation, 'aggregate').mockResolvedValueOnce([
        { byDistrict: [], byCalendarDay: [], byTimeBucket: [], total: [] }
      ]).mockResolvedValueOnce([]);

      const req = {
        params: { code: 'A90' },
        query: { from: '2026-11-01T00:00:00Z', to: '2026-11-12T00:00:00Z' },
        user: adminUser
      };
      const res = mockResponse();

      await analyticsController.getDiseaseAnalytics(req, res);

      expect(res.statusCode).toBe(200);
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
        .mockResolvedValueOnce([{ count: 3 }]);

      const req = {
        params: { code: 'A90' },
        query: { from: '2026-11-10T00:00:00Z', to: '2026-11-12T23:59:59Z', bucket: 'day' },
        user: adminUser
      };
      const res = mockResponse();

      await analyticsController.getDiseaseAnalytics(req, res);

      expect(res.statusCode).toBe(200);
      const payload = res.body.data;
      expect(payload.summary.totalCases).toBe(15);
      expect(payload.summary.districtsAffected).toBe(2);
      expect(payload.summary.previousPeriodCases).toBe(3);
      expect(payload.summary.change).toBe(12);
      expect(payload.summary.changePct).toBe(400);
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
      expect(western.cases).toBe(15);

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
        .mockResolvedValueOnce([]);

      const req = {
        params: { code: 'J11' },
        query: { from: '2026-11-10T00:00:00Z', to: '2026-11-12T23:59:59Z' },
        user: adminUser
      };
      const res = mockResponse();

      await analyticsController.getDiseaseAnalytics(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.body.data.summary.totalCases).toBe(5);
      expect(res.body.data.summary.previousPeriodCases).toBe(0);
      expect(res.body.data.summary.changePct).toBe('new');
    });

    it('rejects non-admin or unauthenticated with 403', async () => {
      const unauthReq = { params: { code: 'A90' }, query: {}, user: undefined };
      const unauthRes = mockResponse();
      await analyticsController.getDiseaseAnalytics(unauthReq, unauthRes);
      expect(unauthRes.statusCode).toBe(403);

      const patientReq = { params: { code: 'A90' }, query: {}, user: patientUser };
      const patientRes = mockResponse();
      await analyticsController.getDiseaseAnalytics(patientReq, patientRes);
      expect(patientRes.statusCode).toBe(403);
    });
  });
});
