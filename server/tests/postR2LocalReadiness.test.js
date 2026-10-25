'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),{EventEmitter}=require('events');
const {createRuntimeHealth,hasProductionAdmission}=require('../src/security/runtimeHealth');
const {createApplicationShutdown}=require('../src/security/applicationShutdown');
const {createMlHealthMonitor}=require('../src/security/mlHealthMonitor');
const {apiErrorHandler}=require('../src/security/apiErrorHandler');
const response=()=>({status:jest.fn().mockReturnThis(),json:jest.fn()});
const proof=()=>({dbName:'test',authenticatedRoles:[{role:'readWrite',db:'test'}],authenticatedUserCount:1,storageProfile:'current-model-contract-no-migration',verifiedCollections:28,verifiedRequiredIndexes:65,transactionTopologyVerified:true});
test.each([undefined,{}, {...proof(),verifiedRequiredIndexes:64},{...proof(),authenticatedUserCount:2},{...proof(),transactionTopologyVerified:false},{...proof(),authenticatedRoles:[{role:'root',db:'admin'}]}])('production readiness refuses incomplete proof %#',info=>{
 const res=response();createRuntimeHealth({mongoReady:()=>true,redisReady:()=>true,requireAdmission:true,admissionReady:()=>hasProductionAdmission(info)})({},res);expect(res.status).toHaveBeenCalledWith(503);
});
test('production readiness requires proof and becomes unavailable during shutdown',()=>{
 const res=response();createRuntimeHealth({mongoReady:()=>true,redisReady:()=>true,requireAdmission:true,admissionReady:()=>hasProductionAdmission(proof())})({},res);expect(res.status).toHaveBeenCalledWith(200);
 const closed=response();createRuntimeHealth({mongoReady:()=>true,redisReady:()=>true,stopping:()=>true})({},closed);expect(closed.status).toHaveBeenCalledWith(503);
});
test('a failed readiness predicate produces sanitized 503',()=>{const res=response();createRuntimeHealth({mongoReady:()=>{throw Error('private dependency');}})({},res);expect(res.status).toHaveBeenCalledWith(503);expect(JSON.stringify(res.json.mock.calls)).not.toContain('private');});
test('production DB adapter retains admission proof without returning connection or URI',async()=>{
 const mod={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/config/db.js'),'utf8'),{module:mod,process:{env:{}},console:{log(){},error(){}},require:()=>({isAutomatedTestEnvironment:()=>false,connectProductionDB:async()=>({...proof(),maskedUri:'masked',connection:{secret:'not-public'}})})});
 const result=await mod.exports();expect(result).toEqual(proof());expect(result).not.toHaveProperty('connection');expect(result).not.toHaveProperty('maskedUri');
});
test('Redis failed quit clears readiness and attempts owned-client destroy',async()=>{
 const client={isOpen:true,on(){},connect:async()=>{},quit:jest.fn(async()=>{throw Error('private redis url');}),destroy:jest.fn()},mod={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/config/redis.js'),'utf8'),{module:mod,process:{env:{NODE_ENV:'production'}},console:{log(){},warn(){},error(){}},require(name){if(name==='redis')return{createClient:()=>client};if(name==='../security/redisConnectionPolicy')return{validateRedisConnection:()=> 'rediss://offline.invalid'};throw Error('IMPORT_DENIED');}});
 await mod.exports.initRedis();expect(mod.exports.isUsingPersistentRedis()).toBe(true);
 await expect(mod.exports.closeRedis()).rejects.toThrow('SECURITY_STORE_SHUTDOWN_FAILED');expect(mod.exports.isUsingPersistentRedis()).toBe(false);expect(client.destroy).toHaveBeenCalledTimes(1);
 await mod.exports.closeRedis();expect(client.quit).toHaveBeenCalledTimes(1);
});
test.each([0,200,700,'500',NaN])('invalid error status %p cannot crash the API error handler',status=>{const res=response();apiErrorHandler({status,message:'private'},null,res,jest.fn());expect(res.status).toHaveBeenCalledWith(500);expect(JSON.stringify(res.json.mock.calls)).not.toContain('private');});
test.each([[{type:'entity.parse.failed'},400],[{type:'entity.too.large'},413],[{name:'CastError'},400],[{status:409},409]])('API preserves expected error status %#',(error,status)=>{const res=response();apiErrorHandler(error,null,res,jest.fn());expect(res.status).toHaveBeenCalledWith(status);});
test('partly sent response delegates error instead of sending a second response',()=>{const res={...response(),headersSent:true},next=jest.fn(),error=Error('inert');apiErrorHandler(error,null,res,next);expect(next).toHaveBeenCalledWith(error);expect(res.status).not.toHaveBeenCalled();});
test('shutdown is single-flight, stops jobs and transports before backing stores, removes signals',async()=>{
 const calls=[],signals=new EventEmitter(),httpServer={listening:true,close(cb){calls.push('http');this.listening=false;cb();},closeIdleConnections(){}};
 const lifecycle=createApplicationShutdown({signals,disconnect:async()=>calls.push('mongo'),closeRedis:async()=>calls.push('redis')});
 lifecycle.bind({monitor:{stop:()=>calls.push('monitor')},jobs:{stop:()=>calls.push('jobs')},io:{close:cb=>{calls.push('io');cb();}},httpServer});lifecycle.installSignals();expect(signals.listenerCount('SIGTERM')).toBe(1);
 const first=lifecycle.stop();expect(lifecycle.stop()).toBe(first);expect(lifecycle.stopping).toBe(true);expect(await first).toEqual({status:'closed',failures:[]});expect(calls).toEqual(['monitor','jobs','io','http','redis','mongo']);expect(signals.listenerCount('SIGTERM')).toBe(0);
});
test('not-yet-listening Socket.IO does not prevent partial-startup cleanup',async()=>{
 const closeRedis=jest.fn(),disconnect=jest.fn(),lifecycle=createApplicationShutdown({closeRedis,disconnect,signals:new EventEmitter()});
 lifecycle.bind({io:{close:cb=>cb(Object.assign(Error('inert'),{code:'ERR_SERVER_NOT_RUNNING'}))},httpServer:{listening:false}});
 expect((await lifecycle.stop()).status).toBe('closed');expect(disconnect).toHaveBeenCalledTimes(1);expect(closeRedis).toHaveBeenCalledTimes(1);
});
test.each(['transport','background'])('failed %s drain holds backing stores instead of closing under active work',async mode=>{
 const disconnect=jest.fn(),closeRedis=jest.fn(),lifecycle=createApplicationShutdown({disconnect,closeRedis,signals:new EventEmitter(),timeoutMs:20});
 lifecycle.bind(mode==='transport'?{httpServer:{listening:true,close(){}}}:{jobs:{stop:()=>new Promise(()=>{})}});
 const result=await lifecycle.stop();expect(result).toMatchObject({status:'failed',failures:[mode]});expect(disconnect).not.toHaveBeenCalled();expect(closeRedis).not.toHaveBeenCalled();
});
test('ML health requires typed ready payload and does not overlap health requests',async()=>{
 let release;const request=jest.fn(()=>new Promise(resolve=>{release=resolve;})),monitor=createMlHealthMonitor({request,url:'http://127.0.0.1:5101/health'});
 const first=monitor.check();await Promise.resolve();await monitor.check();expect(request).toHaveBeenCalledTimes(1);release({status:200,data:{status:'unknown'}});await first;expect(monitor.status).toBe('unavailable');
 request.mockResolvedValue({status:200,data:{status:'ready'}});await monitor.check();expect(monitor.status).toBe('available');await monitor.stop();expect(monitor.status).toBe('unavailable');await monitor.check();expect(request).toHaveBeenCalledTimes(2);
});
test('stopping ML monitor aborts and awaits an in-flight request',async()=>{
 const request=jest.fn((_url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))))),monitor=createMlHealthMonitor({request,url:'http://127.0.0.1:5101/health'});
 monitor.start();await Promise.resolve();await monitor.stop();expect(request).toHaveBeenCalledTimes(1);expect(request.mock.calls[0][1].signal.aborted).toBe(true);
});
test('cron shutdown awaits an active operation and refuses a queued tick afterward',async()=>{
 let finish;const work=new Promise(resolve=>{finish=resolve;}),callbacks=[],mod={exports:{}},updateMany=jest.fn(()=>work);
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/utils/cronJobs.js'),'utf8'),{module:mod,process:{env:{MEDISYNC_BACKGROUND_JOBS_APPROVED:'true'}},console:{log(){},error(){}},Intl,Set,Promise,require(name){if(name==='node-cron')return{schedule:(expression,callback)=>{callbacks.push(callback);return{stop(){},destroy(){}};}};if(name.startsWith('../models/'))return{updateMany};if(name==='./emailService'||name==='../security/nicPersistence')return{};throw Error('CRON_IMPORT_DENIED');}});
 const jobs=mod.exports(),running=callbacks[0]();await Promise.resolve();let stopped=false;const stop=jobs.stop().then(()=>stopped=true);await Promise.resolve();expect(stopped).toBe(false);finish({modifiedCount:0});await running;await stop;await callbacks[0]();expect(updateMany).toHaveBeenCalledTimes(1);
});
test.each(['redis','cron','listen'])('actual app partial %s startup failure cleans its resources with no ML poll or listener activation',async fail=>{
 const calls=[],app={set(){},use(){},get(){}},server={listening:false},mod={exports:{}},environment={NODE_ENV:'production',MEDISYNC_LIVE_START_APPROVED:'true',VAULT_TOKEN:'inert',ENCRYPTION_KEY:'inert'};
 const redis={initRedis:async()=>{calls.push('redis:init');if(fail==='redis')throw Error('EXPECTED_FAILURE');},closeRedis:async()=>calls.push('redis:close')};
 const mongoose={disconnect:async()=>calls.push('mongo:close')};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8'),{module:mod,process:{env:environment},global:{},console:{log(){},warn(){},error(){}},setInterval:()=>calls.push('unexpected:timer'),require(name){
 if(name==='./security/clinicalEntryPolicy')return{assertClinicalEntry(){}};if(name==='dotenv')return{config(){}};
 if(name==='node-vault')return()=>({read:async()=>({data:{data:{versions:{1:'inert'},activeVersion:1}}})});
 if(name==='./security/clientOriginPolicy')return{clientOrigin:()=> 'http://127.0.0.1:3100'};
 if(name==='./security/securityRuntime')return{initialize(){},assertProtectedCompatibility(){}};
 if(name==='./config/dbGuard')return{isAutomatedTestEnvironment:()=>false};if(name==='./config/db')return async()=>proof();
 if(name==='./config/redis')return redis;if(name==='mongoose')return mongoose;
 if(name==='./security/applicationShutdown')return{createApplicationShutdown:options=>createApplicationShutdown({...options,signals:new EventEmitter()})};
 if(name==='./utils/cronJobs')return()=>{if(fail==='cron')throw Error('EXPECTED_FAILURE');return{stop:()=>calls.push('jobs:stop')};};
 if(name==='./models/Admin')return{exists:async()=>true};if(name.startsWith('./models/')||name==='./utils/versionedEncryption'||name==='./controllers/doctorController')return{};
 if(name==='express')return Object.assign(()=>app,{json:()=>()=>{}});if(name==='http')return{createServer:()=>server};
 if(name==='socket.io')return{Server:function(){return{on(){},use(){},close(cb){calls.push('io:close');cb(Object.assign(Error('not running'),{code:'ERR_SERVER_NOT_RUNNING'}));}};}};
 if(name==='./security/socketAuthorization')return{installSocketAuthorization(){}};
 if(name==='./security/listenReady')return{listenReady:async()=>{throw Error('EXPECTED_FAILURE');}};
 if(name.startsWith('./security/'))return require('../src/'+name.slice(2));
 if(name.startsWith('./routes/'))return{};
 if(['helmet','cors','cookie-parser','express-rate-limit','express-mongo-sanitize'].includes(name))return()=>{};
 throw Error('UNEXPECTED_IMPORT:'+name);
 }});
 await expect(mod.exports.startServer()).rejects.toThrow('EXPECTED_FAILURE');expect(calls).toContain('mongo:close');expect(calls).toContain('redis:close');expect(calls).not.toContain('unexpected:timer');
});
