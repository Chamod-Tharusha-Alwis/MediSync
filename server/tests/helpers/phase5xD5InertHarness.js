// Execute actual controllers using inert models. No model, config, env or transport imports.
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto'),jwt=require('jsonwebtoken');
const secret='inert-privacy-secret-never-used-by-a-service';
const ids={patient:'111111111111111111111111',doctor:'222222222222222222222222',other:'333333333333333333333333',session:'444444444444444444444444',admin:'555555555555555555555555'};
const nic='199012345678';
function controllerHarness(name, options={}) {
  const calls={reads:0,writes:0,audits:[],selections:[],decryptions:0};
  const patient={_id:ids.patient,nic,fullName:'Inert Patient',dateOfBirth:new Date('1990-01-01'),email:'inert@qa.medisync.local',
    contactInfo:'inert contact',address:'inert address',district:'Colombo',bloodGroup:'O+',allergies:['inert allergen'],chronicConditions:['inert condition'],
    insurance:{provider:'inert',policyNumber:'inert',privateToken:'forbidden'},emergencyContact:{name:'inert',phone:'inert',relationship:'inert',secret:'forbidden'},
    password:'forbidden',twoFactorEnabled:true,lastLoginAt:'forbidden',patientNic_bi:'forbidden',keyVersion:1,__enc_fullName:true,__enc_allergies_d:'forbidden',reportedDoctors:options.revoked?[{doctorId:ids.doctor,status:'pending'}]:[],
    ...(options.patient||{})};
  const chain=value=>{const query={select:selection=>{calls.selections.push(selection);return query;},lean:async()=>value,sort:()=>query,then:(resolve,reject)=>Promise.resolve(value).then(resolve,reject)};return query;};
  const mutation=()=>{calls.writes++;throw new Error('No database mutation permitted by inert seam');};
  const empty=new Proxy({find:()=>chain([]),findById:()=>chain(null),findOne:()=>chain(null),create:mutation},{get:(target,key)=>key in target?target[key]:mutation});
  const patientDoc=()=>({...patient,decryptFieldsSync(){calls.decryptions++;},toObject:()=>({...patient})});
  const models={Patient:{
    findById:id=>chain(String(id)===ids.patient?{nic}:null),
    find:()=>chain(options.ambiguous?[patient,patient]:[patient]),
    findOne:query=>{calls.reads++;return chain(options.missing || query.nic!==nic || query._id && String(query._id)!==ids.patient?null:patientDoc());}
  },Doctor:{findById:()=>chain({_id:ids.doctor,role:'doctor',isActive:true,isVerified:true,...options.doctor})},
    Consultation:{find:()=>chain(options.relationship===false?[]:[{_id:ids.other,status:'active',createdAt:new Date()}])},
    Admin:{findById:()=>chain(options.admin===null?null:{_id:ids.admin,role:'admin',isActive:true,isSuperAdmin:true,...options.admin})},
    OTPSession:{findById:()=>chain(options.otp||null)},AuditLog:{create:async value=>{if(options.auditFails)throw Error('inert audit failure');calls.audits.push(value);return{};}}};
  const exports={};
  const dependency=name=>{
    if(options.dependencies && Object.prototype.hasOwnProperty.call(options.dependencies,name))return options.dependencies[name];
    if(name==='crypto')return crypto;if(name==='jsonwebtoken')return jwt;
    if(name==='mongoose')return{Types:{ObjectId:{isValid:value=>/^[0-9a-f]{24}$/.test(value)}}};
    if(name.startsWith('../models/'))return models[name.split('/').at(-1)]||empty;
    if(name==='../utils/patientProfilePolicy')return require('../../src/utils/patientProfilePolicy');
    if(name==='../utils/prescriptionDuration')return require('../../src/utils/prescriptionDuration');
    if(name==='../security/nicPersistence')return require('../../src/security/nicPersistence');
    return new Proxy({}, {get:()=>mutation});
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,`../../src/controllers/${name}.js`),'utf8'),{exports,require:dependency,process:{env:{JWT_SECRET:secret}},console:{error:()=>{},log:()=>{},warn:()=>{}},Buffer,fetch:mutation},{filename:`inert-actual-${name}.js`});
  async function invoke(method, req={}){let status=200,body;const res={status(value){status=value;return res;},json(value){body=value;return res;}};
    await exports[method]({params:{nic},headers:{},body:{},...req},res);return{status,body};}
  return{invoke,calls,patient,exports};
}
function consent({nic:target=nic,requesterId=ids.doctor,...overrides}={}){
  const metadata={requesterId,requesterRole:'doctor',accessNic:target,accessExpiresAt:new Date(Date.now()+60000),revoked:false,...overrides.metadata};
  const claims={type:'patient-access',nic:target,sessionId:ids.session,requesterId,requesterRole:'doctor',...overrides.claims};
  const token=jwt.sign(claims,secret,{expiresIn:overrides.expiresIn??60});
  return{token,otp:{_id:ids.session,purpose:'patient-access',used:true,userId:ids.patient,metadata,...overrides.otp}};
}
module.exports={controllerHarness,consent,ids,nic};
