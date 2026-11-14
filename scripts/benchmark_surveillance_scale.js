'use strict';

/**
 * scripts/benchmark_surveillance_scale.js
 *
 * Measures runtime and memory scalability of the outbreak surveillance aggregation
 * across 1,000, 10,000, and 100,000 verified consultations with random ICD codes.
 *
 * Usage: node scripts/benchmark_surveillance_scale.js
 */

const fs = require('fs');
const path = require('path');
const { evaluateOutbreakCriteria, computeGrowthFromCases } = require('../server/src/services/surveillanceService');

const DISTRICTS = [
  'Colombo', 'Gampaha', 'Kalutara', 'Kandy', 'Matale', 'Nuwara Eliya',
  'Galle', 'Matara', 'Hambantota', 'Jaffna', 'Kilinochchi', 'Mannar',
  'Vavuniya', 'Mullaitivu', 'Batticaloa', 'Ampara', 'Trincomalee',
  'Kurunegala', 'Puttalam', 'Anuradhapura', 'Polonnaruwa', 'Badulla',
  'Monaragala', 'Ratnapura', 'Kegalle'
];

const icdCodes = require('../server/reference-data/icd10_clean.json');
const DAY_MS = 86400000;

function generateConsultations(count, now) {
  const cases = [];
  const nowMs = +now;
  const icdLen = icdCodes.length;
  const distLen = DISTRICTS.length;

  for (let i = 0; i < count; i++) {
    const randomDaysAgo = Math.random() * 63; // within 63 days lookback
    const time = nowMs - randomDaysAgo * DAY_MS;
    const icd = icdCodes[Math.floor(Math.random() * icdLen)];
    const district = DISTRICTS[Math.floor(Math.random() * distLen)];

    cases.push({
      consultationId: `bench-${i}`,
      patientId: `pat-${i % 5000}`,
      diseaseId: `ICD10:${icd.code.replace('.', '').toUpperCase()}`,
      disease: `ICD10:${icd.code.replace('.', '').toUpperCase()}`,
      district,
      time,
      createdAt: new Date(time)
    });
  }
  return cases;
}

function runBenchmark() {
  const now = new Date('2026-11-13T12:00:00.000Z');
  const scales = [1000, 10000, 100000];
  const results = [];

  console.log('================================================================================');
  console.log('MediSync Outbreak Surveillance Scalability & Runtime Benchmark');
  console.log(`Node ${process.version} on ${process.platform} (${process.arch})`);
  console.log('================================================================================\n');

  for (const scale of scales) {
    if (global.gc) global.gc();
    const memBefore = process.memoryUsage().heapUsed;
    const genStart = Date.now();
    const cases = generateConsultations(scale, now);
    const genDuration = Date.now() - genStart;

    const t0 = process.hrtime.bigint();
    const criteriaResults = evaluateOutbreakCriteria({
      cases,
      now,
      baselineDays: 56,
      level: 'district'
    });
    const t1 = process.hrtime.bigint();
    const durationMs = Number(t1 - t0) / 1e6;

    // Growth metrics benchmark
    const g0 = process.hrtime.bigint();
    const growth = computeGrowthFromCases({ cases, windowHours: 72, now });
    const g1 = process.hrtime.bigint();
    const growthDurationMs = Number(g1 - g0) / 1e6;

    const memAfter = process.memoryUsage().heapUsed;
    const heapUsedMb = (memAfter - memBefore) / (1024 * 1024);

    const opsPerSec = Math.round((scale / (durationMs / 1000)));

    console.log(`[Scale: ${scale.toLocaleString()} Consultations]`);
    console.log(`  - Detection Pipeline Runtime:   ${durationMs.toFixed(2)} ms`);
    console.log(`  - 72h Growth Metric Runtime:    ${growthDurationMs.toFixed(2)} ms`);
    console.log(`  - Total Surveillance Time:      ${(durationMs + growthDurationMs).toFixed(2)} ms`);
    console.log(`  - Processing Throughput:        ${opsPerSec.toLocaleString()} consultations/sec`);
    console.log(`  - Disease Groups Evaluated:     ${criteriaResults.length.toLocaleString()}`);
    console.log(`  - Heap delta:                   ${heapUsedMb.toFixed(2)} MB\n`);

    results.push({
      consultationCount: scale,
      criteriaDurationMs: Number(durationMs.toFixed(2)),
      growthDurationMs: Number(growthDurationMs.toFixed(2)),
      totalDurationMs: Number((durationMs + growthDurationMs).toFixed(2)),
      throughputConsultationsPerSec: opsPerSec,
      diseaseGroupsEvaluated: criteriaResults.length,
      heapDeltaMb: Number(heapUsedMb.toFixed(2))
    });
  }

  const outPath = path.resolve(__dirname, '../docs/report/surveillance_benchmark_results.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    benchmark: 'Single-Pass Statistical Surveillance & 72h Aggregation Benchmark',
    results
  }, null, 2));

  console.log(`Benchmark written to ${outPath}`);
  return results;
}

if (require.main === module) {
  runBenchmark();
}

module.exports = { runBenchmark, generateConsultations };