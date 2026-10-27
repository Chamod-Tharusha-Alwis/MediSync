'use strict';
// Evaluate the actual auth middleware; no real JWT library, model, environment or application import.
const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'../../..');
const actor='inert-auth-actor',secretMarker='B11_INERT_NOT_A_SECRET';
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function createHarness({sourceFile='server/src/middleware/auth.js',banMode='none',banResult,sessionOverride={},invalidJwt=false,sessionMode='valid',role='doctor',auditFails=false}={}){
  if(!['server/src/middleware/auth.js','scratch/phase5x-evidence/b11-r1-auth-original-20261016.js.txt'].includes(sourceFile))throw Error('Only reviewed current/original source');
  const source=fs.readFileSync(path.join(root,sourceFile),'utf8');
  const calls={imports:[],jwt:[],sessionFind:[],sessionSave:0,banFind:[],audit:[],device:0,next:0,protected:0,clinical:0};
  const logs=[],control=deferred(),decoded={id:actor,role,sub:'INERT_NIC_MARKER'},error=Object.assign(Error('INERT_DB_DETAIL token=INERT_TOKEN_MARKER nic=INERT_NIC_MARKER'),{code:'INERT_TIMEOUT'});
  const session={userId:actor,isValid:true,logoutAt:null,expiredAt:new Date(Date.now()+60000),async save(){calls.sessionSave++;if(sessionMode==='saveReject')throw error;},...sessionOverride};
  const ban=()=>({targetId:actor,isActive:true,banType:'permanent',reason:'Synthetic restriction',expiresAt:null});
  const fakeRequire=name=>{
    calls.imports.push(name);
    if(name==='jsonwebtoken')return{verify(token,key,options){calls.jwt.push({syntheticToken:token==='INERT_TOKEN_MARKER',syntheticKey:key===secretMarker,options});if(invalidJwt)throw error;return decoded;}};
    if(name==='crypto')return require('crypto');
    if(name==='../models/SessionToken')return{async findOne(filter){calls.sessionFind.push(filter);if(sessionMode==='findReject')throw error;return sessionMode==='missing'?null:session;}};
    if(name==='../models/BanRecord')return{findOne(filter){calls.banFind.push(filter);switch(banMode){case 'syncThrow':throw error;case 'reject':return Promise.reject(error);case 'timeout':return Promise.reject(Object.assign(error,{name:'MongoNetworkTimeoutError'}));case 'deferred':return control.promise;case 'active':return Promise.resolve(ban());case 'temporary':return Promise.resolve({...ban(),banType:'temporary',expiresAt:new Date(Date.now()+60000)});case 'result':return Promise.resolve(banResult);case 'expiredFiltered':{const expired={...ban(),expiresAt:new Date(Date.now()-60000)};return Promise.resolve(expired.expiresAt>filter.$or[1].expiresAt.$gt?expired:null);}case 'inactiveFiltered':return Promise.resolve(null);default:return Promise.resolve(null);}}};
    if(name==='../models/AuditLog')return{async create(value){calls.audit.push(value);if(auditFails)throw error;return{};}};
    if(name==='../utils/deviceParser')return{parseDeviceModel(){calls.device++;return'inert-device';}};
    throw Error('Unexpected middleware import');
  };
  const moduleDouble={exports:{}};
  vm.runInNewContext(source,{module:moduleDouble,exports:moduleDouble.exports,require:fakeRequire,process:{env:{JWT_SECRET:secretMarker}},console:{error:(...args)=>logs.push(args)},Date,Buffer},{filename:sourceFile,timeout:1000});
  const req=({header='Bearer INERT_TOKEN_MARKER'}={})=>({headers:{...(header===null?{}:{authorization:header}),'user-agent':'inert-agent'},params:{nic:'INERT_NIC_MARKER'},body:{patientNic:'INERT_NIC_MARKER'},method:'GET',originalUrl:'/inert/protected',path:'/inert/protected'});
  function response(){const state={status:200,bodies:[],responses:0};return{state,status(code){state.status=code;return this;},json(body){state.responses++;state.bodies.push(body);return this;}};}
  async function invoke({allowedRoles=['doctor'],header,clinical=false}={}){const request=req(header===undefined?{}:{header}),res=response();await moduleDouble.exports(allowedRoles)(request,res,()=>{calls.next++;calls.protected++;if(clinical)calls.clinical++;});return{request,response:res.state};}
  return{protect:moduleDouble.exports,calls,logs,control,decoded,session,invoke,req,response,ban};
}
module.exports={createHarness,deferred};
