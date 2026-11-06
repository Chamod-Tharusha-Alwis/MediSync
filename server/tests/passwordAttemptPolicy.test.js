'use strict';
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),vm=require('vm'),{createRequire}=require('module');
const root=path.resolve(__dirname,'../..');
const policy=require('../src/security/passwordAttemptPolicy');
const account={_id:'111111111111111111111111'};
function store(){
  let clock=0;const rows=new Map(),calls={get:0,increment:0,clear:0,ttls:[]};
  function active(key){const row=rows.get(key);if(row&&row.until<=clock){rows.delete(key);return null;}return rows.get(key);}
  return {calls,advance(ms){clock+=ms;},async getAttempts(key){calls.get++;return active(key)?.count||0;},async incrementAttempts(key,seconds){calls.increment++;calls.ttls.push(seconds);const row=active(key)||{count:0,until:clock+seconds*1000};row.count++;rows.set(key,row);return row.count;},async clearAttempts(key){calls.clear++;rows.delete(key);}};
}
// Load the existing inert controller harness, substituting candidate source and
// only its security-store/guard boundary. No alternate login implementation.
function controller(pharmacy,counters){
  const filename=path.join(root,'server/tests/helpers/loginRequestHarness.js'),module={exports:{}};
  const actualRequire=createRequire(filename),source=fs.readFileSync(filename,'utf8');
  const controllerFile=path.join(root,'server/src/controllers/'+(pharmacy?'pharmacyController.js':'authController.js'));
  vm.runInNewContext(source,{module,exports:module.exports,Buffer,__dirname:path.dirname(filename),require(name){
    if(name==='fs')return {...fs,readFileSync(file,...args){if(String(file).endsWith('/src/controllers/'+(pharmacy?'pharmacyController.js':'authController.js'))||String(file).endsWith('\\src\\controllers\\'+(pharmacy?'pharmacyController.js':'authController.js')))return fs.readFileSync(controllerFile,...args);return fs.readFileSync(file,...args);}};
    if(name==='vm')return {runInNewContext(text,context,...args){const previous=context.require;context.require=id=>id==='../security/passwordAttemptPolicy'?policy.createPasswordAttemptPolicy(counters):id==='../config/redis'?counters:previous(id);return vm.runInNewContext(text,context,...args);}};
    return actualRequire(name);
  }});
  return module.exports.harness(pharmacy);
}
const bad=role=>({email:'owned-login-fixture',password:'inert-wrong-password',role});
for(const role of ['admin','doctor','patient','hospital_admin','pharmacist'])test('candidate real generic controller holds '+role+' after five failures',async()=>{
  const counters=store(),h=controller(false,counters),statuses=[];
  for(let i=0;i<6;i++)statuses.push((await h.invoke(bad(role),'192.0.2.'+(i+1))).status);
  assert.deepEqual(statuses,[401,401,401,401,429,429]);assert.equal(counters.calls.increment,5);assert.deepEqual([...new Set(counters.calls.ttls)],[900]);assert.equal(h.calls.writes,0);
});
test('generic and dedicated pharmacy login share the authoritative-account allowance',async()=>{
  const counters=store(),generic=controller(false,counters),dedicated=controller(true,counters),statuses=[];
  for(let i=0;i<6;i++)statuses.push((await (i%2?dedicated:generic).invoke(bad('pharmacist'))).status);
  assert.deepEqual(statuses,[401,401,401,401,429,429]);assert.equal(counters.calls.increment,5);
});
test('the window starts on the first failure and expires without extending on checks',async()=>{
  const counters=store(),p=policy.createPasswordAttemptPolicy(counters);await p.recordFailure(account,'Patient');counters.advance(120000);
  for(let i=0;i<4;i++)await p.recordFailure(account,'Patient');assert.equal(await p.canAttempt(account,'Patient'),false);
  counters.advance(779999);assert.equal(await p.canAttempt(account,'Patient'),false);counters.advance(1);assert.equal(await p.canAttempt(account,'Patient'),true);
});
test('counters are isolated by authoritative account and collection',async()=>{
  const counters=store(),p=policy.createPasswordAttemptPolicy(counters);for(let i=0;i<5;i++)await p.recordFailure(account,'Patient');
  assert.equal(await p.canAttempt(account,'Doctor'),true);assert.equal(await p.canAttempt({_id:'222222222222222222222222'},'Patient'),true);assert.equal(await p.canAttempt(account,'Patient'),false);
});
test('candidate controllers fail closed with sanitized 503 on security-store failure',async()=>{
  for(const pharmacy of [false,true]){const counters=store();counters.getAttempts=async()=>{throw Error('private-store-sentinel');};const h=controller(pharmacy,counters);const r=await h.invoke(bad(pharmacy?'pharmacist':'patient'));assert.equal(r.status,503);assert.deepEqual(JSON.parse(JSON.stringify(r.result)),{error:'Login security verification unavailable'});assert.equal(h.calls.writes,0);}
});
for(const value of [-1,NaN,1.5,'5',null,Number.MAX_SAFE_INTEGER+1])test('invalid security counter fails closed: '+String(value),async()=>{
  const counters=store();counters.getAttempts=async()=>value;const p=policy.createPasswordAttemptPolicy(counters);await assert.rejects(p.canAttempt(account,'Patient'),{code:'PASSWORD_ATTEMPT_STORE_UNAVAILABLE'});
});
test('one hanging store call is bounded and never retried',async()=>{
  const counters=store();let calls=0;counters.getAttempts=()=>{calls++;return new Promise(()=>{});};const p=policy.createPasswordAttemptPolicy(counters);await assert.rejects(p.canAttempt(account,'Patient'),{code:'PASSWORD_ATTEMPT_STORE_UNAVAILABLE'});assert.equal(calls,1);
});

function successfulGeneric(counters,beforePasswordReturn=null){
  const filename=path.join(root,'server/tests/phase0LoginDiagnostics.test.js'),module={exports:{}};
  let text=fs.readFileSync(filename,'utf8');text=text.slice(0,text.indexOf('function expectFailure'))+'\nmodule.exports={harness,roles};';
  text=text.replace(/^.*'\.\.\/security\/passwordAttemptPolicy': require[^\n]*\n/m,'');
  text=text.replace('const dependencies = {','const dependencies = {\n    "../security/passwordAttemptPolicy": passwordPolicyInstance,');
  text=text.replace('bcryptjs: bcrypt,','bcryptjs: {...bcrypt, compare: async (...args) => { const result=await bcrypt.compare(...args); if(beforePasswordReturn)await beforePasswordReturn(); return result; }},');
  const actualRequire=createRequire(filename);
  vm.runInNewContext(text,{module,exports:module.exports,Buffer,__dirname:path.dirname(filename),beforePasswordReturn,passwordPolicyInstance:policy.createPasswordAttemptPolicy(counters),require(name){
    if(name==='fs')return {...fs,readFileSync(file,...args){if(String(file).endsWith('authController.js'))return fs.readFileSync(path.join(root,'server/src/controllers/authController.js'),...args);return fs.readFileSync(file,...args);}};
    return actualRequire(name);
  }});
  return module.exports;
}
for(const [role,model] of [['admin','Admin'],['doctor','Doctor'],['patient','Patient'],['hospital_admin','Hospital'],['pharmacist','PharmacyStaff']])test('candidate preserves real-crypto successful '+role+' session flow',async()=>{
  const counters=store();await policy.createPasswordAttemptPolicy(counters).recordFailure(account,model);
  const h=successfulGeneric(counters).harness({role,model}),r=await h.invoke();
  assert.equal(r.status,200);assert.equal(h.calls.sessionWrites,1);assert.equal(h.calls.userSaves,1);assert.equal(counters.calls.clear,0);
});
test('a held account cannot use a correct password until its window ends',async()=>{
  const counters=store(),p=policy.createPasswordAttemptPolicy(counters);for(let i=0;i<5;i++)await p.recordFailure(account,'Patient');
  const h=successfulGeneric(counters).harness({role:'patient',model:'Patient'}),r=await h.invoke();assert.equal(r.status,429);assert.equal(h.calls.sessionWrites,0);assert.equal(h.calls.userSaves,0);assert.equal(counters.calls.clear,0);
});
test('dedicated pharmacy preserves real-crypto successful session/cookie flow',async()=>{
  const bcrypt=require(path.join(root,'server/node_modules/bcryptjs')),crypto=require('crypto'),jwt=require(path.join(root,'server/node_modules/jsonwebtoken'));
  const counters=store();await policy.createPasswordAttemptPolicy(counters).recordFailure(account,'PharmacyStaff');const calls={sessions:0,saves:0,cookies:0},module={exports:{}};
  const row={...account,role:'pharmacist',isActive:true,isVerified:true,password:bcrypt.hashSync('inert-owned-correct-password',4),async save(){calls.saves++;}};
  const dependencies={bcryptjs:bcrypt,crypto,jsonwebtoken:jwt,uuid:{v4:()=>crypto.randomUUID()},'../security/loginRequest':require(path.join(root,'server/src/security/loginRequest')),'../security/passwordAttemptPolicy':policy.createPasswordAttemptPolicy(counters),'../models/PharmacyStaff':{findOne(){const p=Promise.resolve(row);p.populate=()=>p;return p;}},'../models/SessionToken':{async create(){calls.sessions++;}},'../models/AuditLog':{async create(){}},'../utils/deviceParser':{parseDeviceModel:()=> 'Inert Device'}};
  const deny=new Proxy({}, {get(){return ()=>{throw Error('UNEXPECTED_OFFLINE_DEPENDENCY');};}});
  vm.runInNewContext(fs.readFileSync(path.join(root,'server/src/controllers/pharmacyController.js'),'utf8'),{module,exports:module.exports,Buffer,Date,process:{env:{NODE_ENV:'production',SKIP_LOGIN_NOTIFICATION:'true',JWT_SECRET:'inert-access-key-only-used-in-this-vm',JWT_REFRESH_SECRET:'inert-refresh-key-only-used-in-this-vm'}},console:{log(){},warn(){},error(){}},require:name=>dependencies[name]||deny});
  let status=200;const res={status(n){status=n;return this;},json(){return this;},cookie(){calls.cookies++;return this;}};
  await module.exports.loginPharmacy({body:{email:'owned-login-fixture',password:'inert-owned-correct-password'},headers:{},ip:'127.0.0.1'},res);
  assert.equal(status,200);assert.equal(calls.sessions,1);assert.equal(calls.saves,1);assert.equal(calls.cookies,1);assert.equal(counters.calls.clear,0);
});

test('a valid login does not erase failures from the active fifteen-minute window',async()=>{
  const counters=store(),failing=controller(false,counters);for(let i=0;i<4;i++)assert.equal((await failing.invoke(bad('patient'))).status,401);
  const h=successfulGeneric(counters).harness({role:'patient',model:'Patient'});assert.equal((await h.invoke()).status,200);
  assert.equal((await failing.invoke(bad('patient'))).status,429);assert.equal(counters.calls.clear,0);
});
test('a fifth failure during password comparison is rechecked before session creation',async()=>{
  const counters=store(),p=policy.createPasswordAttemptPolicy(counters);for(let i=0;i<4;i++)await p.recordFailure(account,'Patient');
  const h=successfulGeneric(counters,()=>p.recordFailure(account,'Patient')).harness({role:'patient',model:'Patient'});const r=await h.invoke();assert.equal(r.status,429);assert.equal(h.calls.sessionWrites,0);assert.equal(counters.calls.clear,0);
});
