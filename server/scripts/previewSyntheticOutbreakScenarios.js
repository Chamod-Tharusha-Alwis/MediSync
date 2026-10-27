'use strict';

/**
 * MediSync — 6-Scenario Catalog-Validated Synthetic Outbreak Surveillance Preview Tool
 *
 * Scenarios (Exact 2 High, 2 Medium, 2 Low Distribution):
 * 1. High Danger: Dengue (Kandy) -> Critical/High Severity Spike
 * 2. High Danger: Cholera (Jaffna) -> Critical/High Severity Spike
 * 3. Medium Danger: Gastroenteritis (Colombo) -> Moderate/Medium Severity Spike
 * 4. Medium Danger: Typhoid Fever (Matara) -> Moderate/Medium Severity Spike
 * 5. Low Danger: Common Cold (Nuwara Eliya) -> Capped Medium Severity Spike (>100 cases, >=800%)
 * 6. Low Danger: Seasonal Allergies (Badulla) -> Low/Normal Severity Baseline Activity
 *
 * Safety & Privacy Boundaries:
 * - isSimulation: true
 * - isSyntheticUniversityData: true
 * - syntheticLabel: 'SYNTHETIC DEMONSTRATION'
 * - Zero patient NIC or consultation records generated.
 * - Zero emails, SMS, or public broadcasts dispatched.
 * - Preview-first / Dry-run by default.
 */

const SYNTHETIC_SCENARIOS = [
  {
    scenarioId: 'SIM-HIGH-DENGUE-KANDY',
    disease: 'Dengue',
    icdCode: 'A90',
    district: 'Kandy',
    coordinates: [7.2906, 80.6337],
    dangerLevel: 'High',
    baselineDailyAvg: 10,
    currentCases: 32,
    spikePercentage: 220,
    calculatedSeverity: 'Critical',
    rationale: 'High Danger pathogen exceeding 10 cases with >=150% surge over 14-day baseline.'
  },
  {
    scenarioId: 'SIM-HIGH-CHOLERA-JAFFNA',
    disease: 'Cholera',
    icdCode: 'A00',
    district: 'Jaffna',
    coordinates: [9.6615, 80.0255],
    dangerLevel: 'High',
    baselineDailyAvg: 4,
    currentCases: 16,
    spikePercentage: 300,
    calculatedSeverity: 'Critical',
    rationale: 'High Danger waterborne outbreak with 300% surge over moving baseline.'
  },
  {
    scenarioId: 'SIM-MED-GASTRO-COLOMBO',
    disease: 'Gastroenteritis',
    icdCode: 'A09.9',
    district: 'Colombo',
    coordinates: [6.9271, 79.8612],
    dangerLevel: 'Medium',
    baselineDailyAvg: 20,
    currentCases: 85,
    spikePercentage: 325,
    calculatedSeverity: 'Moderate',
    rationale: 'Medium Danger systemic condition exceeding 30 cases with >=300% surge.'
  },
  {
    scenarioId: 'SIM-MED-TYPHOID-MATARA',
    disease: 'Typhoid Fever',
    icdCode: 'A01.0',
    district: 'Matara',
    coordinates: [5.9549, 80.5550],
    dangerLevel: 'Medium',
    baselineDailyAvg: 6,
    currentCases: 22,
    spikePercentage: 267,
    calculatedSeverity: 'Moderate',
    responsePriority: 'P3-Moderate',
    rationale: 'Medium Danger water/food-borne enteric pathogen (Salmonella Typhi) showing 267% surge over 14-day baseline.'
  },
  {
    scenarioId: 'SIM-LOW-COLD-NUWARAELIYA',
    disease: 'Common Cold',
    icdCode: 'J00',
    district: 'Nuwara Eliya',
    coordinates: [6.9497, 80.7839],
    dangerLevel: 'Low',
    baselineDailyAvg: 25,
    currentCases: 260,
    spikePercentage: 940,
    calculatedSeverity: 'Moderate',
    rationale: 'Low Danger respiratory condition exceeding 100 cases and >=800% spike; severity capped at Moderate to avoid emergency panic.'
  },
  {
    scenarioId: 'SIM-LOW-ALLERGY-BADULLA',
    disease: 'Seasonal Allergies',
    icdCode: 'T78.4',
    district: 'Badulla',
    coordinates: [6.9934, 81.0550],
    dangerLevel: 'Low',
    baselineDailyAvg: 20,
    currentCases: 75,
    spikePercentage: 275,
    calculatedSeverity: 'Low',
    rationale: 'Low Danger environmental sensitivity (synthetic teaching simulation baseline; non-infectious condition, not evidence of communicable outbreak).'
  }
];

function generateOutbreakPreview(now = new Date()) {
  const documents = SYNTHETIC_SCENARIOS.map(s => ({
    scenarioId: s.scenarioId,
    disease: s.disease,
    icdCode: s.icdCode,
    location: s.district,
    district: s.district,
    coordinates: s.coordinates,
    dangerLevel: s.dangerLevel,
    severity: s.calculatedSeverity,
    severitySource: 'MANUAL_SYNTHETIC_TEACHING_SCENARIO',
    clinicalUsePermitted: false,
    affectedCount: s.currentCases,
    baseline: s.baselineDailyAvg,
    spikePercentage: s.spikePercentage,
    status: 'Active',
    isSimulation: true,
    isSyntheticUniversityData: true,
    datasetBatch: 'PHASE6_SYNTHETIC_V1',
    syntheticLabel: 'SYNTHETIC DEMONSTRATION',
    publicAuthorityNotice: 'ACADEMIC SYNTHETIC PREVIEW ONLY — NOT AN OFFICIAL PUBLIC HEALTH NOTICE',
    createdAt: now.toISOString(),
    rationale: s.rationale
  }));

  return {
    readiness: {
      clinicalUse: 'FORBIDDEN',
      catalogAlignment: 'HOLD',
      severityValidation: 'MANUAL_LABELS_NOT_A_MODEL_RESULT',
      holds: ['Requested Medium Typhoid teaching tier conflicts with High in the pinned ML curated catalog; clinical review required.']
    },
    scenarioCount: documents.length,
    tierBreakdown: {
      highDangerCount: documents.filter(d => d.dangerLevel === 'High').length,
      mediumDangerCount: documents.filter(d => d.dangerLevel === 'Medium').length,
      lowDangerCount: documents.filter(d => d.dangerLevel === 'Low').length
    },
    severityBreakdown: {
      criticalCount: documents.filter(d => d.severity === 'Critical').length,
      moderateCount: documents.filter(d => d.severity === 'Moderate').length,
      lowCount: documents.filter(d => d.severity === 'Low').length
    },
    safetyGuards: {
      zeroPatientNics: true,
      zeroConsultations: true,
      zeroExternalBroadcasts: true,
      isolatedToInternalPreview: true
    },
    documents
  };
}

if (require.main === module) {
  const preview = generateOutbreakPreview();
  console.log('===============================================================');
  console.log('MEDISYNC 6-SCENARIO SYNTHETIC OUTBREAK SURVEILLANCE PREVIEW');
  console.log('===============================================================\n');
  console.log(JSON.stringify(preview, null, 2));
}

module.exports = {
  SYNTHETIC_SCENARIOS,
  generateOutbreakPreview
};
