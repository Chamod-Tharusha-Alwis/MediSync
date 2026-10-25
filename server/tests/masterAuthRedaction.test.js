'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const source=fs.readFileSync(path.join(__dirname,'../src/middleware/auth.js'),'utf8');
async function invoke(options={}){
 const id='a'.repeat(24),calls={audit:[],logs:[],next:0};let status=200;
 const modules={jsonwebtoken:{verify:()=>{if(options.invalidJwt)throw Error('PRIVATE_JWT');return{id,role:options.role||'doctor'};}},crypto,
 '../models/SessionToken':{findOne:async()=>{if(options.sessionError)throw Error('PRIVATE_SESSION');return options.noSession?null:{userId:id,isValid:true,expiredAt:new Date(Date.now()+60000),save:async()=>{}};}},
 '../models/AuditLog':{create:async row=>{if(options.auditError)throw Error('PRIVATE_AUDIT');calls.audit.push(row);}},
 '../models/BanRecord':{findOne:async()=>{if(options.banError)throw Error('PRIVATE_BAN');return options.ban?{targetId:id,isActive:true,banType:'permanent',reason:'Policy',expiresAt:null}:null;}},
 '../utils/deviceParser':{parseDeviceModel:()=> 'offline-device'}};
 const box={module:{exports:{}},require:name=>{if(!Object.hasOwn(modules,name))throw Error('UNREVIEWED_REQUIRE');return modules[name];},console:{error:(...args)=>calls.logs.push(args)},process:{env:{JWT_SECRET:'offline-only'}}};
 vm.runInNewContext(source,box,{filename:'actual-auth.js'});
 const req={headers:{authorization:options.noJwt?null:'Bearer synthetic-only'},params:{nic:'PRIVATE_NIC'},body:{patientNic:'PRIVATE_NIC'},method:'GET',originalUrl:'/patient/PRIVATE_NIC?token=PRIVATE_TOKEN',path:'/patient/PRIVATE_NIC',...(options.noRoute?{}:{route:{path:'/patient/:nic'}})};
 const res={status:n=>{status=n;return res;},json:()=>res};await box.module.exports(['doctor'])(req,res,()=>calls.next++);return{status,calls};
}
test('actual protected middleware redacts NIC and uses route template without raw URL/query',async()=>{const r=await invoke();expect(r.calls.next).toBe(1);expect(r.calls.audit[0]).toMatchObject({action:'GET /patient/:nic',accessedNic:'REDACTED'});expect(JSON.stringify(r.calls)).not.toContain('PRIVATE_');});
test('missing Express route uses constant without falling back to raw patient URL',async()=>expect((await invoke({noRoute:true})).calls.audit[0].action).toBe('GET protected-route'));
test.each([
 ['missingJWT',{noJwt:true},401],['invalidJWT',{invalidJwt:true},401],['wrongRole',{role:'patient'},403],['missingSession',{noSession:true},401],['suspensionOutage',{banError:true},503],['activeBan',{ban:true},403]
])('%s remains denied with status %s',async(_,options,status)=>{const r=await invoke(options);expect(r.status).toBe(status);expect(r.calls.next).toBe(0);expect(r.calls.audit).toHaveLength(0);expect(JSON.stringify(r.calls.logs)).not.toContain('PRIVATE_');});
test('audit outage logs only a constant; existing fail-open policy is explicitly preserved',async()=>{const r=await invoke({auditError:true});expect(r.calls.next).toBe(1);expect(r.calls.logs).toEqual([['Audit persistence unavailable.']]);});
test('outer session error is generic and cannot leak driver/auth details',async()=>{const r=await invoke({sessionError:true});expect(r.status).toBe(500);expect(r.calls.next).toBe(0);expect(r.calls.logs).toEqual([['Authentication unavailable.']]);});
