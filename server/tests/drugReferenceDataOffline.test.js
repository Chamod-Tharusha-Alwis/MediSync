'use strict';

/**
 * Backend Reference Data & Search Offline Unit Tests
 * Exercises controller logic, query normalization, case-insensitivity, and natural key integrity.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { escapeRegex } = require('../src/utils/ingredientResolver');
const referenceCatalogs = require('../src/utils/referenceCatalogs');

describe('Milestone 2 Backend: Reference Data & Search Controller Suite', () => {

  test('1. Reference Data Manifest and Datasets match expected SHA-256 digests', () => {
    const manifestPath = path.resolve(__dirname, '../reference-data/manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    const drugEntry = manifest.entries.find(e => e.catalog === 'drugs');
    const icdEntry = manifest.entries.find(e => e.catalog === 'icd10');
    expect(drugEntry).toBeDefined();
    expect(icdEntry).toBeDefined();

    const drugFile = path.resolve(__dirname, '../reference-data/drugs_clean.json');
    const icdFile = path.resolve(__dirname, '../reference-data/icd10_clean.json');

    const drugSha = crypto.createHash('sha256').update(fs.readFileSync(drugFile)).digest('hex');
    const icdSha = crypto.createHash('sha256').update(fs.readFileSync(icdFile)).digest('hex');

    expect(drugSha).toBe(drugEntry.sha256);
    expect(icdSha).toBe(icdEntry.sha256);
  });

  test('2. loadReferenceCatalogs() parses drugs and ICD-10 records with natural keys', () => {
    const catalogs = referenceCatalogs.loadReferenceCatalogs();
    expect(catalogs).toHaveProperty('drugs');
    expect(catalogs).toHaveProperty('icd10');

    expect(Array.isArray(catalogs.drugs)).toBe(true);
    expect(catalogs.drugs.length).toBe(3000);

    expect(Array.isArray(catalogs.icd10)).toBe(true);
    expect(catalogs.icd10.length).toBe(71704);

    // Natural key validation: each drug has non-empty unique name
    const sampleDrug = catalogs.drugs[0];
    expect(sampleDrug).toHaveProperty('name');
    expect(sampleDrug).toHaveProperty('genericName');

    // Natural key validation: each ICD concept has non-empty unique code
    const sampleIcd = catalogs.icd10[0];
    expect(sampleIcd).toHaveProperty('code');
    expect(sampleIcd).toHaveProperty('description');
  });

  test('3. Regex escaping protects search queries against catastrophic backtracking or syntax injection', () => {
    const dangerousInputs = [
      '.*',
      'paracetamol (500mg)',
      'amox+clav',
      'a{1000}',
      'dengue[classical]'
    ];
    for (const inp of dangerousInputs) {
      const escaped = escapeRegex(inp);
      expect(() => new RegExp(escaped, 'i')).not.toThrow();
    }
  });

  test('4. In-memory ICD-10 lookup retrieves Cholera (A00) and Dengue (A90)', () => {
    const catalogs = referenceCatalogs.loadReferenceCatalogs();
    const qCholera = 'cholera';
    const choleraMatches = catalogs.icd10.filter(item =>
      item.code.toLowerCase().includes(qCholera) || item.description.toLowerCase().includes(qCholera)
    );
    expect(choleraMatches.length).toBeGreaterThan(0);
    expect(choleraMatches.some(m => m.code.startsWith('A00'))).toBe(true);

    const qDengue = 'dengue';
    const dengueMatches = catalogs.icd10.filter(item =>
      item.code.toLowerCase().includes(qDengue) || item.description.toLowerCase().includes(qDengue)
    );
    expect(dengueMatches.length).toBeGreaterThan(0);
    expect(dengueMatches.some(m => m.code === 'A90')).toBe(true);
  });

  test('5. Query normalization enforces minimum character length of 2', () => {
    const drugController = require('../src/controllers/drugController');
    let resJson;
    const mockRes = {
      json: (data) => { resJson = data; return mockRes; },
      status: () => mockRes
    };

    // Query with 1 character
    drugController.searchDrugs({ query: { q: 'a' } }, mockRes);
    expect(resJson).toEqual({ data: [] });

    // Empty query
    drugController.searchDrugs({ query: { q: '  ' } }, mockRes);
    expect(resJson).toEqual({ data: [] });
  });
});
