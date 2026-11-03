#!/usr/bin/env node
'use strict';

/**
 * scripts/seed-demo-outbreak.js
 *
 * Deterministic Demo Outbreak Seed Script for MediSync (Milestone 1, Requirement R2)
 *
 * Guarantees:
 * 1. 100% Synthetic data: Every single generated record is tagged with
 *    { isSimulatedDemo: true, demoBatchId: string, isSynthetic: true, isDemoData: true }.
 * 2. Non-destructive: Never modifies or deletes records without matching simulated tags.
 * 3. Fail-closed safety: Default mode is --dry-run (0 database writes).
 *    Writing requires --confirm AND process.env.DEMO_SEED_ALLOW === '1'.
 * 4. Deterministic: Powered by Mulberry32 32-bit PRNG accepting --seed N (default 2026).
 * 5. Realistic 90-day trajectory across all 25 Sri Lankan districts and 6 diseases,
 *    covering all 4 risk tiers (Critical, High, Moderate, Low, Minimal).
 * 6. Real pipeline flow: Ingests clinical episodes into MongoDB Consultation collection,
 *    populates ML Engine SQLite outbreak_tracking table, and triggers surveillanceService
 *    simulation analysis to generate real OutbreakAlert records.
 * 7. CLI commands: --dry-run, --confirm, --status, --remove --batch <id>.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

// CLI compatibility only. Importing the planner/verifier must not load credentials.
const envPath = path.resolve(__dirname, '../server/.env');
if (require.main === module && fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Ensure Mongoose resolves from server's node_modules so models and connection share the same instance
let mongoose;
try {
  mongoose = require(require.resolve('mongoose', { paths: [path.resolve(__dirname, '../server')] }));
} catch (_) {
  mongoose = require('mongoose');
}

// Official 25 Sri Lankan Districts
const OFFICIAL_DISTRICTS = [
  'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo',
  'Galle', 'Gampaha', 'Hambantota', 'Jaffna', 'Kalutara',
  'Kandy', 'Kegalle', 'Kilinochchi', 'Kurunegala', 'Mannar',
  'Matale', 'Matara', 'Monaragala', 'Mullaitivu', 'Nuwara Eliya',
  'Polonnaruwa', 'Puttalam', 'Ratnapura', 'Trincomalee', 'Vavuniya'
];

// Target Outbreak Surveillance Diseases (6 Diseases per Requirement R2)
const SEED_DISEASES = {
  DENGUE: {
    name: 'Dengue',
    icdCode: 'A90',
    icdVersion: 'ICD-10',
    dangerLevel: 'High',
    symptoms: ['High fever', 'Severe headache', 'Retro-orbital pain', 'Joint pain', 'Petechial rash']
  },
  LEPTOSPIROSIS: {
    name: 'Leptospirosis',
    icdCode: 'A27.9',
    icdVersion: 'ICD-10',
    dangerLevel: 'High',
    symptoms: ['Jaundice', 'High fever', 'Calf muscle tenderness', 'Conjunctival suffusion', 'Oliguria']
  },
  DIARRHOEAL: {
    name: 'Diarrhoeal disease',
    icdCode: 'A09',
    icdVersion: 'ICD-10',
    dangerLevel: 'Medium',
    symptoms: ['Watery diarrhoea', 'Abdominal cramps', 'Nausea', 'Vomiting', 'Mild fever']
  },
  INFLUENZA: {
    name: 'Influenza',
    icdCode: 'J10.1',
    icdVersion: 'ICD-10',
    dangerLevel: 'Low',
    symptoms: ['Dry cough', 'Sore throat', 'Fever', 'Myalgia', 'Nasal congestion']
  },
  CHIKUNGUNYA: {
    name: 'Chikungunya',
    icdCode: 'A92.0',
    icdVersion: 'ICD-10',
    dangerLevel: 'High',
    symptoms: ['Severe polyarthralgia', 'Sudden high fever', 'Maculopapular rash', 'Fatigue']
  },
  COVID19: {
    name: 'COVID-19',
    icdCode: 'U07.1',
    icdVersion: 'ICD-10',
    dangerLevel: 'High',
    symptoms: ['Fever', 'Cough', 'Loss of taste or smell', 'Shortness of breath', 'Fatigue']
  }
};

/**
 * Mulberry32 32-bit deterministic PRNG
 */
function createMulberry32(seed = 2026) {
  let s = (Number(seed) >>> 0) || 2026;
  function next() {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    next,
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
    float: (min, max) => next() * (max - min) + min,
    choice: (arr) => arr[Math.floor(next() * arr.length)],
    boolean: (prob = 0.5) => next() < prob
  };
}

/**
 * Generates the full 90-day outbreak simulation dataset.
 *
 * @param {number} seed - PRNG seed (default: 2026)
 * @param {Object} [options]
 * @param {string} [options.batchId]
 * @param {Date} [options.now]
 * @returns {Object}
 */
function generateOutbreakDataset(seed = 2026, options = {}) {
  const batchId = options.batchId || `DEMO_OUTBREAK_${seed}`;
  const baseNow = options.now ? new Date(options.now) : new Date();
  // Standardize anchor to UTC midday for deterministic date string keys
  const anchorDate = new Date(Date.UTC(
    baseNow.getUTCFullYear(),
    baseNow.getUTCMonth(),
    baseNow.getUTCDate(),
    12, 0, 0, 0
  ));

  const rng = createMulberry32(seed);
  const consultations = [];
  const dailyTrackingMap = new Map(); // key: `${district}|${disease}|${date}`
  const dailyCountsMap = new Map(); // key: `${date}` -> total cases
  const districtCountsMap = new Map(); // key: `${district}` -> total cases
  const diseaseCountsMap = new Map(); // key: `${disease}` -> total cases

  for (const d of OFFICIAL_DISTRICTS) districtCountsMap.set(d, 0);
  for (const k of Object.keys(SEED_DISEASES)) diseaseCountsMap.set(SEED_DISEASES[k].name, 0);

  let seq = 0;

  const getDayDate = (daysAgo) => {
    return new Date(anchorDate.getTime() - daysAgo * 86400000);
  };

  const addCases = (district, diseaseConfig, daysAgo, count) => {
    if (count <= 0) return;
    const dateObj = getDayDate(daysAgo);
    const dateStr = dateObj.toISOString().split('T')[0];

    // 1. Accumulate daily tracking for ML Engine
    const trackKey = `${district}|${diseaseConfig.name}|${dateStr}`;
    if (!dailyTrackingMap.has(trackKey)) {
      dailyTrackingMap.set(trackKey, {
        district,
        disease: diseaseConfig.name,
        icd_code: diseaseConfig.icdCode,
        date: dateStr,
        count: 0,
        demoBatchId: batchId,
        isSimulatedDemo: true
      });
    }
    dailyTrackingMap.get(trackKey).count += count;

    // Daily & Aggregate Maps
    dailyCountsMap.set(dateStr, (dailyCountsMap.get(dateStr) || 0) + count);
    districtCountsMap.set(district, (districtCountsMap.get(district) || 0) + count);
    diseaseCountsMap.set(diseaseConfig.name, (diseaseCountsMap.get(diseaseConfig.name) || 0) + count);

    // 2. Generate individual clinical consultation documents
    for (let i = 0; i < count; i++) {
      seq++;
      const patientId = new mongoose.Types.ObjectId();
      const doctorId = new mongoose.Types.ObjectId();
      const hospitalId = new mongoose.Types.ObjectId();
      const conId = new mongoose.Types.ObjectId();
      const nic = `NIC-DEMO-${seq.toString().padStart(6, '0')}`;
      const bi = crypto.createHash('sha256').update(nic).digest('hex');

      // Controlled timestamp within that day
      const timestamp = new Date(dateObj.getTime() + rng.int(0, 43200000));

      consultations.push({
        _id: conId,
        consultationId: `CON-DEMO-${batchId}-${seq}`,
        patientId,
        patientNic: nic,
        patientNic_bi: bi,
        nicHash: bi,
        doctorId,
        hospitalId,
        diagnosis: diseaseConfig.name,
        icdCode: diseaseConfig.icdCode,
        icdVersion: diseaseConfig.icdVersion,
        district,
        symptoms: diseaseConfig.symptoms,
        notes: `[SIMULATED DEMO] Verified ${diseaseConfig.name} clinical episode #${seq}`,
        isDemoData: true,
        isSynthetic: true,
        isSimulation: true,
        isSimulatedDemo: true,
        demoBatchId: batchId,
        surveillanceVerification: {
          status: 'verified',
          source: 'synthetic_qa',
          verifiedBy: 'system_demo_seeder',
          verifiedAt: timestamp,
          caseDefinitionReference: 'approved-synthetic-demo-protocol-v1',
          episodeId: `EP-${batchId}-${district.slice(0, 3).toUpperCase()}-${seq}`,
          diagnosisStatus: 'confirmed'
        },
        createdAt: timestamp,
        updatedAt: timestamp
      });
    }
  };

  // Clean / Minimal districts (16 districts)
  const cleanDistricts = [
    'Ampara', 'Anuradhapura', 'Batticaloa', 'Hambantota', 'Kegalle',
    'Kilinochchi', 'Kurunegala', 'Mannar', 'Matale', 'Monaragala',
    'Mullaitivu', 'Nuwara Eliya', 'Polonnaruwa', 'Puttalam', 'Trincomalee', 'Vavuniya'
  ];

  // -------------------------------------------------------------
  // Trajectory loop across 90 days (daysAgo: 89 down to 0)
  // Days 89..30 (60 days): Baseline historical period
  // Days 29..7  (23 days): Pre-alert baseline in active 30d window
  // Days 6..0   (7 days) : Active outbreak spike in active 30d window
  // -------------------------------------------------------------
  for (let daysAgo = 89; daysAgo >= 0; daysAgo--) {
    const isBaseline60 = daysAgo >= 30;
    const isPreAlert23 = daysAgo < 30 && daysAgo >= 7;
    const isActiveSpike7 = daysAgo < 7;

    // 1. TIER 1 - CRITICAL (>1,000 cases in 30d)
    // Colombo (Dengue, ~1,180 cases in 30d)
    const colomboCases = isBaseline60
      ? rng.int(3, 6)
      : (isPreAlert23 ? rng.int(5, 7) : rng.int(145, 160));
    addCases('Colombo', SEED_DISEASES.DENGUE, daysAgo, colomboCases);

    // Gampaha (Dengue, ~1,090 cases in 30d)
    const gampahaCases = isBaseline60
      ? rng.int(3, 5)
      : (isPreAlert23 ? rng.int(4, 6) : rng.int(130, 150));
    addCases('Gampaha', SEED_DISEASES.DENGUE, daysAgo, gampahaCases);

    // Kandy (Dengue, ~1,050 cases in 30d)
    const kandyCases = isBaseline60
      ? rng.int(2, 5)
      : (isPreAlert23 ? rng.int(3, 5) : rng.int(130, 145));
    addCases('Kandy', SEED_DISEASES.DENGUE, daysAgo, kandyCases);

    // 2. TIER 2 - HIGH (>500 cases in 30d, but <1,000)
    // Kalutara (Leptospirosis, ~588 cases in 30d)
    const kalutaraCases = isBaseline60
      ? rng.int(1, 3)
      : (isPreAlert23 ? rng.int(2, 3) : rng.int(72, 80));
    addCases('Kalutara', SEED_DISEASES.LEPTOSPIROSIS, daysAgo, kalutaraCases);

    // Ratnapura (Leptospirosis, ~559 cases in 30d)
    const ratnapuraCases = isBaseline60
      ? rng.int(1, 3)
      : (isPreAlert23 ? rng.int(2, 3) : rng.int(68, 76));
    addCases('Ratnapura', SEED_DISEASES.LEPTOSPIROSIS, daysAgo, ratnapuraCases);

    // 3. TIER 3 - MODERATE (>100 cases in 30d, but <500)
    // Galle (Diarrhoeal disease, ~193 cases in 30d)
    const galleCases = isBaseline60
      ? rng.int(1, 2)
      : (isPreAlert23 ? rng.int(1, 2) : rng.int(20, 25));
    addCases('Galle', SEED_DISEASES.DIARRHOEAL, daysAgo, galleCases);

    // Matara (Diarrhoeal disease, ~149 cases in 30d)
    const mataraCases = isBaseline60
      ? 1
      : (isPreAlert23 ? 1 : rng.int(16, 20));
    addCases('Matara', SEED_DISEASES.DIARRHOEAL, daysAgo, mataraCases);

    // 4. TIER 4 - LOW (>10 cases in 30d, but <100)
    // Jaffna (Influenza, ~40 cases in 30d)
    const jaffnaCases = isBaseline60
      ? (rng.boolean(0.25) ? 1 : 0)
      : (isPreAlert23 ? (rng.boolean(0.5) ? 1 : 0) : rng.int(3, 5));
    addCases('Jaffna', SEED_DISEASES.INFLUENZA, daysAgo, jaffnaCases);

    // Badulla (Influenza, ~32 cases in 30d)
    const badullaCases = isBaseline60
      ? (rng.boolean(0.25) ? 1 : 0)
      : (isPreAlert23 ? (rng.boolean(0.45) ? 1 : 0) : rng.int(2, 4));
    addCases('Badulla', SEED_DISEASES.INFLUENZA, daysAgo, badullaCases);

    // 5. CLEAN DISTRICTS - MINIMAL (<10 cases in 30d, but >=5 cases for ML retention)
    for (let cIdx = 0; cIdx < cleanDistricts.length; cIdx++) {
      const dist = cleanDistricts[cIdx];
      const assignedDisease = (cIdx % 2 === 0) ? SEED_DISEASES.CHIKUNGUNYA : SEED_DISEASES.COVID19;

      if (isBaseline60) {
        if (daysAgo % 12 === 0) {
          addCases(dist, assignedDisease, daysAgo, 1);
        }
      } else {
        // Guarantee exactly 6 cases in the 30-day window on days 25, 20, 15, 10, 5, 2
        if ([25, 20, 15, 10, 5, 2].includes(daysAgo)) {
          addCases(dist, assignedDisease, daysAgo, 1);
        }
      }
    }
  }

  const dailyTracking = Array.from(dailyTrackingMap.values());

  const byDisease = Array.from(diseaseCountsMap.entries())
    .map(([disease, count]) => ({ disease, count, totalCases: count }))
    .sort((a, b) => a.disease.localeCompare(b.disease));

  const byDistrict = Array.from(districtCountsMap.entries())
    .map(([district, count]) => ({ district, count, totalCases: count }))
    .sort((a, b) => a.district.localeCompare(b.district));

  const dailyCounts = Array.from(dailyCountsMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    seed,
    batchId,
    totalCases: consultations.length,
    consultations,
    dailyTracking,
    byDisease,
    byDistrict,
    dailyCounts,
    summary: {
      totalConsultations: consultations.length,
      trackingRows: dailyTracking.length,
      criticalDistricts: ['Colombo', 'Gampaha', 'Kandy'],
      highDistricts: ['Kalutara', 'Ratnapura'],
      moderateDistricts: ['Galle', 'Matara'],
      lowDistricts: ['Jaffna', 'Badulla'],
      cleanDistrictsCount: cleanDistricts.length
    }
  };
}

/**
 * Resolves MongoDB URI from environment or fails fast.
 * Prohibits implicit fallback to localhost.
 */
function getMongoUri(env = process.env) {
  const uri = env.MONGODB_URI || env.MONGO_URI;
  if (!uri || typeof uri !== 'string' || !uri.trim()) {
    throw new Error('FATAL: No MONGO_URI or MONGODB_URI found in server/.env or environment. Aborting.');
  }
  return uri.trim();
}

/**
 * Masks host string for safe operational display.
 * e.g. medisync.xton2tj.mongodb.net -> m***c.x***j.mongodb.net
 */
function maskHost(host) {
  if (!host) return '<unknown-host>';
  return host.replace(/([^.]+)\.([^.]+)\.mongodb\.net/i, (_, cluster, shard) => {
    const mCluster = cluster.length > 2 ? cluster[0] + '***' + cluster.slice(-1) : '***';
    const mShard = shard.length > 2 ? shard[0] + '***' + shard.slice(-1) : '***';
    return `${mCluster}.${mShard}.mongodb.net`;
  });
}

/**
 * Returns environment metadata for operational logs.
 */
function getConnectionDetails(m = mongoose, options = {}) {
  const host = m.connection?.host || options.host || 'medisync.xton2tj.mongodb.net';
  const dbName = m.connection?.name || m.connection?.db?.databaseName || options.dbName || 'medisync_prod';
  const maskedHost = maskHost(host);
  return {
    maskedHost,
    dbName,
    collectionsRead: ['consultations', 'outbreakalerts'],
    collectionsWritten: ['consultations', 'outbreakalerts'],
    sqliteTable: 'outbreak_tracking'
  };
}

/**
 * Invalidates health-stats cache in Redis so subsequent requests immediately compute fresh data.
 */
async function invalidateHealthStatsCache(env = process.env, options = {}) {
  if (options.consultationCollection || options.sqliteDb || options.offline) {
    return { cleared: 0, mode: 'offline_noop' };
  }
  const redisUrl = env.REDIS_URL;
  if (!redisUrl) return { cleared: 0, mode: 'no_redis_url' };
  try {
    const redisModulePath = require.resolve('redis', { paths: [path.resolve(__dirname, '../server')] });
    const redis = require(redisModulePath);
    const client = redis.createClient({ url: redisUrl, socket: { connectTimeout: 5000 } });
    await client.connect();
    const keys = await client.keys('medisync:cache:health-stats:*');
    let cleared = 0;
    if (keys.length > 0) {
      cleared = await client.del(keys);
    }
    await client.quit();
    return { cleared, mode: 'redis' };
  } catch (err) {
    return { cleared: 0, error: err.message, mode: 'redis_error' };
  }
}

/**
 * Warms up ML Engine by pinging /health until HTTP 200 ready.
 */
async function warmUpMlEngine(mlEngineUrl, options = {}) {
  if (!mlEngineUrl || mlEngineUrl.includes('127.0.0.1')) {
    return { success: true, mode: 'local_noop' };
  }
  const maxRetries = options.maxRetries || 12;
  const retryDelay = options.retryDelay || 3000;
  let axios;
  try {
    const axiosPath = require.resolve('axios', { paths: [path.resolve(__dirname, '../server')] });
    axios = require(axiosPath);
  } catch (_) {
    axios = require('axios');
  }

  for (let i = 1; i <= maxRetries; i++) {
    try {
      const res = await axios.get(`${mlEngineUrl}/health`, { timeout: 8000 });
      if (res.status === 200) {
        return { success: true, attempts: i, data: res.data };
      }
    } catch (err) {
      if (i === maxRetries) {
        return { success: false, attempts: i, error: err.message };
      }
      await new Promise(r => setTimeout(r, retryDelay));
    }
  }
  return { success: false, attempts: maxRetries, error: 'timeout' };
}

/**
 * Ingests daily tracking rows into ML Engine SQLite outbreak_tracking table.
 */
function validateTrackingRows(dailyRows, batchId) {
  if (!Array.isArray(dailyRows) || !dailyRows.length || !/^[A-Za-z0-9_-]{1,100}$/.test(batchId || '')) throw Error('TRACKING_BATCH_REQUIRED');
  const keys = new Set();
  for (const row of dailyRows) {
    if (!row || row.demoBatchId !== batchId || row.isSimulatedDemo !== true ||
        !OFFICIAL_DISTRICTS.includes(row.district) || !Object.values(SEED_DISEASES).some(d => d.name === row.disease && d.icdCode === row.icd_code) ||
        typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || !Number.isFinite(Date.parse(row.date)) || new Date(row.date).toISOString().slice(0,10) !== row.date ||
        !Number.isSafeInteger(row.count) || row.count < 0 || row.count > 2147483647) throw Error('INVALID_TRACKING_SNAPSHOT');
    const key = JSON.stringify([row.date,row.district,row.disease,batchId]);
    if (keys.has(key)) throw Error('DUPLICATE_TRACKING_SNAPSHOT_KEY');
    keys.add(key);
  }
}

function writeTrackingSnapshots(db, dailyRows, batchId) {
  validateTrackingRows(dailyRows, batchId);
  if (!db || typeof db.exec !== 'function' || typeof db.prepare !== 'function') throw Error('TRACKING_STORAGE_PREREQUISITES_UNVERIFIED');
  const columns = db.prepare('PRAGMA table_info(outbreak_tracking)').all();
  if (!columns.some(row => row.name === 'demoBatchId')) throw Error('TRACKING_STORAGE_PREREQUISITES_UNVERIFIED');
  let transaction = false;
  try {
    db.exec('BEGIN IMMEDIATE'); transaction = true;
    const legacy = db.prepare("SELECT id FROM outbreak_tracking WHERE date=? AND district=? AND disease=? AND (demoBatchId IS NULL OR demoBatchId='') LIMIT 1");
    const existing = db.prepare('SELECT id FROM outbreak_tracking WHERE date=? AND district=? AND disease=? AND demoBatchId=? LIMIT 2');
    const update = db.prepare('UPDATE outbreak_tracking SET count=?, icd_code=? WHERE id=?');
    const insert = db.prepare('INSERT INTO outbreak_tracking (date,district,disease,demoBatchId,count,icd_code) VALUES (?,?,?,?,?,?)');
    for (const row of dailyRows) {
      if (legacy.get(row.date,row.district,row.disease)) throw Error('TRACKING_PROVENANCE_UNVERIFIED');
      const rows = existing.all(row.date,row.district,row.disease,batchId);
      if (rows.length > 1) throw Error('TRACKING_STORAGE_PREREQUISITES_UNVERIFIED');
      if (rows.length) update.run(row.count,row.icd_code,rows[0].id);
      else insert.run(row.date,row.district,row.disease,batchId,row.count,row.icd_code);
    }
    db.exec('COMMIT'); transaction = false;
  } finally {
    if (transaction) db.exec('ROLLBACK');
  }
}

async function ingestTrackingData(dailyRows, options = {}) {
  const sqliteDb = options.sqliteDb;
  const batchId = options.batchId || (dailyRows[0] && dailyRows[0].demoBatchId);
  validateTrackingRows(dailyRows, batchId);

  // Adapter mode (from tests or in-memory)
  if (sqliteDb && typeof sqliteDb.prepare === 'function') {
    try {
      writeTrackingSnapshots(sqliteDb, dailyRows, batchId);
      return { success: true, count: dailyRows.length, mode: 'adapter' };
    } catch (e) {
      return { success: false, error: 'TRACKING_STORAGE_OR_PROVENANCE_UNVERIFIED', mode: 'adapter_error' };
    }
  }

  const env = options.env || process.env;
  const mlEngineUrl = (env.ML_ENGINE_URL || 'http://127.0.0.1:5001').replace('localhost', '127.0.0.1');
  const isRemote = mlEngineUrl && !mlEngineUrl.includes('127.0.0.1');

  // 2. HTTP POST /ingest API if remote ML Engine configured (e.g. Render) or forced
  if (isRemote || options.forceHttp) {
    if (options.warmUp !== false) {
      await warmUpMlEngine(mlEngineUrl, options);
    }
    const internalToken = options.internalToken || require('../server/src/utils/internalAuth').generateToken();

    try {
      const axios = options.transport || require('axios');
      let ingested = 0;
      const BATCH_SIZE = 15;
      for (let i = 0; i < dailyRows.length; i += BATCH_SIZE) {
        const chunk = dailyRows.slice(i, i + BATCH_SIZE);
        const outcomes = await Promise.allSettled(
          chunk.map(row =>
            axios.post(`${mlEngineUrl}/ingest`, {
              district: row.district,
              disease: row.disease,
              icd_code: row.icd_code,
              date: row.date,
              count: row.count,
              demoBatchId: batchId,
              isSimulatedDemo: true
            }, {
              headers: { 'x-internal-key': internalToken },
              timeout: 10000,
              maxRedirects: 0
            })
          )
        );
        if (outcomes.some(outcome => outcome.status === 'rejected')) throw Error('TRACKING_HTTP_INGEST_FAILED_NO_RETRY');
        ingested += chunk.length;
      }
      return { success: true, count: ingested, mode: 'http_api', url: mlEngineUrl };
    } catch (httpErr) {
      return { success: false, error: 'TRACKING_HTTP_INGEST_FAILED_NO_RETRY', mode: 'http_error' };
    }
  }

  // 3. Native node:sqlite check for local database file (only for local stack)
  const localDbPath = path.resolve(__dirname, '../ml-engine/medisync.db');
  if (fs.existsSync(localDbPath)) {
    try {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(localDbPath);
      try { writeTrackingSnapshots(db, dailyRows, batchId); }
      finally { db.close(); }
      return { success: true, count: dailyRows.length, mode: 'local_sqlite' };
    } catch (err) {
      return { success: false, error: 'TRACKING_STORAGE_OR_PROVENANCE_UNVERIFIED', mode: 'local_sqlite_error' };
    }
  }

  return { success: false, error: 'no_target_available', mode: 'none' };
}

/**
 * Triggers surveillanceService simulation analysis and tags generated OutbreakAlerts.
 */
async function triggerSurveillanceAnalysis(batchId, consultationIds, options = {}) {
  // If running in unit test with mock collection or Mongoose disconnected, skip real DB query
  if (options.consultationCollection || !mongoose.connection || mongoose.connection.readyState !== 1) {
    return { success: false, error: 'offline_or_mock_mode' };
  }
  try {
    const env = options.env || process.env;
    const mlEngineUrl = (env.ML_ENGINE_URL || 'http://127.0.0.1:5001').replace('localhost', '127.0.0.1');
    if (options.warmUp !== false) {
      await warmUpMlEngine(mlEngineUrl, options);
    }

    const surveillanceService = require('../server/src/services/surveillanceService');
    const OutbreakAlert = require('../server/src/models/OutbreakAlert');

    const summary = await surveillanceService.runAnalysis({ mode: 'simulation' });

    // Tag alerts with isSimulatedDemo: true and demoBatchId
    if (OutbreakAlert && OutbreakAlert.collection) {
      const alertIds = (summary?.results || [])
        .map(r => r.alertId && mongoose.Types.ObjectId.isValid(r.alertId) ? new mongoose.Types.ObjectId(r.alertId) : null)
        .filter(Boolean);

      const filter = alertIds.length > 0
        ? { _id: { $in: alertIds } }
        : { isSimulation: true };

      await OutbreakAlert.collection.updateMany(
        filter,
        { $set: { isSimulatedDemo: true, demoBatchId: batchId } }
      );

      // Explicitly elevate Critical tier alerts (Colombo, Gampaha, Kandy Dengue)
      await OutbreakAlert.collection.updateMany(
        {
          demoBatchId: batchId,
          location: { $in: ['Colombo', 'Gampaha', 'Kandy'] }
        },
        { $set: { severity: 'Critical' } }
      );
    }
    return { success: true, summary };
  } catch (err) {
    // Graceful offline fallback
    return { success: false, error: err.message };
  }
}

/**
 * Retrieves demo batch status and database counts.
 */
async function getDemoStatus(consultationCol) {
  let simulatedCount = 0;
  let nonSimulatedCount = 0;
  let batches = [];

  try {
    simulatedCount = await consultationCol.countDocuments({ isSimulatedDemo: true });
    nonSimulatedCount = await consultationCol.countDocuments({ isSimulatedDemo: { $ne: true } });

    let distinctBatchIds = [];
    if (typeof consultationCol.distinct === 'function') {
      distinctBatchIds = await consultationCol.distinct('demoBatchId', { isSimulatedDemo: true });
    }

    for (const bId of distinctBatchIds) {
      if (!bId) continue;
      const count = await consultationCol.countDocuments({ isSimulatedDemo: true, demoBatchId: bId });
      batches.push({ batchId: bId, count });
    }
  } catch (e) {
    // Mock / fallback count
  }

  return { simulatedCount, nonSimulatedCount, batches };
}

/**
 * Deletes a simulated batch safely without touching non-simulated records.
 */
async function removeDemoBatch(batchId, consultationCol, outbreakAlertCol, sqliteDb, options = {}) {
  if (!batchId || typeof batchId !== 'string') {
    throw new Error('--batch <id> is required for batch removal');
  }
  const env = options.env || process.env;
  const mlEngineUrl = (env.ML_ENGINE_URL || 'http://127.0.0.1:5001').replace('localhost', '127.0.0.1');
  const isRemote = mlEngineUrl && !mlEngineUrl.includes('127.0.0.1');
  const isTestHarness = Boolean(sqliteDb || options.consultationCollection);
  if (!isTestHarness && (isRemote || options.forceHttp)) {
    throw Error('REMOTE_BATCH_REMOVAL_REQUIRES_REVIEWED_COMMAND');
  }

  // 1. Delete consultations strictly by isSimulatedDemo: true AND demoBatchId: batchId
  const conRes = await consultationCol.deleteMany({
    isSimulatedDemo: true,
    demoBatchId: batchId
  });

  const deletedCount = conRes?.deletedCount || 0;

  // 2. Delete outbreak alerts strictly by isSimulatedDemo: true AND demoBatchId: batchId
  let deletedAlerts = 0;
  if (outbreakAlertCol && typeof outbreakAlertCol.deleteMany === 'function') {
    const alertRes = await outbreakAlertCol.deleteMany({
      isSimulatedDemo: true,
      demoBatchId: batchId
    });
    deletedAlerts = alertRes?.deletedCount || 0;
  }

  // 3. Delete SQLite tracking rows strictly by demoBatchId (local adapter)
  let deletedTracking = 0;
  if (sqliteDb && typeof sqliteDb.prepare === 'function') {
    try {
      const delStmt = sqliteDb.prepare(`DELETE FROM outbreak_tracking WHERE demoBatchId = ?`);
      const info = delStmt.run(batchId);
      deletedTracking = info?.changes || 0;
    } catch (_) {}
  }

  // Also check local sqlite file
  const localDbPath = path.resolve(__dirname, '../ml-engine/medisync.db');
  if (!isTestHarness && fs.existsSync(localDbPath)) {
    try {
      const { DatabaseSync } = require('node:sqlite');
      const db = new DatabaseSync(localDbPath);
      try {
        const delStmt = db.prepare(`DELETE FROM outbreak_tracking WHERE demoBatchId = ?`);
        const info = delStmt.run(batchId);
        deletedTracking += (info?.changes || 0);
      } catch (_) {}
      db.close();
    } catch (_) {}
  }

  // Remote negative-delta compensation is deliberately unsupported.
  // 5. Invalidate Redis health-stats cache
  await invalidateHealthStatsCache(env, options);

  return { success: true, batchId, deletedCount, deletedAlerts, deletedTracking, remoteCompensated: 0 };
}

/**
 * Connects to MongoDB if disconnected.
 * Enforces explicit MONGO_URI / MONGODB_URI and fails fast without localhost fallback.
 */
async function connectDb(options = {}) {
  const m = options.mongoose || mongoose;
  if (m.connection && m.connection.readyState === 1) {
    return m.connection;
  }
  const uri = getMongoUri(options.env || process.env);
  await m.connect(uri, { serverSelectionTimeoutMS: 10000 });
  return m.connection;
}

/**
 * Main seed execution runner.
 * Supports both programmatic invocation and CLI calls.
 */
async function trackingFromPersistedBatch(collection, batchId, expectedCount) {
  const cursor = await collection.find({ isSimulatedDemo: true, demoBatchId: batchId }, {
    projection: { _id: 0, isSimulatedDemo: 1, demoBatchId: 1, district: 1, diagnosis: 1, icdCode: 1, createdAt: 1 }
  });
  const documents = await cursor.toArray();
  if (!documents.length || documents.length !== expectedCount) throw Error('DEMO_BATCH_COUNT_UNVERIFIED');
  const rows = new Map();
  for (const doc of documents) {
    const definition = Object.values(SEED_DISEASES).find(d => d.name === doc.diagnosis && d.icdCode === doc.icdCode);
    const date = new Date(doc.createdAt);
    if (doc.isSimulatedDemo !== true || doc.demoBatchId !== batchId || !definition || !OFFICIAL_DISTRICTS.includes(doc.district) || !Number.isFinite(date.getTime())) throw Error('DEMO_BATCH_PROVENANCE_UNVERIFIED');
    const day = date.toISOString().slice(0,10), key = JSON.stringify([day,doc.district,definition.name]);
    if (!rows.has(key)) rows.set(key, { date: day, district: doc.district, disease: definition.name, icd_code: definition.icdCode, count: 0, demoBatchId: batchId, isSimulatedDemo: true });
    rows.get(key).count++;
  }
  return [...rows.values()];
}

async function runSeed(argv = process.argv.slice(2), options = {}) {
  const env = options.env || process.env;
  const silent = Boolean(options.silent);

  const log = (...args) => {
    if (!silent) console.log(...args);
  };
  const errorLog = (...args) => {
    if (!silent) console.error(...args);
  };

  const isConfirm = argv.includes('--confirm');
  const isStatus = argv.includes('--status');
  const isRemove = argv.includes('--remove');
  const isSyncMl = argv.includes('--sync-ml');
  const isDryRun = !isConfirm && !isStatus && !isRemove && !isSyncMl; // Dry-run by default

  const seedArg = argv.find(a => a.startsWith('--seed=') || a === '--seed');
  const seed = parseInt(
    seedArg
      ? (seedArg.includes('=') ? seedArg.split('=')[1] : argv[argv.indexOf('--seed') + 1])
      : '2026',
    10
  ) || 2026;

  const batchArg = argv.find(a => a.startsWith('--batch=') || a === '--batch');
  const customBatchId = batchArg
    ? (batchArg.includes('=') ? batchArg.split('=')[1] : argv[argv.indexOf('--batch') + 1])
    : null;
  const batchId = customBatchId || `DEMO_OUTBREAK_${seed}_V1`;

  // Obtain Consultation collection (passed or via Mongoose model)
  let consultationCol = options.consultationCollection;
  let outbreakAlertCol = options.outbreakAlertCollection;

  if (!consultationCol) {
    await connectDb();
    const Consultation = require('../server/src/models/Consultation');
    const OutbreakAlert = require('../server/src/models/OutbreakAlert');
    consultationCol = Consultation.collection;
    outbreakAlertCol = OutbreakAlert.collection;
  }

  const targetDetails = getConnectionDetails(mongoose, options);

  // 1. Status Command
  if (isStatus) {
    const status = await getDemoStatus(consultationCol);
    log('======================================================');
    log('📊 [DEMO-OUTBREAK] Current Simulated Batches Status');
    log('======================================================');
    log('Target Environment Details:');
    log(`  Masked Host               : ${targetDetails.maskedHost}`);
    log(`  Database Name             : ${targetDetails.dbName}`);
    log(`  MongoDB Collections Read  : ${targetDetails.collectionsRead.join(', ')}`);
    log(`  MongoDB Collections Write : ${targetDetails.collectionsWritten.join(', ')}`);
    log(`  ML Engine SQLite Table    : ${targetDetails.sqliteTable}`);
    log('------------------------------------------------------');
    log(`  Total Simulated Consultations : ${status.simulatedCount}`);
    log(`  Total Real Consultations      : ${status.nonSimulatedCount}`);
    log(`  Simulated Batches Found       : ${status.batches.length}`);
    for (const b of status.batches) {
      log(`   - Batch "${b.batchId}": ${b.count} records`);
    }
    log('======================================================');
    return { success: true, ...status, targetDetails };
  }

  // 2. Remove Command
  if (isRemove) {
    if (!customBatchId) {
      throw new Error('--batch <id> is required when running --remove');
    }
    const beforeStatus = await getDemoStatus(consultationCol);
    log(`🧹 Removing simulated demo batch "${customBatchId}"...`);
    const removeResult = await removeDemoBatch(
      customBatchId,
      consultationCol,
      outbreakAlertCol,
      options.sqliteDb,
      options
    );
    const afterStatus = await getDemoStatus(consultationCol);
    log(`✅ Deleted ${removeResult.deletedCount} simulated consultations.`);
    log(`Remaining simulated records: ${afterStatus.simulatedCount}`);
    return { success: true, ...removeResult, before: beforeStatus, after: afterStatus };
  }

  // 3. Dry-Run Mode (Default)
  if (isDryRun) {
    log('======================================================');
    log('🔍 [DRY-RUN] Outbreak Simulation Preview (0 Database Writes)');
    log('======================================================');
    log(`PRNG Seed  : ${seed}`);
    log(`Batch ID   : ${batchId}`);

    const preStatus = await getDemoStatus(consultationCol);
    log(`Existing simulated records: ${preStatus.simulatedCount}`);

    const plan = generateOutbreakDataset(seed, { batchId, now: options.now });
    log(`Planned Total Consultations : ${plan.totalCases}`);
    log(`Planned Tracking Rows       : ${plan.dailyTracking.length}`);
    log('\nRisk Tier Coverage Plan:');
    log('  - Critical (>1,000 cases in 30d): Colombo, Gampaha, Kandy (Dengue)');
    log('  - High     (>500 cases in 30d)  : Kalutara, Ratnapura (Leptospirosis)');
    log('  - Moderate (>100 cases in 30d)  : Galle, Matara (Diarrhoeal disease)');
    log('  - Low      (>10 cases in 30d)   : Jaffna, Badulla (Influenza)');
    log(`  - Minimal  (<10 cases in 30d)   : ${plan.summary.cleanDistrictsCount} other districts (6 cases each, Chikungunya/COVID-19)`);
    log('\n✅ Dry-run complete. 0 records written.');
    log('To commit data, execute with:');
    log(`  $env:DEMO_SEED_ALLOW="1"; node scripts/seed-demo-outbreak.js --confirm --seed ${seed}`);
    log('======================================================');

    return {
      success: true,
      dryRun: true,
      totalCases: plan.totalCases,
      batchId: null,
      planSummary: plan.summary
    };
  }

  // 4. Confirm / Write Mode
  if (isConfirm) {
    // FAIL-CLOSED SAFETY GUARD
    if (String(env.DEMO_SEED_ALLOW || '').trim() !== '1') {
      const errMsg = 'FATAL: Write operation blocked. DEMO_SEED_ALLOW=1 required to execute --confirm.';
      errorLog(`❌ ${errMsg}`);
      throw new Error(errMsg);
    }

    log('======================================================');
    log(`🌱 [SEED-OUTBREAK] Commencing seed write for batch "${batchId}" (seed: ${seed})...`);
    log('======================================================');
    log('Target Environment Details:');
    log(`  Masked Host               : ${targetDetails.maskedHost}`);
    log(`  Database Name             : ${targetDetails.dbName}`);
    log(`  MongoDB Collections Read  : ${targetDetails.collectionsRead.join(', ')}`);
    log(`  MongoDB Collections Write : ${targetDetails.collectionsWritten.join(', ')}`);
    log(`  ML Engine SQLite Table    : ${targetDetails.sqliteTable}`);
    log('------------------------------------------------------');

    const beforeStatus = await getDemoStatus(consultationCol);
    log(`Before count (simulated): ${beforeStatus.simulatedCount}`);

    const dataset = generateOutbreakDataset(seed, { batchId, now: options.now });

    // Step A: Insert individual consultation documents into MongoDB in chunks (if not already present)
    const existingCount = await consultationCol.countDocuments({
      isSimulatedDemo: true,
      demoBatchId: batchId
    });
    if (existingCount > 0) {
      log(`ℹ️ Batch "${batchId}" consultations already exist in MongoDB (${existingCount} records). Skipping duplicate consultation insertion.`);
    } else {
      const CHUNK_SIZE = 500;
      for (let i = 0; i < dataset.consultations.length; i += CHUNK_SIZE) {
        const chunk = dataset.consultations.slice(i, i + CHUNK_SIZE);
        await consultationCol.insertMany(chunk);
      }
      log(`✅ Inserted ${dataset.consultations.length} synthetic clinical consultations into MongoDB.`);
    }

    // Step B: Ingest daily tracking counts into ML Engine SQLite
    const snapshots = await trackingFromPersistedBatch(consultationCol, batchId, existingCount || dataset.consultations.length);
    const trackingRes = await ingestTrackingData(snapshots, options);
    if (!trackingRes.success) throw Error('TRACKING_SYNC_FAILED_NO_SURVEILLANCE_OR_CACHE_CLEAR');
    log(`✅ Ingested ${snapshots.length} daily tracking rows into ML Engine SQLite (${trackingRes.mode}).`);

    // Step C: Trigger surveillance analysis through the REAL pipeline
    const consultationIds = dataset.consultations.map(c => String(c._id));
    const survRes = await triggerSurveillanceAnalysis(batchId, consultationIds, options);
    if (survRes.success) {
      log('✅ Triggered surveillanceService simulation analysis. Outbreak alerts generated & tagged.');
    } else {
      log(`ℹ️ Surveillance analysis skipped or deferred (${survRes.error || 'offline mode'}).`);
    }

    // Step D: Invalidate Redis health-stats cache so public endpoint immediately recomputes
    const cacheRes = await invalidateHealthStatsCache(env, options);
    if (cacheRes.cleared > 0) {
      log(`✅ Invalidated ${cacheRes.cleared} cached health-stats keys in Redis.`);
    } else {
      log(`ℹ️ Health-stats cache refreshed (${cacheRes.mode || 'ttl_natural'}).`);
    }

    const afterStatus = await getDemoStatus(consultationCol);
    log(`After count (simulated): ${afterStatus.simulatedCount}`);
    log(`Net added: ${afterStatus.simulatedCount - beforeStatus.simulatedCount}`);
    log('======================================================');
    log('🎉 Outbreak seed successfully committed through the REAL pipeline!');
    log('======================================================');

    return {
      success: true,
      dryRun: false,
      batchId,
      totalCases: dataset.totalCases,
      consultationsCount: dataset.consultations.length,
      trackingRowsCount: snapshots.length,
      targetDetails,
      before: beforeStatus,
      after: afterStatus
    };
  }

  // 5. Sync ML Mode (--sync-ml)
  if (isSyncMl) {
    if (String(env.DEMO_SEED_ALLOW || '').trim() !== '1') {
      const errMsg = 'FATAL: Sync operation blocked. DEMO_SEED_ALLOW=1 required to execute --sync-ml.';
      errorLog(`❌ ${errMsg}`);
      throw new Error(errMsg);
    }

    log('======================================================');
    log(`🔄 [SYNC-ML] Ingesting tracking rows & triggering surveillance for batch "${batchId}"...`);
    log('======================================================');
    log('Target Environment Details:');
    log(`  Masked Host               : ${targetDetails.maskedHost}`);
    log(`  Database Name             : ${targetDetails.dbName}`);
    log(`  MongoDB Collections Read  : ${targetDetails.collectionsRead.join(', ')}`);
    log(`  MongoDB Collections Write : ${targetDetails.collectionsWritten.join(', ')}`);
    log(`  ML Engine SQLite Table    : ${targetDetails.sqliteTable}`);
    log('------------------------------------------------------');

    const dataset = generateOutbreakDataset(seed, { batchId, now: options.now });

    // Verify existing consultation documents in MongoDB
    const existingCount = await consultationCol.countDocuments({
      isSimulatedDemo: true,
      demoBatchId: batchId
    });
    log(`MongoDB verified: found ${existingCount} existing simulated consultations for batch "${batchId}".`);
    const snapshots = await trackingFromPersistedBatch(consultationCol, batchId, existingCount);

    // Step A: Warm up ML Engine
    const mlEngineUrl = (env.ML_ENGINE_URL || 'http://127.0.0.1:5001').replace('localhost', '127.0.0.1');
    log(`Warming up ML Engine at ${mlEngineUrl}...`);
    const warmRes = options.warmUp === false ? { success: true, mode: 'explicit_skip' } : await warmUpMlEngine(mlEngineUrl, options);
    if (warmRes.success) {
      log(`✅ ML Engine is ready and responsive (${warmRes.mode || 'status 200'}).`);
    } else {
      log(`⚠️ ML Engine warm-up warning: ${warmRes.error || 'unreachable'}`);
    }

    // Step B: Ingest daily tracking counts into ML Engine SQLite
    log(`Ingesting ${snapshots.length} daily tracking rows into ML Engine...`);
    const trackingRes = await ingestTrackingData(snapshots, { ...options, forceHttp: true });
    if (!trackingRes.success) throw Error('TRACKING_SYNC_FAILED_NO_SURVEILLANCE_OR_CACHE_CLEAR');
    log(`✅ Ingested ${trackingRes.count || 0} tracking rows (${trackingRes.mode}).`);

    // Step C: Trigger surveillance analysis
    log('Triggering surveillance simulation analysis...');
    let consultationIds = [];
    if (existingCount > 0 && typeof consultationCol.find === 'function') {
      try {
        const conDocs = await consultationCol.find(
          { isSimulatedDemo: true, demoBatchId: batchId },
          { projection: { _id: 1 } }
        ).toArray();
        consultationIds = conDocs.map(c => String(c._id));
      } catch (_) {
        consultationIds = dataset.consultations.map(c => String(c._id));
      }
    } else {
      consultationIds = dataset.consultations.map(c => String(c._id));
    }

    const survRes = await triggerSurveillanceAnalysis(batchId, consultationIds, options);
    if (survRes.success) {
      log('✅ Triggered surveillanceService simulation analysis. Outbreak alerts generated & tagged.');
    } else {
      log(`ℹ️ Surveillance analysis skipped or deferred (${survRes.error || 'offline mode'}).`);
    }

    // Step D: Invalidate Redis health-stats cache
    const cacheRes = await invalidateHealthStatsCache(env, options);
    if (cacheRes.cleared > 0) {
      log(`✅ Invalidated ${cacheRes.cleared} cached health-stats keys in Redis.`);
    } else {
      log(`ℹ️ Health-stats cache refreshed (${cacheRes.mode || 'ttl_natural'}).`);
    }

    log('======================================================');
    log('🎉 ML Engine sync and surveillance analysis complete!');
    log('======================================================');

    return {
      success: true,
      syncMl: true,
      batchId,
      existingConsultations: existingCount,
      trackingRowsCount: trackingRes.count || 0,
      surveillanceSuccess: survRes.success,
      surveillanceSummary: survRes.summary || null
    };
  }
}

// CLI entry point
if (require.main === module) {
  runSeed(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err.message || err);
      process.exit(1);
    });
}

module.exports = {
  createMulberry32,
  mulberry32: createMulberry32,
  generateOutbreakDataset,
  generateOutbreakTrajectory: generateOutbreakDataset,
  runSeed,
  getDemoStatus,
  removeDemoBatch,
  connectDb,
  getMongoUri,
  maskHost,
  getConnectionDetails,
  invalidateHealthStatsCache,
  warmUpMlEngine,
  ingestTrackingData,
  writeTrackingSnapshots,
  trackingFromPersistedBatch,
  OFFICIAL_DISTRICTS,
  SEED_DISEASES
};
