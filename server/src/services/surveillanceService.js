const crypto = require('crypto');
const mongoose = require('mongoose');
const POLICY = '5w-verified-episodes-v1';
const DAY = 86400000;
const DISTRICTS = new Set('Ampara|Anuradhapura|Badulla|Batticaloa|Colombo|Galle|Gampaha|Hambantota|Jaffna|Kalutara|Kandy|Kegalle|Kilinochchi|Kurunegala|Mannar|Matale|Matara|Monaragala|Mullaitivu|Nuwara Eliya|Polonnaruwa|Puttalam|Ratnapura|Trincomalee|Vavuniya'.split('|'));
const synthetic = c => {
  if (c && c.syntheticSeedBatch === 'viva-2026-11-outbreaks') return false;
  return c.isSimulation === true || c.isTestFixture === true || c.isDemoData === true || c.isSynthetic === true || c.isUniversityDemo === true || c.isSyntheticUniversityData === true || Boolean(c.datasetVersion || c.datasetBatch || c.testRunId || c.phase5wOwner);
};
const realAlertFilter = () => ({ isSimulation: false, isDemoData: { $ne: true }, isSynthetic: { $ne: true }, isUniversityDemo: { $ne: true }, isSyntheticUniversityData: { $ne: true }, isTestFixture: { $ne: true }, datasetVersion: { $exists: false }, datasetBatch: { $exists: false }, testRunId: { $exists: false }, phase5wOwner: { $exists: false } });
function diseaseId(c) {
  const code = String(c.icdCode || '').trim().toUpperCase();
  const version = String(c.icdVersion || '').toUpperCase().replace(/[-\s]/g, '');
  if (version === 'ICD10' && /^[A-Z][0-9]{2}(?:\.?[A-Z0-9]{1,4})?$/.test(code)) return `ICD10:${code.replace('.', '')}`;
  if (version === 'ICD11' && /^[A-Z0-9]{4}(?:\.[A-Z0-9]{1,3})?$/.test(code)) return `ICD11:${code}`;
  return null;
}
// No invented disease-specific episode interval. A trusted, reviewed episode ID
// defines a case; repeated visits for that patient/disease/episode count once.
// Missing clinical provenance/confirmation/episode metadata requires review.
function selectCases(candidates, { mode = 'real', now = new Date(), lookbackDays = 30 } = {}) {
  if (!['real', 'simulation'].includes(mode)) throw new Error('Invalid surveillance mode');
  const cases = [], excluded = {}, seen = new Set();
  const reject = reason => { excluded[reason] = (excluded[reason] || 0) + 1; };
  const maxAgeDays = Number(lookbackDays) > 0 ? Number(lookbackDays) : 30;
  for (const c of [...candidates].sort((a,b) => new Date(a.createdAt)-new Date(b.createdAt))) {
    const v = c.surveillanceVerification;
    if (mode === 'simulation' ? !synthetic(c) : synthetic(c)) { reject('provenance'); continue; }
    if (!v || v.status !== 'verified' || v.source !== (mode === 'simulation' ? 'synthetic_qa' : 'clinical_review') || !v.verifiedBy || !v.caseDefinitionReference) { reject('unverified'); continue; }
    if (v.diagnosisStatus !== 'confirmed') { reject('unconfirmed'); continue; }
    const time = new Date(c.createdAt).getTime(), verifiedAt = new Date(v.verifiedAt).getTime();
    if (!Number.isFinite(time) || !Number.isFinite(verifiedAt) || time > +now || verifiedAt > +now || time < +now-maxAgeDays*DAY) { reject('reporting_time'); continue; }
    const id = diseaseId(c), patient = c.patientId && String(c.patientId);
    if (!id || !patient || !c._id || !String(v.episodeId || '').trim() || !DISTRICTS.has(c.district)) { reject('identity_or_location'); continue; }
    const key = `${patient}|${id}|${v.episodeId}`;
    if (seen.has(key)) { reject('repeat_episode'); continue; }
    seen.add(key); cases.push({ consultationId:String(c._id), diseaseId:id, disease:id, district:c.district, time, createdAt: c.createdAt });
  }
  return { cases, excluded, policy:POLICY };
}
async function loadCases(options) {
  // Raw collection preserves provenance fields and avoids sending decrypted PHI
  // into aggregation. This metadata cannot be supplied by public consultation APIs.
  const Consultation = require('../models/Consultation');
  const now = options?.now || new Date();
  const lookbackDays = Number(options?.lookbackDays) > 0 ? Number(options.lookbackDays) : 30;
  const docs = await Consultation.collection.find({createdAt:{$gte:new Date(+now-lookbackDays*DAY),$lte:now}}, { projection: {
    _id: 1, patientId: 1, createdAt: 1, district: 1, icdCode: 1, icdVersion: 1, surveillanceVerification: 1,
    isSimulation: 1, isTestFixture: 1, isDemoData: 1, isSynthetic: 1, isUniversityDemo: 1, isSyntheticUniversityData: 1,
    datasetVersion: 1, datasetBatch: 1, testRunId: 1, phase5wOwner: 1, syntheticSeedBatch: 1
  } }).toArray();
  return selectCases(docs, {...options,now,lookbackDays});
}
async function runAnalysis({mode='real', now=new Date(), io=null} = {}) {
  if (!['real','simulation'].includes(mode)) throw new Error('Invalid surveillance mode');
  const selection = await loadCases({mode,now,lookbackDays:63});
  const criteriaResults = evaluateOutbreakCriteria({ cases: selection.cases, now, baselineDays: 56, level: 'district' });
  const buckets = new Map();
  for (const c of selection.cases) {
    const key = `${c.district}|${c.diseaseId}`;
    if (!buckets.has(key)) buckets.set(key,{district:c.district,disease:c.disease,last_7_days_count:0,previous_baseline_avg:0,sourceConsultationIds:[]});
    const b=buckets.get(key);b.sourceConsultationIds.push(c.consultationId);
    if(c.time>=+now-7*DAY)b.last_7_days_count++;else b.previous_baseline_avg++;
  }
  const payload=[...buckets.values()].map(({sourceConsultationIds,...b})=>({...b,previous_baseline_avg:b.previous_baseline_avg*7/23}));
  const summary={results:[],suppressed:[],consultations_analysed:selection.cases.length,data_points:selection.cases.length,mode,source:mode,policy:POLICY,excluded:selection.excluded,
    message:'Verified episode counts only. Model signals require administrator review; external delivery is disabled.'};
  const growthMetrics = computeGrowthFromCases({ cases: selection.cases, windowHours: 72, now });
  if(!payload.length)return summary;

  let mlResults = [];
  try {
    const {data}=await require('axios').post(`${process.env.ML_ENGINE_URL || 'http://127.0.0.1:5001'}/api/admin/outbreak/trigger`,payload,
      {timeout:process.env.ML_OUTBREAK_TIMEOUT_MS ? Number(process.env.ML_OUTBREAK_TIMEOUT_MS) : 60000,headers:{'x-internal-key':require('../utils/internalAuth').generateToken()}});
    mlResults = data?.results || [];
  } catch (_) {}

  const OutbreakAlert=require('../models/OutbreakAlert');
  const alertMap = new Map();

  // 1. Process statistical criteria signals (Stage D outbreak detector: Gate 1 floor + Gate 2 persistence)
  for (const cr of criteriaResults || []) {
    const b = buckets.get(`${cr.district}|${cr.disease}`);
    if (cr.triggered) {
      const ids = b ? [...b.sourceConsultationIds].sort() : [];
      const _id = new mongoose.Types.ObjectId(crypto.createHash('sha256').update(JSON.stringify([POLICY,mode,cr.district,cr.disease,ids])).digest('hex').slice(0,24));
      const alertData = {
        disease: cr.disease,
        location: cr.district,
        district: cr.district,
        affectedCount: cr.count,
        caseCount: cr.count,
        severity: cr.severity,
        status: 'Pending',
        surveillancePolicy: POLICY,
        sourceConsultationIds: ids,
        isSimulation: mode === 'simulation',
        isDemoData: mode === 'simulation',
        message: `${mode === 'simulation' ? '[SIMULATION] ' : ''}Unreviewed statistical signal (${cr.alertLevel} - max z=${cr.maxZ}, ${cr.maxConsecutiveDays} consecutive days). Requires administrator approval.`,
        maxZ: cr.maxZ,
        consecutiveDays: cr.maxConsecutiveDays,
        dailyCounts: cr.dailyCounts
      };
      await OutbreakAlert.updateOne(
        { _id },
        {
          $setOnInsert: {
            status: 'Pending',
            surveillancePolicy: POLICY,
            sourceConsultationIds: ids,
            isSimulation: mode === 'simulation',
            isDemoData: mode === 'simulation',
          },
          $set: {
            disease: cr.disease,
            location: cr.district,
            district: cr.district,
            affectedCount: cr.count,
            caseCount: cr.count,
            severity: cr.severity,
            alertLevel: cr.alertLevel,
            maxZ: cr.maxZ,
            consecutiveDays: cr.maxConsecutiveDays,
            dailyCounts: cr.dailyCounts,
            message: `${mode === 'simulation' ? '[SIMULATION] ' : ''}Unreviewed statistical signal (${cr.alertLevel} - max z=${cr.maxZ}, ${cr.maxConsecutiveDays} consecutive days). Requires administrator approval.`
          }
        },
        { upsert: true }
      );
      let alertDoc = null;
      try {
        const query = typeof OutbreakAlert.findById === 'function' ? OutbreakAlert.findById(_id) : null;
        alertDoc = typeof query?.lean === 'function' ? await query.lean() : (query ? await query : null);
      } catch (_) {}
      const baseline7d = cr.baseline7d ?? (cr.baseline ? cr.baseline * 7 : 0);
      const devPct = typeof cr.deviationPct === 'number' && Number.isFinite(cr.deviationPct)
        ? cr.deviationPct
        : (baseline7d > 0 ? Math.round(((cr.count - baseline7d) / baseline7d) * 100) : (cr.count > 0 ? 100 : 0));

      const item = {
        alertId: String(_id),
        district: cr.district,
        disease: cr.disease,
        anomaly: true,
        severity: cr.severity,
        risk_level: cr.severity,
        danger_level: cr.severity,
        latest_actual: cr.count,
        count: cr.count,
        baseline: cr.baseline ?? (cr.baselineDailyMean ?? 0),
        baseline7d,
        zScore: cr.maxZ,
        z_score: cr.maxZ,
        maxZ: cr.maxZ,
        deviationPct: devPct,
        spike_percentage: devPct,
        status: alertDoc ? alertDoc.status : 'Pending',
        isSimulation: mode === 'simulation',
        sourceConsultationIds: ids,
        consecutiveDays: cr.maxConsecutiveDays,
        dailyCounts: cr.dailyCounts
      };
      const enrichedItem = enrichAlertWith72h(item, growthMetrics);
      alertMap.set(`${cr.district}|${cr.disease}`, enrichedItem);
      summary.results.push(enrichedItem);

      try {
        const { notifyOutbreakAlert } = require('./notificationService');
        await notifyOutbreakAlert({ _id, ...alertData }, { io });
      } catch (_) {}
    } else {
      summary.suppressed.push({
        district: cr.district,
        disease: cr.disease,
        count: cr.count,
        reason: cr.reason, // 'CASE_FLOOR_NOT_MET' or 'PERSISTENCE_CRITERIA_NOT_MET'
        maxZ: cr.maxZ,
        maxConsecutiveDays: cr.maxConsecutiveDays,
        dailyCounts: cr.dailyCounts
      });
    }
  }

  // 2. Incorporate any anomalies returned by ML engine not already captured
  for (const r of mlResults) {
    const key = `${r.district}|${r.disease}`;
    const b = buckets.get(key);
    if (!b || r.anomaly !== true || alertMap.has(key)) continue;
    const ids = [...b.sourceConsultationIds].sort();
    const _id = new mongoose.Types.ObjectId(crypto.createHash('sha256').update(JSON.stringify([POLICY,mode,b.district,b.disease,ids])).digest('hex').slice(0,24));
    const sev = ({low:'Low',medium:'Moderate',high:'High',critical:'Critical'})[String(r.severity || r.risk_level).toLowerCase()] || 'Moderate';
    const alertData = {
      disease: b.disease,
      location: b.district,
      district: b.district,
      affectedCount: b.last_7_days_count,
      caseCount: b.last_7_days_count,
      severity: sev,
      status: 'Pending',
      surveillancePolicy: POLICY,
      sourceConsultationIds: ids,
      isSimulation: mode === 'simulation',
      isDemoData: mode === 'simulation',
      message: `${mode === 'simulation' ? '[SIMULATION] ' : ''}Unreviewed statistical signal. Not a confirmed outbreak.`
    };
    await OutbreakAlert.updateOne(
      { _id },
      {
        $setOnInsert: {
          status: 'Pending',
          surveillancePolicy: POLICY,
          sourceConsultationIds: ids,
          isSimulation: mode === 'simulation',
          isDemoData: mode === 'simulation',
        },
        $set: {
          disease: b.disease,
          location: b.district,
          district: b.district,
          affectedCount: b.last_7_days_count,
          caseCount: b.last_7_days_count,
          severity: sev,
          message: `${mode === 'simulation' ? '[SIMULATION] ' : ''}Unreviewed statistical signal. Not a confirmed outbreak.`
        }
      },
      { upsert: true }
    );
    let alertDoc = null;
    try {
      const query = typeof OutbreakAlert.findById === 'function' ? OutbreakAlert.findById(_id) : null;
      alertDoc = typeof query?.lean === 'function' ? await query.lean() : (query ? await query : null);
    } catch (_) {}
    const item = {
      ...r,
      alertId: String(_id),
      status: alertDoc ? alertDoc.status : 'Pending',
      severity: sev,
      isSimulation: mode === 'simulation'
    };
    const enrichedItem = enrichAlertWith72h(item, growthMetrics);
    alertMap.set(key, enrichedItem);
    summary.results.push(enrichedItem);

    try {
      const { notifyOutbreakAlert } = require('./notificationService');
      await notifyOutbreakAlert({ _id, ...alertData }, { io });
    } catch (_) {}
  }

  return summary;
}
const COLOMBO_OFFSET_MS = 330 * 60000; // Asia/Colombo +05:30

const DISTRICT_TO_PROVINCE = Object.freeze({
  'Colombo': 'Western', 'Gampaha': 'Western', 'Kalutara': 'Western',
  'Kandy': 'Central', 'Matale': 'Central', 'Nuwara Eliya': 'Central',
  'Galle': 'Southern', 'Matara': 'Southern', 'Hambantota': 'Southern',
  'Jaffna': 'Northern', 'Kilinochchi': 'Northern', 'Mannar': 'Northern', 'Mullaitivu': 'Northern', 'Vavuniya': 'Northern',
  'Batticaloa': 'Eastern', 'Ampara': 'Eastern', 'Trincomalee': 'Eastern',
  'Kurunegala': 'North Western', 'Puttalam': 'North Western',
  'Anuradhapura': 'North Central', 'Polonnaruwa': 'North Central',
  'Badulla': 'Uva', 'Monaragala': 'Uva',
  'Ratnapura': 'Sabaragamuwa', 'Kegalle': 'Sabaragamuwa'
});

const OFFICIAL_PROVINCES = Object.freeze([
  'Western', 'Central', 'Southern', 'Northern', 'Eastern',
  'North Western', 'North Central', 'Uva', 'Sabaragamuwa'
]);

const PROVINCE_TO_DISTRICTS = Object.freeze({
  'Western': ['Colombo', 'Gampaha', 'Kalutara'],
  'Central': ['Kandy', 'Matale', 'Nuwara Eliya'],
  'Southern': ['Galle', 'Matara', 'Hambantota'],
  'Northern': ['Jaffna', 'Kilinochchi', 'Mannar', 'Mullaitivu', 'Vavuniya'],
  'Eastern': ['Batticaloa', 'Ampara', 'Trincomalee'],
  'North Western': ['Kurunegala', 'Puttalam'],
  'North Central': ['Anuradhapura', 'Polonnaruwa'],
  'Uva': ['Badulla', 'Monaragala'],
  'Sabaragamuwa': ['Ratnapura', 'Kegalle']
});

/**
 * Returns the UTC timestamp corresponding to local midnight (00:00:00) in Asia/Colombo (+05:30)
 * for the calendar date of the provided timestamp.
 */
function getColomboMidnight(date = new Date()) {
  const d = new Date(date);
  const localTime = new Date(+d + COLOMBO_OFFSET_MS);
  return Date.UTC(localTime.getUTCFullYear(), localTime.getUTCMonth(), localTime.getUTCDate()) - COLOMBO_OFFSET_MS;
}

/**
 * Stage D Outbreak Detector (WP4 & Milestone 4)
 * 
 * Evaluates outbreak criteria across Sri Lanka geographic levels:
 * - Level: 'district' (25 districts), 'province' (9 provinces), or 'island' (National Sri Lanka).
 * - Window W: exactly 7 complete calendar days ending yesterday (excluding today's partial day).
 * - Gate 1 (Floor): N >= 5 distinct episodes per disease x entity in W.
 * - Baseline: 56 complete calendar days prior to window W.
 * - Regularization: if sigma < 0.5, sigma = max(0.5, sqrt(mu)). If mu == 0, mu = 0.1, sigma = 0.5.
 * - Daily z-score for day k (1..7): z_k = (C_k - mu) / sigma.
 * - Gate 2 (Persistence): at least two consecutive complete calendar days in W with strict z > 2.0 (and C_k > 0).
 * - Severity: Watch (z in [2.0, 3.0)), Alert (z in [3.0, 4.0)), Critical (z >= 4.0).
 */
function getSeverityFromZ(maxZ, maxConsecutiveDays = 2) {
  if (typeof maxConsecutiveDays === 'number' && maxConsecutiveDays < 2) {
    return { alertLevel: 'None', severity: 'None' };
  }
  const z = typeof maxZ === 'number' && Number.isFinite(maxZ) ? maxZ : 0;
  if (z >= 4.0) return { alertLevel: 'Critical', severity: 'Critical' };
  if (z >= 3.0) return { alertLevel: 'Alert', severity: 'High' };
  if (z >= 2.0) return { alertLevel: 'Watch', severity: 'Moderate' };
  return { alertLevel: 'None', severity: 'None' };
}

function evaluateOutbreakCriteria({ cases = [], now = new Date(), baselineDays = 56, level = 'district' } = {}) {
  const normLevel = String(level || 'district').toLowerCase();
  const todayMidnight = getColomboMidnight(now);
  const windowEnd = todayMidnight; // End of yesterday
  const windowStart = windowEnd - 7 * DAY;
  const baselineStart = windowStart - baselineDays * DAY;

  const groups = new Map();
  for (const c of cases) {
    let entity = c.district;
    if (normLevel === 'province') {
      entity = DISTRICT_TO_PROVINCE[c.district];
      if (!entity) continue;
    } else if (normLevel === 'island' || normLevel === 'national') {
      entity = 'Sri Lanka';
    }

    const diseaseKey = c.diseaseId || c.disease;
    if (!entity || !diseaseKey) continue;
    const key = `${entity}|${diseaseKey}`;
    if (!groups.has(key)) {
      groups.set(key, { entityName: entity, district: entity, level: normLevel, disease: diseaseKey, windowCases: [], baselineCases: [] });
    }
    const g = groups.get(key);
    const t = typeof c.time === 'number' ? c.time : new Date(c.createdAt).getTime();
    if (t >= windowStart && t < windowEnd) {
      g.windowCases.push(c);
    } else if (t >= baselineStart && t < windowStart) {
      g.baselineCases.push(c);
    }
  }

  const results = [];
  for (const [, g] of groups.entries()) {
    const N = g.windowCases.length;
    const dailyCounts = Array(7).fill(0);
    for (const c of g.windowCases) {
      const t = typeof c.time === 'number' ? c.time : new Date(c.createdAt).getTime();
      const dayIdx = Math.floor((t - windowStart) / DAY);
      if (dayIdx >= 0 && dayIdx < 7) dailyCounts[dayIdx]++;
    }

    if (N < 5) {
      results.push({
        district: g.district,
        entityName: g.entityName,
        level: g.level,
        disease: g.disease,
        triggered: false,
        reason: 'CASE_FLOOR_NOT_MET',
        count: N,
        dailyCounts,
        dailyZ: Array(7).fill(0),
        maxZ: 0,
        maxConsecutiveDays: 0,
        alertLevel: 'None',
        severity: 'None'
      });
      continue;
    }

    const baselineDaily = Array(baselineDays).fill(0);
    for (const c of g.baselineCases) {
      const t = typeof c.time === 'number' ? c.time : new Date(c.createdAt).getTime();
      const dayIdx = Math.floor((t - baselineStart) / DAY);
      if (dayIdx >= 0 && dayIdx < baselineDays) baselineDaily[dayIdx]++;
    }

    let bMean = baselineDaily.reduce((a, b) => a + b, 0) / baselineDays;
    const bVariance = baselineDaily.reduce((a, b) => a + Math.pow(b - bMean, 2), 0) / Math.max(1, baselineDays - 1);
    let bStd = Math.sqrt(bVariance);

    if (bStd < 0.5) {
      bStd = Math.max(0.5, Math.sqrt(bMean));
      if (bMean === 0) {
        bMean = 0.1;
        bStd = 0.5;
      }
    }

    const dailyZ = dailyCounts.map(count => (count - bMean) / bStd);
    let maxConsecutive = 0;
    let currentConsecutive = 0;

    for (let i = 0; i < 7; i++) {
      if (dailyZ[i] > 2.0 && dailyCounts[i] > 0) {
        currentConsecutive++;
        if (currentConsecutive > maxConsecutive) maxConsecutive = currentConsecutive;
      } else {
        currentConsecutive = 0;
      }
    }

    const hasConsecutiveElevated = maxConsecutive >= 2;
    const maxZ = Math.max(...dailyZ);
    const { alertLevel, severity } = hasConsecutiveElevated
      ? getSeverityFromZ(maxZ, maxConsecutive)
      : { alertLevel: 'None', severity: 'None' };

    const baseline7d = bMean * 7;
    const deviationPct = baseline7d > 0
      ? ((N - baseline7d) / baseline7d) * 100
      : (N > 0 ? 100 : 0);

    results.push({
      district: g.district,
      entityName: g.entityName,
      level: g.level,
      disease: g.disease,
      triggered: hasConsecutiveElevated,
      count: N,
      baseline: Number(bMean.toFixed(2)),
      baselineDailyMean: Number(bMean.toFixed(2)),
      baseline7d: Number(baseline7d.toFixed(2)),
      deviationPct: Number(deviationPct.toFixed(1)),
      dailyCounts,
      dailyZ: dailyZ.map(z => Number(z.toFixed(2))),
      maxZ: Number(maxZ.toFixed(2)),
      zScore: Number(maxZ.toFixed(2)),
      maxConsecutiveDays: maxConsecutive,
      alertLevel,
      severity,
      reason: hasConsecutiveElevated ? 'ALERT_CRITERIA_SATISFIED' : 'PERSISTENCE_CRITERIA_NOT_MET'
    });
  }

  return results;
}

function evaluateMultiLevelOutbreakCriteria({ cases = [], now = new Date(), baselineDays = 56 } = {}) {
  return {
    district: evaluateOutbreakCriteria({ cases, now, baselineDays, level: 'district' }),
    province: evaluateOutbreakCriteria({ cases, now, baselineDays, level: 'province' }),
    island: evaluateOutbreakCriteria({ cases, now, baselineDays, level: 'island' })
  };
}

async function canReviewSimulation(user) {
  const allowedRoles = ['admin', 'super_admin', 'superadmin', 'health_officer'];
  if (!allowedRoles.includes(user?.role)) return false;
  try {
    const adminId = user.id || user._id;
    if (adminId && mongoose.Types.ObjectId.isValid(adminId)) {
      const admin = await require('../models/Admin').collection.findOne({
        _id: new mongoose.Types.ObjectId(adminId)
      });
      if (admin) {
        if (admin.isActive === false) return false;
        return true;
      }
    }
  } catch (_) {}
  return Boolean(user && (synthetic(user) || allowedRoles.includes(user.role)));
}

function computeGrowthFromCases({ cases = [], windowHours = 72, now = new Date() } = {}) {
  const windowMs = windowHours * 60 * 60 * 1000;
  const nowMs = +now;
  const currentStart = nowMs - windowMs;
  const prevStart = currentStart - windowMs;
  const sevenDaysStart = nowMs - 7 * DAY;

  const { getDistrictPopulation, getIslandPopulation } = require('./incidenceService');

  const districtMap = new Map();
  const islandMap = new Map();

  for (const c of cases) {
    const t = typeof c.time === 'number' ? c.time : new Date(c.createdAt).getTime();
    if (t < prevStart || t > nowMs) continue;

    const dis = c.disease || c.diseaseId || 'Unknown';
    const dist = c.district || 'Unknown';

    const distKey = `${dis}|${dist}`;
    if (!districtMap.has(distKey)) {
      districtMap.set(distKey, {
        disease: dis,
        district: dist,
        currentCases: 0,
        previousCases: 0,
        dailyCounts: Array(7).fill(0)
      });
    }
    const dBucket = districtMap.get(distKey);
    if (t >= currentStart) dBucket.currentCases++;
    else if (t >= prevStart) dBucket.previousCases++;

    if (t >= sevenDaysStart) {
      const dayIdx = Math.min(6, Math.max(0, Math.floor((t - sevenDaysStart) / DAY)));
      dBucket.dailyCounts[dayIdx]++;
    }

    if (!islandMap.has(dis)) {
      islandMap.set(dis, {
        disease: dis,
        district: 'Sri Lanka (Island-wide)',
        currentCases: 0,
        previousCases: 0,
        dailyCounts: Array(7).fill(0)
      });
    }
    const iBucket = islandMap.get(dis);
    if (t >= currentStart) iBucket.currentCases++;
    else if (t >= prevStart) iBucket.previousCases++;

    if (t >= sevenDaysStart) {
      const dayIdx = Math.min(6, Math.max(0, Math.floor((t - sevenDaysStart) / DAY)));
      iBucket.dailyCounts[dayIdx]++;
    }
  }

  const formatRow = (row, isIsland = false) => {
    const absChange = row.currentCases - row.previousCases;
    let pctChange;
    if (row.previousCases === 0) {
      pctChange = row.currentCases > 0 ? 'new' : 0;
    } else {
      pctChange = Number((((row.currentCases - row.previousCases) / row.previousCases) * 100).toFixed(1));
    }
    const pop = isIsland ? getIslandPopulation() : getDistrictPopulation(row.district);
    const incidence = (pop && pop > 0)
      ? Number(((row.currentCases / pop) * 100000).toFixed(2))
      : null;

    return {
      disease: row.disease,
      district: row.district,
      currentCases: row.currentCases,
      previousCases: row.previousCases,
      absoluteChange: absChange,
      percentChange: pctChange,
      dailyCounts: row.dailyCounts,
      population: pop,
      incidencePer100k: incidence,
      hasPopulation: Boolean(pop && pop > 0)
    };
  };

  const districtResults = [...districtMap.values()]
    .map(r => formatRow(r, false))
    .sort((a, b) => b.absoluteChange - a.absoluteChange || b.currentCases - a.currentCases);

  const islandResults = [...islandMap.values()]
    .map(r => formatRow(r, true))
    .sort((a, b) => b.absoluteChange - a.absoluteChange || b.currentCases - a.currentCases);

  return {
    window: `${windowHours}h`,
    windowHours,
    asOf: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
    districts: districtResults,
    island: islandResults
  };
}

async function calculateGrowthMetrics({ windowHours = 72, mode = 'real', now = new Date() } = {}) {
  const lookbackDays = Math.max(7, Math.ceil((windowHours * 2) / 24));
  const selection = await loadCases({ mode, now, lookbackDays });
  return computeGrowthFromCases({ cases: selection.cases, windowHours, now });
}

function diseasesMatch(d1, d2) {
  if (!d1 || !d2) return false;
  const s1 = String(d1).trim().toLowerCase();
  const s2 = String(d2).trim().toLowerCase();
  if (s1 === s2) return true;
  const c1 = s1.replace(/^icd(?:10|11):/, '').replace('.', '');
  const c2 = s2.replace(/^icd(?:10|11):/, '').replace('.', '');
  if (c1 === c2) return true;
  try {
    const { diseaseLabel } = require('./publicHealthStats');
    const l1 = (diseaseLabel(d1) || '').toLowerCase();
    const l2 = (diseaseLabel(d2) || '').toLowerCase();
    if (l1 && l2 && (l1 === l2 || l1 === s2 || l2 === s1)) return true;
  } catch (_) {}
  return false;
}

function enrichAlertWith72h(alert, growthData) {
  const { getDistrictPopulation } = require('./incidenceService');
  const alertObj = typeof alert?.toObject === 'function' ? alert.toObject() : { ...alert };
  const dist = (alertObj.district || alertObj.location || '').trim();
  const dis = (alertObj.disease || '').trim();
  const dMatch = growthData?.districts?.find(d => 
    diseasesMatch(d.disease, dis) &&
    d.district?.toLowerCase() === dist.toLowerCase()
  );
  const iMatch = growthData?.island?.find(i => 
    diseasesMatch(i.disease, dis)
  );

  const currentCases = dMatch ? dMatch.currentCases : (alertObj.caseCount || alertObj.affectedCount || 0);
  const previousCases = dMatch ? dMatch.previousCases : 0;
  const absoluteChange = dMatch ? dMatch.absoluteChange : currentCases;
  const percentChange = dMatch ? dMatch.percentChange : (currentCases > 0 ? 'new' : 0);
  const population = dMatch?.population || getDistrictPopulation(dist);
  const incidencePer100k = (population && population > 0)
    ? Number(((currentCases / population) * 100000).toFixed(2))
    : (dMatch?.incidencePer100k ?? null);

  const rawShare = (population && population > 0 && currentCases > 0)
    ? ((currentCases / population) * 100)
    : 0;

  let formattedShare = '0%';
  if (currentCases > 0 && population > 0) {
    if (rawShare < 0.0001) formattedShare = rawShare.toFixed(5) + '%';
    else if (rawShare < 0.01) formattedShare = rawShare.toFixed(4) + '%';
    else formattedShare = rawShare.toFixed(2) + '%';
    if (parseFloat(formattedShare) === 0) formattedShare = '<0.00001%';
  }

  const islandCases = iMatch ? iMatch.currentCases : currentCases;
  const islandPreviousCases = iMatch ? iMatch.previousCases : 0;
  const islandChange = iMatch ? iMatch.absoluteChange : islandCases;
  const islandPercentChange = iMatch ? iMatch.percentChange : (islandCases > 0 ? 'new' : 0);

  const plainText = `${dist ? dist + ': ' : ''}${currentCases} cases in the last 72h (previous 72h: ${previousCases}, ${absoluteChange >= 0 ? '+' : ''}${absoluteChange}). ${formattedShare} of the district population, ${incidencePer100k ?? '0.00'} per 100,000. Island-wide: ${islandCases} cases.`;

  return {
    ...alertObj,
    metrics72h: {
      currentCases,
      previousCases,
      absoluteChange,
      percentChange,
      population,
      incidencePer100k,
      popSharePct: rawShare,
      formattedShare,
      islandCases,
      islandPreviousCases,
      islandChange,
      islandPercentChange,
      censusYear: 2012,
      censusName: 'Department of Census and Statistics - Census 2012',
      honestyNote: 'Verified MediSync cases (lower bound; only consultations recorded in MediSync are counted)',
      plainText
    }
  };
}

module.exports = {
  POLICY,
  synthetic,
  realAlertFilter,
  diseaseId,
  selectCases,
  loadCases,
  runAnalysis,
  canReviewSimulation,
  evaluateOutbreakCriteria,
  evaluateMultiLevelOutbreakCriteria,
  getColomboMidnight,
  getSeverityFromZ,
  computeGrowthFromCases,
  calculateGrowthMetrics,
  diseasesMatch,
  enrichAlertWith72h,
  DISTRICT_TO_PROVINCE,
  OFFICIAL_PROVINCES,
  PROVINCE_TO_DISTRICTS
};
