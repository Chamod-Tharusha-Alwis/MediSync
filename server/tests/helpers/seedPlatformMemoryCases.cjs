'use strict';
// Executed ONLY by the native local lifecycle profile, outside the backend
// no-network sandbox. It owns one numeric-loopback MongoMemoryReplSet, with no
// Atlas credentials, no downloads, and no access to an existing Mongo service.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process'),vm=require('vm');
const root=path.resolve(__dirname,'../../..');
const {buildSeedPlatformPlan}=require('../../../scripts/seedPlatformPlan.cjs');
const engine=require('../../../scripts/seedPlatformStore.cjs');
const {resolvePatientNics}=require('../../../scripts/seed-platform-data.js');

async function runMemoryCases(out) {
  if(!path.resolve(out).startsWith(path.join(root,'scratch')+path.sep))throw Error('MEMORY_EVIDENCE_TARGET_REJECTED');
  const mongoose=require('../../node_modules/mongoose');
  if(mongoose.connection.readyState!==0||['MONGO_URI','MONGO_URI_TEST','MONGODB_URI','REDIS_URL'].some(k=>process.env[k]))throw Error('MEMORY_ENVIRONMENT_REJECTED');
  const checks=[],scenarios=[],analysisMetrics=[];
  const check=async(name,body)=>{let passed=false,errorCategory;try{passed=(await body())===true;}catch(error){passed=false;errorCategory=Number.isInteger(error.code)?'DATABASE_CODE_'+error.code:/^SEED_[A-Z_]+$/.test(error.code||'')?error.code:'MEMORY_CASE_EXCEPTION';}checks.push({name,passed,...(errorCategory?{errorCategory}:{})});if(!passed)throw Error('MEMORY_CASE_FAILED');};
  const binary=process.env.MONGOMS_SYSTEM_BINARY||'C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe';
  if(!fs.existsSync(binary))throw Error('MEMORY_BINARY_NOT_AVAILABLE_NO_DOWNLOAD');
  const version=cp.spawnSync(binary,['--version'],{encoding:'utf8',windowsHide:true,timeout:10000}).stdout.match(/db version v([0-9.]+)/)?.[1];
  if(!version)throw Error('MEMORY_BINARY_NOT_VERIFIED');
  const oldConsole={...console};for(const k of ['log','warn','error'])console[k]=()=>{};
  const moduleLoad=require('module')._load;
  require('module')._load=function(name,...args){if(/emailService|notificationService|cloudinary|resend|brevo|config\/redis/i.test(name))throw Error('MEMORY_PROVIDER_IMPORT_DENIED');return moduleLoad.call(this,name,...args);};
  let owned,connection;
  try {
    const {MongoMemoryReplSet}=require('../../node_modules/mongodb-memory-server');
    const dbPath=path.join(out,'owned-mongo');fs.mkdirSync(dbPath,{recursive:true});
    owned=new MongoMemoryReplSet({binary:{systemBinary:binary,version},replSet:{count:1,ip:'127.0.0.1',dbName:'medisync_seed_offline'},instanceOpts:[{ip:'127.0.0.1',dbPath}]});
    await owned.start();
    const uri=owned.getUri('medisync_seed_offline'),u=new URL(uri);
    if(u.hostname!=='127.0.0.1'||u.pathname!=='/medisync_seed_offline')throw Error('MEMORY_DATABASE_TARGET_REJECTED');
    require('../../src/security/productionAtlasPolicy').disableAutomaticModelDdl(mongoose);
    global.ENCRYPTION_KEYS={'1':crypto.randomBytes(32).toString('hex')};global.ACTIVE_KEY_VERSION=1;global.ENCRYPTION_KEY=global.ENCRYPTION_KEYS['1'];
    connection=await mongoose.createConnection(uri,{autoCreate:false,autoIndex:false,serverSelectionTimeoutMS:10000}).asPromise();
    const models=engine.modelSet(mongoose,connection),store=engine.createStore(models,connection,mongoose);
    for(const Model of Object.values(models)){
      await connection.db.createCollection(Model.collection.name);
      for(const [keys,options]of Model.schema.indexes()){
        const allowed={};for(const key of ['unique','sparse','expireAfterSeconds','name'])if(options[key]!==undefined)allowed[key]=options[key];
        await Model.collection.createIndex(keys,allowed);
      }
    }
    const passwordHash=await require('../../node_modules/bcryptjs').hash(crypto.randomBytes(48).toString('hex'),12);
    const now='2026-11-06T07:30:00.000Z',later='2026-11-07T07:30:00.000Z';
    let plan=buildSeedPlatformPlan({now,compact:true});
    const baseline=new models.Patient({_id:new mongoose.Types.ObjectId(),nic:plan.records.find(r=>r.model==='Patient').document.nic,
      email:'baseline-control@example.invalid',fullName:'Synthetic preservation control',password:passwordHash,createdAt:new Date(now),updatedAt:new Date(now)});
    baseline.encryptFieldsSync();await models.Patient.collection.insertOne(baseline.toObject());
    const baselineId=baseline._id;
    const digest=async()=>crypto.createHash('sha256').update(JSON.stringify(await models.Patient.collection.findOne({_id:baselineId}))).digest('hex');
    const baselineHash=await digest();
    const total=async()=>{let n=0;for(const M of Object.values(models))n+=await M.collection.countDocuments({});return n;};
    await check('actual memory replica is loopback-only and isolated',async()=>connection.db.databaseName==='medisync_seed_offline'&&u.hostname==='127.0.0.1');
    await check('dry-run creates no records, sessions, indexes or collections',async()=>{
      const names=await connection.db.listCollections({},{nameOnly:true}).toArray();const before=await total();let sessions=0;
      const beforeIndexes=await Promise.all(Object.values(models).map(M=>M.collection.listIndexes().toArray()));
      await engine.runSeedPlan({plan,models,store:{...store,startSession(){sessions++;throw Error('UNEXPECTED_WRITE_SESSION');}},apply:false});
      const afterNames=await connection.db.listCollections({},{nameOnly:true}).toArray();
      const afterIndexes=await Promise.all(Object.values(models).map(M=>M.collection.listIndexes().toArray()));
      return before===await total()&&sessions===0&&names.length===afterNames.length&&JSON.stringify(beforeIndexes)===JSON.stringify(afterIndexes);
    });
    await check('collision resolution skips the existing control without modifying it',async()=>{
      const nics=await resolvePatientNics(plan,models,mongoose);plan=buildSeedPlatformPlan({now,compact:true,patientNics:nics});
      return nics.every(n=>n!==baseline.nic)&&new Set(nics).size===nics.length&&await digest()===baselineHash;
    });
    await check('real model encryption and one transaction create exactly the owned graph',async()=>{
      const r=await engine.runSeedPlan({plan,models,store,passwordHash,apply:true});return r.inserted===plan.records.length&&(await engine.inspectOwned(plan,store)).complete;
    });
    await check('non-owned prescription linkage blocks refresh and removal without changing either graph',async()=>{
      const dependent={_id:new mongoose.Types.ObjectId(),prescriptionId:'memory-dependent-control',consultationId:new mongoose.Types.ObjectId(plan.records.find(r=>r.model==='Consultation').id)};
      await models.Prescription.collection.insertOne(dependent);const before=await total();let denied=0;
      for(const action of ['refresh','remove'])try{await engine.runSeedPlan({plan,models,store,passwordHash,action,apply:true});}catch(error){if(error.code==='SEED_NON_OWNED_DEPENDENCIES_PRESENT')denied++;}
      const unchanged=before===await total()&&Boolean(await models.Prescription.collection.findOne({_id:dependent._id}))&&(await engine.inspectOwned(plan,store)).complete&&await digest()===baselineHash;
      await models.Prescription.collection.deleteOne({_id:dependent._id});return denied===2&&unchanged;
    });
    await check('normal model hydration and blind-index lookup recover the owned fixture',async()=>{
      const row=plan.records.find(r=>r.model==='Patient');const raw=await models.Patient.collection.findOne({_id:new mongoose.Types.ObjectId(row.id)});
      const loaded=await models.Patient.findById(row.id);const filter=require('../../src/security/nicPersistence').nicFilter(row.document.nic,{plainFields:['nic']});
      const found=await models.Patient.findOne(filter);return raw.__enc_fullName===true&&raw.fullName!==row.document.fullName&&loaded.fullName===row.document.fullName&&String(found?._id)===row.id;
    });
    await check('repeat confirm is idempotent and does not update existing records',async()=>{
      const before=await total(),r=await engine.runSeedPlan({plan,models,store,passwordHash,apply:true});return r.idempotent===true&&r.inserted===0&&before===await total()&&await digest()===baselineHash;
    });
    const maxDate=async()=>+(await models.Consultation.collection.find({syntheticSeedBatch:plan.namespace}).sort({createdAt:-1}).limit(1).toArray())[0].createdAt;
    await check('refresh re-dates only owned records and preserves cardinality and control hash',async()=>{
      const before=await total(),oldMax=await maxDate();const next=buildSeedPlatformPlan({now:later,compact:true,patientNics:plan.records.filter(r=>r.model==='Patient').map(r=>r.document.nic)});
      const r=await engine.runSeedPlan({plan:next,models,store,passwordHash,action:'refresh',apply:true});plan=next;
      return r.deleted===r.inserted&&before===await total()&&await maxDate()>oldMax&&await maxDate()<=+new Date(later)&&await digest()===baselineHash;
    });
    await check('unknown commit outcome is surfaced once without automatic retry or cleanup',async()=>{
      let commits=0,aborts=0;
      const uncertain={...store,async startSession(){const s=await connection.startSession();return {
        startTransaction:opts=>s.startTransaction(opts),async commitTransaction(){commits++;await s.commitTransaction();throw Error('SYNTHETIC_LOST_ACK');},
        async abortTransaction(){aborts++;return s.abortTransaction();},endSession:()=>s.endSession(),
        // Driver operations require the real session; handled by the adapter below.
        ownedSession:s};}};
      const unwrap=session=>session?.ownedSession||session;
      uncertain.readOwned=(name,ids,projection,s)=>store.readOwned(name,ids,projection,unwrap(s));uncertain.countNamespace=(name,ns,s)=>store.countNamespace(name,ns,unwrap(s));
      uncertain.countForeignReferences=(p,s)=>store.countForeignReferences(p,unwrap(s));
      uncertain.deleteOwned=(r,ns,s)=>store.deleteOwned(r,ns,unwrap(s));uncertain.insertOwned=(name,rows,s)=>store.insertOwned(name,rows,unwrap(s));
      let category;try{await engine.runSeedPlan({plan,models,store:uncertain,passwordHash,action:'refresh',apply:true});}catch(e){category=e.code;}
      return category==='SEED_COMMIT_OUTCOME_UNKNOWN_NO_RETRY'&&commits===1&&aborts===0&&(await engine.inspectOwned(plan,store)).complete;
    });
    await check('remove uses exact owned IDs and preserves every unowned control byte',async()=>{
      const r=await engine.runSeedPlan({plan,models,store,action:'remove',apply:true});return r.deleted===plan.records.length&&await total()===1&&await digest()===baselineHash;
    });
    await check('non-prefixed collision blocks seed and removal before a partial write',async()=>{
      const expected=plan.records.find(r=>r.model==='Patient'),raw=baseline.toObject();raw._id=new mongoose.Types.ObjectId(expected.id);raw.email='unowned-control@example.invalid';raw.nic=require('../../../scripts/seedPlatformPlan.cjs').candidatePatientNics(10000).at(-1);raw.syntheticSeedBatch=plan.namespace;raw.isSynthetic=true;
      await models.Patient.collection.insertOne(raw);const before=await total();let refused=0;
      for(const action of ['seed','remove']){try{await engine.runSeedPlan({plan,models,store,passwordHash,action,apply:true});}catch(e){if(e.code==='SEED_EXISTING_RECORD_NOT_OWNED')refused++;}}
      await models.Patient.collection.deleteOne({_id:raw._id});return refused===2&&before===2&&await digest()===baselineHash;
    });
    await check('actual insert failure aborts the transaction and preserves the unowned control',async()=>{
      let insertCalls=0;const failing={...store,async insertOwned(...args){insertCalls++;if(insertCalls===2)throw Object.assign(Error('SEED_INERT_INSERT_REJECTED'),{code:'SEED_INERT_INSERT_REJECTED'});return store.insertOwned(...args);}};
      let category;try{await engine.runSeedPlan({plan,models,store:failing,passwordHash,apply:true});}catch(error){category=error.code;}
      return category==='SEED_INERT_INSERT_REJECTED'&&insertCalls===2&&await total()===1&&(await engine.inspectOwned(plan,store)).total===0&&await digest()===baselineHash;
    });
    // Full scenario fixtures are confined to this owned memory database. The
    // exact production selector/analysis and ML heuristic code are exercised;
    // notification delivery is an explicit inert seam, never a real provider.
    await check('full-size dataset remains synthetic and real reporting excludes it',async()=>{
      plan=buildSeedPlatformPlan({now});const nics=await resolvePatientNics(plan,models,mongoose);plan=buildSeedPlatformPlan({now,patientNics:nics});
      await engine.runSeedPlan({plan,models,store,passwordHash,apply:true});
      const rows=await models.Consultation.collection.find({syntheticSeedBatch:plan.namespace}).toArray();
      const {selectCases}=require('../../src/services/surveillanceService');
      return selectCases(rows,{mode:'real',now:new Date(now)}).cases.length===0&&selectCases(rows,{mode:'simulation',now:new Date(now)}).cases.length>0;
    });
    let inAppNotificationCalls=0;
    const canonicalAlert=require('../../src/models/OutbreakAlert');
    const alertModel=connection.model('OwnedSeedOutbreak',canonicalAlert.schema,'outbreakalerts');
    const code=fs.readFileSync(path.join(root,'server/src/services/surveillanceService.js'),'utf8'),module={exports:{}};
    const ml=(payload)=>{
      const env={...process.env,PYTHONDONTWRITEBYTECODE:'1',OMP_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1',MKL_NUM_THREADS:'1'};
      const python=path.join(root,'ml-engine/.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
      const r=cp.spawnSync(python,[path.join(root,'ml-engine/scripts/seed_platform_contract.py'),out],{env,input:JSON.stringify(payload),encoding:'utf8',windowsHide:true,timeout:60000,maxBuffer:5*1024*1024});
      if(r.status!==0)throw Error('MEMORY_ML_CONTRACT_FAILED');
      const response=JSON.parse(r.stdout);analysisMetrics.push(...response.results);return response;
    };
    vm.runInNewContext(code,{module,exports:module.exports,Date,Set,Map,console:{error(){}},process:{env:{}},require(name){
      if(name==='mongoose')return mongoose;if(name==='crypto')return crypto;
      if(name==='../models/Consultation')return models.Consultation;
      if(name==='../models/OutbreakAlert')return alertModel;
      if(name==='axios')return {async post(url,payload){if(!url.endsWith('/api/admin/outbreak/trigger'))throw Error('MEMORY_ML_PATH_REJECTED');return {data:ml(payload)};}};
      if(name==='../utils/internalAuth')return {generateToken(){return 'synthetic-contract-only';}};
      if(name==='./notificationService')return {async notifyOutbreakAlert(){inAppNotificationCalls++;}};
      throw Error('MEMORY_UNEXPECTED_ANALYSIS_IMPORT');
    }});
    await connection.db.createCollection('outbreakalerts');
    await check('actual analysis with actual ML contract does not alert on S8 single-day fixture',async()=>{
      const r=await module.exports.runAnalysis({mode:'simulation',now:new Date(now)});
      for(const result of r.results)scenarios.push({disease:result.disease,district:result.district,anomaly:result.anomaly,severity:result.severity});
      return !r.results.some(v=>v.district==='Ampara'&&v.disease==='ICD10:A90')&&r.consultations_analysed>0;
    });
    return {success:checks.every(c=>c.passed),checks,scenarios,analysisMetrics,inAppNotificationCalls,externalEmailImports:0,liveNetwork:false,loopback:true,baselinePreserved:await digest()===baselineHash};
  } catch (_) {return {success:false,checks,scenarios,category:'OWNED_MEMORY_PROOF_FAILED'};}
  finally {
    if(connection)await connection.close();if(owned)await owned.stop({doCleanup:false,force:false});
    delete global.ENCRYPTION_KEY;delete global.ENCRYPTION_KEYS;delete global.ACTIVE_KEY_VERSION;
    require('module')._load=moduleLoad;Object.assign(console,oldConsole);
  }
}
module.exports={runMemoryCases};
