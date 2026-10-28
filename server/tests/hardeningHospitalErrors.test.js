'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const sentinel='SYNTHETIC_PRIVATE_DIAGNOSTIC_CANARY';
function harness({failure=true,missing=false}={}){
 const logs=[],exports={};
 const chain=value=>({select:()=>chain(value),sort:()=>chain(value),then:(yes,no)=>Promise.resolve(value).then(yes,no)});
 const model=new Proxy({}, {get:(_target,key)=>()=>{if(failure)throw Error(sentinel);if(['countDocuments'].includes(key))return 0;return chain(key==='findById'?(missing?null:{_id:'a'.repeat(24),name:'Synthetic Hospital'}):[]);}});
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/controllers/hospitalController.js'),'utf8'),{
  exports,require(name){if(name.startsWith('../models/'))return model;if(name==='crypto')return require('crypto');return new Proxy({},{get:()=>()=>{throw Error(sentinel);}});},
  console:{error:(...args)=>logs.push(args),log(){},warn(){}},process:{env:{}},Buffer
 });
 return{logs,async invoke(method){let status=200,body;const res={status(s){status=s;return this;},json(b){body=b;return this;}};await exports[method]({user:{id:'a'.repeat(24)},body:{name:'Synthetic Hospital',regNo:'SYNTHETIC-ONLY',email:'hospital@example.invalid',password:'Synthetic-Only-2026!'},params:{nic:'SYNTHETIC'},headers:{}},res);return{status,body};}};
}
test.each(['registerHospital','loginHospital','getStats','getDoctors','updateSettings','getProfile','getPatients','updatePatientRecords','getHospitalStaff','getHospitalPatientHistory'])('%s errors suppress exception details in API and logs',async method=>{
 const h=harness(),r=await h.invoke(method);expect(r.status).toBe(500);expect(r.body.error).toEqual(expect.any(String));expect(r.body.details).toBe('Request could not be completed.');expect(JSON.stringify([r.body,h.logs])).not.toContain(sentinel);
});
test('successful profile response remains intact',async()=>{const r=await harness({failure:false}).invoke('getProfile');expect(r.status).toBe(200);expect(r.body).toEqual({data:{_id:'a'.repeat(24),name:'Synthetic Hospital'},message:'Profile fetched'});});
test('missing hospital retains its existing 404 contract',async()=>{const r=await harness({failure:false,missing:true}).invoke('getProfile');expect(r.status).toBe(404);expect(r.body).toEqual({error:'Hospital not found'});});
