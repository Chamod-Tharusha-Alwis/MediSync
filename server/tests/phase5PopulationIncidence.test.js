'use strict';

const fs = require('fs');
const path = require('path');
const populationData = require('../src/data/districtPopulation2024.json');
const incidenceService = require('../src/services/incidenceService');
const { OFFICIAL_PROVINCES, DISTRICT_TO_PROVINCE } = require('../src/services/surveillanceService');

describe('Phase 5 — Population Data & Incidence per 100k Calculation', () => {
  describe('5.1 Census 2024 Population Schema & Neutral Null Safeguards', () => {
    test('districtPopulation2024.json contains all 25 districts with year 2024 and source URL', () => {
      expect(populationData.year).toBe(2024);
      expect(populationData.source).toContain('statistics.gov.lk');
      expect(populationData.status).toBe('pending_owner_data');
      expect(populationData.retrievedAt).toBeNull();

      const districts = Object.keys(populationData.districts);
      expect(districts).toHaveLength(25);

      // Verify every district is in official Sri Lanka district mapping
      districts.forEach(d => {
        expect(DISTRICT_TO_PROVINCE[d]).toBeDefined();
      });
    });

    test('all 25 districts default to null pending verified DCS table entry (never typed from memory)', () => {
      const entries = Object.entries(populationData.districts);
      expect(entries).toHaveLength(25);
      entries.forEach(([district, pop]) => {
        expect(pop).toBeNull();
      });
    });

    test('client districtPopulation2024.json mirrors server schema exactly', () => {
      const clientJsonPath = path.resolve(__dirname, '../../client/src/data/districtPopulation2024.json');
      expect(fs.existsSync(clientJsonPath)).toBe(true);
      const clientData = JSON.parse(fs.readFileSync(clientJsonPath, 'utf8'));
      expect(clientData.districts).toEqual(populationData.districts);
      expect(clientData.year).toBe(2024);
    });
  });

  describe('5.2 Incidence per 100,000 Calculation', () => {
    test('returns "population data pending" when district population is null', () => {
      const res = incidenceService.calculateIncidencePer100k(15, 'Colombo');
      expect(res.incidence).toBeNull();
      expect(res.display).toBe('population data pending');
      expect(res.hasPopulation).toBe(false);
    });

    test('returns "population data pending" when cases is invalid or district unknown', () => {
      const res1 = incidenceService.calculateIncidencePer100k(null, 'Colombo');
      expect(res1.display).toBe('population data pending');

      const res2 = incidenceService.calculateIncidencePer100k(10, 'InvalidDistrict');
      expect(res2.display).toBe('population data pending');
    });

    test('calculates correct incidence per 100,000 when population is provided', () => {
      // Mock getDistrictPopulation to simulate verified population
      jest.spyOn(incidenceService, 'getDistrictPopulation').mockImplementation(d => {
        if (d === 'Colombo') return 2375415;
        return null;
      });

      // 238 cases in Colombo (pop ~2.375M) -> ~10.02 per 100k
      const res = incidenceService.calculateIncidencePer100k(238, 'Colombo');
      expect(res.hasPopulation).toBe(true);
      expect(res.incidence).toBe(10.02);
      expect(res.display).toBe('10.02 / 100k');
    });

    test('province incidence returns "population data pending" when constituent districts have null population', () => {
      const res = incidenceService.calculateProvinceIncidencePer100k(40, 'Western');
      expect(res.incidence).toBeNull();
      expect(res.display).toBe('population data pending');
      expect(res.hasPopulation).toBe(false);
    });

    test('province incidence calculates aggregated rate when all constituent districts have population', () => {
      jest.spyOn(incidenceService, 'getDistrictPopulation').mockImplementation(d => {
        // Western province districts: Colombo (2M), Gampaha (2M), Kalutara (1M) = 5M
        if (d === 'Colombo') return 2000000;
        if (d === 'Gampaha') return 2000000;
        if (d === 'Kalutara') return 1000000;
        return null;
      });

      // 500 cases in Western province (pop 5M) -> 10.00 per 100k
      const res = incidenceService.calculateProvinceIncidencePer100k(500, 'Western');
      expect(res.hasPopulation).toBe(true);
      expect(res.incidence).toBe(10);
      expect(res.display).toBe('10 / 100k');
    });
  });
});
