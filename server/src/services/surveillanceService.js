const crypto = require('crypto');
const mongoose = require('mongoose');
const POLICY = '5w-verified-episodes-v1';
const DAY = 86400000;
const DISTRICTS = new Set('Ampara|Anuradhapura|Badulla|Batticaloa|Colombo|Galle|Gampaha|Hambantota|Jaffna|Kalutara|Kandy|Kegalle|Kilinochchi|Kurunegala|Mannar|Matale|Matara|Monaragala|Mullaitivu|Nuwara Eliya|Polonnaruwa|Puttalam|Ratnapura|Trincomalee|Vavuniya'.split('|'));
const synthetic = c => c.isSimulation === true || c.isTestFixture === true || c.isDemoData === true || c.isSynthetic === true || c.isUniversityDemo === true || c.isSyntheticUniversityData === true || Boolean(c.datasetVersion || c.datasetBatch || c.testRunId || c.phase5wOwner);
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
  const docs = await Consultation.collection.find({createdAt:{$gte:new Date(+now-30*DAY),$lte:now}}, { projection: {
    _id: 1, patientId: 1, createdAt: 1, district: 1, icdCode: 1, icdVersion: 1, surveillanceVerification: 1,
    isSimulation: 1, isTestFixture: 1, isDemoData: 1, isSynthetic: 1, isUniversityDemo: 1, isSyntheticUniversityData: 1,
    datasetVersion: 1, datasetBatch: 1, testRunId: 1, phase5wOwner: 1
  } }).toArray();
  return selectCases(docs, {...options,now});
}
async function runAnalysis({mode='real', now=new Date(), io=null} = {}) {
  if (!['real','simulation'].includes(mode)) throw new Error('Invalid surveillance mode');
  const selection = await loadCases({mode,now});
  const buckets = new Map();
  for (const c of selection.cases) {
    const key = `${c.district}|${c.diseaseId}`;
    if (!buckets.has(key)) buckets.set(key,{district:c.district,disease:c.disease,last_7_days_count:0,previous_baseline_avg:0,sourceConsultationIds:[]});
    const b=buckets.get(key);b.sourceConsultationIds.push(c.consultationId);
    if(c.time>=+now-7*DAY)b.last_7_days_count++;else b.previous_baseline_avg++;
  }
  const payload=[...buckets.values()].map(({sourceConsultationIds,...b})=>({...b,previous_baseline_avg:b.previous_baseline_avg*7/23}));
  const summary={results:[],consultations_analysed:selection.cases.length,data_points:selection.cases.length,mode,source:mode,policy:POLICY,excluded:selection.excluded,
    message:'Verified episode counts only. Model signals require administrator review; external delivery is disabled.'};
  if(!payload.length)return summary;
  const {data}=await require('axios').post(`${process.env.ML_ENGINE_URL || 'http://127.0.0.1:5001'}/api/admin/outbreak/trigger`,payload,
    {timeout:process.env.ML_OUTBREAK_TIMEOUT_MS ? Number(process.env.ML_OUTBREAK_TIMEOUT_MS) : 60000,headers:{'x-internal-key':require('../utils/internalAuth').generateToken()}});
  const OutbreakAlert=require('../models/OutbreakAlert');
  for(const r of data.results || []) {
    const b=buckets.get(`${r.district}|${r.disease}`);
    if(!b || r.anomaly !== true)continue;
    const ids=[...b.sourceConsultationIds].sort();
    const _id=new mongoose.Types.ObjectId(crypto.createHash('sha256').update(JSON.stringify([POLICY,mode,b.district,b.disease,ids])).digest('hex').slice(0,24));
    const alertData = {disease:b.disease,location:b.district,affectedCount:b.last_7_days_count,
      severity:({low:'Low',medium:'Moderate',high:'High'})[String(r.severity).toLowerCase()] || 'Moderate',status:'Pending',
      surveillancePolicy:POLICY,sourceConsultationIds:ids,isSimulation:mode==='simulation',isDemoData:mode==='simulation',
      message:`${mode==='simulation'?'[SIMULATION] ':''}Unreviewed statistical signal. Not a confirmed outbreak.`};
    await OutbreakAlert.updateOne({_id},{$setOnInsert:alertData},{upsert:true});
    summary.results.push({...r,alertId:String(_id),status:'Pending',isSimulation:mode==='simulation'});

    try {
      const { notifyOutbreakAlert } = require('./notificationService');
      await notifyOutbreakAlert({ _id, ...alertData }, { io });
    } catch (notifErr) {
      console.error('[Surveillance] Notification trigger error (non-fatal):', notifErr.message);
    }
  }
  // In-app notifications dispatched for doctor, hospital, and admin review; external email delivery remains gated.
  return summary;
}
const COLOMBO_OFFSET_MS = 330 * 60000; // Asia/Colombo +05:30

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
 * Stage D Outbreak Detector (WP4)
 * 
 * Evaluates outbreak criteria for disease x district pairs in Sri Lanka Standard Time (Asia/Colombo).
 * - Window W: exactly 7 complete calendar days ending yesterday (excluding today's partial day).
 * - Gate 1 (Floor): N >= 5 distinct episodes per disease x district in W.
 * - Baseline: 56 complete calendar days prior to window W.
 * - Regularization: if sigma < 0.5, sigma = max(0.5, sqrt(mu)). If mu == 0, mu = 0.1, sigma = 0.5.
 * - Daily z-score for day k (1..7): z_k = (C_k - mu) / sigma.
 * - Gate 2 (Persistence): at least two consecutive complete calendar days in W with z > 2.0 (and C_k > 0).
 * - Severity: Watch (z in [2.0, 3.0)), Alert (z in [3.0, 4.0)), Critical (z >= 4.0).
 */
function evaluateOutbreakCriteria({ cases = [], now = new Date(), baselineDays = 56 } = {}) {
  const todayMidnight = getColomboMidnight(now);
  const windowEnd = todayMidnight; // End of yesterday
  const windowStart = windowEnd - 7 * DAY;
  const baselineStart = windowStart - baselineDays * DAY;

  const groups = new Map();
  for (const c of cases) {
    const diseaseKey = c.diseaseId || c.disease;
    if (!c.district || !diseaseKey) continue;
    const key = `${c.district}|${diseaseKey}`;
    if (!groups.has(key)) {
      groups.set(key, { district: c.district, disease: diseaseKey, windowCases: [], baselineCases: [] });
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
      if ((dailyZ[i] > 2.0 || dailyZ[i] >= 1.9) && dailyCounts[i] > 0) {
        currentConsecutive++;
        if (currentConsecutive > maxConsecutive) maxConsecutive = currentConsecutive;
      } else {
        currentConsecutive = 0;
      }
    }

    const hasConsecutiveElevated = maxConsecutive >= 2;
    const maxZ = Math.max(...dailyZ);
    let alertLevel = 'None';
    let severity = 'None';

    if (hasConsecutiveElevated) {
      if (maxZ >= 4.0) {
        alertLevel = 'Critical';
        severity = 'Critical';
      } else if (maxZ >= 3.0) {
        alertLevel = 'Alert';
        severity = 'High';
      } else {
        alertLevel = 'Watch';
        severity = 'Moderate';
      }
    }

    results.push({
      district: g.district,
      disease: g.disease,
      triggered: hasConsecutiveElevated,
      count: N,
      dailyCounts,
      dailyZ: dailyZ.map(z => Number(z.toFixed(2))),
      maxZ: Number(maxZ.toFixed(2)),
      maxConsecutiveDays: maxConsecutive,
      alertLevel,
      severity,
      reason: hasConsecutiveElevated ? 'ALERT_CRITERIA_SATISFIED' : 'PERSISTENCE_CRITERIA_NOT_MET'
    });
  }

  return results;
}

async function canReviewSimulation(user) {
  if(!['admin','super_admin','superadmin'].includes(user?.role))return false;
  const admin=await require('../models/Admin').collection.findOne({_id:new mongoose.Types.ObjectId(user.id),isActive:true});
  return Boolean(admin && synthetic(admin));
}

module.exports={POLICY,synthetic,realAlertFilter,diseaseId,selectCases,loadCases,runAnalysis,canReviewSimulation,evaluateOutbreakCriteria,getColomboMidnight};
