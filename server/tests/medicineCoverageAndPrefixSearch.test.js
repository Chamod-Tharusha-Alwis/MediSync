'use strict';

const fs = require('fs');
const path = require('path');
const { runAudit } = require('../../scripts/audit_medicine_coverage');
const Drug = require('../src/models/Drug');
const { searchDrugs, COMMON_DRUGS } = require('../src/controllers/drugController');
const { parseMedicationEntry, resolveSingleIngredient } = require('../src/utils/ingredientResolver');
const { computeClinicalFindings } = require('../src/utils/clinicalSafetyValidator');

describe('Task R5: Medicine Catalog Coverage Audit & Prefix Search', () => {
  test('1. Medicine coverage audit runs and computes benchmark % resolved accurately', () => {
    const data = runAudit();
    expect(data.benchmarkTotal).toBe(300);
    expect(data.benchmarkResolved).toBeGreaterThanOrEqual(220);
    expect(data.benchmarkPercentResolved).toBeGreaterThanOrEqual(70);
    expect(Array.isArray(data.benchmarkGaps)).toBe(true);
    expect(data.benchmarkGaps.length).toBe(data.benchmarkTotal - data.benchmarkResolved);

    // Verify output files exist on disk
    const gapsFile = path.resolve(__dirname, '../../docs/final/data/medicine_coverage_gaps.json');
    const docFile = path.resolve(__dirname, '../../docs/final/MEDICINE_COVERAGE.md');
    expect(fs.existsSync(gapsFile)).toBe(true);
    expect(fs.existsSync(docFile)).toBe(true);
  });

  test('2. Prefix search resolves "citalopr" to Citalopram without silent auto-substitution', async () => {
    const spy = jest.spyOn(Drug, 'find').mockReturnValue({
      limit: () => ({
        select: async () => [{ name: 'Citalopram', genericName: 'Citalopram', brand: 'Celexa' }]
      })
    });

    const mockReq = { query: { q: 'citalopr' } };
    let jsonResult = null;
    const mockRes = {
      json: (data) => { jsonResult = data; return mockRes; },
      status: () => mockRes
    };

    await searchDrugs(mockReq, mockRes);
    expect(jsonResult).toBeDefined();
    expect(Array.isArray(jsonResult.data)).toBe(true);
    expect(jsonResult.data.length).toBeGreaterThan(0);

    const hit = jsonResult.data.find(d => (d.name || '').toLowerCase().includes('citalopram'));
    expect(hit).toBeDefined();
    expect(hit.name).toBe('Citalopram');
    spy.mockRestore();
  });

  test('3. Prefix search resolves "penicil" to Penicillin', async () => {
    const spy = jest.spyOn(Drug, 'find').mockReturnValue({
      limit: () => ({
        select: async () => [{ name: 'Penicillin Capsule 10\'S', genericName: 'Benzylpenicillin', brand: 'Penicillin' }]
      })
    });

    const mockReq = { query: { q: 'penicil' } };
    let jsonResult = null;
    const mockRes = {
      json: (data) => { jsonResult = data; return mockRes; },
      status: () => mockRes
    };

    await searchDrugs(mockReq, mockRes);
    expect(jsonResult).toBeDefined();
    expect(Array.isArray(jsonResult.data)).toBe(true);

    const hit = jsonResult.data.find(d => (d.name || '').toLowerCase().includes('penicillin'));
    expect(hit).toBeDefined();
    spy.mockRestore();
  });

  test('4. Citalopram and Penicillin resolve to canonical active ingredients with 0 unresolved tokens', () => {
    const resCit = resolveSingleIngredient('citalopram');
    expect(resCit.resolved).toBe(true);
    expect(resCit.canonical).toBe('citalopram');

    const parsedCit = parseMedicationEntry('Citalopram 20mg');
    expect(parsedCit.valid).toBe(true);
    expect(parsedCit.unresolvedIngredients).toEqual([]);
    expect(parsedCit.resolvedIngredients[0].canonical).toBe('citalopram');

    const resPen = resolveSingleIngredient('penicillin');
    expect(resPen.resolved).toBe(true);
    expect(resPen.canonical).toBe('benzylpenicillin');

    const parsedPen = parseMedicationEntry('Penicillin 250mg');
    expect(parsedPen.valid).toBe(true);
    expect(parsedPen.unresolvedIngredients).toEqual([]);
  });

  test('5. Ingredients without verified limits produce "No dose ceiling on file" notice without inventing limits', async () => {
    const safetyLimits = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../src/data/medicine_safety_limits.json'), 'utf8')
    );

    const citLimit = safetyLimits.limits.find(l => l.drug === 'Citalopram');
    expect(citLimit).toBeDefined();
    expect(citLimit.citationStatus).toBe('unverified_owner_must_check');
    expect(citLimit.maxDailyDoseMg).toBeUndefined();

    const penLimit = safetyLimits.limits.find(l => l.drug === 'Penicillin');
    expect(penLimit).toBeDefined();
    expect(penLimit.citationStatus).toBe('unverified_owner_must_check');
    expect(penLimit.maxDailyDoseMg).toBeUndefined();

    const result = await computeClinicalFindings({
      medications: [{ drugName: 'Citalopram', dosage: '20mg', frequency: 'Daily', durationDays: 14 }]
    });

    const unconfigured = result.findings.find(f => f.type === 'unconfigured_limit');
    expect(unconfigured).toBeDefined();
    expect(unconfigured.summary).toContain('No dose ceiling on file for this ingredient');
  });
});
