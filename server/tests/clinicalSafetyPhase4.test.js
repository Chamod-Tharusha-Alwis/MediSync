'use strict';

const { evaluateEmergencyRedFlags } = require('../src/utils/emergencyAdvisory');
const {
  analyzeMedicationSafety,
  checkAllergyConflict,
} = require('../src/utils/ingredientResolver');
const { COMMON_DRUGS } = require('../src/controllers/drugController');
const {
  evaluateMedicineSafety,
  findSafetyLimit,
} = require('../src/utils/medicineSafetyEngine');
const mlPredictionService = require('../src/services/mlPredictionService');
const axios = require('axios');

describe('Phase 4 — Clinical Safety Gaps & Emergency Red-Flag Advisory Suite', () => {
  const originalInternalKey = process.env.INTERNAL_API_KEY;

  beforeAll(() => {
    process.env.INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || 'test-internal-api-key';
  });

  afterAll(() => {
    process.env.INTERNAL_API_KEY = originalInternalKey;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. Deterministic Rule-Based Emergency Red-Flag Screen', () => {
    test('SC-09 triggers ACUTE_MENINGISM advisory for sudden severe headache + neck stiffness + photophobia', () => {
      const symptoms = ['sudden severe headache', 'stiff neck', 'photophobia'];
      const result = evaluateEmergencyRedFlags(symptoms);

      expect(result.hasEmergencyRedFlag).toBe(true);
      expect(result.advisory).toBe('Possible emergency presentation: urgent clinical assessment recommended');
      expect(result.clinicalValidation).toBe('not_established');
      expect(result.provenance).toBe('design heuristic, not clinically validated');

      const meningismRule = result.flaggedRules.find((r) => r.id === 'ACUTE_MENINGISM');
      expect(meningismRule).toBeDefined();
      expect(meningismRule.matchedRequired.length).toBeGreaterThan(0);
      expect(meningismRule.matchedAccompanied.length).toBeGreaterThan(0);
    });

    test('SC-03 triggers ACUTE_CARDIORESPIRATORY_DISTRESS for dependent edema + exertional breathlessness', () => {
      const symptoms = ['swollen ankles', 'weight gain', 'shortness of breath on exertion'];
      const result = evaluateEmergencyRedFlags(symptoms);

      expect(result.hasEmergencyRedFlag).toBe(true);
      expect(result.advisory).toBe('Possible emergency presentation: urgent clinical assessment recommended');

      const cardioRule = result.flaggedRules.find((r) => r.id === 'ACUTE_CARDIORESPIRATORY_DISTRESS');
      expect(cardioRule).toBeDefined();
      expect(cardioRule.matchedRequired.length).toBeGreaterThan(0);
      expect(cardioRule.matchedAccompanied.length).toBeGreaterThan(0);
    });

    test('triggers ACUTE_CORONARY_SYNDROME for chest pain + sweating and radiating arm pain', () => {
      const symptoms = ['chest pain', 'sweating', 'pain radiating to left arm'];
      const result = evaluateEmergencyRedFlags(symptoms);

      expect(result.hasEmergencyRedFlag).toBe(true);
      const coronaryRule = result.flaggedRules.find((r) => r.id === 'ACUTE_CORONARY_SYNDROME');
      expect(coronaryRule).toBeDefined();
    });

    test('triggers ALTERED_CONSCIOUSNESS for acute syncope or loss of consciousness', () => {
      const symptoms = ['loss of consciousness'];
      const result = evaluateEmergencyRedFlags(symptoms);

      expect(result.hasEmergencyRedFlag).toBe(true);
      const consciousnessRule = result.flaggedRules.find((r) => r.id === 'ALTERED_CONSCIOUSNESS');
      expect(consciousnessRule).toBeDefined();
    });

    test('triggers ANAPHYLAXIS for airway swelling with wheezing or hypotension', () => {
      const symptoms = ['facial swelling', 'throat tightness', 'wheezing'];
      const result = evaluateEmergencyRedFlags(symptoms);

      expect(result.hasEmergencyRedFlag).toBe(true);
      const anaphylaxisRule = result.flaggedRules.find((r) => r.id === 'ANAPHYLAXIS');
      expect(anaphylaxisRule).toBeDefined();
    });

    test('triggers SEVERE_HEMORRHAGE for hematemesis or heavy bleeding', () => {
      const symptoms = ['hematemesis', 'vomiting blood'];
      const result = evaluateEmergencyRedFlags(symptoms);

      expect(result.hasEmergencyRedFlag).toBe(true);
      const hemorrhageRule = result.flaggedRules.find((r) => r.id === 'SEVERE_HEMORRHAGE');
      expect(hemorrhageRule).toBeDefined();
    });

    test('SC-05 resting tremor and rigidity does NOT trigger emergency advisory (chronic neurodegenerative pattern)', () => {
      const symptoms = ['tremor', 'bradykinesia', 'muscle rigidity'];
      const result = evaluateEmergencyRedFlags(symptoms);

      expect(result.hasEmergencyRedFlag).toBe(false);
      expect(result.advisory).toBeNull();
      expect(result.flaggedRules).toHaveLength(0);
      expect(result.clinicalValidation).toBe('not_established');
    });

    test('SC-10 malar rash presentation does NOT trigger emergency advisory (subacute autoimmune pattern)', () => {
      const symptoms = ['skin rash on face', 'malar butterfly rash', 'joint stiffness'];
      const result = evaluateEmergencyRedFlags(symptoms);

      expect(result.hasEmergencyRedFlag).toBe(false);
      expect(result.advisory).toBeNull();
      expect(result.flaggedRules).toHaveLength(0);
    });

    test('benign common symptoms do not trigger emergency advisory', () => {
      const symptoms = ['cough', 'mild fever', 'runny nose', 'sneezing'];
      const result = evaluateEmergencyRedFlags(symptoms);

      expect(result.hasEmergencyRedFlag).toBe(false);
      expect(result.advisory).toBeNull();
      expect(result.flaggedRules).toHaveLength(0);
    });

    test('empty or invalid symptoms cleanly return no emergency advisory', () => {
      expect(evaluateEmergencyRedFlags([]).hasEmergencyRedFlag).toBe(false);
      expect(evaluateEmergencyRedFlags('').hasEmergencyRedFlag).toBe(false);
      expect(evaluateEmergencyRedFlags(null).hasEmergencyRedFlag).toBe(false);
    });
  });

  describe('2. ML Prediction Resilience & Invariance', () => {
    test('predictDiseaseResilient attaches emergencyAdvisory without modifying predictions array', async () => {
      const mockMlOutput = {
        predictions: [
          { disease: 'Migraine', icd_code: 'G43.909', confidence: 36.4, source: 'curated' },
          { disease: 'Tension Headache', icd_code: 'G44.209', confidence: 28.1, source: 'curated' },
        ],
      };

      jest.spyOn(axios, 'post').mockResolvedValue({
        data: mockMlOutput,
      });

      const response = await mlPredictionService.predictDiseaseResilient([
        'sudden severe headache',
        'stiff neck',
        'photophobia',
      ]);

      expect(response.statusCode).toBe(200);
      expect(response.data.availability).toBe('available');
      // Invariant: ML candidate ordering and contents are completely identical
      expect(response.data.predictions).toHaveLength(2);
      expect(response.data.predictions[0].disease).toBe('Migraine');
      expect(response.data.predictions[1].disease).toBe('Tension Headache');
      // Emergency advisory is attached alongside
      expect(response.data.emergencyAdvisory).toBeDefined();
      expect(response.data.emergencyAdvisory.hasEmergencyRedFlag).toBe(true);
      expect(response.data.emergencyAdvisory.clinicalValidation).toBe('not_established');
    });

    test('predictDiseaseResilient attaches emergencyAdvisory even when ML service fails (503 fallback)', async () => {
      jest.spyOn(axios, 'post').mockRejectedValue({
        code: 'ECONNREFUSED',
        message: 'connect ECONNREFUSED 127.0.0.1:5001',
      });

      const response = await mlPredictionService.predictDiseaseResilient(
        ['chest pain', 'sweating', 'pain radiating to arm'],
        { retryDelayMs: 0 }
      );

      expect(response.statusCode).toBe(503);
      expect(response.data.predictions).toEqual([]);
      // Safety advisory is still present and active during outages
      expect(response.data.emergencyAdvisory).toBeDefined();
      expect(response.data.emergencyAdvisory.hasEmergencyRedFlag).toBe(true);
    });
  });

  describe('3. Five Implemented Medicine Safety Rules Verification', () => {
    test('Rule 1: Drug-Drug Interaction (DDI) detects Amoxicillin + Warfarin interaction', () => {
      const result = analyzeMedicationSafety(['Amoxicillin', 'Warfarin'], [], COMMON_DRUGS);
      expect(result.hasInteraction).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      const ddi = result.warnings.find((w) => w.type === 'drug_interaction');
      expect(ddi).toBeDefined();
      expect(ddi.description || ddi.message).toContain('anticoagulant');
    });

    test('Rule 2: Duplicate Active Ingredient detection flags Paracetamol brand combinations', async () => {
      const result = await evaluateMedicineSafety({
        medications: ['Paracetamol', 'Panadol'],
      });
      expect(result.hasWarnings).toBe(true);
      const dup = result.warnings.find((w) => w.type === 'duplicate_active_ingredient');
      expect(dup).toBeDefined();
      expect(dup.ingredient).toBe('acetaminophen');
    });

    test('Rule 3: Patient Allergy Conflict flags matching drug or class', () => {
      const allergyResult = checkAllergyConflict('Amoxicillin', ['penicillin']);
      expect(allergyResult.hasConflict).toBe(true);
      expect(allergyResult.conflicts[0].type).toBe('class_cross_reactivity');
    });

    test('Rule 4: Daily dose ceilings enforce maximum thresholds from cited limits catalog', async () => {
      const limit = findSafetyLimit('Paracetamol');
      expect(limit).toBeDefined();
      expect(limit.maxDailyDoseMg).toBe(4000);

      // 1500mg TDS = 4500mg daily > 4000mg limit
      const highDoseResult = await evaluateMedicineSafety({
        medications: [{ drugName: 'Paracetamol', dosage: '1500mg', frequency: 'TDS' }],
      });
      const highDoseWarning = highDoseResult.warnings.find((w) => w.type === 'dosage_limit_exceeded');
      expect(highDoseWarning).toBeDefined();
      expect(highDoseWarning.dailyDoseMg).toBe(4500);

      // 500mg TDS = 1500mg daily <= 4000mg limit
      const normalDoseResult = await evaluateMedicineSafety({
        medications: [{ drugName: 'Paracetamol', dosage: '500mg', frequency: 'TDS' }],
      });
      const normalDoseWarning = normalDoseResult.warnings.find((w) => w.type === 'dosage_limit_exceeded');
      expect(normalDoseWarning).toBeUndefined();
    });

    test('Rule 5: Course duration limits detect excessive course lengths from cited limits catalog', async () => {
      const limit = findSafetyLimit('Paracetamol');
      expect(limit).toBeDefined();
      expect(limit.maxCourseDurationDays).toBe(7);

      // 14 days > 7 days maxCourseDurationDays
      const longCourseResult = await evaluateMedicineSafety({
        medications: [{ drugName: 'Paracetamol', durationDays: 14 }],
      });
      const longWarning = longCourseResult.warnings.find((w) => w.type === 'duration_limit_exceeded');
      expect(longWarning).toBeDefined();
      expect(longWarning.durationDays).toBe(14);

      // 5 days <= 7 days
      const normalCourseResult = await evaluateMedicineSafety({
        medications: [{ drugName: 'Paracetamol', durationDays: 5 }],
      });
      const normalWarning = normalCourseResult.warnings.find((w) => w.type === 'duration_limit_exceeded');
      expect(normalWarning).toBeUndefined();
    });
  });
});
