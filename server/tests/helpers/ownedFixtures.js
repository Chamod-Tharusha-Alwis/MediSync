// Phase 5X harness: intercept native driver writes, record IDs BEFORE writes,
// reject every mutation of a document not owned by this suite, clean exact IDs.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),mongoose=require('mongoose');
process.env.NODE_ENV='test';process.env.MEDISYNC_TEST_MODE='true';process.env.EMAIL_SERVICE_LIVE_TEST='false';
process.env.WHO_ICD11_CLIENT_ID='';process.env.WHO_ICD11_CLIENT_SECRET='';
mongoose.set('autoCreate',false);mongoose.set('autoIndex',false);
global.ENCRYPTION_KEYS={'1':process.env.ENCRYPTION_KEY};global.ACTIVE_KEY_VERSION=1;
const browserMode=process.env.MEDISYNC_QA_BROWSER_RUN==='true';
if(browserMode && !/^5xc-b-[0-9a-f-]{36}$/.test(process.env.MEDISYNC_QA_BROWSER_OWNER || ''))throw new Error('Missing valid browser run owner');
const legacyOwner=process.env.MEDISYNC_QA_LEGACY_OWNER;
if(legacyOwner && !/^5x-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(legacyOwner))throw new Error('Invalid legacy fixture owner');
const owner=browserMode?process.env.MEDISYNC_QA_BROWSER_OWNER:legacyOwner || `5x-${crypto.randomUUID()}`,owned={},aliases=new Map(),rejected=[];
let frozen=false,pendingWrites=0,cleanupState='pending',runtimeVerification=null,runtimeVerified=false;
let readOnly=false,allowedCollections=null,ownedReferences=false,safetyConfigured=false;
const verifiedAbsent=new Set();
const directory=path.resolve(__dirname,'../../../scratch/phase5x-evidence');fs.mkdirSync(directory,{recursive:true});
const manifest=path.join(directory,`${owner}${browserMode?`.${process.env.MEDISYNC_QA_MANIFEST_LABEL==='server'?'server':'fixtures'}`:''}.json`);
if(fs.existsSync(manifest))throw new Error('Refusing to overwrite an existing owned manifest');
const receipt=()=>({owner,owned,rejected,frozen,pendingWrites,readOnly,allowedCollections:allowedCollections?[...allowedCollections]:null,ownedReferences,cleanupState,recoveryRequired:cleanupState!=='complete' && Object.values(owned).some(ids=>ids.length),runtimeVerification,runtimeVerified,
  networkAttempts:require('./qaEnvironment').networkAttempts,
  secretReadAttempts:require('./qaEnvironment').secretReadAttempts || [],
  otpKeyHashes:[...require('./qaEnvironment').otpKeys].map(key=>crypto.createHash('sha256').update(String(key)).digest('hex')),
  capturedMockEmails:global.__MEDISYNC_CAPTURED_TEST_EMAILS?.length || 0});
const save=()=>fs.writeFileSync(manifest,JSON.stringify(receipt(),null,2));
const track=(name,id)=>{const value=String(id);if(!(owned[name] ||= []).includes(value))owned[name].push(value);verifiedAbsent.delete(`${name}:${value}`);cleanupState='pending';save();};
save();
const proto=mongoose.mongo.Collection.prototype,original={};
for(const method of ['insertOne','insertMany','updateOne','updateMany','replaceOne','findOneAndUpdate','findOneAndReplace','deleteOne','deleteMany','findOneAndDelete'])original[method]=proto[method];
function refuse(collection,method,reason){rejected.push({collection:collection.collectionName,method,reason});save();throw new Error(`QA ownership guard refused ${method}: ${reason}`);}
function assertDatabase(collection,allowFrozen=false){
  if(process.env.MONGO_URI || process.env.MEDISYNC_TEST_MODE!=='true' || collection.dbName!=='medisync_automated_test'){
    throw new Error('QA write refused outside isolated test mode/database');
  }
  if(readOnly)refuse(collection,'write','read-only verification process');
  if(browserMode && (!safetyConfigured || !allowedCollections || !ownedReferences || !runtimeVerified))refuse(collection,'write','browser immutable scope and runtime are required');
  if(allowedCollections && !allowedCollections.has(collection.collectionName))refuse(collection,'write','collection is outside reviewed mutation scope');
  if(allowedCollections && !runtimeVerified)refuse(collection,'write','runtime role verification required before scoped writes');
  if(frozen && !allowFrozen)refuse(collection,'write','run is frozen');
}
async function checkBrowserReferences(collection,data,options={}){
  if(!browserMode && !ownedReferences)return;
  const db=mongoose.connection.db;
  const actorCollections=['admins','doctors','patients','hospitals','pharmacystaffs'];
  const mapping={patientId:'patients',hospitalId:'hospitals',sessionHospitalId:'hospitals',pharmacyId:'pharmacies',staffId:'pharmacystaffs',consultationId:'consultations',prescriptionId:'prescriptions',referredBy:'doctors',dispensedBy:'pharmacies'};
  if(collection.collectionName!=='doctors')mapping.doctorId='doctors';
  async function referenced(value,targets){
    if(!value || !mongoose.isObjectIdOrHexString(value))return;
    const id=new mongoose.Types.ObjectId(String(value));
    for(const name of targets)if(await db.collection(name).findOne({_id:id,phase5xOwner:owner,isSynthetic:true},{session:options.session}))return;
    refuse(collection,'reference','clinical/actor reference is not owned by this browser run');
  }
  for(const [field,target] of Object.entries(mapping))await referenced(data[field],[target]);
  for(const field of ['userId','actorId','targetId','acceptedBy','dispenserStaffId'])await referenced(data[field],actorCollections);
  await referenced(data.metadata?.requesterId,actorCollections);
  for(const id of data.hospitals || [])await referenced(id,['hospitals']);
  for(const id of data.doctors || [])await referenced(id,['doctors']);
  for(const login of data.orgLogins || [])await referenced(login.hospitalId,['hospitals']);
  for(const report of data.reportedDoctors || [])await referenced(report.doctorId,['doctors']);
  if(['consultations','prescriptions','labtests'].includes(collection.collectionName)){
    const hash=data.patientNic_bi || data.nicHash;
    if(hash && !await db.collection('patients').findOne({patientNic_bi:hash,phase5xOwner:owner,isSynthetic:true},{session:options.session}))refuse(collection,'reference','patient blind index is not owned');
  }
}
proto.bulkWrite=async function(){assertDatabase(this);refuse(this,'bulkWrite','use owned exact-ID writes');};
for(const method of ['drop','rename','createIndex','createIndexes','dropIndex','dropIndexes'])proto[method]=async function(){assertDatabase(this);refuse(this,method,'collection/schema changes are prohibited');};
for(const method of ['insertOne','insertMany'])proto[method]=async function(docs,options={}){
  assertDatabase(this);const values=Array.isArray(docs)?docs:[docs];
  for(const doc of values){doc._id ||= new mongoose.Types.ObjectId();if(await this.findOne({_id:doc._id},{session:options.session}))refuse(this,method,'existing ID');
    if(doc.datasetVersion==='MEDISYNC_UNIV_DEMO_V2')refuse(this,method,'cannot add university baseline records');
    await checkBrowserReferences(this,doc,options);
    doc.isSynthetic=true;doc.isTestFixture=true;doc.testRunId=owner;doc.phase5xOwner=owner;track(this.collectionName,doc._id);}
  // Freeze may arrive while ownership/reference reads await the driver.
  assertDatabase(this);
  return original[method].call(this,docs,options);
};
for(const method of ['updateOne','updateMany','replaceOne','findOneAndUpdate','findOneAndReplace','deleteOne','deleteMany','findOneAndDelete'])proto[method]=async function(filter,update,options){
  assertDatabase(this);const deleting=method.toLowerCase().includes('delete');const opts=(deleting?update:options)||{};
  if(!filter || !Object.keys(filter).length)refuse(this,method,'blanket mutation');
  if(opts.upsert)refuse(this,method,'upserts require a separately reviewed owned insert path');
  const matches=await this.find(filter,{session:opts.session,projection:{_id:1,phase5xOwner:1,isSynthetic:1}}).toArray();
  if(matches.some(d=>d.phase5xOwner!==owner || d.isSynthetic!==true || (!browserMode && !owned[this.collectionName]?.includes(String(d._id)))))refuse(this,method,'pre-existing or foreign document');
  if(browserMode)for(const doc of matches)track(this.collectionName,doc._id);
  if(!deleting){
    if(Array.isArray(update))refuse(this,method,'update pipelines are not permitted');
    const replacing=method.toLowerCase().includes('replace');
    if(replacing){
      if(update.datasetVersion==='MEDISYNC_UNIV_DEMO_V2')refuse(this,method,'baseline label');
      update.phase5xOwner=owner;update.isSynthetic=true;update.isTestFixture=true;update.testRunId=owner;
      await checkBrowserReferences(this,update,opts);
    }else{
      const protectedFields=new Set(['_id','phase5xOwner','isSynthetic','isTestFixture','testRunId','datasetVersion']);
      for(const [operator,changes] of Object.entries(update || {})){
        if(!operator.startsWith('$'))refuse(this,method,'replacement through update method');
        for(const [field,value] of Object.entries(changes || {}))if(protectedFields.has(field.split('.')[0]) ||
          (operator==='$rename' && protectedFields.has(String(value).split('.')[0])))refuse(this,method,'ownership metadata is immutable');
      }
      await checkBrowserReferences(this,update.$set || {},opts);
      if((browserMode || ownedReferences) && (update.$push || update.$addToSet)){
        // Nested relationship edits require a separately reviewed path.
        for(const field of Object.keys({...update.$push,...update.$addToSet}))if(['reportedDoctors','hospitals','doctors'].includes(field))refuse(this,method,'nested browser relationship edit');
      }
    }
  }
  // Constrain the actual mutation, closing the gap between precheck and write.
  const scoped={$and:[filter,{_id:{$in:matches.map(d=>d._id)},phase5xOwner:owner,isSynthetic:true}]};
  assertDatabase(this);
  return deleting ? original[method].call(this,scoped,opts) : original[method].call(this,scoped,update,opts);
};
const originalAggregate=proto.aggregate;
for(const method of [...Object.keys(original),'bulkWrite']){
  const guarded=proto[method];
  proto[method]=async function(...args){pendingWrites++;try{return await guarded.apply(this,args);}catch(error){if(browserMode){rejected.push({collection:this.collectionName,method,reason:'browser native operation failed'});save();}throw error;}finally{pendingWrites--;}};
}
const installedInsertOne=proto.insertOne;
function verifyRuntime(info, { browserContract } = {}){
  runtimeVerified=false;
  const providerKeys=Object.keys(process.env).filter(key=>/^(RESEND_|BREVO_|EMAIL_|SMTP_|CLOUDINARY_|TWILIO_|SMS_|VAULT_|REDIS_|WHO_ICD)/.test(key) && process.env[key] && !['EMAIL_SERVICE_LIVE_TEST'].includes(key));
  runtimeVerification={database:info.dbName,roles:info.authenticatedRoles,authenticatedUsers:info.authenticatedUserCount,
    productionUriLoaded:Boolean(process.env.MONGO_URI),providerSecretKeysLoaded:providerKeys.length,
    dbGuardActive:require('../../src/config/dbGuard').areDestructiveGuardsInstalled(),nativeFixtureGuardActive:proto.insertOne===installedInsertOne,
    testMode:process.env.MEDISYNC_TEST_MODE==='true',browserMode};
  save();
  if(runtimeVerification.database!=='medisync_automated_test' || runtimeVerification.authenticatedUsers!==1 ||
    runtimeVerification.roles?.length!==1 || runtimeVerification.roles[0]?.role!=='readWrite' || runtimeVerification.roles[0]?.db!=='medisync_automated_test' ||
    runtimeVerification.productionUriLoaded || providerKeys.length || !runtimeVerification.dbGuardActive || !runtimeVerification.nativeFixtureGuardActive || !runtimeVerification.testMode || browserMode){
    if(!browserMode || runtimeVerification.database!=='medisync_automated_test' || runtimeVerification.authenticatedUsers!==1 ||
      runtimeVerification.roles?.length!==1 || runtimeVerification.roles[0]?.role!=='readWrite' || runtimeVerification.roles[0]?.db!=='medisync_automated_test' ||
      runtimeVerification.productionUriLoaded || providerKeys.length || !runtimeVerification.dbGuardActive || !runtimeVerification.nativeFixtureGuardActive || !runtimeVerification.testMode)
      throw new Error('Legacy runtime safety verification failed before fixture writes');
    const reviewed=require('./browserRunConfig').validateBrowserRunConfig(browserContract||{});
    if(reviewed.owner!==owner || !safetyConfigured || !ownedReferences || JSON.stringify([...allowedCollections||[]].sort())!==JSON.stringify([...reviewed.allowedCollections].sort()) || !readOnly)
      throw new Error('Browser E1 runtime requires immutable read-only ownership scope');
  }
  runtimeVerified=true;save();return runtimeVerification;
}
proto.aggregate=function(pipeline,options){
  if(JSON.stringify(pipeline || []).match(/"\$(out|merge)"\s*:/))refuse(this,'aggregate','write aggregation');
  return originalAggregate.call(this,pipeline,options);
};
const originalCommand=mongoose.mongo.Db.prototype.command;
mongoose.mongo.Db.prototype.command=function(command,options){
  if(this.databaseName!=='medisync_automated_test' || process.env.MONGO_URI)throw new Error('QA command outside restricted database');
  if(!['connectionStatus','ping','buildInfo','collStats','dbStats'].includes(Object.keys(command || {})[0]))throw new Error('QA direct database command refused');
  return originalCommand.call(this,command,options);
};
// A dedicated uncapped test collection allows exact cleanup without changing the
// existing capped audit log. All reads and assertions use this real Atlas model.
const auditPath=require.resolve('../../src/models/AuditLog');
const Audit=require(auditPath),auditSchema=Audit.schema.clone();auditSchema.options.capped=undefined;
require.cache[auditPath].exports=mongoose.models.Phase5xAuditLog || mongoose.model('Phase5xAuditLog',auditSchema,'phase5x_audit_qa');
function alias(value){
  if(!aliases.has(value))aliases.set(value,/^\d{9}[VX]$|^\d{12}$/i.test(value)?`1990${crypto.randomInt(10000000,99999999)}`:value.includes('@')?`${value.split('@')[0]}.${owner}@qa.medisync.local`:`${value}-${owner}`);
  return aliases.get(value);
}
async function clone(Model,filter,overrides={}){
  const doc=await Model.findOne(filter);if(!doc)throw new Error(`Missing read-only reference: ${Model.modelName}`);
  const source=await Model.collection.findOne({_id:doc._id},{projection:{datasetVersion:1,isSynthetic:1}});
  if(source?.datasetVersion!=='MEDISYNC_UNIV_DEMO_V2'||source?.isSynthetic!==true){
    throw new Error(`Refusing to clone non-baseline ${Model.modelName} document`);
  }
  const data=doc.toObject();delete data._id;delete data.__v;delete data.createdAt;delete data.updatedAt;
  for(const k of ['email','nic','doctorId','regNo','licenseNo'])if(typeof data[k]==='string')data[k]=alias(data[k]);
  if(data.patientNic_bi && data.nic)data.patientNic_bi=crypto.createHash('sha256').update(data.nic).digest('hex');
  data.datasetVersion=owner;data.isSynthetic=true;data.isDemoData=true;
  const fresh=new Model({...data,...overrides});await fresh.save();return Model.findById(fresh._id);
}
async function cleanup(){
  cleanupState='running';save();
  if(pendingWrites || (browserMode && !frozen)){cleanupState='failed';save();throw new Error('QA cleanup requires settled native writes and a frozen browser fixture process');}
  const errors=[];
  try{await require('./qaEnvironment').cleanupOtp();}catch(error){errors.push({collection:'memory-otp',error:error.name});}
  if(mongoose.connection.readyState!==1){
    if(Object.values(owned).some(ids=>ids.length) || errors.length){cleanupState='failed';save();throw new Error('QA cleanup cannot verify owned IDs without a connection');}
    cleanupState='complete';save();return;
  }
  for(const [name,ids] of Object.entries(owned).reverse())for(const id of ids){
    if(verifiedAbsent.has(`${name}:${id}`))continue;
    const collection=mongoose.connection.db.collection(name);
    try{assertDatabase(collection,true);await original.deleteOne.call(collection,{_id:new mongoose.Types.ObjectId(id),phase5xOwner:owner,isSynthetic:true});}
    catch(error){errors.push({collection:name,id,error:error.name});}
  }
  const remaining=[];for(const [name,ids] of Object.entries(owned)){
    try{
      if(await mongoose.connection.db.collection(name).countDocuments({_id:{$in:ids.map(id=>new mongoose.Types.ObjectId(id))}}))remaining.push(name);
      else for(const id of ids)verifiedAbsent.add(`${name}:${id}`);
    }
    catch(error){errors.push({collection:name,error:error.name});remaining.push(name);}
  }
  cleanupState=remaining.length || errors.length?'failed':'complete';
  fs.writeFileSync(manifest,JSON.stringify({...receipt(),cleanupRemaining:remaining,cleanupErrors:errors},null,2));if(remaining.length || errors.length || rejected.length)throw new Error('QA cleanup or ownership safety check failed');
}
function configureSafety(options){
  if(safetyConfigured || runtimeVerification || pendingWrites || Object.values(owned).some(ids=>ids.length))throw new Error('QA safety scope must be configured once before verification or fixtures');
  if(options.collections){if(!Array.isArray(options.collections)||!options.collections.length||options.collections.some(name=>!/^[a-z][a-z0-9_]*$/.test(name)))throw new Error('Invalid reviewed collection scope');allowedCollections=new Set(options.collections);}
  readOnly=options.readOnly===true;ownedReferences=options.ownedReferences===true;safetyConfigured=true;save();
}
module.exports={owner,owned,alias,clone,cleanup,track,manifest,verifyRuntime,configureSafety,freeze:()=>{frozen=true;save();},status:()=>({owner,frozen,pendingWrites,readOnly,runtimeVerified,allowedCollections:allowedCollections?[...allowedCollections]:null,ownedReferences,rejected:rejected.length,
  nativeFixtureGuardActive:proto.insertOne===installedInsertOne,dbGuardActive:require('../../src/config/dbGuard').areDestructiveGuardsInstalled(),
  testMode:process.env.MEDISYNC_TEST_MODE==='true',productionUriLoaded:Boolean(process.env.MONGO_URI)})};
