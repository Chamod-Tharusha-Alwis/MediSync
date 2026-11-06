'use strict';

// Operator tool, never an application startup import or public endpoint.
const path=require('path'),crypto=require('crypto');
const {assertPlan,inspectOwned,runSeedPlan,modelSet,createStore}=require('./seedPlatformStore.cjs');
const fail=code=>{throw Object.assign(Error(code),{code});};
const TEST_DATABASE='medisync_automated_test';
const PRODUCTION_HOST='medisync.xton2tj.mongodb.net';

function parseArguments(args) {
  let database,action='seed',apply=false,dry=false;
  const seen=new Set();
  for(let i=0;i<args.length;i++) {
    const flag=args[i];if(seen.has(flag))fail('SEED_ARGUMENT_INVALID');seen.add(flag);
    if(flag==='--db'){database=args[++i];if(!database||database.startsWith('--'))fail('SEED_DATABASE_REQUIRED');}
    else if(flag==='--confirm')apply=true;
    else if(flag==='--dry-run')dry=true;
    else if(flag==='--refresh'||flag==='--remove'){if(action!=='seed')fail('SEED_MODE_INVALID');action=flag.slice(2);}
    else fail('SEED_ARGUMENT_INVALID');
  }
  if(!['medisync_prod',TEST_DATABASE].includes(database))fail('SEED_DATABASE_NOT_APPROVED');
  if(dry&&apply)fail('SEED_MODE_INVALID');
  return {database,action,apply:apply&&!dry};
}

function loadKeys(environment,isQa) {
  // Same operator dictionary as production boot, before any model registration.
  const ring=require('../server/src/security/operatorKeyPolicy').validateAndLoadOperatorKeys(environment);
  const state=require('../server/src/security/securityRuntime').current().status();
  if(state.nicMode!=='legacy'||state.fieldMode!=='legacy')fail('SEED_SECURITY_PROFILE_NOT_QUALIFIED');
  if(isQa && environment.NODE_ENV!=='test')fail('SEED_QA_MODE_REQUIRED');
  global.ENCRYPTION_KEYS=ring.keys;global.ACTIVE_KEY_VERSION=ring.activeVersion;
  global.ENCRYPTION_KEY=ring.keys[ring.activeVersion];
}

function selectSeedTarget(environment,database) {
  const target=require('../server/scripts/operatorDatabaseMode').selectOperatorDatabase(environment,database===TEST_DATABASE);
  if(target.database!==database)fail('SEED_TARGET_NOT_VERIFIED');
  if(target.mode==='production'){
    const {ConnectionString}=require('../server/node_modules/mongodb-connection-string-url');
    const uri=new ConnectionString(target.uri);
    if(uri.hosts.length!==1||uri.hosts[0].toLowerCase()!==PRODUCTION_HOST)fail('SEED_EXISTING_CLUSTER_REQUIRED');
  }
  return target;
}

async function verifySeedStorage(db,environment,target,models) {
  // The real startup checker has an opt-in DDL mode. Even an inherited opt-in
  // must never turn this tool's prerequisite check into provisioning.
  if(target.mode==='production')await require('../server/src/security/productionStorageAdmission').verifyProductionStorage(db,{...environment,MEDISYNC_AUTO_PROVISION_STORAGE:'false'});
  for(const model of Object.values(models)){
    const rows=await db.listCollections({name:model.collection.name},{nameOnly:true}).toArray();
    if(rows.length!==1)fail('SEED_STORAGE_PREREQUISITES_MISSING');
  }
}

async function connectWithRetry(mongoose,uri,options,{maxRetries=2,retryDelayMs=1000}={}) {
  for(let attempt=1;attempt<=maxRetries+1;attempt++) {
    try {
      await mongoose.connect(uri,options);
      return;
    } catch(err) {
      const isTransient=/server selection timed out|MongoNetworkError|MongoNetworkTimeoutError|ETIMEDOUT|ECONNRESET|socket disconnected/i.test(err.message||'')||['MongoServerSelectionError','MongoNetworkError','MongoNetworkTimeoutError'].includes(err.name||'');
      if(attempt>maxRetries||!isTransient)throw err;
      await new Promise(resolve=>setTimeout(resolve,retryDelayMs*attempt));
    }
  }
}

async function closeSeedConnection(mongoose,{primaryError,applied=false}={}) {
  try{await mongoose.disconnect();}catch(_){
    if(primaryError){primaryError.connectionCleanupVerified=false;return;}
    fail(applied?'SEED_COMMITTED_CONNECTION_CLEANUP_UNVERIFIED':'SEED_CONNECTION_CLEANUP_UNVERIFIED');
  }
}

async function resolvePatientNics(plan,models,mongoose) {
  const values=[],used=new Set(),candidates=require('./seedPlatformPlan.cjs').candidatePatientNics(10000);let nextCandidate=0;
  for(const row of plan.records.filter(r=>r.model==='Patient')) {
    const existing=await models.Patient.collection.findOne({_id:new mongoose.Types.ObjectId(row.id)},
      {projection:{_id:1,email:1,nic:1,syntheticSeedBatch:1,isSynthetic:1},maxTimeMS:10000});
    let value;
    if(existing) {
      require('./seedPlatformStore.cjs').assertOwned(existing,row,plan.namespace);value=existing.nic;
      if(typeof value!=='string'||!/^\d{12}$/.test(value)||used.has(value))fail('SEED_OWNED_IDENTITY_INVALID');
    } else {
      let tries=0;
      do {
        if(++tries>10000||nextCandidate>=candidates.length)fail('SEED_IDENTITY_SPACE_UNAVAILABLE');
        value=candidates[nextCandidate++];
      } while(used.has(value)||await models.Patient.collection.countDocuments({nic:value},{maxTimeMS:10000}));
    }
    used.add(value);values.push(value);
  }
  return values;
}

async function runCli(args=process.argv.slice(2),{readFile=require('fs').readFileSync,environment=process.env,now=new Date()}={}) {
  const config=parseArguments(args);
  if(config.apply&&environment.MEDISYNC_SEED_RUN_APPROVAL!=='SEED RUN APPROVED')fail('SEED_WRITE_APPROVAL_REQUIRED');
  // Parse privately; never dotenv.config(), inherit a URI, or print its contents.
  const parsed=require('../server/node_modules/dotenv').parse(readFile(path.resolve(__dirname,'../server/.env')));
  const selected=config.database===TEST_DATABASE?'MONGO_URI_TEST':'MONGO_URI';
  const env={};
  for(const [key,value]of Object.entries(parsed))if(!/^MONGO|^DATABASE_URL$/i.test(key))env[key]=value;
  if(typeof parsed[selected]!=='string'||!parsed[selected].trim())fail('SEED_URI_REQUIRED');
  env[selected]=parsed[selected];env.NODE_ENV=config.database===TEST_DATABASE?'test':'production';
  for(const key of Object.keys(parsed))delete parsed[key];
  const mongoose=require('../server/node_modules/mongoose');
  const {disableAutomaticModelDdl}=require('../server/src/security/productionAtlasPolicy');
  disableAutomaticModelDdl(mongoose);mongoose.set('bufferCommands',false);
  const {verifyOperatorIdentity}=require('../server/scripts/operatorDatabaseMode');
  let ownsConnection=false,primaryError,result;
  try {
    const target=selectSeedTarget(env,config.database);
    if(mongoose.connection.readyState!==0)fail('SEED_TARGET_NOT_VERIFIED');
    loadKeys(env,config.database===TEST_DATABASE);
    const models=modelSet(mongoose);
    const {buildSeedPlatformPlan}=require('./seedPlatformPlan.cjs');
    let plan=assertPlan(buildSeedPlatformPlan({now}));
    ownsConnection=true;
    await connectWithRetry(mongoose,target.uri,{...target.connectionOptions,autoCreate:false,autoIndex:false,retryWrites:false});
    await verifyOperatorIdentity(mongoose.connection.db,target);
    await verifySeedStorage(mongoose.connection.db,env,target,models);
    const store=createStore(models,mongoose.connection,mongoose);
    await inspectOwned(plan,store);
    const patientNics=await resolvePatientNics(plan,models,mongoose);
    plan=assertPlan(buildSeedPlatformPlan({now,patientNics}));
    const passwordHash=config.apply&&config.action!=='remove'?await require('../server/node_modules/bcryptjs').hash(crypto.randomBytes(48).toString('hex'),12):undefined;
    result=await runSeedPlan({plan,store,models,passwordHash,action:config.action,apply:config.apply});
    return result;
  } catch(error){primaryError=error;throw error;
  } finally {
    try{if(ownsConnection)await closeSeedConnection(mongoose,{primaryError,applied:config.apply&&Boolean(result?.inserted||result?.deleted)});}
    finally{
      for(const key of Object.keys(env))delete env[key];
      delete global.ENCRYPTION_KEY;delete global.ENCRYPTION_KEYS;delete global.ACTIVE_KEY_VERSION;
    }
  }
}

if(require.main===module)runCli().then(result=>console.log(JSON.stringify(result))).catch(error=>{
  console.log(JSON.stringify({status:'BLOCKED',category:/^SEED_[A-Z_]+$/.test(error.code||'')?error.code:'SEED_ADMISSION_OR_EXECUTION_FAILED'}));process.exitCode=1;
});
module.exports={parseArguments,loadKeys,selectSeedTarget,verifySeedStorage,connectWithRetry,closeSeedConnection,resolvePatientNics,runCli};
