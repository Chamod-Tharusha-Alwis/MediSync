'use strict';

/**
 * Phase D2b Offline Regression Test: Sourced Disease-Symptom Knowledge Base
 * Verifies edge probability preservation, quality threshold filtering (P >= 15%),
 * minimum surviving symptoms (>= 3), dummy cluster quarantine, zero active KB
 * contamination, and strict separation of unmapped review candidates.
 */

const fs = require('fs');
const path = require('path');

const KB_PATH = path.resolve(__dirname, '../../ml-engine/data/disease_symptom_kb.v1.json');
const UNMAPPED_PATH = path.resolve(__dirname, '../../ml-engine/data/unmapped_diseases.v1.json');
const QUARANTINE_PATH = path.resolve(__dirname, '../../ml-engine/data/kb_quarantine.v1.json');
const REVIEW_CSV_PATH = path.resolve(__dirname, '../../ml-engine/data_pipeline/mapping_review.csv');

describe('Phase D2b Sourced Disease-Symptom Knowledge Base Contract', () => {
  let kb;
  let unmapped;
  let quarantine;

  beforeAll(() => {
    expect(fs.existsSync(KB_PATH)).toBe(true);
    expect(fs.existsSync(UNMAPPED_PATH)).toBe(true);
    expect(fs.existsSync(QUARANTINE_PATH)).toBe(true);
    expect(fs.existsSync(REVIEW_CSV_PATH)).toBe(true);

    kb = JSON.parse(fs.readFileSync(KB_PATH, 'utf8'));
    unmapped = JSON.parse(fs.readFileSync(UNMAPPED_PATH, 'utf8'));
    quarantine = JSON.parse(fs.readFileSync(QUARANTINE_PATH, 'utf8'));
  });

  test('top-level KB metadata conforms to schema and license status', () => {
    expect(kb.version).toBe('1.0.0');
    expect(typeof kb.generatedAt).toBe('string');
    expect(kb.source).toMatch(/SymCAT/i);
    expect(kb.licenseStatus).toBe('internal research use, licence unverified');
    expect(kb.disclaimer).toContain('clinicalValidation: not_established');
    expect(kb.curation).toBeDefined();
    expect(kb.curation.probabilityThreshold).toBe(15.0);
    expect(kb.curation.minSurvivingSymptoms).toBe(3);
    expect(Array.isArray(kb.diseases)).toBe(true);
    expect(kb.diseases.length).toBeGreaterThanOrEqual(100);
  });

  test('every symptom edge contains an empirical probability >= 15.0%', () => {
    for (const d of kb.diseases) {
      expect(Array.isArray(d.symptoms)).toBe(true);
      expect(d.symptoms.length).toBeGreaterThanOrEqual(3);
      for (const edge of d.symptoms) {
        expect(typeof edge).toBe('object');
        expect(typeof edge.name).toBe('string');
        expect(edge.name.trim().length).toBeGreaterThan(0);
        expect(typeof edge.probability).toBe('number');
        expect(edge.probability).toBeGreaterThanOrEqual(15.0);
        expect(edge.probability).toBeLessThanOrEqual(100.0);
        expect(edge.name).not.toMatch(/placeholder|generic symptom|symptom \d+/i);
      }
    }
  });

  test('every disease entry contains non-empty provenance tracing to raw source', () => {
    for (const d of kb.diseases) {
      expect(d.provenance).toBeDefined();
      expect(typeof d.provenance.source).toBe('string');
      expect(d.provenance.licenseStatus).toBe('internal research use, licence unverified');
      expect(typeof d.provenance.retrievedAt).toBe('string');
    }
  });

  test('quarantine ledger isolates dummy imputation cluster and priority diseases with zero active contamination', () => {
    expect(Array.isArray(quarantine.quarantinedDiseases)).toBe(true);
    expect(quarantine.quarantinedDiseases.length).toBeGreaterThanOrEqual(100);

    const quarantinedNames = new Set(quarantine.quarantinedDiseases.map(d => d.name.toLowerCase()));
    const mustQuarantine = [
      'blastomycosis', 'chancroid', 'leishmaniasis', 'leptospirosis',
      'rabies', 'air embolism', 'fat embolism', 'chagas disease',
      'typhoid fever', 'dengue fever'
    ];

    for (const name of mustQuarantine) {
      expect(quarantinedNames.has(name)).toBe(true);
    }

    const activeNames = new Set(kb.diseases.map(d => d.name.toLowerCase()));
    for (const name of mustQuarantine) {
      expect(activeNames.has(name)).toBe(false);
    }
  });

  test('mapped diseases have valid ICD-10 formatting and confidence exact_normalized', () => {
    const icdRegex = /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/;
    for (const d of kb.diseases) {
      expect(d.mappingConfidence).toBe('exact_normalized');
      expect(d.icd10).toMatch(icdRegex);
    }
  });

  test('unmapped diseases remain strictly separated and not populated into mapped KB', () => {
    const mappedIds = new Set(kb.diseases.map(d => d.diseaseId));
    const unmappedIds = new Set(unmapped.diseases.map(d => d.diseaseId));

    for (const id of unmappedIds) {
      expect(mappedIds.has(id)).toBe(false);
    }

    for (const d of unmapped.diseases) {
      expect(d.mappingConfidence).toBe('none');
      expect(d.icd10).toBeNull();
    }
  });
});
