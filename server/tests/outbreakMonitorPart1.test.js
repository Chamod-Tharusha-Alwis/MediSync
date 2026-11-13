'use strict';

const mongoose = require('mongoose');
const { formatPopulationShare, formatChangePercent, getDistrictPopulation, getIslandPopulation } = require('../src/services/incidenceService');
const { getLastScan, diseasesMatch } = require('../src/services/surveillanceService');
const OutbreakScan = require('../src/models/OutbreakScan');

describe('Part 1: Outbreak Monitor Cleanup, Telemetry, and Formatting Verification', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Formatting Rules (formatPopulationShare and formatChangePercent)', () => {
    test('at least 2 significant digits formatted for population share, never 0% when cases > 0', () => {
      // 12 cases in Gampaha (pop 2,304,833) = ~0.0005206%
      const gampaha = formatPopulationShare(12, 'Gampaha');
      expect(gampaha.population).toBe(2304833);
      expect(gampaha.formattedShare).not.toBe('0%');
      expect(gampaha.formattedShare).not.toBe('0.00%');
      expect(gampaha.formattedShare).toBe('0.0005%');
      expect(gampaha.incidencePer100k).toBe(0.52);

      // 1 case in Colombo (pop 2,324,349) = ~0.00004302%
      const colombo = formatPopulationShare(1, 'Colombo');
      expect(colombo.formattedShare).not.toBe('0%');
      expect(colombo.formattedShare).toBe('0.00004%');
      expect(colombo.incidencePer100k).toBe(0.04);

      // 0 cases correctly returns 0%
      const zero = formatPopulationShare(0, 'Colombo');
      expect(zero.formattedShare).toBe('0%');
      expect(zero.incidencePer100k).toBe(0);
    });

    test('supports Island-wide region resolution and never outputs NaN or divide-by-zero', () => {
      const islandPop = getIslandPopulation();
      expect(islandPop).toBeGreaterThan(20000000);

      const island = formatPopulationShare(20, 'Island-wide');
      expect(island.population).toBe(islandPop);
      expect(island.formattedShare).not.toBe('0%');
      expect(island.incidencePer100k).toBeGreaterThan(0);

      // Negative or invalid cases clamped safely
      const negative = formatPopulationShare(-5, 'Gampaha');
      expect(negative.formattedShare).toBe('0%');
      expect(negative.incidencePer100k).toBe(0);

      // Invalid district returns safe fallback without throwing
      const invalid = formatPopulationShare(10, 'InvalidDistrictName');
      expect(invalid.formattedShare).toBe('0%');
      expect(invalid.incidencePer100k).toBe(0);
      expect(invalid.population).toBeNull();
    });

    test('formatChangePercent reports "new" when previous window is 0 and cases > 0', () => {
      expect(formatChangePercent(5, 0)).toBe('new');
      expect(formatChangePercent(0, 0)).toBe('0%');
      expect(formatChangePercent(15, 5)).toBe('+200.0%');
      expect(formatChangePercent(3, 10)).toBe('-70.0%');
      expect(formatChangePercent(10, 10)).toBe('0.0%');
    });
  });

  describe('2. Only Outbreak Alerts Listed Rule', () => {
    test('filters growth telemetry to only diseases that have a Pending or Active outbreak alert', () => {
      const activeAlerts = [
        { disease: 'ICD10:A90', status: 'Pending', location: 'Gampaha' },
        { disease: 'ICD10:J11.1', status: 'Active', location: 'Kandy' }
      ];

      const rawGrowthList = [
        { disease: 'ICD10:A90', district: 'Gampaha', currentCases: 12, previousCases: 3 },
        { disease: 'ICD10:J11.1', district: 'Kandy', currentCases: 5, previousCases: 0 },
        { disease: 'ICD10:A09', district: 'Colombo', currentCases: 18, previousCases: 15 }, // Non-outbreak diarrhea
        { disease: 'ICD10:I10', district: 'Kalutara', currentCases: 30, previousCases: 28 }, // Non-outbreak hypertension
        { disease: 'ICD10:E11', district: 'Galle', currentCases: 25, previousCases: 20 }     // Non-outbreak diabetes
      ];

      const outbreakDiseases = new Set(activeAlerts.map(a => a.disease));
      const filtered = rawGrowthList.filter(row =>
        [...outbreakDiseases].some(d => diseasesMatch(d, row.disease))
      );

      expect(filtered.length).toBe(2);
      expect(filtered.map(r => r.disease)).toEqual(['ICD10:A90', 'ICD10:J11.1']);
      expect(filtered.some(r => r.disease === 'ICD10:A09')).toBe(false);
      expect(filtered.some(r => r.disease === 'ICD10:I10')).toBe(false);
      expect(filtered.some(r => r.disease === 'ICD10:E11')).toBe(false);
    });

    test('disease matching accommodates aliases, prefix differences, and exact codes', () => {
      expect(diseasesMatch('Dengue', 'ICD10:A90')).toBe(true);
      expect(diseasesMatch('A90', 'Dengue fever')).toBe(true);
      expect(diseasesMatch('Influenza', 'ICD10:J11.1')).toBe(true);
      expect(diseasesMatch('Leptospirosis', 'ICD10:A27')).toBe(true);
      expect(diseasesMatch('Enteric fever', 'ICD10:A01')).toBe(true);
      expect(diseasesMatch('Typhoid', 'ICD10:A01')).toBe(true);
      expect(diseasesMatch('Hypertension', 'ICD10:A90')).toBe(false);
    });
  });

  describe('3. Top-10 Rule by Last-72h Cases', () => {
    test('sorts matching outbreak growth rows descending by last-72h cases and caps at 10', () => {
      const activeAlerts = [
        { disease: 'ICD10:A90', status: 'Pending' }
      ];

      // 15 districts with dengue cases
      const rawGrowthDistricts = Array.from({ length: 15 }, (_, i) => ({
        disease: 'ICD10:A90',
        district: `District_${i + 1}`,
        currentCases: (i + 1) * 3, // 3, 6, 9 ... 45
        previousCases: i + 1,
        absoluteChange: (i + 1) * 2
      }));

      const outbreakDiseases = new Set(activeAlerts.map(a => a.disease));
      const filtered = rawGrowthDistricts.filter(row =>
        [...outbreakDiseases].some(d => diseasesMatch(d, row.disease))
      );

      filtered.sort((a, b) => b.currentCases - a.currentCases);
      const top10 = filtered.slice(0, 10);

      expect(top10.length).toBe(10);
      expect(top10[0].currentCases).toBe(45);
      expect(top10[9].currentCases).toBe(18);
      expect(top10.every((r, idx) => idx === 0 || r.currentCases <= top10[idx - 1].currentCases)).toBe(true);
    });
  });

  describe('4. Overall Outbreak Percentage and Summary Metrics Calculation', () => {
    test('computes combined 72h cases, previous cases, overall change %, and highest incidence district', () => {
      const outbreakAlerts = [
        { disease: 'ICD10:A90', status: 'Pending', location: 'Gampaha' },
        { disease: 'ICD10:J11.1', status: 'Active', location: 'Kandy' }
      ];

      const growthData = {
        island: [
          { disease: 'ICD10:A90', currentCases: 20, previousCases: 8, absoluteChange: 12 },
          { disease: 'ICD10:J11.1', currentCases: 10, previousCases: 2, absoluteChange: 8 },
          { disease: 'ICD10:A09', currentCases: 40, previousCases: 35 } // Non-outbreak
        ],
        districts: [
          { disease: 'ICD10:A90', district: 'Gampaha', currentCases: 12, incidencePer100k: 0.52 },
          { disease: 'ICD10:A90', district: 'Colombo', currentCases: 8, incidencePer100k: 0.34 },
          { disease: 'ICD10:J11.1', district: 'Kandy', currentCases: 10, incidencePer100k: 0.73 },
          { disease: 'ICD10:A09', district: 'Colombo', currentCases: 40, incidencePer100k: 1.72 } // Non-outbreak
        ]
      };

      const outbreakDiseases = new Set(outbreakAlerts.map(a => a.disease));
      const matchedIsland = growthData.island.filter(r =>
        [...outbreakDiseases].some(d => diseasesMatch(d, r.disease))
      );

      let last72hTotal = 0;
      let prev72hTotal = 0;
      for (const r of matchedIsland) {
        last72hTotal += r.currentCases;
        prev72hTotal += r.previousCases;
      }

      expect(last72hTotal).toBe(30); // 20 + 10 (excluding A09)
      expect(prev72hTotal).toBe(10); // 8 + 2
      const netChange = last72hTotal - prev72hTotal;
      expect(netChange).toBe(20);
      const overallChangePct = `+${(((last72hTotal - prev72hTotal) / prev72hTotal) * 100).toFixed(1)}%`;
      expect(overallChangePct).toBe('+200.0%');

      // Highest incidence among outbreak diseases
      const matchedDistricts = growthData.districts.filter(r =>
        [...outbreakDiseases].some(d => diseasesMatch(d, r.disease))
      );
      let highestIncidence = null;
      let maxRate = -1;
      for (const r of matchedDistricts) {
        if (r.incidencePer100k > maxRate) {
          maxRate = r.incidencePer100k;
          highestIncidence = r;
        }
      }

      expect(highestIncidence).toBeDefined();
      expect(highestIncidence.district).toBe('Kandy');
      expect(highestIncidence.incidencePer100k).toBe(0.73);
      expect(highestIncidence.disease).toBe('ICD10:J11.1');
    });
  });

  describe('5. OutbreakScan Model and Scan Telemetry Storage', () => {
    test('getLastScan safely returns null when no scan has been recorded', async () => {
      jest.spyOn(OutbreakScan, 'findOne').mockReturnValue({
        sort: () => ({
          lean: async () => null
        })
      });

      const scan = await getLastScan('real');
      expect(scan).toBeNull();
    });

    test('getLastScan returns latest recorded scan telemetry with casesScanned', async () => {
      const mockScan = {
        _id: 'scan-001',
        scannedAt: new Date('2026-11-13T09:00:00Z'),
        casesScanned: 154,
        outbreaksDetected: 2,
        signalsSuppressed: 1,
        mode: 'real'
      };

      jest.spyOn(OutbreakScan, 'findOne').mockReturnValue({
        sort: () => ({
          lean: async () => mockScan
        })
      });

      const scan = await getLastScan('real');
      expect(scan).toEqual(mockScan);
      expect(scan.casesScanned).toBe(154);
      expect(scan.outbreaksDetected).toBe(2);
      expect(scan.signalsSuppressed).toBe(1);
    });
  });
});
