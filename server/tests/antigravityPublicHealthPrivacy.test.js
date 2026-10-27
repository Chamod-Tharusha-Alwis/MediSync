'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
function controller(error){
 const exported={},log=jest.fn();
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/controllers/publicController.js'),'utf8'),{
  exports:exported,module:{exports:exported},process:{env:{}},console:{log(){},warn(){},error:log},
  require(name){if(name==='../security/publicDto')return require('../src/security/publicDto');
   if(name==='axios')return{get:async()=>{throw error;}};
   if(name==='../utils/internalAuth')return{generateToken:()=> 'offline-token'};
   if(name==='../config/redis')return{getCache:async()=>null,setCache:jest.fn()};
   if(name==='crypto')return require('crypto');
   if(name==='mongoose')return{connection:{readyState:0}};
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
