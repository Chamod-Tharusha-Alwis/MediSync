'use strict';

// Only the reviewed operator CLI may construct a live adapter. These pure
// ownership/transaction routines also run against an owned memory-test adapter.
const PREFIX_FIELDS = Object.freeze({ Patient:'email', Doctor:'doctorId', Hospital:'regNo', Pharmacy:'regNo',
  PharmacyStaff:'email', Consultation:'consultationId', Prescription:'prescriptionId', LabTest:'labTestId', Dispensing:'receiptNumber' });
const fail = code => { throw Object.assign(Error(code), { code }); };
const idOf = value => String(value);
// Actual model/service reference paths. Reads only: a non-owned dependant must
// be reviewed, never cascaded or silently orphaned by refresh/removal.
const REFERENCE_PATHS = Object.freeze({
  patients:{'reportedDoctors.doctorId':'Doctor'},
  doctors:{hospitals:'Hospital','orgLogins.hospitalId':'Hospital'},
  pharmacies:{adminId:'PharmacyStaff'},pharmacystaffs:{pharmacyId:'Pharmacy',createdBy:'PharmacyStaff'},
  consultations:{patientId:'Patient',doctorId:'Doctor',hospitalId:'Hospital',sessionHospitalId:'Hospital'},
  prescriptions:{consultationId:'Consultation',patientId:'Patient',doctorId:'Doctor',hospitalId:'Hospital',dispensedBy:'Pharmacy',dispenserStaffId:'PharmacyStaff'},
  labtests:{consultationId:'Consultation',patientId:'Patient',hospitalId:'Hospital',acceptedBy:'Hospital',referredBy:'Doctor'},
  dispensings:{prescriptionId:'Prescription',pharmacyId:'Pharmacy',staffId:'PharmacyStaff'},
  reviews:{reviewerId:'Patient',targetId:'ALL',consultationId:'Consultation'},
  consultationratings:{consultationId:'Consultation',doctorId:'Doctor'},
  testorders:{consultationId:'Consultation',doctorId:'Doctor',hospitalId:'Hospital'},
  supporttickets:{patientId:'Patient'},
  clinicalcommands:{patientId:'Patient',actorId:'ALL','result.consultationId':'Consultation','result.prescriptionId':'Prescription','result.prescriptionIds':'Prescription','result.labTestIds':'LabTest'},
  outbreakalerts:{sourceConsultationIds:'Consultation'},
  banrecords:{targetId:'ALL',bannedBy:'Doctor',liftedBy:'Doctor'},
  accountinvitations:{subjectId:'ALL',pharmacyId:'Pharmacy'},
  notifications:{userId:'ALL',referenceId:'ALL_OR_PREFIX'}
});

function assertPlan(plan) {
  if (!plan || !/^SEED_[A-Z0-9_]+$/.test(plan.namespace || '') || !Number.isFinite(+new Date(plan.now)) || !Array.isArray(plan.records) || !plan.records.length) fail('SEED_PLAN_INVALID');
  const seen = new Set();
  for (const row of plan.records) {
    if (!Object.hasOwn(PREFIX_FIELDS,row.model) || !/^[a-f0-9]{24}$/.test(row.id || '') ||
        row.prefix?.field !== PREFIX_FIELDS[row.model] || typeof row.prefix.value !== 'string' || !/^seed[-_]/i.test(row.prefix.value) ||
        row.document?.[row.prefix.field] !== row.prefix.value || seen.has(row.model+':'+row.id)) fail('SEED_PLAN_OWNERSHIP_INVALID');
    seen.add(row.model+':'+row.id);
  }
  const byModel=Object.fromEntries(Object.keys(PREFIX_FIELDS).map(model=>[model,new Map(plan.records.filter(r=>r.model===model).map(r=>[r.id,r]))]));
  function ref(row,field,model,required=true){const value=row.document[field];if(value==null&&!required)return null;const target=byModel[model].get(String(value));if(!target)fail('SEED_FOREIGN_REFERENCE_NOT_OWNED');return target;}
  for(const row of plan.records){
    if(row.model==='Doctor')for(const hospital of row.document.hospitals||[])if(!byModel.Hospital.has(String(hospital)))fail('SEED_FOREIGN_REFERENCE_NOT_OWNED');
    if(row.model==='PharmacyStaff')ref(row,'pharmacyId','Pharmacy');
    if(row.model==='Pharmacy')ref(row,'adminId','PharmacyStaff',false);
    if(['Consultation','Prescription','LabTest'].includes(row.model)){
      const patient=ref(row,'patientId','Patient');
      if(row.document.patientNic!==patient.document.nic)fail('SEED_PATIENT_LINK_MISMATCH');
      if(row.model==='Consultation'||row.model==='Prescription')ref(row,'doctorId','Doctor');
      ref(row,'hospitalId','Hospital',false);
      if(row.model!=='Consultation'){
        const consultation=ref(row,'consultationId','Consultation');
        if(String(consultation.document.patientId)!==patient.id)fail('SEED_PATIENT_LINK_MISMATCH');
      }
      if(row.model==='LabTest')ref(row,'referredBy','Doctor',false);
    }
    if(row.model==='Dispensing'){
      const prescription=ref(row,'prescriptionId','Prescription'),staff=ref(row,'staffId','PharmacyStaff');ref(row,'pharmacyId','Pharmacy');
      if(row.document.patientNic!==prescription.document.patientNic||String(staff.document.pharmacyId)!==String(row.document.pharmacyId))fail('SEED_DISPENSING_LINK_MISMATCH');
    }
  }
  return plan;
}

function assertOwned(row, expected, namespace) {
  if (!row || idOf(row._id) !== expected.id || row[expected.prefix.field] !== expected.prefix.value ||
      row.syntheticSeedBatch !== namespace || row.isSynthetic !== true) fail('SEED_EXISTING_RECORD_NOT_OWNED');
}

async function inspectOwned(plan, store, session) {
  assertPlan(plan);
  const present = new Map(), counts = Object.fromEntries(Object.keys(PREFIX_FIELDS).map(k => [k,0]));
  for (const model of Object.keys(PREFIX_FIELDS)) {
    const expected = plan.records.filter(row=>row.model===model);
    if (!expected.length) continue;
    const byId = new Map(expected.map(row=>[row.id,row]));
    const projection = {_id:1,syntheticSeedBatch:1,isSynthetic:1,[PREFIX_FIELDS[model]]:1};
    for (let start=0;start<expected.length;start+=500) {
      const rows=await store.readOwned(model,expected.slice(start,start+500).map(row=>row.id),projection,session);
      if (!Array.isArray(rows)) fail('SEED_OWNERSHIP_READ_INVALID');
      for (const row of rows) {
        const spec=byId.get(idOf(row?._id));
        if (!spec || present.has(model+':'+spec.id)) fail('SEED_OWNERSHIP_READ_INVALID');
        assertOwned(row,spec,plan.namespace);present.set(model+':'+spec.id,row);counts[model]++;
      }
    }
    // Prefix records outside the fixed registry are never silently deleted.
    const namespaceCount=await store.countNamespace(model,plan.namespace,session);
    if (!Number.isSafeInteger(namespaceCount) || namespaceCount!==counts[model]) fail('SEED_UNREGISTERED_OWNED_RECORDS');
  }
  return {present,counts,total:present.size,complete:present.size===plan.records.length};
}

async function assertNoForeignReferences(plan,store,session) {
  if(typeof store.countForeignReferences!=='function')fail('SEED_DEPENDENCIES_UNVERIFIED');
  let count;try{count=await store.countForeignReferences(plan,session);}catch(_){fail('SEED_DEPENDENCIES_UNVERIFIED');}
  if(!Number.isSafeInteger(count)||count<0)fail('SEED_DEPENDENCIES_UNVERIFIED');
  if(count)fail('SEED_NON_OWNED_DEPENDENCIES_PRESENT');
}

function prepareRecords(plan,models,{passwordHash}={}) {
  assertPlan(plan);
  if (typeof passwordHash!=='string' || !/^\$2[aby]\$1[2-5]\$/.test(passwordHash)) fail('SEED_UNUSABLE_PASSWORD_HASH_REQUIRED');
  const {writeNicFields}=require('../server/src/security/nicPersistence');
  return plan.records.map(row=>{
    const Model=models[row.model];if (!Model) fail('SEED_MODEL_REQUIRED');
    const input={...row.document,_id:row.id};
    if (Model.schema.path('password')) input.password=passwordHash;
    const nic=row.model==='Patient'?input.nic:input.patientNic;
    if (typeof nic==='string' && ['Patient','Consultation','Prescription','LabTest'].includes(row.model)) {
      Object.assign(input,writeNicFields(nic,{legacyFields:row.model==='Patient'||row.model==='LabTest'?['patientNic_bi']:['patientNic_bi','nicHash']}));
    }
    const doc=new Model(input);
    if (doc.validateSync()) fail('SEED_MODEL_VALIDATION_FAILED');
    if (typeof doc.encryptFieldsSync==='function') doc.encryptFieldsSync();
    const raw=doc.toObject({depopulate:true,versionKey:false});
    if (idOf(raw._id)!==row.id || raw[row.prefix.field]!==row.prefix.value) fail('SEED_SERIALIZED_OWNERSHIP_INVALID');
    // The existing surveillance service deliberately reads raw trusted metadata,
    // not hydrated clinical documents. Append only synthetic provenance after
    // canonical model validation/encryption; never mutate schema strictness.
    const metadata={syntheticSeedBatch:plan.namespace,isSynthetic:true,isDemoData:true};
    if (row.model==='Consultation') {
      const v=row.metadata?.surveillanceVerification;
      if (!v || v.status!=='verified' || v.source!=='synthetic_qa' || v.diagnosisStatus!=='confirmed' ||
          typeof v.episodeId!=='string' || !/^SEED[-_]/.test(v.episodeId) || !v.verifiedBy || !v.caseDefinitionReference ||
          !Number.isFinite(+new Date(v.verifiedAt)) || +new Date(v.verifiedAt)>+new Date(plan.now)) fail('SEED_SYNTHETIC_PROVENANCE_REQUIRED');
      metadata.isSimulation=true;metadata.surveillanceVerification={...v};
    }
    return {...row,raw:{...raw,...metadata}};
  });
}

async function runSeedPlan({plan,store,models,passwordHash,action='seed',apply=false}) {
  if (!['seed','refresh','remove'].includes(action) || typeof apply!=='boolean') fail('SEED_MODE_INVALID');
  const before=await inspectOwned(plan,store);
  if(action!=='seed'&&before.total)await assertNoForeignReferences(plan,store);
  const result={mode:action,dryRun:!apply,existingOwned:before.counts,planned:plan.counts,existingOrTestAccountsTouched:0,
    wouldInsert:action==='remove'||before.complete&&action==='seed'?0:plan.records.length,wouldDelete:action==='seed'?0:before.total};
  if (action==='seed' && before.total && !before.complete) fail('SEED_PARTIAL_BATCH_REQUIRES_REVIEW');
  if (!apply) return result;
  if (action==='seed' && before.complete) return {...result,dryRun:false,idempotent:true,inserted:0,deleted:0};
  if (action==='remove' && before.total===0) return {...result,dryRun:false,idempotent:true,inserted:0,deleted:0};
  const prepared=action==='remove'?[]:prepareRecords(plan,models,{passwordHash});
  const session=await store.startSession();let commitStarted=false,commitCompleted=false,primaryError;
  try {
    session.startTransaction({readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});
    const inside=await inspectOwned(plan,store,session);
    if (inside.total!==before.total || inside.complete!==before.complete) fail('SEED_CONCURRENT_CHANGE');
    if(action!=='seed'&&inside.total)await assertNoForeignReferences(plan,store,session);
    let deleted=0;
    if (action!=='seed') {
      // Children before actors; every delete repeats exact id AND prefix AND
      // synthetic ownership inside the transaction. Never deleteMany/drop.
      for (const row of [...plan.records].reverse()) {
        if (!inside.present.has(row.model+':'+row.id)) continue;
        const n=await store.deleteOwned(row,plan.namespace,session);
        if (n!==1) fail('SEED_CONCURRENT_CHANGE');deleted++;
      }
    }
    for (const model of Object.keys(PREFIX_FIELDS)) {
      const rows=prepared.filter(row=>row.model===model);
      for (let offset=0;offset<rows.length;offset+=500) await store.insertOwned(model,rows.slice(offset,offset+500).map(row=>row.raw),session);
    }
    commitStarted=true;await session.commitTransaction();commitCompleted=true;
    return {...result,dryRun:false,idempotent:false,inserted:prepared.length,deleted};
  } catch (error) {
    primaryError=error;
    if(commitStarted)primaryError=Object.assign(Error('SEED_COMMIT_OUTCOME_UNKNOWN_NO_RETRY'),{code:'SEED_COMMIT_OUTCOME_UNKNOWN_NO_RETRY'});
    else try{await session.abortTransaction();}catch(_){primaryError=Object.assign(Error('SEED_ABORT_UNVERIFIED'),{code:'SEED_ABORT_UNVERIFIED'});}
    throw primaryError;
  } finally {
    try{await session.endSession();}catch(_){
      if(primaryError)primaryError.sessionCleanupVerified=false;
      else fail(commitCompleted?'SEED_COMMITTED_SESSION_CLEANUP_UNVERIFIED':'SEED_SESSION_CLEANUP_UNVERIFIED');
    }
  }
}

function modelSet(mongoose,connection=mongoose.connection) {
  const models={};
  for (const name of Object.keys(PREFIX_FIELDS)) {
    const canonical=require('../server/src/models/'+name);
    models[name]=connection===mongoose.connection?canonical:(connection.models[name]||connection.model(name,canonical.schema));
  }
  return models;
}

function createStore(models,connection,mongoose) {
  const objectId=id=>new mongoose.Types.ObjectId(id);
  return {
    async readOwned(name,ids,projection,session) {return models[name].collection.find({_id:{$in:ids.map(objectId)}},{projection,session,maxTimeMS:10000}).toArray();},
    countNamespace(name,namespace,session) {return models[name].collection.countDocuments({syntheticSeedBatch:namespace},{session,maxTimeMS:10000});},
    async deleteOwned(row,namespace,session) {const r=await models[row.model].collection.deleteOne({_id:objectId(row.id),[row.prefix.field]:row.prefix.value,syntheticSeedBatch:namespace,isSynthetic:true},{session});return r.deletedCount;},
    async insertOwned(name,rows,session) {if(rows.length)await models[name].collection.insertMany(rows,{session,ordered:true});},
    async countForeignReferences(plan,session){
      const ids=model=>plan.records.filter(r=>model==='ALL'||r.model===model).flatMap(r=>[objectId(r.id),r.id]);
      const prefixes=plan.records.map(r=>r.prefix.value);
      for(const [collection,fields]of Object.entries(REFERENCE_PATHS)){
        const clauses=Object.entries(fields).map(([field,model])=>({[field]:{$in:model==='ALL_OR_PREFIX'?[...ids('ALL'),...prefixes]:ids(model)}}));
        const owned=plan.records.filter(r=>r.collection===collection).map(r=>objectId(r.id));
        const filter={$or:clauses,...(owned.length?{_id:{$nin:owned}}:{})};
        if(await connection.db.collection(collection).countDocuments(filter,{session,maxTimeMS:5000,limit:1}))return 1;
      }
      return 0;
    },
    startSession(){return connection.startSession();}
  };
}

module.exports={PREFIX_FIELDS,REFERENCE_PATHS,assertPlan,assertOwned,inspectOwned,assertNoForeignReferences,prepareRecords,runSeedPlan,modelSet,createStore};
