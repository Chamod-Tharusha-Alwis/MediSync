'use strict';

jest.mock('uuid', () => ({ v4: () => 'mock-uuid-test' }));

const adminMlStatusService = require('../src/services/adminMlStatusService');
const surveillanceService = require('../src/services/surveillanceService');
const adminController = require('../src/controllers/adminController');
const deviceController = require('../src/controllers/deviceController');
const Doctor = require('../src/models/Doctor');
const Patient = require('../src/models/Patient');
const PharmacyStaff = require('../src/models/PharmacyStaff');
const Hospital = require('../src/models/Hospital');
const Admin = require('../src/models/Admin');
const AuditLog = require('../src/models/AuditLog');
const SessionToken = require('../src/models/SessionToken');
const TrustedDevice = require('../src/models/TrustedDevice');

describe('Phase 4 — ML Resilience, Admin Session Monitor, Outbreak 3 Levels & Mapping', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('4.1 ML Status Resilience & Waking State', () => {
    const validData = {
      status: 'active',
      dataPoints: 120,
      dataPointUnit: 'reference disease profiles',
      clinicalValidation: 'not established',
      models: {
        diseasePrediction: 'TF-IDF + Cosine Similarity',
        outbreakForecasting: 'unavailable'
      }
    };

    test('readAdminMlStatus returns "available" when ML service responds with valid payload', async () => {
      const mockGet = jest.fn().mockResolvedValue({
        status: 200,
        data: validData
      });

      const result = await adminMlStatusService.readAdminMlStatus({
        get: mockGet,
        token: () => 'secret-test-token',
        baseUrl: 'https://ml.example.invalid',
        log: () => {}
      });

      expect(result.status).toBe('available');
      expect(result.available).toBe(true);
      expect(result.availabilityState).toBe('available');
      expect(result.dataPoints).toBe(120);
    });

    test('readAdminMlStatus returns availabilityState "waking" on 503 / connection errors', async () => {
      const err = new Error('Service Unavailable');
      err.response = { status: 503 };
      const mockGet = jest.fn().mockRejectedValue(err);

      const result = await adminMlStatusService.readAdminMlStatus({
        get: mockGet,
        token: () => 'secret-test-token',
        baseUrl: 'https://ml.example.invalid',
        log: () => {}
      });

      expect(result.status).toBe('unavailable');
      expect(result.available).toBe(false);
      expect(result.availabilityState).toBe('waking');
    });

    test('readAdminMlStatus returns availabilityState "down" on 404 / auth errors', async () => {
      const err = new Error('Not Found');
      err.response = { status: 404 };
      const mockGet = jest.fn().mockRejectedValue(err);

      const result = await adminMlStatusService.readAdminMlStatus({
        get: mockGet,
        token: () => 'secret-test-token',
        baseUrl: 'https://ml.example.invalid',
        log: () => {}
      });

      expect(result.status).toBe('unavailable');
      expect(result.available).toBe(false);
      expect(result.availabilityState).toBe('down');
      expect(result.category).toBe('not_found');
    });

    test('probeAdminMlStatusWithRetry returns cached status and retries on waking', async () => {
      adminMlStatusService.clearAdminMlStatusCache();

      let attempts = 0;
      const mockGet = jest.fn().mockImplementation(async () => {
        attempts++;
        if (attempts === 1) {
          const err = new Error('Cold starting');
          err.response = { status: 503 };
          throw err;
        }
        return { status: 200, data: validData };
      });

      const probed = await adminMlStatusService.probeAdminMlStatusWithRetry({
        get: mockGet,
        token: () => 'secret-token',
        baseUrl: 'https://ml.example.invalid',
        useCache: true,
        cacheTtlMs: 5000,
        maxRetries: 1,
        baseDelayMs: 10,
        log: () => {}
      });

      expect(probed.available).toBe(true);
      expect(probed.availabilityState).toBe('available');
      expect(attempts).toBe(2);
    });
  });

  describe('4.2 Session Monitor & Masked Identifier Reveal Audit', () => {
    test('revealIdentifier logs ADMIN_REVEAL_PII and returns unmasked identifier', async () => {
      const mockDoctor = {
        _id: '507f1f77bcf86cd799439011',
        fullName: 'Dr. Test Kamal',
        role: 'doctor',
        nic: '198512345678',
        licenseNo: 'SLMC-12345',
        doctorId: 'DR-TEST1',
        email: 'kamal.test@medisync.lk'
      };

      jest.spyOn(Doctor, 'findById').mockReturnValueOnce({
        select: jest.fn().mockResolvedValueOnce(mockDoctor)
      });
      const auditSpy = jest.spyOn(AuditLog, 'create').mockResolvedValueOnce({ _id: 'audit-1' });

      const req = {
        params: { userId: '507f1f77bcf86cd799439011' },
        user: { id: '507f1f77bcf86cd799439099', role: 'admin' },
        headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      };

      let jsonResult = null;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(data => { jsonResult = data; return res; })
      };

      await adminController.revealIdentifier(req, res);

      expect(res.status).not.toHaveBeenCalledWith(400);
      expect(res.status).not.toHaveBeenCalledWith(403);
      expect(res.status).not.toHaveBeenCalledWith(404);
      expect(jsonResult.success).toBe(true);
      expect(jsonResult.identifier).toBe('198512345678');
      expect(jsonResult.role).toBe('doctor');

      expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
        action: 'ADMIN_REVEAL_PII',
        actorId: '507f1f77bcf86cd799439099',
        actorRole: 'admin',
        accessedNic: '198512345678'
      }));
    });

    test('revealIdentifier requires admin or super_admin role', async () => {
      const req = {
        params: { userId: '507f1f77bcf86cd799439011' },
        user: { id: '507f1f77bcf86cd799439099', role: 'doctor' },
        headers: {}
      };
      let jsonResult = null;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(data => { jsonResult = data; return res; })
      };

      await adminController.revealIdentifier(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(jsonResult.error).toContain('Admin authorization required');
    });

    test('getActiveSessions filters by role and search query', async () => {
      const mockSessions = [
        {
          _id: 'sess-1',
          userId: '507f1f77bcf86cd799439011',
          userModel: 'Doctor',
          deviceModel: 'Chrome on Windows',
          deviceFingerprint: 'fp-1',
          isValid: true,
          isTrusted: true,
          createdAt: new Date(),
          lastUsed: new Date()
        },
        {
          _id: 'sess-2',
          userId: '507f1f77bcf86cd799439022',
          userModel: 'Patient',
          deviceModel: 'Safari on iPhone',
          deviceFingerprint: 'fp-2',
          isValid: true,
          isTrusted: false,
          createdAt: new Date(),
          lastUsed: new Date()
        }
      ];

      jest.spyOn(SessionToken, 'find').mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(mockSessions)
          })
        })
      });

      jest.spyOn(Doctor, 'find').mockResolvedValue([
        { _id: '507f1f77bcf86cd799439011', fullName: 'Dr. Alice Silva', role: 'doctor', licenseNo: 'SLMC-99999' }
      ]);
      jest.spyOn(Patient, 'find').mockResolvedValue([
        { _id: '507f1f77bcf86cd799439022', fullName: 'Bob Perera', nic: '199512345678' }
      ]);
      jest.spyOn(PharmacyStaff, 'find').mockResolvedValue([]);
      jest.spyOn(Hospital, 'find').mockResolvedValue([]);
      jest.spyOn(Admin, 'find').mockResolvedValue([]);

      jest.spyOn(TrustedDevice, 'find').mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { userId: '507f1f77bcf86cd799439011', deviceFingerprint: 'fp-1', isTrusted: true, isRevoked: false }
        ])
      });

      // Filter by role=doctor
      const reqRole = { query: { role: 'doctor', search: '' } };
      let jsonRole = null;
      const resRole = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(data => { jsonRole = data; return resRole; })
      };

      await deviceController.getActiveSessions(reqRole, resRole);
      expect(jsonRole.data).toHaveLength(1);
      expect(jsonRole.total).toBe(1);
      expect(jsonRole.data[0].fullName).toBe('Dr. Alice Silva');
      expect(jsonRole.data[0].role).toBe('doctor');

      // Filter by search=bob
      const reqSearch = { query: { role: '', search: 'Bob' } };
      let jsonSearch = null;
      const resSearch = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(data => { jsonSearch = data; return resSearch; })
      };

      await deviceController.getActiveSessions(reqSearch, resSearch);
      expect(jsonSearch.data).toHaveLength(1);
      expect(jsonSearch.total).toBe(1);
      expect(jsonSearch.data[0].fullName).toBe('Bob Perera');
      expect(jsonSearch.data[0].role).toBe('patient');
    });
  });

  describe('4.3 Outbreak Detector Threshold (Strict z > 2.0)', () => {
    test('requires strict z > 2.0: value with z <= 2.0 does not trigger alert', () => {
      // Create cases with N >= 5 but with uniform baseline and slight bump where z <= 2.0
      // Baseline 56 days, 2 cases/day = 112 cases
      // Window 7 days: 2 cases/day = 14 cases. Mean=2, std~=1.41. z = 0.
      const now = new Date('2026-11-08T00:00:00Z');
      const cases = [];
      const DAY = 86400000;

      // 56 days baseline: 2 cases/day
      for (let d = 56; d >= 8; d--) {
        const time = now.getTime() - d * DAY + 3600000;
        cases.push({ district: 'Colombo', disease: 'Dengue', createdAt: new Date(time) });
        cases.push({ district: 'Colombo', disease: 'Dengue', createdAt: new Date(time) });
      }

      // Window 7 days: 2 cases/day
      for (let d = 7; d >= 1; d--) {
        const time = now.getTime() - d * DAY + 3600000;
        cases.push({ district: 'Colombo', disease: 'Dengue', createdAt: new Date(time) });
        cases.push({ district: 'Colombo', disease: 'Dengue', createdAt: new Date(time) });
      }

      const results = surveillanceService.evaluateOutbreakCriteria({
        cases,
        now,
        baselineDays: 56,
        level: 'district'
      });

      expect(results).toHaveLength(1);
      expect(results[0].triggered).toBe(false);
      expect(results[0].severity).toBe('None');
    });
  });

  describe('4.4 Official 9 Provinces & 25 Districts Bijective Mapping', () => {
    test('all 25 districts map to exactly 1 of the official 9 provinces', () => {
      const {
        OFFICIAL_PROVINCES,
        DISTRICT_TO_PROVINCE,
        PROVINCE_TO_DISTRICTS
      } = surveillanceService;

      expect(OFFICIAL_PROVINCES).toHaveLength(9);
      expect(new Set(OFFICIAL_PROVINCES).size).toBe(9);

      const districtEntries = Object.entries(DISTRICT_TO_PROVINCE);
      expect(districtEntries).toHaveLength(25);

      // Verify every district maps to a valid official province
      districtEntries.forEach(([district, province]) => {
        expect(OFFICIAL_PROVINCES).toContain(province);
      });

      // Verify union of districts in PROVINCE_TO_DISTRICTS has size 25 with no duplicates
      const allDistrictsInProvinces = [];
      OFFICIAL_PROVINCES.forEach(prov => {
        const districts = PROVINCE_TO_DISTRICTS[prov];
        expect(Array.isArray(districts)).toBe(true);
        expect(districts.length).toBeGreaterThan(0);
        allDistrictsInProvinces.push(...districts);
      });

      expect(allDistrictsInProvinces).toHaveLength(25);
      expect(new Set(allDistrictsInProvinces).size).toBe(25);

      // Every district in PROVINCE_TO_DISTRICTS matches DISTRICT_TO_PROVINCE
      OFFICIAL_PROVINCES.forEach(prov => {
        PROVINCE_TO_DISTRICTS[prov].forEach(dist => {
          expect(DISTRICT_TO_PROVINCE[dist]).toBe(prov);
        });
      });
    });

    test('multi-level outbreak evaluation triggers provincial alert even when individual districts have < 5 cases', () => {
      // Multi-district case distribution in Southern Province (Galle, Matara, Hambantota)
      // Baseline 56 days: 0 cases in all districts
      // Window 7 days:
      // Day 1 & Day 2:
      // Galle: 2 cases/day (total window = 4 < 5)
      // Matara: 2 cases/day (total window = 4 < 5)
      // Hambantota: 0 cases
      // Total for Southern Province = 4 cases/day on Day 1 & Day 2 (total window = 8 >= 5)
      const now = new Date('2026-11-08T00:00:00Z');
      const cases = [];
      const DAY = 86400000;

      // In window 7 days:
      // Day 1 (7 days ago): Galle has 2 cases, Matara has 2 cases
      const day1 = now.getTime() - 7 * DAY + 3600000;
      cases.push({ district: 'Galle', disease: 'Dengue', createdAt: new Date(day1) });
      cases.push({ district: 'Galle', disease: 'Dengue', createdAt: new Date(day1) });
      cases.push({ district: 'Matara', disease: 'Dengue', createdAt: new Date(day1) });
      cases.push({ district: 'Matara', disease: 'Dengue', createdAt: new Date(day1) });

      // Day 2 (6 days ago): Galle has 2 cases, Matara has 2 cases
      const day2 = now.getTime() - 6 * DAY + 3600000;
      cases.push({ district: 'Galle', disease: 'Dengue', createdAt: new Date(day2) });
      cases.push({ district: 'Galle', disease: 'Dengue', createdAt: new Date(day2) });
      cases.push({ district: 'Matara', disease: 'Dengue', createdAt: new Date(day2) });
      cases.push({ district: 'Matara', disease: 'Dengue', createdAt: new Date(day2) });

      const results = surveillanceService.evaluateMultiLevelOutbreakCriteria({
        cases,
        now,
        baselineDays: 56
      });

      // District level:
      // Galle has N=4 (< 5 floor) -> triggered false (CASE_FLOOR_NOT_MET)
      // Matara has N=4 (< 5 floor) -> triggered false (CASE_FLOOR_NOT_MET)
      const galleResult = results.district.find(r => r.district === 'Galle');
      const mataraResult = results.district.find(r => r.district === 'Matara');
      expect(galleResult).toBeDefined();
      expect(galleResult.triggered).toBe(false);
      expect(galleResult.reason).toBe('CASE_FLOOR_NOT_MET');
      expect(mataraResult).toBeDefined();
      expect(mataraResult.triggered).toBe(false);
      expect(mataraResult.reason).toBe('CASE_FLOOR_NOT_MET');

      // Province level:
      // Southern Province has N=8 (>= 5 floor), dailyCounts: [4, 4, 0, 0, 0, 0, 0].
      // Baseline 56 days: 0 cases. bMean=0.1, bStd=0.5.
      // Day 1 z = (4 - 0.1)/0.5 = 7.8 > 2.0.
      // Day 2 z = (4 - 0.1)/0.5 = 7.8 > 2.0.
      // 2 consecutive days elevated -> triggers Watch/Alert/Critical!
      const southernResult = results.province.find(r => r.entityName === 'Southern');
      expect(southernResult).toBeDefined();
      expect(southernResult.triggered).toBe(true);
      expect(southernResult.count).toBe(8);
      expect(['Watch', 'Alert', 'Critical']).toContain(southernResult.severity);

      // Island level:
      const islandResult = results.island.find(r => r.entityName === 'Sri Lanka');
      expect(islandResult).toBeDefined();
      expect(islandResult.triggered).toBe(true);
      expect(islandResult.count).toBe(8);
    });
  });
});
