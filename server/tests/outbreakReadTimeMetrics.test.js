'use strict';

const { enrichAlertWith72h, computeGrowthFromCases } = require('../src/services/surveillanceService');
const { formatPopulationShare, calculateIncidencePer100k, getDistrictPopulation } = require('../src/services/incidenceService');

describe('Part 1: Outbreak Read-Time 72h Cases and Population Metrics', () => {
  const gampahaPop = getDistrictPopulation('Gampaha');

  it('computes exact population share and incidence according to prompt example (Gampaha: 12 cases)', () => {
    expect(gampahaPop).toBe(2304833);
    const result = formatPopulationShare(12, 'Gampaha');
    expect(result.population).toBe(2304833);
    expect(result.formattedShare).toBe('0.0005%');
    expect(result.incidencePer100k).toBe(0.52);
    expect(result.display).toContain('0.0005% of district population');
    expect(result.display).toContain('0.52 per 100,000');
  });

  it('never displays 0% when cases > 0', () => {
    // 1 case in Colombo (pop ~2.32M) produces 0.00004%, which must not round down to 0%
    const colomboResult = formatPopulationShare(1, 'Colombo');
    expect(colomboResult.formattedShare).not.toBe('0%');
    expect(colomboResult.formattedShare).not.toBe('0.00%');
    expect(colomboResult.formattedShare).toBe('0.00004%');

    // 0 cases correctly displays 0%
    const zeroResult = formatPopulationShare(0, 'Colombo');
    expect(zeroResult.formattedShare).toBe('0%');
  });

  it('enriches alert with read-time 72h metrics, island-wide total, and honesty note', () => {
    const mockGrowthData = {
      window: '72h',
      windowHours: 72,
      districts: [
        {
          disease: 'ICD10:A90',
          district: 'Gampaha',
          currentCases: 12,
          previousCases: 3,
          absoluteChange: 9,
          percentChange: 300,
          population: 2304833,
          incidencePer100k: 0.52,
          hasPopulation: true
        }
      ],
      island: [
        {
          disease: 'ICD10:A90',
          currentCases: 20,
          previousCases: 8,
          absoluteChange: 12,
          percentChange: 150,
          population: 20358680,
          incidencePer100k: 0.10
        }
      ]
    };

    // Stored alert lacking any stored 72h or population fields
    const storedAlert = {
      _id: 'mock-alert-gampaha',
      disease: 'Dengue',
      district: 'Gampaha',
      location: 'Gampaha',
      severity: 'Critical',
      status: 'Pending'
    };

    const enriched = enrichAlertWith72h(storedAlert, mockGrowthData);

    expect(enriched.metrics72h).toBeDefined();
    expect(enriched.metrics72h.currentCases).toBe(12);
    expect(enriched.metrics72h.previousCases).toBe(3);
    expect(enriched.metrics72h.absoluteChange).toBe(9);
    expect(enriched.metrics72h.percentChange).toBe(300);
    expect(enriched.metrics72h.population).toBe(2304833);
    expect(enriched.metrics72h.formattedShare).toBe('0.0005%');
    expect(enriched.metrics72h.incidencePer100k).toBe(0.52);
    expect(enriched.metrics72h.islandCases).toBe(20);
    expect(enriched.metrics72h.censusYear).toBe(2012);
    expect(enriched.metrics72h.honestyNote).toContain('lower bound');
    expect(enriched.metrics72h.plainText).toBe(
      'Gampaha: 12 cases in the last 72h (previous 72h: 3, +9). 0.0005% of the district population, 0.52 per 100,000. Island-wide: 20 cases.'
    );
  });

  it('correctly handles brand new signal (0 previous cases) with "new"', () => {
    const mockGrowthData = {
      window: '72h',
      windowHours: 72,
      districts: [
        {
          disease: 'ICD10:J11',
          district: 'Kandy',
          currentCases: 6,
          previousCases: 0,
          absoluteChange: 6,
          percentChange: 'new',
          population: 1375382,
          incidencePer100k: 0.44,
          hasPopulation: true
        }
      ],
      island: [
        {
          disease: 'ICD10:J11',
          currentCases: 6,
          previousCases: 0,
          absoluteChange: 6,
          percentChange: 'new',
          population: 20358680,
          incidencePer100k: 0.03
        }
      ]
    };

    const alert = {
      _id: 'mock-alert-kandy',
      disease: 'Influenza',
      district: 'Kandy',
      severity: 'High',
      status: 'Pending'
    };

    const enriched = enrichAlertWith72h(alert, mockGrowthData);
    expect(enriched.metrics72h.currentCases).toBe(6);
    expect(enriched.metrics72h.previousCases).toBe(0);
    expect(enriched.metrics72h.percentChange).toBe('new');
    expect(enriched.metrics72h.islandCases).toBe(6);
  });
});
