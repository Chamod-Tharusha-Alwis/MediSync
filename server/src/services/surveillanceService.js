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
function selectCases(candidates, { mode = 'real', now = new Date() } = {}) {
  if (!['real', 'simulation'].includes(mode)) throw new Error('Invalid surveillance mode');
  const cases = [], excluded = {}, seen = new Set();
  const reject = reason => { excluded[reason] = (excluded[reason] || 0) + 1; };
  for (const c of [...candidates].sort((a,b) => new Date(a.createdAt)-new Date(b.createdAt))) {
    const v = c.surveillanceVerification;
    if (mode === 'simulation' ? !synthetic(c) : synthetic(c)) { reject('provenance'); continue; }
    if (!v || v.status !== 'verified' || v.source !== (mode === 'simulation' ? 'synthetic_qa' : 'clinical_review') || !v.verifiedBy || !v.caseDefinitionReference) { reject('unverified'); continue; }
    if (v.diagnosisStatus !== 'confirmed') { reject('unconfirmed'); continue; }
    const time = new Date(c.createdAt).getTime(), verifiedAt = new Date(v.verifiedAt).getTime();
    if (!Number.isFinite(time) || !Number.isFinite(verifiedAt) || time > +now || verifiedAt > +now || time < +now-30*DAY) { reject('reporting_time'); continue; }
    const id = diseaseId(c), patient = c.patientId && String(c.patientId);
    if (!id || !patient || !c._id || !String(v.episodeId || '').trim() || !DISTRICTS.has(c.district)) { reject('identity_or_location'); continue; }
    const key = `${patient}|${id}|${v.episodeId}`;
    if (seen.has(key)) { reject('repeat_episode'); continue; }
    seen.add(key); cases.push({ consultationId:String(c._id), diseaseId:id, disease:id, district:c.district, time });
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
async function runAnalysis({mode='real', now=new Date()} = {}) {
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
    {timeout:30000,headers:{'x-internal-key':require('../utils/internalAuth').generateToken()}});
  const OutbreakAlert=require('../models/OutbreakAlert');
  for(const r of data.results || []) {
    const b=buckets.get(`${r.district}|${r.disease}`);
    if(!b || r.anomaly !== true)continue;
    const ids=[...b.sourceConsultationIds].sort();
    const _id=new mongoose.Types.ObjectId(crypto.createHash('sha256').update(JSON.stringify([POLICY,mode,b.district,b.disease,ids])).digest('hex').slice(0,24));
    await OutbreakAlert.updateOne({_id},{$setOnInsert:{disease:b.disease,location:b.district,affectedCount:b.last_7_days_count,
      severity:({low:'Low',medium:'Moderate',high:'High'})[String(r.severity).toLowerCase()] || 'Moderate',status:'Pending',
      surveillancePolicy:POLICY,sourceConsultationIds:ids,isSimulation:mode==='simulation',isDemoData:mode==='simulation',
      message:`${mode==='simulation'?'[SIMULATION] ':''}Unreviewed statistical signal. Not a confirmed outbreak.`}},{upsert:true});
    summary.results.push({...r,alertId:String(_id),status:'Pending',isSimulation:mode==='simulation'});
  }
  // Intentionally no socket, email, notification or BroadcastMessage side effects.
  // Simulation results are available only to authenticated synthetic reviewers.
  return summary;
}
async function canReviewSimulation(user) {
  if(!['admin','super_admin','superadmin'].includes(user?.role))return false;
  const admin=await require('../models/Admin').collection.findOne({_id:new mongoose.Types.ObjectId(user.id),isActive:true});
  return Boolean(admin && synthetic(admin));
}
module.exports={POLICY,synthetic,realAlertFilter,diseaseId,selectCases,loadCases,runAnalysis,canReviewSimulation};
