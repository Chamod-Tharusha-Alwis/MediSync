const { icd10 } = require('../src/utils/loadDatasets');
const whoIcd11Service = require('../src/services/whoIcd11Service');
const drugController = require('../src/controllers/drugController');

describe('Stage 3 — Comprehensive Global Disease Reference & WHO ICD-11 Suite', () => {

  test('1. ICD-10 in-memory dataset contains 71,704 validated coding concepts', () => {
    expect(Array.isArray(icd10)).toBe(true);
    expect(icd10.length).toBe(71704);
    expect(icd10[0]).toHaveProperty('code');
    expect(icd10[0]).toHaveProperty('description');
  });

  test('2. WHO ICD-11 service provides high-yield core catalog and status inquiry', () => {
    const status = whoIcd11Service.getWhoApiStatus();
    expect(status).toHaveProperty('isConfigured');
    expect(status).toHaveProperty('curatedCoreCatalogSize');
    expect(status.curatedCoreCatalogSize).toBeGreaterThan(40);
    expect(typeof status.instructions).toBe('string');
  });

  test('3. WHO ICD-11 offline search retrieves standard and tropical conditions', async () => {
    const dengueMatches = await whoIcd11Service.searchIcd11('dengue', 10);
    expect(dengueMatches.length).toBeGreaterThan(0);
    const dengue = dengueMatches.find(d => d.code === '1D20');
    expect(dengue).toBeDefined();
    expect(dengue.version).toBe('ICD-11');
    expect(dengue.entityId).toContain('1435254666');

    const malariaMatches = await whoIcd11Service.searchIcd11('malaria', 10);
    expect(malariaMatches.length).toBeGreaterThan(0);
    expect(malariaMatches.some(m => m.code.startsWith('1F4'))).toBe(true);
  });

  test('4. WHO ICD-11 search retrieves rare and genetic diseases', async () => {
    const downMatches = await whoIcd11Service.searchIcd11('Down syndrome', 5);
    expect(downMatches.length).toBeGreaterThan(0);
    expect(downMatches[0].code).toBe('LD20');

    const thalMatches = await whoIcd11Service.searchIcd11('Thalassaemia', 5);
    expect(thalMatches.length).toBeGreaterThan(0);
    expect(thalMatches[0].code).toBe('3A51');
  });

  test('5. getICDCodes controller returns dual ICD-10 and ICD-11 results when version=all', async () => {
    const req = {
      query: { q: 'cholera', version: 'all', limit: '10' }
    };
    let jsonResult = null;
    const res = {
      json: (data) => { jsonResult = data; return res; },
      status: () => res
    };

    await drugController.getICDCodes(req, res);
    expect(jsonResult).toBeDefined();
    expect(jsonResult.data.length).toBeGreaterThan(0);

    const hasIcd10 = jsonResult.data.some(d => d.version === 'ICD-10');
    const hasIcd11 = jsonResult.data.some(d => d.version === 'ICD-11');
    expect(hasIcd10).toBe(true);
    expect(hasIcd11).toBe(true);
  });

  test('6. getICDCodes controller filters strictly by version=icd10 and version=icd11', async () => {
    // ICD-10 only
    const req10 = { query: { q: 'diabetes', version: 'icd10', limit: '10' } };
    let json10 = null;
    const res10 = { json: (d) => { json10 = d; return res10; }, status: () => res10 };
    await drugController.getICDCodes(req10, res10);
    expect(json10.data.every(d => d.version === 'ICD-10')).toBe(true);

    // ICD-11 only
    const req11 = { query: { q: 'diabetes', version: 'icd11', limit: '10' } };
    let json11 = null;
    const res11 = { json: (d) => { json11 = d; return res11; }, status: () => res11 };
    await drugController.getICDCodes(req11, res11);
    expect(json11.data.every(d => d.version === 'ICD-11')).toBe(true);
  });

  test('7. getWhoIcdStatus controller returns 200 with setup instructions', async () => {
    const req = {};
    let statusData = null;
    const res = { json: (d) => { statusData = d; return res; }, status: () => res };
    await drugController.getWhoIcdStatus(req, res);
    expect(statusData).toBeDefined();
    expect(statusData).toHaveProperty('isConfigured');
    expect(statusData).toHaveProperty('instructions');
  });
});
