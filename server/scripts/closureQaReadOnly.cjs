'use strict';
// Prepared for a separately approved read-only Atlas attempt. Never loads dotenv,
// models, providers, application startup, fixtures or a production connection.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'../..'),DB='medisync_automated_test';
const BASELINE='scratch/phase5w-evidence/database-before.json';
const BASELINE_HASH='7bb653951dcb7127f81670c52c805527c9d5814683736b5e09df3269e951aeaa';
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function canonical(value){
  if(value===null||typeof value!=='object')return value;
  if(value instanceof Date)return {$date:value.toISOString()};
  if(value._bsontype==='ObjectId')return {$oid:String(value)};
  if(Array.isArray(value))return value.map(canonical);
  return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
}
function installReadOnlyGuard(driver){
  const deny=()=>{throw Error('QA_PREFLIGHT_WRITE_OR_DDL_FORBIDDEN');};
  for(const name of ['insertOne','insertMany','updateOne','updateMany','replaceOne','deleteOne','deleteMany','bulkWrite','findOneAndUpdate','findOneAndReplace','findOneAndDelete','drop','rename','createIndex','createIndexes','dropIndex','dropIndexes','initializeOrderedBulkOp','initializeUnorderedBulkOp','aggregate','mapReduce','createSearchIndex','createSearchIndexes','updateSearchIndex','dropSearchIndex'])driver.Collection.prototype[name]=deny;
  for(const name of ['createCollection','dropCollection','dropDatabase','renameCollection','createIndex','dropIndex','executeDbAdminCommand','aggregate','admin','addUser','removeUser'])driver.Db.prototype[name]=deny;
  driver.MongoClient.prototype.bulkWrite=deny;
  const command=driver.Db.prototype.command,db=driver.MongoClient.prototype.db;
  driver.Db.prototype.command=function(document,...args){
    if(this.databaseName!==DB||!document||(document.$db!==undefined&&document.$db!==DB)||Object.keys(document).some(key=>!['connectionStatus','showPrivileges','ping','find','filter','projection','sort','limit','batchSize','getMore','collection','listCollections','nameOnly','listIndexes','cursor','killCursors','cursors','comment','maxTimeMS','readConcern','$db'].includes(key)))throw Error('QA_PREFLIGHT_COMMAND_FORBIDDEN');
    return command.call(this,document,...args);
  };
  driver.MongoClient.prototype.db=function(name,...args){const result=db.call(this,name,...args);if(result.databaseName!==DB)throw Error('QA_PREFLIGHT_DATABASE_FORBIDDEN');return result;};
}
function compare(before,after){
  const changed=[],missing=[],added=[];
  for(const [collection,rows]of Object.entries(before.collections))for(const [id,doc]of Object.entries(rows.documents)){
    const current=after.collections[collection]?.documents[id];
    if(!current)missing.push({collection,id});else if(current.hash!==doc.hash)changed.push({collection,id});
  }
  for(const [collection,rows]of Object.entries(after.collections))for(const id of Object.keys(rows.documents))if(!before.collections[collection]?.documents[id])added.push({collection,id});
  return {changed,missing,added};
}
function plan(){
  const bytes=fs.readFileSync(path.join(ROOT,BASELINE));if(sha(bytes)!==BASELINE_HASH)throw Error('QA_PREFLIGHT_BASELINE_HASH_CHANGED');
  const baseline=JSON.parse(bytes);let university=0,operational=0;
  for(const rows of Object.values(baseline.collections))for(const row of Object.values(rows.documents))row.baseline?university++:operational++;
  if(baseline.database!==DB||university!==74803||operational!==48)throw Error('QA_PREFLIGHT_BASELINE_CONTRACT_CHANGED');
  return {database:DB,role:'readWrite@'+DB,baseline:BASELINE,baselineSha256:BASELINE_HASH,university,operational,readsOnly:true,atlasContacted:false};
}
async function snapshot(db){
  const collections={},references=[],residuals=[];
  const refs={consultations:{patientId:'patients',doctorId:'doctors',sessionHospitalId:'hospitals'},prescriptions:{patientId:'patients',doctorId:'doctors',hospitalId:'hospitals',consultationId:'consultations'},dispensings:{prescriptionId:'prescriptions',pharmacyId:'pharmacies',staffId:'pharmacystaffs'},labtests:{patientId:'patients',consultationId:'consultations',referredBy:'doctors',hospitalId:'hospitals'},pharmacystaffs:{pharmacyId:'pharmacies'}};
  for(const {name,options}of await db.listCollections({}, {nameOnly:false}).toArray()){
    if(name.startsWith('system.'))continue;const documents={};let baselineCount=0;
    for await(const doc of db.collection(name).find({}).sort({_id:1})){
      const baseline=doc.datasetVersion==='MEDISYNC_UNIV_DEMO_V2';if(baseline)baselineCount++;
      documents[String(doc._id)]={hash:sha(JSON.stringify(canonical(doc))),baseline};
      if(doc.phase5xOwner||doc.phase5xBrowserOwner||/^(5x-|5wb-|IR04_QA_|LAB-SUITE-)/.test(String(doc.testRunId||'')))residuals.push({collection:name,id:String(doc._id)});
      if(baseline){for(const [field,target]of Object.entries(refs[name]||{}))if(doc[field]?._bsontype==='ObjectId')references.push({source:name,id:String(doc._id),field,target,targetId:String(doc[field])});if(name==='doctors')for(const id of doc.hospitals||[])references.push({source:name,id:String(doc._id),field:'hospitals',target:'hospitals',targetId:String(id)});}
    }
    const indexes=(await db.collection(name).listIndexes().toArray()).map(index=>({name:index.name,key:index.key,unique:index.unique===true,expireAfterSeconds:index.expireAfterSeconds})).sort((a,b)=>a.name.localeCompare(b.name));
    collections[name]={baselineCount,documents,capped:options?.capped===true,indexes};
  }
  const university=Object.values(collections).reduce((n,c)=>n+c.baselineCount,0),total=Object.values(collections).reduce((n,c)=>n+Object.keys(c.documents).length,0);
  const brokenReferences=references.filter(r=>!collections[r.target]?.documents[r.targetId]);
  return {at:new Date().toISOString(),database:db.databaseName,collections,university,operational:total-university,brokenReferences,residuals};
}
async function main(state={}){
  state.stage='PLAN';
  const prepared=plan();if(process.argv.includes('--plan')){console.log(JSON.stringify(prepared));return;}
  state.stage='APPROVAL';
  if(process.env.MEDISYNC_CLOSURE_READONLY_APPROVED!=='true'||process.env.NODE_ENV!=='test'||process.env.MEDISYNC_TEST_MODE!=='true')throw Error('QA_PREFLIGHT_SEPARATE_READONLY_APPROVAL_REQUIRED');
  state.stage='QA_CONFIGURATION';
  require('../src/security/qaConnectionAdmission').assertQaConnectionConfiguration(process.env);
  state.stage='DRIVER_GUARD';
  const mongoose=require('mongoose');installReadOnlyGuard(mongoose.mongo);mongoose.set('autoCreate',false);mongoose.set('autoIndex',false);
  state.stage='RECEIPT_DIRECTORY';
  const out=fs.mkdtempSync(path.join(ROOT,'scratch/closure-qa-readonly-'));
  const receipt={at:new Date().toISOString(),prepared,nativeReadOnlyGuard:true,mutationsAllowed:false};
  try{
    state.stage='DATABASE_ATTEMPT';state.connectionStarted=true;
    const proof=await require('../src/config/dbGuard').connectAutomatedTestDB();receipt.runtime={database:proof.dbName,roles:proof.authenticatedRoles,authenticatedUsers:proof.authenticatedUserCount};
    const original=JSON.parse(fs.readFileSync(path.join(ROOT,BASELINE))),before=await snapshot(mongoose.connection.db),after=await snapshot(mongoose.connection.db);
    fs.writeFileSync(path.join(out,'before.json'),JSON.stringify(before));fs.writeFileSync(path.join(out,'after.json'),JSON.stringify(after));
    receipt.originalComparison=compare(original,before);receipt.windowComparison=compare(before,after);
    receipt.counts={university:after.university,operational:after.operational};receipt.brokenReferences=after.brokenReferences;receipt.residuals=after.residuals;
    receipt.emptyAuditCollection=after.collections.phase5x_audit_qa?Object.keys(after.collections.phase5x_audit_qa.documents).length===0:false;
    receipt.newCollectionNames=Object.keys(after.collections).filter(name=>!original.collections[name]);
    receipt.transactionCollectionExists=!!after.collections.clinicalcommands;
    const schema=snapshot=>canonical(Object.fromEntries(Object.entries(snapshot.collections).map(([name,row])=>[name,{capped:row.capped,indexes:row.indexes}])));
    receipt.windowSchemaUnchanged=JSON.stringify(schema(before))===JSON.stringify(schema(after));
    receipt.missingOriginalCollections=Object.keys(original.collections).filter(name=>!after.collections[name]);
    const diffOk=[receipt.originalComparison,receipt.windowComparison].every(diff=>!diff.changed.length&&!diff.missing.length&&!diff.added.length);
    receipt.status=diffOk&&after.university===74803&&after.operational===48&&!after.brokenReferences.length&&!after.residuals.length&&receipt.emptyAuditCollection&&receipt.windowSchemaUnchanged&&!receipt.missingOriginalCollections.length&&receipt.newCollectionNames.every(name=>name==='phase5x_audit_qa')?'PASS':'FAIL';
    console.log(JSON.stringify({status:receipt.status,database:proof.dbName,roles:proof.authenticatedRoles,counts:receipt.counts,receiptDirectory:path.relative(ROOT,out)}));
    if(receipt.status!=='PASS')process.exitCode=1;
  }catch(error){receipt.status='FAIL';receipt.failureClass=error.name;console.error('QA_PREFLIGHT_STOPPED_WITHOUT_CLEANUP');process.exitCode=1;}
  finally{await mongoose.disconnect();fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2));}
}
if(require.main===module){const state={connectionStarted:false};main(state).catch(error=>{const receipt=require('./qaReadOnlyAdmissionDiagnostics.cjs').recordAdmissionFailure(error,state,{fs,root:ROOT});console.error(receipt.event);console.error(JSON.stringify(receipt));process.exitCode=1;});}
module.exports={plan,canonical,compare,installReadOnlyGuard,snapshot,main};
