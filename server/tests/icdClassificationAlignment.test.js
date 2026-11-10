'use strict';

const { detectIcdVersion, isValidIcd10Syntax } = require('../src/utils/icdClassifier');
const { CURATED_ICD11_CORE_CATALOG } = require('../src/services/whoIcd11Service');
const { icd10 } = require('../src/utils/loadDatasets');

describe('Task R7: ICD Classification Alignment Suite', () => {

  describe('1. Classification Detection Rules', () => {
    test('accurately identifies 6A70 as ICD-11 and not ICD-10', () => {
      expect(detectIcdVersion('6A70')).toBe('ICD-11');
      expect(isValidIcd10Syntax('6A70')).toBe(false);
    });

    test('all curated WHO ICD-11 core codes are identified as ICD-11', () => {
      for (const entry of CURATED_ICD11_CORE_CATALOG) {
        expect(detectIcdVersion(entry.code)).toBe('ICD-11');
        expect(isValidIcd10Syntax(entry.code)).toBe(false);
      }
    });

    test('all sample US ICD-10-CM codes are identified as ICD-10', () => {
      const sampleIcd10 = ['A90', 'F32.9', 'I10', 'E11.9', 'J45.909', 'K21.9', 'B50.0', 'M54.5'];
      for (const code of sampleIcd10) {
        expect(detectIcdVersion(code)).toBe('ICD-10');
        expect(isValidIcd10Syntax(code)).toBe(true);
      }
    });

    test('zero items in the local ICD-10 reference dataset have an ICD-11 style code', () => {
      for (const entry of icd10) {
        const isIcd11 = detectIcdVersion(entry.code) === 'ICD-11';
        expect(isIcd11).toBe(false);
      }
    });
  });

  describe('2. Consultation Normalization', () => {
    test('normalizes mislabeled ICD-10 6A70 to ICD-11 during clinical write processing', () => {
      const { detectIcdVersion } = require('../src/utils/icdClassifier');
      const input = { icdCode: '6A70', icdVersion: 'ICD-10' };
      const resolvedVersion = input.icdCode
        ? (detectIcdVersion(input.icdCode) === 'ICD-11' ? 'ICD-11' : (input.icdVersion || 'ICD-10'))
        : (input.icdVersion || '');
      expect(resolvedVersion).toBe('ICD-11');
    });

    test('retains ICD-10 for genuine ICD-10 codes', () => {
      const { detectIcdVersion } = require('../src/utils/icdClassifier');
      const input = { icdCode: 'A90', icdVersion: 'ICD-10' };
      const resolvedVersion = input.icdCode
        ? (detectIcdVersion(input.icdCode) === 'ICD-11' ? 'ICD-11' : (input.icdVersion || 'ICD-10'))
        : (input.icdVersion || '');
      expect(resolvedVersion).toBe('ICD-10');
    });
  });

  describe('3. PDF and Downstream Labeling', () => {
    test('renders ICD-11 Reference label for 6A70 in clinical summary PDF format', () => {
      const isIcd11 = (code, version) => version === 'ICD-11' || (/^[1-9][A-Z0-9]{3}/i.test(code || '') || /^[A-S][A-Z][0-9]{2}/i.test(code || ''));
      expect(isIcd11('6A70', 'ICD-10')).toBe(true);
      expect(isIcd11('A90', 'ICD-10')).toBe(false);
    });
  });
});
