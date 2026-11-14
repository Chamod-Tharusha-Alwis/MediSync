'use strict';

// Guards ml-engine/evaluation/evaluation_results.json and docs/report/AI_EVALUATION.md:
//  - they must never claim clinical validation;
//  - every reported metric must be computed by the evaluation scripts, not typed into their source.

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const evalDir = path.join(root, 'ml-engine/evaluation');
const results = JSON.parse(fs.readFileSync(path.join(evalDir, 'evaluation_results.json'), 'utf8'));
const report = fs.readFileSync(path.join(root, 'docs/report/AI_EVALUATION.md'), 'utf8');
// The scripts that produce the evaluation. (generate_*.py in the same folder are older chart scripts, not part of it.)
const EVALUATION_SCRIPTS = ['eval_common.py', 'fetch_dataset.py', 'run_symptom_benchmark.py', 'run_interaction_benchmark.py',
  'verify_interaction_sources.py', 'make_figures.py', 'write_report.py'];
const sources = EVALUATION_SCRIPTS.map(name => ({ name, text: fs.readFileSync(path.join(evalDir, name), 'utf8') }));
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

  test('3. symptom metrics are reproduced from the per-row engine outputs stored in the results', () => {
    const rows = symptoms.rows;
    expect(rows.length).toBe(symptoms.datasetManifest.rows);
    expect(rows.length).toBe(symptoms.coverage.testRows);
    for (const k of [1, 3, 5]) {
      const hits = rows.filter(row => row[`hitTop${k}`] === 1).length;
      const block = symptoms.allRows[`top${k}`];
      expect(block.correct).toBe(hits);
      expect(block.n).toBe(rows.length);
      expect(block.accuracy).toBe(round6(hits / rows.length));
      expect(block.ci95[0]).toBeLessThanOrEqual(block.accuracy);
      expect(block.ci95[1]).toBeGreaterThanOrEqual(block.accuracy);
    }
    // A top-1 hit must be backed by a recorded engine prediction that the frozen mapping accepts.
    const mapping = JSON.parse(fs.readFileSync(path.join(evalDir, 'label_mapping.json'), 'utf8')).mapping;
    const norm = name => String(name).replace(/\s+/g, ' ').trim().toLowerCase();
    for (const row of rows) {
      const entry = mapping[row.referenceDiagnosis];
      const accepted = [entry.tier1_profile, ...(entry.tier2_profiles || [])].filter(Boolean).map(norm);
      const top = row.top5[0] ? norm(row.top5[0].profile) : null;
      expect(row.hitTop1).toBe(top !== null && accepted.includes(top) ? 1 : 0);
    }
    // Per-diagnosis figures and the confusion matrix agree with the rows.
    const matrix = symptoms.confusionMatrixTop1;
    expect(matrix.counts.flat().reduce((a, b) => a + b, 0)).toBe(rows.length);
    let f1Sum = 0;
    for (const [label, stats] of Object.entries(symptoms.allRows.perDiagnosis)) {
      const support = rows.filter(row => row.referenceDiagnosis === label).length;
      const tp = rows.filter(row => row.referenceDiagnosis === label && row.predictedClass === label).length;
      const predicted = rows.filter(row => row.predictedClass === label).length;
      expect(stats.support).toBe(support);
      expect(stats.recall).toBe(round6(tp / support));
      expect(stats.precision).toBe(predicted ? round6(tp / predicted) : 0);
      f1Sum += stats.f1;
    }
    expect(symptoms.allRows.macroF1).toBeCloseTo(f1Sum / Object.keys(symptoms.allRows.perDiagnosis).length, 5);
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
      for (const form of [String(value), value.toFixed(4), value.toFixed(3), (value * 100).toFixed(2)]) metrics.add(form);
    });
    expect(metrics.size).toBeGreaterThan(100);
    const leaked = [];
    for (const { name, text } of sources) {
      for (const literal of text.match(/(?<![\w.])\d+\.\d+(?![\w.])/g) || []) {
        if (metrics.has(literal)) leaked.push(`${name}: ${literal}`);
      }
    }
    expect(leaked).toEqual([]);

    // The two benchmark scripts and the shared helper may contain only declared configuration numbers.
    // 32 = random key bytes, 200 = HTTP OK, 60 = network timeout seconds, 20261114 = seed, 2000 = bootstrap resamples, 95 = interval level.
    const ALLOWED = new Set(['0', '1', '2', '3', '5', '6', '20', '32', '60', '95', '100', '200', '2000', '20261114', '0.0', '0.9']);
    const unexpected = [];
    for (const { name, text } of sources.filter(source => /^(run_.*|eval_common)\.py$/.test(source.name))) {
      const code = text.replace(/"""[\s\S]*?"""/g, '').replace(/#.*$/gm, '').replace(/f?'(?:[^'\\\n]|\\.)*'|f?"(?:[^"\\\n]|\\.)*"/g, "''");
      for (const literal of code.match(/(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g) || []) {
        if (!ALLOWED.has(literal)) unexpected.push(`${name}: ${literal}`);
      }
    }
    expect(unexpected).toEqual([]);
  });

  test('6. the downloaded dataset is gitignored and the manifest records its provenance', () => {
    expect(fs.readFileSync(path.join(root, '.gitignore'), 'utf8')).toMatch(/^ml-engine\/evaluation\/data\/$/m);
    const manifest = JSON.parse(fs.readFileSync(path.join(evalDir, 'manifest.json'), 'utf8'));
    expect(manifest.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.provenanceNote).toMatch(/not real patient data/);
    expect(symptoms.datasetManifest.sha256).toBe(manifest.sha256);
    expect(symptoms.run.git.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(interactions.run.git.commit).toMatch(/^[0-9a-f]{40}$/);
  });
});
