'use strict';

const fs = require('fs');
const path = require('path');
const populationData = require('../src/data/districtPopulation2024.json');
const incidenceService = require('../src/services/incidenceService');
const { OFFICIAL_PROVINCES, DISTRICT_TO_PROVINCE } = require('../src/services/surveillanceService');

describe('Fix F: Official DCS District Population Table & Incidence per 100k', () => {
  describe('Official DCS Census Table Integrity', () => {
    test('contains all 25 districts with DCS source URL and verified census metadata', () => {
      expect(populationData.year).toBe(2012);
      expect(populationData.source).toContain('statistics.gov.lk');
      expect(populationData.status).toBe('official_verified');
      expect(populationData.islandTotal).toBe(20358680);

      const districts = Object.keys(populationData.districts);
      expect(districts).toHaveLength(25);

      districts.forEach(d => {
        expect(DISTRICT_TO_PROVINCE[d]).toBeDefined();
        expect(typeof populationData.districts[d]).toBe('number');
        expect(populationData.districts[d]).toBeGreaterThan(0);
      });
    });

    test('sum of all 25 district populations exactly equals islandTotal in reference data', () => {
      const sum = Object.values(populationData.districts).reduce((acc, p) => acc + p, 0);
      expect(sum).toBe(populationData.islandTotal);
      expect(incidenceService.getIslandPopulation()).toBe(populationData.islandTotal);
    });

    test('client districtPopulation2024.json mirrors server schema and data exactly', () => {
      const clientJsonPath = path.resolve(__dirname, '../../client/src/data/districtPopulation2024.json');
      expect(fs.existsSync(clientJsonPath)).toBe(true);
      const clientData = JSON.parse(fs.readFileSync(clientJsonPath, 'utf8'));
      expect(clientData.districts).toEqual(populationData.districts);
      expect(clientData.year).toBe(2012);
      expect(clientData.islandTotal).toBe(populationData.islandTotal);
    });
  });

  describe('Incidence per 100,000 Calculation & Fallback Safeguards', () => {
    test('returns "N/A" (never "pending" or NaN) when cases is invalid or district unknown', () => {
      const res1 = incidenceService.calculateIncidencePer100k(null, 'Colombo');
      expect(res1.display).toBe('N/A');
      expect(res1.incidence).toBeNull();
      expect(res1.hasPopulation).toBe(false);

      const res2 = incidenceService.calculateIncidencePer100k(10, 'InvalidDistrict');
      expect(res2.display).toBe('N/A');
      expect(res2.incidence).toBeNull();
      expect(res2.hasPopulation).toBe(false);
    });

    test('calculates correct incidence per 100,000 using verified DCS district population', () => {
      // Colombo DCS pop: 2,324,349. 232 cases -> (232 / 2,324,349) * 100,000 = 9.98 per 100k
      const res = incidenceService.calculateIncidencePer100k(232, 'Colombo');
      expect(res.hasPopulation).toBe(true);
      expect(res.population).toBe(2324349);
      expect(res.incidence).toBe(9.98);
      expect(res.display).toBe('9.98 / 100k');
    });

    test('province and island incidence calculate aggregated rates with DCS data', () => {
      // Western Province: Colombo (2,324,349) + Gampaha (2,304,833) + Kalutara (1,221,948) = 5,851,130
      expect(incidenceService.getProvincePopulation('Western')).toBe(5851130);
      const provRes = incidenceService.calculateProvinceIncidencePer100k(585, 'Western');
      expect(provRes.hasPopulation).toBe(true);
      expect(provRes.incidence).toBe(10.0);
      expect(provRes.display).toBe('10 / 100k');

      // Island: 2,036 cases across 20,358,680 -> 10.00 per 100k
      const islandRes = incidenceService.calculateIslandIncidencePer100k(2036);
      expect(islandRes.hasPopulation).toBe(true);
      expect(islandRes.population).toBe(20358680);
      expect(islandRes.incidence).toBe(10.0);
      expect(islandRes.display).toBe('10 / 100k');
    });
  });
});
