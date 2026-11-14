'use strict';

const fs = require('fs');
const path = require('path');

describe('Part 7 Hardcoded Metric & Data Integrity Audit', () => {
  const root = path.resolve(__dirname, '../..');

  test('1. UI components contain no unapproved literal numeric statistics or fake risk percentages', () => {
    function walk(dir) {
      let files = [];
      for (const item of fs.readdirSync(dir)) {
        const full = path.join(dir, item);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          if (item !== 'node_modules' && item !== '.git') files = files.concat(walk(full));
        } else if (item.endsWith('.jsx')) {
          files.push(full);
        }
      }
      return files;
    }

    const pagesDir = path.join(root, 'client/src/pages');
    const componentsDir = path.join(root, 'client/src/components');
    const uiFiles = walk(pagesDir).concat(walk(componentsDir));

    const APPROVED_LITERALS = new Set([
      '404',     // Standard HTTP 404 error code in NotFound.jsx
      '0%',      // Empty percentage state
      '0 (0%)',  // Empty state label
    ]);

    const violations = [];

    for (const file of uiFiles) {
      const content = fs.readFileSync(file, 'utf8');
      // Detect literal numbers/percentages rendered between JSX tags: >VALUE<
      const regex = />\s*([0-9]+(?:\.[0-9]+)?%?)\s*</g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        const val = match[1].trim();
        // Allow single digits 0-5 commonly used for layout grids, steps, star ratings
        if (['0', '1', '2', '3', '4', '5'].includes(val)) continue;
        if (APPROVED_LITERALS.has(val)) continue;

        const line = content.slice(0, match.index).split('\n').length;
        violations.push({
          file: path.relative(root, file).replace(/\\/g, '/'),
          line,
          value: val
        });
      }
    }

    expect(violations).toEqual([]);
  });

  test('2. DCS population reference table is verified, complete, and identical across server and client', () => {
    const serverFile = path.join(root, 'server/src/data/districtPopulation2024.json');
    const clientFile = path.join(root, 'client/src/data/districtPopulation2024.json');

    expect(fs.existsSync(serverFile)).toBe(true);
    expect(fs.existsSync(clientFile)).toBe(true);

    const serverRaw = fs.readFileSync(serverFile, 'utf8');
    const clientRaw = fs.readFileSync(clientFile, 'utf8');
    expect(clientRaw).toBe(serverRaw);

    const data = JSON.parse(serverRaw);
    expect(data.source).toBe('http://www.statistics.gov.lk/Population/StaticalInformation/CPH2011');
    expect(data.year).toBe(2012);
    expect(data.islandTotal).toBe(20358680);

    const districts = data.districts;
    const expectedDistricts = [
      'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo',
      'Galle', 'Gampaha', 'Hambantota', 'Jaffna', 'Kalutara',
      'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala', 'Mannar',
      'Matale', 'Matara', 'Monaragala', 'Mullaitivu', 'Nuwara Eliya',
      'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya'
    ];

    expect(Object.keys(districts).sort()).toEqual(expectedDistricts.sort());

    let sum = 0;
    for (const d of expectedDistricts) {
      expect(typeof districts[d]).toBe('number');
      expect(districts[d]).toBeGreaterThan(50000);
      sum += districts[d];
    }
    expect(sum).toBe(data.islandTotal);
  });

  test('3. ICD reference catalog contains 71,704 validated leaf concepts', () => {
    const icdPath = path.join(root, 'server/reference-data/icd10_clean.json');
    expect(fs.existsSync(icdPath)).toBe(true);
    const catalog = JSON.parse(fs.readFileSync(icdPath, 'utf8'));
    expect(Array.isArray(catalog)).toBe(true);
    expect(catalog.length).toBe(71704);
  });

  test('4. Pharmaceutical formulary catalog contains exactly 3,000 curated drugs tracked by manifest', () => {
    const drugPath = path.join(root, 'server/reference-data/drugs_clean.json');
    expect(fs.existsSync(drugPath)).toBe(true);
    const drugs = JSON.parse(fs.readFileSync(drugPath, 'utf8'));
    expect(Array.isArray(drugs)).toBe(true);
    expect(drugs.length).toBe(3000);
  });

  test('5. Server medicine catalogue is the tracked 3,000-entry formulary; no doc presents the retail CSV as the catalogue', () => {
    // ml-engine/data/medicines.csv is a gitignored retail scrape (unclear licence) that is absent in CI.
    // Assert only on tracked data, and assert the docs do not overclaim it. No silent skip.
    const drugs = JSON.parse(fs.readFileSync(path.join(root, 'server/reference-data/drugs_clean.json'), 'utf8'));
    expect(drugs).toHaveLength(3000);

    // The server never reads the retail CSV.
    const serverFiles = [];
    (function walk(dir) {
      for (const name of fs.readdirSync(dir)) {
        const full = path.join(dir, name);
        if (fs.statSync(full).isDirectory()) walk(full);
        else if (/\.(js|cjs|json)$/.test(name)) serverFiles.push(full);
      }
    })(path.join(root, 'server/src'));
    const readers = serverFiles.filter(file => fs.readFileSync(file, 'utf8').includes('medicines.csv'));
    expect(readers.map(file => path.relative(root, file))).toEqual([]);

    // No tracked doc may present the 23,939-row CSV as approved medicines or the server catalogue.
    const docs = [];
    for (const dir of ['docs/final', 'docs/report', 'docs/new']) {
      (function walk(d) {
        if (!fs.existsSync(d)) return;
        for (const name of fs.readdirSync(d)) {
          const full = path.join(d, name);
          if (fs.statSync(full).isDirectory()) walk(full);
          else if (name.endsWith('.md')) docs.push(full);
        }
      })(path.join(root, dir));
    }
    expect(docs.length).toBeGreaterThan(10);
    const OVERCLAIM = /globally approved|approved (pharmaceutical )?(medicines|drugs|products)|over 20,000|>20,000|global master/i;
    const DISCLAIMED = /not used by the server|not a list of approved|does not hold 20,000|does \*\*not\*\* show/i;
    const offending = [];
    for (const file of docs) {
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (/23,?939|medicines\.csv/.test(line) && OVERCLAIM.test(line) && !DISCLAIMED.test(line)) {
          offending.push(`${path.relative(root, file)}:${i + 1}`);
        }
      });
    }
    expect(offending).toEqual([]);
  });
});
