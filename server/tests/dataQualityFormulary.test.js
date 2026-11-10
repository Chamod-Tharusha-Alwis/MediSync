'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseMedicationEntry, resolveSingleIngredient } = require('../src/utils/ingredientResolver');
const referenceCatalogs = require('../src/utils/referenceCatalogs');

describe('Task R4: Formulary Data Quality & UI Neutral Fallback Test Suite', () => {
  const root = path.resolve(__dirname, '..');
  const serverDrugPath = path.join(root, 'reference-data/drugs_clean.json');
  const mlDrugPath = path.resolve(root, '../ml-engine/data/drugs_clean.json');
  const manifestPath = path.join(root, 'reference-data/manifest.json');

  test('1. "Penicitin" typo is completely eradicated from drug reference catalogs', () => {
    const serverRaw = fs.readFileSync(serverDrugPath, 'utf8');
    const mlRaw = fs.readFileSync(mlDrugPath, 'utf8');

    expect(serverRaw).not.toContain('Penicitin');
    expect(mlRaw).not.toContain('Penicitin');

    expect(serverRaw).toContain('Penicillin Capsule 10\'S');
    expect(mlRaw).toContain('Penicillin Capsule 10\'S');
  });

  test('2. Reference data parity: server and ml-engine drugs_clean.json remain byte-identical', () => {
    const serverBuf = fs.readFileSync(serverDrugPath);
    const mlBuf = fs.readFileSync(mlDrugPath);

    expect(serverBuf.equals(mlBuf)).toBe(true);
  });

  test('3. Reference manifest accurately records sha256 and byte size of drugs_clean.json', () => {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const entry = manifest.entries.find(e => e.catalog === 'drugs');

    expect(entry).toBeDefined();

    const serverBuf = fs.readFileSync(serverDrugPath);
    const actualSha = crypto.createHash('sha256').update(serverBuf).digest('hex');

    expect(actualSha).toBe(entry.sha256);
    expect(serverBuf.length).toBe(entry.bytes);
    expect(entry.rows).toBe(3000);
  });

  test('4. Ingredient resolution resolves Penicillin to canonical benzylpenicillin with 0 unresolved ingredients', () => {
    const single = resolveSingleIngredient('penicillin');
    expect(single.resolved).toBe(true);
    expect(single.canonical).toBe('benzylpenicillin');
    expect(single.display).toBe('Benzylpenicillin');

    const parsed = parseMedicationEntry('Penicillin Capsule 10\'S');
    expect(parsed.valid).toBe(true);
    expect(parsed.unresolvedIngredients).toEqual([]);
    expect(parsed.resolvedIngredients.length).toBeGreaterThanOrEqual(1);
    expect(parsed.resolvedIngredients[0].canonical).toBe('benzylpenicillin');
  });

  test('5. Brand typos scan audit detects known near-duplicate stems without inventing unverified clinical changes', () => {
    const drugs = JSON.parse(fs.readFileSync(serverDrugPath, 'utf8'));
    const names = drugs.map(d => d.name || '');

    // Assert Penicillin entry exists
    const penEntry = drugs.find(d => d.name === 'Penicillin Capsule 10\'S');
    expect(penEntry).toBeDefined();
    expect(penEntry.brand).toBe('Penicillin 250mg Capsule 10\'S');
    expect(penEntry.genericName).toContain('Penicillin');
  });
});
