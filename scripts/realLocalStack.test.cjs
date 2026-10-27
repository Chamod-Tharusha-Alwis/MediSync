'use strict';
// Enroll names-only reconciliation/startup negatives in the existing CI root profile.
require('./checkRenderEnvironmentNames.test.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),cp=require('child_process'),path=require('path'),fs=require('fs');
const stack=require('./realLocalStack.cjs');
test('root npm start selects only real orchestrator; mock API is not an execution target',()=>{
  const root=require('../package.json');assert.equal(root.scripts.start,'node scripts/startLocalDev.js');assert.equal(root.scripts['start:mock'],undefined);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname,'realLocalStack.cjs'),'utf8'),/standaloneMockServer|startLocalDev.*mock/i);
});
test('Atlas access requires separate approval before reading credentials',()=>{
  let reads=0;const env={};Object.defineProperty(env,'MONGO_URI_TEST',{get(){reads++;throw Error('SECRET');}});
  assert.throws(()=>stack.authorize(env),/ATLAS_AUTHORIZATION_REQUIRED/);assert.equal(reads,0);
});
test('production material rejected even with local approval flag',()=>{
  assert.throws(()=>stack.authorize({MEDISYNC_LOCAL_ATLAS_APPROVED:'true',MONGO_URI:'never-read'}),/PRODUCTION_MATERIAL_FORBIDDEN/);
});
test('real QA admits only explicit restricted Atlas database and rejects local/production selection',()=>{
  const base={MEDISYNC_LOCAL_ATLAS_APPROVED:'true',MEDISYNC_QA_CREDENTIALS_ROTATED:'true',ENCRYPTION_KEY:'synthetic-key'};
  for(const uri of ['mongodb://127.0.0.1/test','mongodb+srv://qa:inert@cluster.mongodb.net/test','mongodb+srv://qa:inert@cluster.p7hjket.mongodb.net/medisync_automated_test'])assert.throws(()=>stack.authorize({...base,MONGO_URI_TEST:uri}));
  assert.equal(stack.authorize({...base,MONGO_URI_TEST:'mongodb+srv://qa:inert@qa-project-medisync.gwprp27.mongodb.net/medisync_automated_test'}).ENCRYPTION_KEY,'synthetic-key');
  assert.throws(()=>stack.authorize({...base,MONGO_URI_TEST:'mongodb+srv://qa:inert@other.mongodb.net/medisync_automated_test'}),/QA_EXISTING_CLUSTER_AND_DATABASE_REQUIRED/);
  assert.throws(()=>stack.authorize({...base,MEDISYNC_QA_CREDENTIALS_ROTATED:undefined,MONGO_URI_TEST:'mongodb+srv://qa:inert@qa-project-medisync.gwprp27.mongodb.net/medisync_automated_test'}),/OPERATOR_CREDENTIAL_ROTATION_ATTESTATION_REQUIRED/);
});
test('child environment does not inherit production/provider keys, Node hooks or proxy settings',()=>{
  const clean=stack.cleanEnvironment({PATH:'local',NODE_OPTIONS:'bad',MONGO_URI:'private',RESEND_API_KEY:'private',HTTP_PROXY:'private',REACT_APP_API_URL:'https://production.invalid'});
  assert.deepEqual(clean,{PATH:'local'});
  assert.equal(require('../client/scripts/localQaPublicEnvironment.cjs')('').raw.REACT_APP_API_URL,'/api');
});
test('the real backend adapter accepts the same rotated restricted-Atlas contract as its connection guard',()=>{
  const env={NODE_ENV:'test',MEDISYNC_TEST_MODE:'true',MEDISYNC_QA_BOOTSTRAPPED:'true',MEDISYNC_QA_CREDENTIALS_ROTATED:'true',MEDISYNC_LOCAL_REAL_STACK:'true',MEDISYNC_LOCAL_ATLAS_APPROVED:'true',PORT:'5100',CLIENT_URL:'http://127.0.0.1:3100',ML_ENGINE_URL:'http://127.0.0.1:5101',REDIS_URL:'redis://127.0.0.1:6379/15',VAULT_TOKEN:'bypass',MONGO_URI_TEST:'mongodb+srv://qa:inert@qa-project-medisync.gwprp27.mongodb.net/medisync_automated_test',ENCRYPTION_KEY:'inert',JWT_SECRET:'inert',JWT_REFRESH_SECRET:'inert',INTERNAL_API_KEY:'inert'};
  assert.doesNotThrow(()=>require('../server/scripts/localRealPolicy.cjs').assertLocalRealBackend(env));
  assert.doesNotThrow(()=>require('../server/src/security/qaConnectionAdmission').assertQaConnectionConfiguration(env));
  assert.throws(()=>require('../server/scripts/localRealPolicy.cjs').assertLocalRealBackend({...env,MEDISYNC_QA_CREDENTIALS_ROTATED:undefined}),/LOCAL_RESTRICTED_RUNTIME_CONTRACT_REQUIRED/);
});
test('Redis discovery uses only existing named container and reports broad port publishing',()=>{
  const redis=stack.inspectRedis((command,args)=>{assert.equal(command,'docker');assert.deepEqual(args,['inspect','--format','{{json .NetworkSettings.Ports}}','medisync-redis']);return '{"6379/tcp":[{"HostPort":"6379","HostIp":"0.0.0.0"}]}';});
  assert.equal(redis.publicBinding,true);assert.throws(()=>stack.inspectRedis(()=>{throw Error();}),/UNAVAILABLE/);
});

test('Redis containment refuses wildcard bindings and accepts inspected loopback-only publishing',()=>{
  assert.throws(()=>stack.assertRedisContainment({container:'medisync-redis',port:6379,publicBinding:true}),/REDIS_LOOPBACK_BINDING_REQUIRED/);
  assert.throws(()=>stack.assertRedisContainment(null),/REDIS_LOOPBACK_BINDING_REQUIRED/);
  assert.doesNotThrow(()=>stack.assertRedisContainment({container:'medisync-redis',port:6379,publicBinding:false}));
});

test('actual launcher stops before Redis contact or child startup on exposed publishing',async()=>{
  const vm=require('vm'),mod={exports:{}},contacts=[];
  const builtins={fs,path,net:{connect(){contacts.push('redis');throw Error('NETWORK_FORBIDDEN');}},http:{},crypto:require('crypto'),child_process:{
    execFileSync(){return '{"6379/tcp":[{"HostPort":"6379","HostIp":"0.0.0.0"}]}';},
    spawn(){contacts.push('child');throw Error('CHILD_FORBIDDEN');}
  }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'realLocalStack.cjs'),'utf8'),{
    require(name){if(!Object.hasOwn(builtins,name))throw Error('IMPORT_FORBIDDEN');return builtins[name];},
    module:mod,__dirname,process:{versions:{node:'24.19.0'}},console:{log(){}},setTimeout,clearTimeout
  });
  await assert.rejects(mod.exports.main({},[]),/REDIS_LOOPBACK_BINDING_REQUIRED/);
  assert.deepEqual(contacts,[]);
});
test('startup waiting stops immediately if the owned lifecycle is no longer alive',async()=>{
  let probes=0;await assert.rejects(stack.waitFor(()=>{probes++;},()=>false,1000),/STARTUP_FAILED/);assert.equal(probes,0);
});
test('actual CRA API proxy preserves backend /api namespace over real loopback HTTP',async()=>{
  const express=require('../client/node_modules/express'),http=require('http');
  const api=express();api.get('/api/contract-probe',(_req,res)=>res.json({path:'/api/contract-probe'}));
  const backend=api.listen(0,'127.0.0.1');await new Promise(r=>backend.once('listening',r));
  const frontend=express(),original={...process.env};
  process.env.REACT_APP_MEDISYNC_QA='false';process.env.REACT_APP_PROXY_TARGET='http://127.0.0.1:'+backend.address().port;
  require('../client/src/setupProxy')(frontend);process.env=original;
  const web=frontend.listen(0,'127.0.0.1');await new Promise(r=>web.once('listening',r));
  try{const result=await new Promise((resolve,reject)=>{http.get('http://127.0.0.1:'+web.address().port+'/api/contract-probe',res=>{let text='';res.on('data',x=>text+=x);res.on('end',()=>resolve({status:res.statusCode,text}));}).on('error',reject);});assert.equal(result.status,200);assert.equal(JSON.parse(result.text).path,'/api/contract-probe');}
  finally{backend.closeAllConnections();web.closeAllConnections();await Promise.all([new Promise(r=>backend.close(r)),new Promise(r=>web.close(r))]);}
});
test('shutdown gracefully stops only an owned IPC child and leaves unrelated child alive',async()=>{
  const own=cp.spawn(process.execPath,['-e',"process.on('message',m=>{if(m.type==='medisync-local-stop')process.exit(0)});process.send('ready');setInterval(()=>{},1000)"],{windowsHide:true,stdio:['ignore','ignore','ignore','ipc']});
  const unrelated=cp.spawn(process.execPath,['-e',"setInterval(()=>{},1000)"],{windowsHide:true,stdio:'ignore'});
  try{await new Promise((r,j)=>{own.once('message',r);own.once('error',j);});await stack.stopChildren([own],1000);assert.equal(own.exitCode,0);assert.equal(unrelated.exitCode,null);}
  finally{if(own.exitCode===null)own.kill();unrelated.kill();await new Promise(r=>unrelated.once('exit',r));}
});
test('non-IPC shutdown removes an owned interpreter-launcher tree, including its child',async()=>{
  const code="const p=require('child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log(p.pid);setInterval(()=>{},1000)";
  const own=cp.spawn(process.execPath,['-e',code],{windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','ignore']});
  const grandchild=await new Promise((resolve,reject)=>{own.stdout.once('data',x=>resolve(Number(String(x).trim())));own.once('error',reject);});
  assert.ok(Number.isSafeInteger(grandchild));
  try{await stack.stopChildren([own],1000);await stack.waitFor(async()=>{try{process.kill(grandchild,0);throw Error('ALIVE');}catch(error){if(error.code==='ESRCH')return;throw error;}},()=>true,3000);}
  finally{try{process.kill(grandchild);}catch(_){}if(own.exitCode===null&&own.signalCode===null)own.kill();}
});
