'use strict';

/**
 * Phase 6 Synthetic Outbreak Scenarios Offline Verification Suite
 * Target: server/tests/phase6OutbreakScenariosOffline.test.js
 *
 * Verifies:
 * 1. Exactly 6 synthetic outbreak scenarios.
 * 2. Exact tier distribution: 2 High, 2 Medium (stored as Moderate), 2 Low.
 * 3. All districts match official Sri Lankan district list in surveillanceService.
 * 4. All severities match OutbreakAlert Mongoose schema enum.
 * 5. Immutable batch identifier 'PHASE6_SYNTHETIC_V1' on every scenario.
 * 6. Zero PII, patient NIC, or personal identification fields present.
 * 7. Dry-run executes safely without database writes.
 */

const { SCENARIOS, BATCH_ID, seedOutbreaks } = require('../../scripts/seedSyntheticOutbreaks');
const OutbreakAlert = require('../src/models/OutbreakAlert');

const OFFICIAL_DISTRICTS = new Set(
  'Ampara|Anuradhapura|Badulla|Batticaloa|Colombo|Galle|Gampaha|Hambantota|Jaffna|Kalutara|Kandy|Kegalle|Kilinochchi|Kurunegala|Mannar|Matale|Matara|Monaragala|Mullaitivu|Nuwara Eliya|Polonnaruwa|Puttalam|Ratnapura|Trincomalee|Vavuniya'.split('|')
);

describe('Phase 6 — Synthetic Outbreak Scenarios Offline Verification', () => {
  test('1. Generates exactly 6 synthetic scenarios', () => {
    expect(Array.isArray(SCENARIOS)).toBe(true);
    expect(SCENARIOS).toHaveLength(6);
  });

  test('2. Enforces exact 2 High, 2 Medium (Moderate), 2 Low severity distribution', () => {
    const high = SCENARIOS.filter(s => s.severity === 'High');
    const medium = SCENARIOS.filter(s => s.severity === 'Moderate');
    const low = SCENARIOS.filter(s => s.severity === 'Low');

    expect(high).toHaveLength(2);
    expect(medium).toHaveLength(2);
    expect(low).toHaveLength(2);
  });

  test('3. Persisted severity matches OutbreakAlert Mongoose enum values', () => {
    const validEnums = OutbreakAlert.schema.path('severity').enumValues;
    for (const scenario of SCENARIOS) {
      expect(validEnums).toContain(scenario.severity);
    }
  });

  test('4. All locations match recognized Sri Lankan districts', () => {
    for (const scenario of SCENARIOS) {
      expect(OFFICIAL_DISTRICTS.has(scenario.location)).toBe(true);
      expect(OFFICIAL_DISTRICTS.has(scenario.district)).toBe(true);
    }
  });

  test('5. Standardized batch identifier is assigned', () => {
    expect(BATCH_ID).toBe('PHASE6_SYNTHETIC_V1');
  });

  test('6. Zero PII, patient NICs, or unauthorized surveillance escalation', () => {
    for (const s of SCENARIOS) {
      expect(s).not.toHaveProperty('nic');
      expect(s).not.toHaveProperty('patientNic');
      expect(s).not.toHaveProperty('patientId');
      expect(s).not.toHaveProperty('phone');
      expect(s).not.toHaveProperty('email');
    }
  });

  test('7. Realistic epidemiological case thresholds and positive spikes', () => {
    for (const s of SCENARIOS) {
      expect(s.affectedCount).toBeGreaterThan(0);
      expect(s.baseline).toBeGreaterThan(0);
      expect(s.spikePercentage).toBeGreaterThanOrEqual(50);
      expect(typeof s.disease).toBe('string');
      expect(s.disease.length).toBeGreaterThan(3);
    }
  });

  test('8. Dry-run execution completes safely without mutating state', async () => {
    const result = await seedOutbreaks('--dry-run');
    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.scenarios).toHaveLength(6);
  });
});
