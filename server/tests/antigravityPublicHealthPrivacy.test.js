'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
function controller(error){
 const exported={},log=jest.fn();
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/controllers/publicController.js'),'utf8'),{
  exports:exported,module:{exports:exported},process:{env:{}},console:{log(){},warn(){},error:log},
  require(name){if(name==='../security/publicDto')return require('../src/security/publicDto');
   if(name==='../services/publicHealthStats')return{CACHE_POLICY:'public-real-verified-episodes-v1',validateFilters:require('../src/services/publicHealthStats').validateFilters,loadPublicHealthStats:async()=>{throw error;}};
   if(name==='axios')return{get:async()=>{throw error;}};
   if(name==='../utils/internalAuth')return{generateToken:()=> 'offline-token'};
   if(name==='../config/redis')return{getCache:async()=>null,setCache:jest.fn()};
   if(name==='crypto')return require('crypto');
   if(name==='mongoose')return{connection:{readyState:1}};
   if(name==='../config/dbGuard')return{isAutomatedTestEnvironment:()=>false,TEST_DB_NAME:'medisync_automated_test',PROD_DB_NAME:'test'};
   return{};
  }
 });
 return{exported,log};
}
test.each([Error('PRIVATE_PROVIDER_URL_WITH_SECRET'),{message:'PRIVATE_PATIENT_MARKER'},null])('public health errors expose no private exception data %#',async error=>{
 const {exported,log}=controller(error),res={status:jest.fn().mockReturnThis(),json:jest.fn()};
 await exported.getHealthStats({query:{}},res);
 expect(res.status).toHaveBeenCalledWith(503);expect(res.json).toHaveBeenCalledWith({error:'PUBLIC_HEALTH_UNAVAILABLE',message:'Health statistics are temporarily unavailable.',data:null});
 expect(JSON.stringify([log.mock.calls,res.json.mock.calls])).not.toMatch(/PRIVATE_PROVIDER|PRIVATE_PATIENT/);
});

test.each(['PUBLIC_REPORTING_SOURCE_UNVERIFIED', 'REPORTING_REVIEW_REQUIRED', 'REPORTING_RESULT_INVALID', 'REPORTING_READ_LIMIT_EXCEEDED', 'REPORTING_SOURCE_UNAVAILABLE', 'REPORTING_CURSOR_INVALID'])('only fixed reporting category %s can enter the operational log', async code => {
 const {exported,log}=controller(Object.assign(Error('PRIVATE_PATIENT_MARKER'),{code,privateValue:'PRIVATE_PROVIDER_URL_WITH_SECRET'})),res={status:jest.fn().mockReturnThis(),json:jest.fn()};
 await exported.getHealthStats({query:{}},res);
 expect(log.mock.calls).toEqual([[`[PublicHealth] stage=SOURCE_READ_AND_VERIFY category=${code}`]]);
 expect(res.status).toHaveBeenCalledWith(503);
 expect(JSON.stringify([log.mock.calls,res.json.mock.calls])).not.toMatch(/PRIVATE_PATIENT|PRIVATE_PROVIDER/);
});

test('unknown error codes and raw exception messages cannot be logged or returned', async () => {
 const {exported,log}=controller({code:'PRIVATE_PATIENT_MARKER',message:'PRIVATE_PROVIDER_URL_WITH_SECRET'}),res={status:jest.fn().mockReturnThis(),json:jest.fn()};
 await exported.getHealthStats({query:{}},res);
 expect(log.mock.calls).toEqual([['[PublicHealth] stage=SOURCE_READ_AND_VERIFY category=DEPENDENCY_OR_REPORTING_FAILURE']]);
 expect(JSON.stringify([log.mock.calls,res.json.mock.calls])).not.toMatch(/PRIVATE_PATIENT|PRIVATE_PROVIDER/);
});
