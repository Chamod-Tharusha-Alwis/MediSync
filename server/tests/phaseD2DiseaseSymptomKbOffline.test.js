'use strict';

/**
 * Phase D2 Offline Regression Test: Sourced Disease-Symptom Knowledge Base
 * Verifies schema compliance, provenance completeness, symptom non-emptiness,
 * valid ICD-10 formatting, and strict separation of unmapped records.
 */

const fs = require('fs');
const path = require('path');

const KB_PATH = path.resolve(__dirname, '../../ml-engine/data/disease_symptom_kb.v1.json');
const UNMAPPED_PATH = path.resolve(__dirname, '../../ml-engine/data/unmapped_diseases.v1.json');

describe('Phase D2 Sourced Disease-Symptom Knowledge Base Contract', () => {
  let kb;
  let unmapped;

  beforeAll(() => {
    expect(fs.existsSync(KB_PATH)).toBe(true);
    expect(fs.existsSync(UNMAPPED_PATH)).toBe(true);
    kb = JSON.parse(fs.readFileSync(KB_PATH, 'utf8'));
    unmapped = JSON.parse(fs.readFileSync(UNMAPPED_PATH, 'utf8'));
  });

  test('top-level KB metadata conforms to schema specification', () => {
    expect(kb.version).toBe('1.0.0');
    expect(typeof kb.generatedAt).toBe('string');
    expect(kb.source).toMatch(/CDC|SymCAT/i);
    expect(kb.disclaimer).toContain('clinicalValidation: not_established');
    expect(Array.isArray(kb.diseases)).toBe(true);
    expect(kb.diseases.length).toBeGreaterThanOrEqual(100);
  });

  test('every disease entry contains non-empty provenance tracing to raw source', () => {
    for (const d of kb.diseases) {
      expect(d.provenance).toBeDefined();
      expect(typeof d.provenance.source).toBe('string');
      expect(d.provenance.source.length).toBeGreaterThan(0);
      expect(typeof d.provenance.retrievedAt).toBe('string');
      expect(d.provenance.retrievedAt.length).toBeGreaterThan(0);
    }
  });

  test('every disease has at least one valid symptom with zero synthetic filler', () => {
    for (const d of kb.diseases) {
      expect(Array.isArray(d.symptoms)).toBe(true);
      expect(d.symptoms.length).toBeGreaterThanOrEqual(1);
      for (const s of d.symptoms) {
        expect(typeof s).toBe('string');
        expect(s.trim().length).toBeGreaterThan(0);
        expect(s).not.toMatch(/placeholder|generic symptom|symptom \d+/i);
      }
    }
  });

  test('mapped diseases have valid ICD-10 formatting and confidence exact or broader', () => {
    const icdRegex = /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/;
    for (const d of kb.diseases) {
      expect(['exact', 'broader']).toContain(d.mappingConfidence);
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
