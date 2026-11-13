'use strict';

/**
 * Task 4 — docs/final claims must match the code they describe.
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const status = read('docs/final/FINAL_STATUS.md');
const live = read('docs/final/LIVE_SITE_CHECK_PROMPT.md');

describe('Task 4 — FINAL_STATUS.md matches the code', () => {
  test('React major version matches client/package.json', () => {
    const declared = JSON.parse(read('client/package.json')).dependencies.react;
    const major = declared.replace(/^[^0-9]*/, '').split('.')[0];
    expect(status).toContain(`React ${major}`);
    expect(status).not.toMatch(/React 18/);
  });

  test('persistence gate is documented as strict z > 2.0, as implemented', () => {
    expect(read('server/src/services/surveillanceService.js')).toContain('dailyZ[i] > 2.0');
    expect(status).toMatch(/strict \$z > 2\.0\$/);
    expect(status).not.toMatch(/2 consecutive days \$z \\ge 2\.0\$/);
  });

  test('medicine claim states 3,000 catalogue entries and does not call the CSV approved medicines', () => {
    const catalogue = JSON.parse(read('server/reference-data/drugs_clean.json'));
    expect(catalogue.length).toBe(3000);
    expect(status).toContain('**3,000 entries**');
    expect(status).not.toMatch(/globally approved medicines/);
    expect(status).toMatch(/not used by the server/);
    // The server never reads the retail CSV.
    const serverSrc = fs.readdirSync(path.join(root, 'server/src'), { recursive: true })
      .filter(f => String(f).endsWith('.js'))
      .some(f => read(path.join('server/src', String(f))).includes('medicines.csv'));
    expect(serverSrc).toBe(false);
  });

  test('symptom profile tiers are both stated (41 curated + 174 knowledge base)', () => {
    const kb = JSON.parse(read('ml-engine/data/disease_symptom_kb.v1.json'));
    const loaded = kb.diseases.filter(d => d.mappingConfidence === 'exact_normalized' && d.icd10).length;
    expect(loaded).toBe(174);
    expect(status).toMatch(/41 curated disease labels/);
    expect(status).toMatch(/174 knowledge-base profiles/);
  });

  test('every backticked test or source path in FINAL_STATUS.md exists', () => {
    const paths = [...status.matchAll(/`((?:server|client|scripts|ml-engine)\/[^`\s]+\.(?:js|jsx|cjs|py|json))`/g)].map(m => m[1]);
    expect(paths.length).toBeGreaterThan(15);
    const missing = paths.filter(p => !fs.existsSync(path.join(root, p)));
    expect(missing).toEqual([]);
  });

  test('allowlist and inventory wording match the hardened code', () => {
    expect(status).toMatch(/OUTBREAK_EMAIL_DELIVERY_ENABLED=true/);
    expect(status).toMatch(/fail closed/);
    expect(status).toMatch(/Dispensing is prescription verification only/);
    expect(status).not.toMatch(/Pharmacy inventory completely removed/);
    expect(status).not.toMatch(/45\/45 routes/);
  });
});

describe('Task 4 — LIVE_SITE_CHECK_PROMPT.md matches the seed and PDF code', () => {
  test('Matara negative control has the number of window cases the seed creates', () => {
    const seed = read('scripts/seed_viva_outbreaks.js');
    const windowCases = [...seed.matchAll(/district: 'Matara'[^\n]*count: (\d+), scenario: 'Matara-SmallCluster-Window'/g)]
      .reduce((sum, m) => sum + Number(m[1]), 0);
    expect(windowCases).toBe(3);
    expect(live).toMatch(/cluster of 3 cases < 5/);
    expect(live).not.toMatch(/cluster of 4 cases/);
  });

  test('PDF flag and RC4 caveats are present', () => {
    expect(live).toContain('PDF_EXPORT_ENABLED=true');
    expect(live).toContain('REACT_APP_PDF_EXPORT_ENABLED=true');
    expect(live).toMatch(/RC4-128/);
  });
});
