'use strict';

const mongoose = require('mongoose');
const { buildOutbreakSeedPlan } = require('../../scripts/seed_viva_outbreaks');
const {
  selectCases,
  evaluateOutbreakCriteria,
  getSeverityFromZ,
  diseasesMatch
} = require('../src/services/surveillanceService');
const { diseaseLabel } = require('../src/services/publicHealthStats');

describe('Part 3: Outbreak Scan Verification against Seeded Viva Plan', () => {
  const refDate = new Date();
  const plan = buildOutbreakSeedPlan(refDate);

  it('proves selectCases in mode: "real" admits all seeded consultations without provenance rejection', () => {
    // Hydrate consultations with mock Mongo _id and patientId as MongoDB would on insertion
    const hydratedConsultations = plan.consultations.map((c) => ({
      ...c,
      _id: new mongoose.Types.ObjectId(),
      patientId: new mongoose.Types.ObjectId()
    }));

    const selection = selectCases(hydratedConsultations, {
      mode: 'real',
      now: refDate,
      lookbackDays: 63
    });

    expect(selection.cases.length).toBe(124);
    expect(selection.excluded.provenance).toBeUndefined();
    expect(selection.policy).toBe('5w-verified-episodes-v1');
  });

  it('proves all five alerts trigger and both suppressions appear according to criteria', () => {
    const hydratedConsultations = plan.consultations.map((c) => ({
      ...c,
      _id: new mongoose.Types.ObjectId(),
      patientId: new mongoose.Types.ObjectId()
    }));

    const selection = selectCases(hydratedConsultations, {
      mode: 'real',
      now: refDate,
      lookbackDays: 63
    });

    const criteriaResults = evaluateOutbreakCriteria({
      cases: selection.cases,
      now: refDate,
      baselineDays: 56,
      level: 'district'
    });

    // 1. Gampaha Dengue -> Triggered, Critical (12 cases, maxZ ~7.57)
    const gampaha = criteriaResults.find(r => r.district === 'Gampaha');
    expect(gampaha).toBeDefined();
    expect(gampaha.triggered).toBe(true);
    expect(gampaha.severity).toBe('Critical');
    expect(gampaha.count).toBe(12);

    // 2. Kandy Influenza -> Triggered, High (8 cases, maxZ ~3.50, in [3.0, 4.0))
    const kandy = criteriaResults.find(r => r.district === 'Kandy');
    expect(kandy).toBeDefined();
    expect(kandy.triggered).toBe(true);
    expect(kandy.severity).toBe('High');
    expect(kandy.count).toBe(8);
    expect(kandy.maxZ).toBeGreaterThanOrEqual(3.0);
    expect(kandy.maxZ).toBeLessThan(4.0);

    // 3. Galle Leptospirosis -> Triggered, Critical/High (7 cases)
    const galle = criteriaResults.find(r => r.district === 'Galle');
    expect(galle).toBeDefined();
    expect(galle.triggered).toBe(true);
    expect(galle.count).toBe(7);

    // 4. Ratnapura Typhoid -> Triggered, Critical/Moderate (6 cases)
    const ratnapura = criteriaResults.find(r => r.district === 'Ratnapura');
    expect(ratnapura).toBeDefined();
    expect(ratnapura.triggered).toBe(true);
    expect(ratnapura.count).toBe(6);

    // 5. Colombo Chickenpox -> Triggered, Non-profiled universal trigger (6 cases)
    const colombo = criteriaResults.find(r => r.district === 'Colombo');
    expect(colombo).toBeDefined();
    expect(colombo.triggered).toBe(true);
    expect(colombo.count).toBe(6);
    expect(colombo.disease).toBe('ICD10:B01');

    // 6. Kalutara Dengue -> Suppressed, PERSISTENCE_CRITERIA_NOT_MET (single-day spike of 6)
    const kalutara = criteriaResults.find(r => r.district === 'Kalutara');
    expect(kalutara).toBeDefined();
    expect(kalutara.triggered).toBe(false);
    expect(kalutara.reason).toBe('PERSISTENCE_CRITERIA_NOT_MET');

    // 7. Matara Dengue -> Suppressed, CASE_FLOOR_NOT_MET (3 cases < 5 floor)
    const matara = criteriaResults.find(r => r.district === 'Matara');
    expect(matara).toBeDefined();
    expect(matara.triggered).toBe(false);
    expect(matara.reason).toBe('CASE_FLOOR_NOT_MET');
    expect(matara.count).toBeLessThan(5);
  });

  it('proves getSeverityFromZ threshold enforcement', () => {
    // Under 2 consecutive days -> None
    expect(getSeverityFromZ(5.5, 1)).toEqual({ alertLevel: 'None', severity: 'None' });

    // Z >= 4.0 -> Critical
    expect(getSeverityFromZ(4.5, 2)).toEqual({ alertLevel: 'Critical', severity: 'Critical' });
    expect(getSeverityFromZ(4.0, 2)).toEqual({ alertLevel: 'Critical', severity: 'Critical' });

    // 3.0 <= Z < 4.0 -> High (Alert level, Kandy z=3.54)
    expect(getSeverityFromZ(3.54, 2)).toEqual({ alertLevel: 'Alert', severity: 'High' });
    expect(getSeverityFromZ(3.0, 2)).toEqual({ alertLevel: 'Alert', severity: 'High' });

    // 2.0 <= Z < 3.0 -> Moderate (Watch level)
    expect(getSeverityFromZ(2.5, 2)).toEqual({ alertLevel: 'Watch', severity: 'Moderate' });
    expect(getSeverityFromZ(2.0, 2)).toEqual({ alertLevel: 'Watch', severity: 'Moderate' });

    // Z < 2.0 -> None
    expect(getSeverityFromZ(1.8, 2)).toEqual({ alertLevel: 'None', severity: 'None' });
  });

  it('proves disease label mapping for all seeded conditions (A27, A01, J11.1, A90)', () => {
    expect(diseaseLabel('ICD10:A27')).toBe('Leptospirosis');
    expect(diseaseLabel('ICD10:A279')).toBe('Leptospirosis');
    expect(diseaseLabel('ICD10:A01')).toBe('Typhoid fever');
    expect(diseaseLabel('ICD10:A010')).toBe('Typhoid fever');
    expect(diseaseLabel('ICD10:J111')).toBe('Influenza');
    expect(diseaseLabel('ICD10:J11')).toBe('Influenza');
    expect(diseaseLabel('ICD10:A90')).toBe('Dengue');

    expect(diseasesMatch('ICD10:A27', 'Leptospirosis')).toBe(true);
    expect(diseasesMatch('ICD10:A01', 'Typhoid fever')).toBe(true);
    expect(diseasesMatch('ICD10:J111', 'Influenza')).toBe(true);
    expect(diseasesMatch('ICD10:A90', 'Dengue')).toBe(true);
  });
});
