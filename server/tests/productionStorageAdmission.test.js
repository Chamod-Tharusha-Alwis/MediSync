'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const {verifyProductionStorage,manifest}=require('../src/security/productionStorageAdmission');
const root=path.resolve(__dirname,'../..'),copy=v=>JSON.parse(JSON.stringify(v));
const env=()=>({NODE_ENV:'production',MEDISYNC_LIVE_START_APPROVED:'true',MEDISYNC_ATLAS_ROTATION_CONFIRMED:'true',MONGO_URI:'mongodb+srv://offline:fictional@medisync.p7hjket.mongodb.net/medisync_prod?retryWrites=true&w=majority&authSource=admin'});
const required=manifest.collections.filter(c=>!c.whenAll);
function fake(){
 const calls=[],collections=new Map(manifest.collections.map(spec=>[spec.name,{rows:[{name:spec.name,type:'collection',options:{...(spec.capped?{capped:true,...spec.capped}:{}),...(spec.validator?{validator:copy(spec.validator)}:{})}}],indexes:copy(spec.indexes)}]));
 const cursor=(rows,label)=>({toArray:async()=>{calls.push(label);return copy(rows);},close:async()=>calls.push('close:'+label)});
 const state={calls,collections,hello:{isWritablePrimary:true,setName:'offline-replica',logicalSessionTimeoutMinutes:30,maxWireVersion:17},roles:[{role:'readWrite',db:'medisync_prod'}]};
 const db={databaseName:'medisync_prod',command:jest.fn(async command=>{calls.push(command.hello?'hello':'identity');if(command.hello)return state.hello;if(command.connectionStatus)return{authInfo:{authenticatedUsers:[{}],authenticatedUserRoles:state.roles}};throw Error('COMMAND_FORBIDDEN');}),
 listCollections:jest.fn(({name},options)=>{expect(options).toMatchObject({nameOnly:false,authorizedCollections:false,maxTimeMS:5000});return cursor(collections.get(name)?.rows||[],name);}),
 collection:jest.fn(name=>({listIndexes:jest.fn(options=>{expect(options.maxTimeMS).toBe(5000);return cursor(collections.get(name)?.indexes||[],'indexes:'+name);})}))};
 state.db=db;return state;
}
function candidate(state=fake(),environment=env()){
 class Connection{};class Db{};class Collection{};
 const driverCalls=[];
 const mongoose={models:{},plugin:jest.fn(),set:jest.fn(),Connection,Model:{deleteMany(){}},mongo:{Db,Collection},connection:{db:state.db},
 connect:async(uri,options)=>{driverCalls.push(options);},disconnect:jest.fn(async()=>{})};
 const mod={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'docs/temp/CODEX_PRODUCTION_STORAGE_GUARD_R2_FOR_APPROVAL.candidate.js'),'utf8'),{module:mod,process:{env:environment},require(name){
  if(name==='mongoose')return mongoose;if(name==='crypto')return crypto;
  if(name==='mongodb-connection-string-url')return require(name);
  if(name==='../security/productionAtlasPolicy')return require('../src/security/productionAtlasPolicy');
  if(name==='../security/productionStorageAdmission')return require('../src/security/productionStorageAdmission');
  throw Error('CANDIDATE_IMPORT_FORBIDDEN');
 }});
 return{...state,guard:mod.exports,mongoose,driverCalls};
}
test('explicit manifest covers every actual model and plugin index without any connection',()=>{
 const mongoose=require('mongoose');mongoose.set('autoCreate',false);mongoose.set('autoIndex',false);
 const files=fs.readdirSync(path.join(root,'server/src/models')).filter(f=>f.endsWith('.js')).sort();
 expect(manifest.collections.filter(c=>c.model).map(c=>path.basename(c.source)).sort()).toEqual(files);
 for(const file of files){
  const model=require(path.join(root,'server/src/models',file)),spec=manifest.collections.find(c=>c.model===model.modelName);
  expect(spec.name).toBe(model.collection.name);expect(spec.capped).toEqual(model.schema.options.capped||false);
  const declared=model.schema.indexes().map(([key,opts])=>({name:opts.name||Object.entries(key).map(([k,v])=>k+'_'+v).join('_'),key,unique:opts.unique===true,sparse:opts.sparse===true,...(opts.expireAfterSeconds!==undefined?{expireAfterSeconds:opts.expireAfterSeconds}:{})}));
  expect(spec.indexes.slice(1)).toEqual(declared);
 }
 expect(mongoose.connection.readyState).toBe(0);expect(required).toHaveLength(28);
});
test('valid metadata admits only after exact identity, topology and all required metadata',async()=>{
 const c=candidate(),result=await c.guard.connectProductionDB();
 expect(result).toMatchObject({dbName:'medisync_prod',verifiedCollections:28,verifiedRequiredIndexes:65,transactionTopologyVerified:true,authenticatedRoles:[{role:'readWrite',db:'medisync_prod'}]});
 expect(c.driverCalls[0]).toMatchObject({tls:true,autoIndex:false,autoCreate:false,writeConcern:{w:'majority'},readPreference:'primary'});
 expect(c.calls.slice(0,2)).toEqual(['identity','hello']);expect(c.mongoose.disconnect).not.toHaveBeenCalled();
});
test.each(required.map(c=>[c.name]))('candidate rejects absent collection %s and disconnects',async name=>{
 const f=fake();f.collections.delete(name);const c=candidate(f);
 await expect(c.guard.connectProductionDB()).rejects.toThrow('storage prerequisites');expect(c.mongoose.disconnect).toHaveBeenCalledTimes(1);
});
test.each(required.flatMap(c=>c.indexes.map(i=>[c.name,i.name])))('candidate rejects absent required index %s/%s',async(name,index)=>{
 const f=fake(),row=f.collections.get(name);row.indexes=row.indexes.filter(i=>i.name!==index);const c=candidate(f);
 await expect(c.guard.connectProductionDB()).rejects.toThrow('storage prerequisites');expect(c.mongoose.disconnect).toHaveBeenCalledTimes(1);
});
test.each([
 ['nonunique identity',f=>f.collections.get('patients').indexes.find(i=>i.name==='nic_1').unique=false],
 ['unexpected sparse identity',f=>f.collections.get('patients').indexes.find(i=>i.name==='email_1').sparse=true],
 ['lost sparse contract',f=>f.collections.get('labtests').indexes.find(i=>i.name==='reportId_1').sparse=false],
 ['partial unique identity',f=>f.collections.get('patients').indexes[1].partialFilterExpression={isActive:true}],
 ['different collation',f=>f.collections.get('patients').indexes[1].collation={locale:'en',strength:2}],
 ['hidden index',f=>f.collections.get('patients').indexes[1].hidden=true],
 ['unfinished index',f=>f.collections.get('patients').indexes[1].buildUUID='offline'],
 ['unready index',f=>f.collections.get('patients').indexes[1].ready=false],
 ['prepared uniqueness',f=>f.collections.get('patients').indexes[1].prepareUnique=true],
 ['malformed uniqueness',f=>f.collections.get('patients').indexes[1].unique='true'],
 ['key direction mismatch',f=>f.collections.get('patients').indexes[1].key={nic:-1}],
 ['compound key order mismatch',f=>f.collections.get('trusteddevices').indexes[2].key={deviceFingerprint:1,userId:1}],
 ['primary sparse',f=>f.collections.get('clinicalcommands').indexes[0].sparse=true],
 ['primary nonunique',f=>f.collections.get('clinicalcommands').indexes[0].unique=false],
 ['wrong primary name',f=>f.collections.get('clinicalcommands').indexes[0].name='fake'],
 ['missing TTL',f=>delete f.collections.get('otpsessions').indexes[1].expireAfterSeconds],
 ['wrong TTL',f=>f.collections.get('otpsessions').indexes[1].expireAfterSeconds=60],
 ['journal TTL',f=>f.collections.get('clinicalcommands').indexes.push({name:'expiry',key:{createdAt:1},expireAfterSeconds:60})],
 ['extra unique constraint',f=>f.collections.get('patients').indexes.push({name:'unexpected',key:{fullName:1},unique:true})],
 ['duplicate key patterns',f=>f.collections.get('patients').indexes.push({...f.collections.get('patients').indexes[1],name:'second_nic'})],
 ['capped journal',f=>f.collections.get('clinicalcommands').rows[0].options.capped=true],
 ['view instead of journal',f=>f.collections.get('clinicalcommands').rows[0].type='view'],
 ['timeseries',f=>f.collections.get('clinicalcommands').rows[0].options.timeseries={timeField:'createdAt'}],
 ['clustered collection',f=>f.collections.get('clinicalcommands').rows[0].options.clusteredIndex={key:{_id:1}}],
 ['collection expiry',f=>f.collections.get('clinicalcommands').rows[0].options.expireAfterSeconds=60],
 ['wrong collection name',f=>f.collections.get('clinicalcommands').rows[0].name='other'],
 ['unreviewed validator',f=>f.collections.get('patients').rows[0].options.validator={active:true}],
 ['collection collation',f=>f.collections.get('patients').rows[0].options.collation={locale:'en'}],
 ['audit retention mismatch',f=>f.collections.get('auditlogs').rows[0].options.max=10],
 ['uncapped audit schema mismatch',f=>delete f.collections.get('auditlogs').rows[0].options.capped]
])('candidate rejects incompatible %s without proceeding',async(_,change)=>{
 const f=fake();change(f);const c=candidate(f);await expect(c.guard.connectProductionDB()).rejects.toThrow('storage prerequisites');expect(c.mongoose.disconnect).toHaveBeenCalledTimes(1);
});
test.each([
 ['listCollections denied',f=>f.db.listCollections.mockImplementation(()=>{throw Error('secret driver details');})],
 ['index metadata denied',f=>f.db.collection.mockImplementation(()=>({listIndexes:()=>{throw Error('secret driver details');}}))],
 ['metadata cursor rejects',f=>f.db.listCollections.mockImplementation(()=>({toArray:async()=>{throw Error('secret driver details');},close:jest.fn()}))],
 ['cursor close rejects',f=>f.db.listCollections.mockImplementation(()=>({toArray:async()=>[],close:async()=>{throw Error('secret driver details');}}))],
 ['hello denied',f=>f.db.command.mockImplementation(async command=>{if(command.hello)throw Error('secret driver details');return{authInfo:{authenticatedUsers:[{}],authenticatedUserRoles:f.roles}};})],
 ['missing transaction sessions',f=>delete f.hello.logicalSessionTimeoutMinutes],
 ['standalone topology',f=>delete f.hello.setName],
 ['not writable primary',f=>f.hello.isWritablePrimary=false],
 ['missing wire version',f=>delete f.hello.maxWireVersion],
 ['obsolete wire version',f=>f.hello.maxWireVersion=6]
])('candidate fails closed for %s',async(_,change)=>{
 const f=fake();change(f);const c=candidate(f);await expect(c.guard.connectProductionDB()).rejects.toThrow('storage prerequisites');expect(c.mongoose.disconnect).toHaveBeenCalledTimes(1);
});
test('extra ordinary performance index and implicit primary uniqueness are permitted',async()=>{
 const f=fake();delete f.collections.get('clinicalcommands').indexes[0].unique;f.collections.get('patients').indexes.push({name:'performance',key:{fullName:1}});
 await expect(verifyProductionStorage(f.db,env())).resolves.toMatchObject({verifiedCollections:28});
});
test('active reminder feature requires reviewed durable journal and validator',async()=>{
 const environment={...env(),MEDISYNC_BACKGROUND_JOBS_APPROVED:'true',MEDISYNC_REMINDER_DISPATCH_APPROVED:'true'};
 await expect(verifyProductionStorage(fake().db,environment)).resolves.toMatchObject({verifiedCollections:29,verifiedRequiredIndexes:66});
 const f=fake();f.collections.delete('reminderdispatches');await expect(verifyProductionStorage(f.db,environment)).rejects.toThrow('PREREQUISITES');
 const bad=fake();bad.collections.get('reminderdispatches').rows[0].options.validationAction='warn';await expect(verifyProductionStorage(bad.db,environment)).rejects.toThrow('PREREQUISITES');
});
test('disabled reminder feature does not request or provision its journal',async()=>{
 const f=fake();f.collections.delete('reminderdispatches');await verifyProductionStorage(f.db,env());expect(f.calls).not.toContain('reminderdispatches');
});
test.each(['MONGO_URI_TEST','SEED_TEST_PASSWORD'])('QA material %s remains denied before driver dispatch',async key=>{
 const c=candidate(fake(),{...env(),[key]:'fictional'});await expect(c.guard.connectProductionDB()).rejects.toThrow();expect(c.driverCalls).toHaveLength(0);
});
test.each(['tls=false','tlsInsecure=true','tlsAllowInvalidCertificates=true','tlsAllowInvalidHostnames=true'])('candidate retains TLS denial for %s',async option=>{
 const environment=env();environment.MONGO_URI+='&'+option;const c=candidate(fake(),environment);await expect(c.guard.connectProductionDB()).rejects.toThrow();expect(c.driverCalls).toHaveLength(0);
});
test.each(['mongodb+srv://offline:fictional@other.mongodb.net/medisync_prod','mongodb+srv://offline:fictional@p7hjket.mongodb.net/test','mongodb+srv://offline:fictional@p7hjket.mongodb.net/medisync_automated_test'])('candidate retains cluster/database pin %#',async uri=>{
 const c=candidate(fake(),{...env(),MONGO_URI:uri});await expect(c.guard.connectProductionDB()).rejects.toThrow();expect(c.driverCalls).toHaveLength(0);
});
test('extra authenticated role denies before metadata and disconnects',async()=>{
 const f=fake();f.roles.push({role:'readAnyDatabase',db:'admin'});const c=candidate(f);await expect(c.guard.connectProductionDB()).rejects.toThrow();expect(c.calls).toEqual(['identity']);expect(c.mongoose.disconnect).toHaveBeenCalledTimes(1);
});
test('shutdown failure never returns an admitted connection',async()=>{
 const f=fake();f.collections.delete('patients');const c=candidate(f);c.mongoose.disconnect.mockRejectedValue(Error('sensitive driver details'));
 await expect(c.guard.connectProductionDB()).rejects.toThrow('connection shutdown failed');
});
test('connection rejection is disconnected and sanitized',async()=>{
 const c=candidate();c.mongoose.connect=async()=>{throw Error('sensitive uri');};await expect(c.guard.connectProductionDB()).rejects.toThrow('identity or storage prerequisites');expect(c.mongoose.disconnect).toHaveBeenCalledTimes(1);
});
async function actualStartup(c){
 const calls=[];const environment={...env(),VAULT_TOKEN:'offline-token',ENCRYPTION_KEY:'offline-key'};
 const processMock={env:environment,exit:()=>{throw Error('STARTUP_STOPPED');}};
 const dbModule={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'server/src/config/db.js'),'utf8'),{module:dbModule,process:processMock,console:{log(){},error(){}},require(name){if(name==='./dbGuard')return c.guard;throw Error('UNEXPECTED_DB_IMPORT');}});
 const mod={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'server/src/app.js'),'utf8'),{module:mod,process:processMock,global:{},console:{log(){},error(){}},setInterval:()=>calls.push('timer'),require(name){
  if(name==='./security/clinicalEntryPolicy')return{assertClinicalEntry(){}};
  if(name==='dotenv')return{config(){}};
  if(name==='node-vault')return()=>({read:async()=>({data:{data:{versions:{1:'offline-key'},activeVersion:1}}})});
  if(name==='./security/clientOriginPolicy')return{clientOrigin:()=> 'https://offline.invalid'};
  if(name==='./security/securityRuntime')return{initialize(){},assertProtectedCompatibility(){}};
  if(name==='./config/dbGuard')return c.guard;if(name==='./config/db')return dbModule.exports;
  if(name==='./utils/cronJobs')return()=>calls.push('cron');
  if(name.startsWith('./models/')||name==='./utils/versionedEncryption'||name==='./controllers/doctorController')return{};
  if(name==='express')return()=>{calls.push('express');throw Error('AFTER_ADMISSION');};
  if(name==='http')return{createServer:()=>calls.push('http')};
  if(name==='socket.io')return{Server:function(){calls.push('socket');}};
  if(['helmet','cors','cookie-parser','express-rate-limit','express-mongo-sanitize'].includes(name))return()=>{};
  calls.push(name);throw Error('POST_ADMISSION_IMPORT');
 }});
 await expect(mod.exports.startServer()).rejects.toThrow('STARTUP_STOPPED');expect(calls).toEqual([]);expect(c.mongoose.disconnect).toHaveBeenCalledTimes(1);
}
test.each(['collection','index','metadata'])('actual app startup stops before Redis, cron, HTTP, sockets and provider operations on %s failure',async mode=>{
 const f=fake();if(mode==='collection')f.collections.delete('clinicalcommands');if(mode==='index')f.collections.get('patients').indexes=[];if(mode==='metadata')f.db.listCollections.mockImplementation(()=>{throw Error('offline');});await actualStartup(candidate(f));
});
test('exact patch reconstructs only the candidate and binds every dependency while protected target stays original or applied',()=>{
 const proposal=JSON.parse(fs.readFileSync(path.join(root,'docs/temp/CODEX_PRODUCTION_STORAGE_GUARD_R2_FOR_APPROVAL.json'))),sha=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
 const currentTargetSha=sha(proposal.target);
 expect([proposal.originalSha256,proposal.proposedSha256]).toContain(currentTargetSha);
 expect(sha(proposal.patch)).toBe(proposal.patchSha256);expect(sha(proposal.candidate)).toBe(proposal.proposedSha256);for(const dep of proposal.dependencies)expect(sha(dep.file)).toBe(dep.sha256);
 if(currentTargetSha===proposal.originalSha256){
  const original=fs.readFileSync(path.join(root,proposal.target),'utf8').split('\n'),patch=fs.readFileSync(path.join(root,proposal.patch),'utf8').split('\n'),hunk=patch.findIndex(s=>s.startsWith('@@ '));
  expect(patch.filter(s=>s.startsWith('diff --git'))).toHaveLength(1);expect(patch[1]).toBe('--- a/'+proposal.target);expect(patch[2]).toBe('+++ b/'+proposal.target);
  const match=patch[hunk].match(/^@@ -(\d+),(\d+) \+(\d+),(\d+) @@$/),start=Number(match[1])-1;
  let at=start,output=original.slice(0,start);for(const line of patch.slice(hunk+1,-1)){if(line[0]===' '||line[0]==='-'){expect(line.slice(1)).toBe(original[at]);at++;}if(line[0]===' '||line[0]==='+')output.push(line.slice(1));}
  expect(at-start).toBe(Number(match[2]));output.push(...original.slice(at));expect(output.join('\n')).toBe(fs.readFileSync(path.join(root,proposal.candidate),'utf8'));
 } else {
  expect(fs.readFileSync(path.join(root,proposal.target),'utf8')).toBe(fs.readFileSync(path.join(root,proposal.candidate),'utf8'));
 }
});
