'use strict';

// Guards ml-engine/evaluation/evaluation_results.json, docs/report/AI_EVALUATION.md and docs/report/VALIDATION_LIMITS.md:
//  - they must never claim clinical validation, and must not contain the forbidden phrases;
//  - every reported metric must be computed by the evaluation scripts, not typed into their source;
//  - every number in AI_EVALUATION.md must come from the results or the dataset manifest.

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const evalDir = path.join(root, 'ml-engine/evaluation');
const results = JSON.parse(fs.readFileSync(path.join(evalDir, 'evaluation_results.json'), 'utf8'));
const report = fs.readFileSync(path.join(root, 'docs/report/AI_EVALUATION.md'), 'utf8');
// Every evaluation script in the folder. generate_*.py are deprecated chart scripts with hardcoded numbers, excluded on purpose.
const EVALUATION_SCRIPTS = fs.readdirSync(evalDir).filter(name => name.endsWith('.py') && !name.startsWith('generate_')).sort();
const sources = EVALUATION_SCRIPTS.map(name => ({ name, text: fs.readFileSync(path.join(evalDir, name), 'utf8') }));
const dataManifest = JSON.parse(fs.readFileSync(path.join(evalDir, 'data/manifest.json'), 'utf8'));
const limitsDoc = fs.readFileSync(path.join(root, 'docs/report/VALIDATION_LIMITS.md'), 'utf8');
const symptoms = results.symptomBenchmark;
const interactions = results.interactionBenchmark;
const round6 = value => Math.round(value * 1e6) / 1e6;

function walk(node, visit, trail = []) {
  if (Array.isArray(node)) node.forEach((item, i) => walk(item, visit, trail.concat(i)));
  else if (node && typeof node === 'object') Object.entries(node).forEach(([key, value]) => walk(value, visit, trail.concat(key)));
  else visit(node, trail);
}

// A sentence may mention clinical validation only to deny it.
const MENTION = /clinical(ly)?[\s_-]*validat/i;
const DENIAL = /\bnot\b|\bnever\b|not_established/i;
const FORBIDDEN = [/clinically (validated|proven|approved|accurate|safe)/i, /validated (in|on|by|with) (real )?(patients|clinicians|hospitals?)/i,
  /clinical validation (is|was|has been) (established|achieved|completed|demonstrated)/i, /diagnostic accuracy/i];

describe('AI evaluation results: honesty and provenance', () => {
  test('1. clinical validation is recorded as not established everywhere', () => {
    expect(results.clinicalValidation).toBe('not_established');
    const flags = [];
    walk(results, (value, trail) => { if (/clinicalValidation$/i.test(String(trail[trail.length - 1]))) flags.push(value); });
    expect(flags.length).toBeGreaterThanOrEqual(4);
    expect(flags.filter(value => value !== 'not_established')).toEqual([]);
    expect(report).toMatch(/Clinical validation: not established/);
  });

  test('2. neither the results nor the report claims clinical validation', () => {
    const offending = [];
    const check = (text, where) => {
      for (const sentence of String(text).split(/(?<=[.!?])\s+|\n/)) {
        if (FORBIDDEN.some(pattern => pattern.test(sentence)) || (MENTION.test(sentence) && !DENIAL.test(sentence))) offending.push(`${where}: ${sentence.slice(0, 120)}`);
      }
    };
    walk(results, (value, trail) => { if (typeof value === 'string') check(value, trail.join('.')); });
    check(report, 'AI_EVALUATION.md');
    expect(offending).toEqual([]);
  });

  test.each([
    ['symptomBenchmark', 'label_mapping.json', block => block.datasetManifest.rows],
    ['ddxplusBenchmark', 'ddxplus_label_mapping.json', block => block.datasetManifest.sample.rows],
  ])('3. %s metrics are reproduced from the per-row engine outputs stored in the results', (section, mappingFile, expectedRows) => {
    const block = results[section];
    const rows = block.rows;
    expect(rows.length).toBe(expectedRows(block));
    expect(rows.length).toBe(block.coverage.testRows);
    for (const k of [1, 3, 5]) {
      const hits = rows.filter(row => row[`hitTop${k}`] === 1).length;
      const top = block.allRows[`top${k}`];
      expect(top.correct).toBe(hits);
      expect(top.n).toBe(rows.length);
      expect(top.accuracy).toBe(round6(hits / rows.length));
      expect(top.ci95[0]).toBeLessThanOrEqual(top.accuracy);
      expect(top.ci95[1]).toBeGreaterThanOrEqual(top.accuracy);
    }
    // A top-1 hit must be backed by a recorded engine prediction that the frozen mapping accepts.
    const mapping = JSON.parse(fs.readFileSync(path.join(evalDir, mappingFile), 'utf8')).mapping;
    const norm = name => String(name).replace(/\s+/g, ' ').trim().toLowerCase();
    for (const row of rows) {
      const entry = mapping[row.referenceDiagnosis];
      const accepted = [entry.tier1_profile, ...(entry.tier2_profiles || [])].filter(Boolean).map(norm);
      const top = row.top5[0] ? norm(row.top5[0].profile) : null;
      expect(row.hitTop1).toBe(top !== null && accepted.includes(top) ? 1 : 0);
    }
    // Per-diagnosis figures and the confusion matrix agree with the rows.
    expect(block.confusionMatrixTop1.counts.flat().reduce((x, y) => x + y, 0)).toBe(rows.length);
    let f1Sum = 0;
    for (const [label, stats] of Object.entries(block.allRows.perDiagnosis)) {
      const support = rows.filter(row => row.referenceDiagnosis === label).length;
      const tp = rows.filter(row => row.referenceDiagnosis === label && row.predictedClass === label).length;
      const predicted = rows.filter(row => row.predictedClass === label).length;
      expect(stats.support).toBe(support);
      expect(stats.recall).toBe(round6(tp / support));
      expect(stats.precision).toBe(predicted ? round6(tp / predicted) : 0);
      f1Sum += stats.f1;
    }
    expect(block.allRows.macroF1).toBeCloseTo(f1Sum / Object.keys(block.allRows.perDiagnosis).length, 5);
  });

  test('4. interaction metrics are reproduced from the per-pair checker outputs stored in the results', () => {
    const pairs = interactions.pairs;
    const reference = JSON.parse(fs.readFileSync(path.join(evalDir, 'interaction_reference.json'), 'utf8'));
    expect(pairs.map(pair => pair.id).sort()).toEqual(reference.pairs.map(pair => pair.id).sort());
    for (const pair of reference.pairs) expect(pair.sourceUrl).toMatch(/^https:\/\/dailymed\.nlm\.nih\.gov\//);
    const count = (expected, outcome) => pairs.filter(pair => pair.expected === expected && pair.checkerOutcome === outcome).length;
    const [tp, fn, pu] = ['warning', 'no_warning', 'unverified'].map(outcome => count('interacting', outcome));
    const [fp, tn, nu] = ['warning', 'no_warning', 'unverified'].map(outcome => count('non_interacting', outcome));
    expect(interactions.confusionMatrix.counts).toEqual([[tp, fn, pu], [fp, tn, nu]]);
    const m = interactions.metrics;
    expect(m.sensitivity.value).toBe(round6(tp / (tp + fn + pu)));
    // Unverified pairs are never counted as correct negatives.
    expect(m.specificity.value).toBe(round6(tn / (fp + tn + nu)));
    expect(m.precision.value).toBe(round6(tp / (tp + fp)));
    expect(m.falseAlarmRate.value).toBe(round6(fp / (fp + tn + nu)));
    expect(m.unverifiedPairs).toBe(pu + nu);
  });

  test('5. no reported metric is hardcoded in the evaluation source code', () => {
    expect(sources.map(source => source.name)).toEqual(expect.arrayContaining(['run_symptom_benchmark.py', 'run_interaction_benchmark.py']));
    // Metric values with real precision (three or more decimals) must not appear as literals in any script.
    const metrics = new Set();
    walk(results, (value, trail) => {
      if (typeof value !== 'number' || Number.isInteger(value) || trail.includes('run') || trail.includes('threshold')) return;
      if (round6(value * 100) % 1 === 0) return; // values such as 0.7 are too coarse to tell apart from layout constants
      if (Math.abs(value) < 0.001) return; // tiny values (such as a 0.0001 median) collide with layout offsets like 0.01
      for (const form of [String(value), value.toFixed(4), value.toFixed(3)]) metrics.add(form);
      if (Math.abs(value) >= 0.01) metrics.add((value * 100).toFixed(2)); // percentage form; below 1% it collides with layout constants
    });
    expect(metrics.size).toBeGreaterThan(100);
    const leaked = [];
    for (const { name, text } of sources) {
      for (const literal of text.match(/(?<![\w.])\d+\.\d+(?![\w.])/g) || []) {
        if (metrics.has(literal)) leaked.push(`${name}: ${literal}`);
      }
    }
    expect(leaked).toEqual([]);

    // In the run_*.py scripts and the shared helper, every number other than 0, 1, 2 and 100 must be a named,
    // module-level UPPER_CASE constant (a declared setting such as a seed or a resample count), not inline in the code.
    const TRIVIAL = new Set(['0', '1', '2', '100', '0.0', '1.0']);
    const unexpected = [];
    for (const { name, text } of sources.filter(source => /^(run_.*|eval_common)\.py$/.test(source.name))) {
      const code = text.replace(/"""[\s\S]*?"""/g, '').replace(/#.*$/gm, '').replace(/f?'(?:[^'\\\n]|\\.)*'|f?"(?:[^"\\\n]|\\.)*"/g, "''")
        .split('\n').filter(line => !/^[A-Z][A-Z0-9_]*\s*=/.test(line)).join('\n');
      for (const literal of code.match(/(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g) || []) {
        if (!TRIVIAL.has(literal)) unexpected.push(`${name}: ${literal}`);
      }
    }
    expect(unexpected).toEqual([]);
  });

  test('6. downloaded datasets are gitignored and the manifest records licence and provenance for each', () => {
    const gitignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/^ml-engine\/evaluation\/data\/\*$/m);
    expect(gitignore).toMatch(/^!ml-engine\/evaluation\/data\/manifest\.json$/m);
    const { datasets } = JSON.parse(fs.readFileSync(path.join(evalDir, 'data/manifest.json'), 'utf8'));
    expect(Object.keys(datasets).length).toBeGreaterThanOrEqual(1);
    for (const [key, entry] of Object.entries(datasets)) {
      expect([key, entry.sha256]).toEqual([key, expect.stringMatching(/^[0-9a-f]{64}$/)]);
      expect([key, typeof entry.licence.licence, entry.licence.licence.length > 0]).toEqual([key, 'string', true]);
      expect([key, Number.isInteger(entry.rows) && entry.rows > 0]).toEqual([key, true]);
      expect([key, entry.url]).toEqual([key, expect.stringMatching(/^https:\/\//)]);
      expect([key, entry.downloadDate]).toEqual([key, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)]);
    }
    expect(datasets.gretelai_test.nature).toMatch(/not real patient data/);
    expect(symptoms.datasetManifest.sha256).toBe(datasets.gretelai_test.sha256);
    expect(symptoms.run.git.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(interactions.run.git.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  test('7. every number in AI_EVALUATION.md comes from the results or the dataset manifest', () => {
    // Accepted renderings of every number in the two JSON files (plain, rounded, and as a percentage),
    // plus every number written inside their text fields (dates, versions, protocol text).
    // Numbers inside row-level records (per-row scores, weekly series, forecast errors, calibration steps) are not accepted,
    // so an invented figure cannot pass by matching one of thousands of row values by chance.
    const ROW_LEVEL = new Set(['rows', 'weeks', 'mapSteps', 'overlappingRowIndices', 'h1', 'h2', 'h4']);
    const isRowLevel = trail => trail.some((key, i) => ROW_LEVEL.has(key) && Number.isInteger(trail[i + 1]));
    const accepted = new Set();
    walk([results, dataManifest], (value, trail) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        if (isRowLevel(trail)) return;
        const a = Math.abs(value);
        for (const form of [String(a), a.toFixed(0), a.toFixed(1), a.toFixed(2), a.toFixed(3), a.toFixed(4),
          (a * 100).toFixed(0), (a * 100).toFixed(1), (a * 100).toFixed(2)]) accepted.add(form);
      } else if (typeof value === 'string') {
        for (const token of value.match(/\d+(?:\.\d+)?/g) || []) accepted.add(token);
      }
    });
    const SMALL_INTEGER_MAX = 10; // structural numbers such as "Top-1", "Tier 2" or "V3"
    const text = report
      .split('\n').filter(line => !line.startsWith('#')).join('\n') // headings
      .replace(/`[^`]*`/g, ' ') // code spans: paths, hashes, commands
      .replace(/\]\([^)]*\)/g, '] ') // link and image targets
      .replace(/(^|[\s(])[-+](?=\d)/gm, '$1'); // signs in front of numbers
    const unmatched = [];
    for (const token of text.match(/(?<![A-Za-z_\-\d.])\d+(?:\.\d+)?(?![\d])/g) || []) {
      if (accepted.has(token)) continue;
      if (/^\d+$/.test(token) && Number(token) <= SMALL_INTEGER_MAX) continue;
      unmatched.push(token);
    }
    expect(unmatched).toEqual([]);
    expect(accepted.size).toBeGreaterThan(500);

    // The headline figures must be exactly the formatted JSON values.
    const pct = v => `${(v * 100).toFixed(1)}%`;
    const ci = c => `${pct(c[0])} to ${pct(c[1])}`;
    const d = results.ddxplusBenchmark, m = interactions.metrics, det = results.outbreakBacktest.detector;
    const h1 = results.outbreakBacktest.projection.byHorizon.h1;
    for (const expected of [
      `top-1 ${pct(symptoms.allRows.top1.accuracy)} (${ci(symptoms.allRows.top1.ci95)}); top-5 ${pct(symptoms.allRows.top5.accuracy)}`,
      `all rows top-1 ${pct(d.allRows.top1.accuracy)} (${ci(d.allRows.top1.ci95)}); covered rows top-1 ${pct(d.coveredRowsOnly.top1.accuracy)}`,
      `sensitivity ${pct(m.sensitivity.value)} (${ci(m.sensitivity.ci95)}); specificity ${pct(m.specificity.value)} (${ci(m.specificity.ci95)})`,
      `week sensitivity ${pct(det.weekSensitivity.value)} (${ci(det.weekSensitivity.ci95)}); specificity ${pct(det.weekSpecificity.value)}`,
      `MAE ${h1.mae.projection.value.toFixed(0)} cases; interval coverage ${pct(h1.intervalCoverage.value)}`,
    ]) expect(report).toContain(expected);
  });

  test('8. the forbidden phrases appear nowhere in the evaluation outputs, limits page or scripts', () => {
    // Built from parts so this file does not itself contain the phrases.
    const phrases = [['clinically', 'validated'], ['clinically', 'proven'], ['accurate', 'for', 'patients']]
      .map(words => new RegExp(words.join('\\s+'), 'i'));
    const files = [['AI_EVALUATION.md', report], ['VALIDATION_LIMITS.md', limitsDoc],
      ['evaluation_results.json', JSON.stringify(results)], ['data/manifest.json', JSON.stringify(dataManifest)],
      ...sources.map(source => [source.name, source.text]),
      ['outbreak_bridge.cjs', fs.readFileSync(path.join(evalDir, 'outbreak_bridge.cjs'), 'utf8')]];
    const found = [];
    for (const [name, text] of files) for (const phrase of phrases) if (phrase.test(text)) found.push(`${name}: ${phrase}`);
    expect(found).toEqual([]);
    for (const required of [/no real patients/i, /no clinician review/i, /no ethics approval/i, /no prospective study/i, /no regulatory assessment/i]) {
      expect(limitsDoc).toMatch(required);
    }
  });
});
