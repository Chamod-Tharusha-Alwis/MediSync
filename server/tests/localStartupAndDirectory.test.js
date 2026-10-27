'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),{EventEmitter}=require('events');
const {startProduction}=require('../src/production');
const {listenReady}=require('../src/security/listenReady');
const {createRuntimeHealth}=require('../src/security/runtimeHealth');
test.each([{NODE_ENV:'production'}, {MEDISYNC_QA_BOOTSTRAPPED:undefined}, {PORT:'5000'}, {MONGO_URI:'unread-production'}])('direct local adapter denies an altered contract before imports (%p)',change=>{
  const env={NODE_ENV:'test',MEDISYNC_TEST_MODE:'true',MEDISYNC_QA_BOOTSTRAPPED:'true',MEDISYNC_QA_CREDENTIALS_ROTATED:'true',MEDISYNC_LOCAL_REAL_STACK:'true',MEDISYNC_LOCAL_ATLAS_APPROVED:'true',PORT:'5100',CLIENT_URL:'http://127.0.0.1:3100',ML_ENGINE_URL:'http://127.0.0.1:5101',REDIS_URL:'redis://127.0.0.1:6379/15',VAULT_TOKEN:'bypass',MONGO_URI_TEST:'synthetic-not-connected',ENCRYPTION_KEY:'inert',JWT_SECRET:'inert',JWT_REFRESH_SECRET:'inert',INTERNAL_API_KEY:'inert',...change};
  expect(()=>require('../scripts/localRealPolicy.cjs').assertLocalRealBackend(env)).toThrow('LOCAL_RESTRICTED_RUNTIME_CONTRACT_REQUIRED');
});
test('health refuses missing database or required Redis without querying clinical records',()=>{
  for(const [db,redis] of [[false,true],[true,false],[false,false]]){
    const res={status:jest.fn().mockReturnThis(),json:jest.fn()};createRuntimeHealth({mongoReady:()=>db,redisReady:()=>redis})({},res);expect(res.status).toHaveBeenCalledWith(503);expect(res.json).toHaveBeenCalledWith({status:'unavailable',service:'medisync-express'});
  }
});
test('health reports ready only when its actual dependency predicates pass',()=>{
  const res={status:jest.fn().mockReturnThis(),json:jest.fn()};createRuntimeHealth({mongoReady:()=>true,redisReady:()=>true})({},res);expect(res.status).toHaveBeenCalledWith(200);expect(res.json.mock.calls[0][0].status).toBe('ready');
});
test('both registered health aliases use a single readiness handler without an earlier unconditional 200',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
  expect((source.match(/app\.get\(\['\/health', '\/api\/health'\]/g)||[])).toHaveLength(1);
  expect(source).not.toContain("app.get('/health'");expect(source).not.toContain("json({ status: 'ok', uptime:");expect(source).toContain("require('./security/runtimeHealth').createRuntimeHealth");
});
test('production executable calls and awaits exactly one real exported startup',async()=>{
  const result={httpServer:{}};let complete;
  const startServer=jest.fn(()=>new Promise(r=>{complete=r;}));
  const promise=startProduction({NODE_ENV:'production',MEDISYNC_ATLAS_ROTATION_CONFIRMED:'true'},()=>({startServer}));
  expect(startServer).toHaveBeenCalledTimes(1);complete(result);expect(await promise).toBe(result);
  expect(fs.readFileSync(path.join(__dirname,'../Dockerfile'),'utf8')).toContain('"src/production.js"');
  expect(require('../package.json').scripts.start).toBe('node src/production.js');
});
test('production startup rejects absent adapter and propagates startup failure',async()=>{
  expect(()=>startProduction({NODE_ENV:'production',MEDISYNC_ATLAS_ROTATION_CONFIRMED:'true'},()=>({}))).toThrow('APPLICATION_START_FUNCTION_REQUIRED');
  await expect(startProduction({NODE_ENV:'production',MEDISYNC_ATLAS_ROTATION_CONFIRMED:'true'},()=>({startServer:()=>Promise.reject(Error('INERT_START_FAILURE'))}))).rejects.toThrow('INERT_START_FAILURE');
});
test('listener readiness does not resolve until listening and rejects occupied-port errors',async()=>{
  const server=new EventEmitter();server.listen=jest.fn();let done=false;
  const promise=listenReady(server,5100,'127.0.0.1').then(()=>{done=true;});await Promise.resolve();expect(done).toBe(false);
  expect(server.listen).toHaveBeenCalledWith(5100,'127.0.0.1');server.emit('listening');await promise;expect(done).toBe(true);
  const other=new EventEmitter();other.listen=jest.fn();const failure=listenReady(other,5100,'127.0.0.1');other.emit('error',Error('EADDRINUSE'));await expect(failure).rejects.toThrow('EADDRINUSE');
});
function controller(fixtures){
  const queries={},selections={};
  function model(name){return {find:jest.fn(filter=>{queries[name]=filter;return {select(fields){selections[name]=fields;return {lean:async()=>fixtures[name]||[]};}};})};}
  const models=Object.fromEntries(['Doctor','Hospital','Pharmacy','PharmacyStaff','Review','BanRecord'].map(name=>[name,model(name)]));
  const context={exports:{},process:{env:{}},console,require(name){if(name==='../security/publicDto')return require('../src/security/publicDto');if(name.startsWith('../models/'))return models[name.slice(10)];if(name==='../config/dbGuard')return {isAutomatedTestEnvironment:()=>false};return {};}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/controllers/publicController.js'),'utf8'),context);
  return {...context,queries,selections};
}
test('hospital query requires verified active publication and response strips unselected metadata defensively',async()=>{
  const c=controller({Hospital:[{_id:'public-hospital',name:'Hospital',password:'inert',twoFactorEnabled:true,lastLoginAt:'private',adminId:'private'}]});
  const res={json:jest.fn(),status:jest.fn().mockReturnThis()};await c.exports.getHospitals({},res);
  expect(c.queries.Hospital).toEqual({isActive:true,isVerified:true,isSynthetic:{$ne:true},isDemoData:{$ne:true},isDemoAccount:{$ne:true},datasetVersion:{$ne:'MEDISYNC_UNIV_DEMO_V2'}});expect(res.status).not.toHaveBeenCalled();
  const row=res.json.mock.calls[0][0].data[0];for(const key of ['password','twoFactorEnabled','lastLoginAt','adminId'])expect(row).not.toHaveProperty(key);
  expect(row.name).toBe('Hospital');
});
test('pharmacy publication requires verified active administrator membership and excludes internal fields',async()=>{
  const c=controller({PharmacyStaff:[{pharmacyId:'approved-facility'}],Pharmacy:[{_id:'approved-facility',name:'Pharmacy',inventory:['private'],adminId:'private',twoFactorEnabled:true}]});
  const res={json:jest.fn(),status:jest.fn().mockReturnThis()};await c.exports.getPharmacies({},res);
  expect(c.queries.PharmacyStaff).toEqual({role:'pharmacy_admin',isActive:true,isVerified:true,isSynthetic:{$ne:true},isDemoData:{$ne:true},isDemoAccount:{$ne:true},datasetVersion:{$ne:'MEDISYNC_UNIV_DEMO_V2'}});
  expect(c.queries.Pharmacy).toEqual({isActive:true,isSynthetic:{$ne:true},isDemoData:{$ne:true},isDemoAccount:{$ne:true},datasetVersion:{$ne:'MEDISYNC_UNIV_DEMO_V2'},_id:{$in:['approved-facility']}});
  const row=res.json.mock.calls[0][0].data[0];for(const key of ['adminId','inventory','twoFactorEnabled'])expect(row).not.toHaveProperty(key);
});
test('assistant is absent from dispensing and pending clinical prescription guards',()=>{
  const guards=[],routes={};const router={};for(const method of ['get','post','put','delete'])router[method]=(route,...handlers)=>{routes[method+route]=handlers;};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/routes/pharmacyRoutes.js'),'utf8'),{module:{exports:{}},require(name){if(name==='express')return {Router:()=>router};if(name==='../middleware/verifiedAuth')return roles=>{const guard={roles};guards.push(guard);return guard;};if(name==='express-rate-limit')return ()=>()=>{};return {};},process:{env:{}}});
  for(const route of ['post/dispense','post/dispense-otc','get/prescriptions/pending/:nic'])expect(routes[route][0].roles).toEqual(['pharmacist','pharmacy_admin']);
  expect(routes['get/staff/me'][0].roles).toContain('assistant');
});
