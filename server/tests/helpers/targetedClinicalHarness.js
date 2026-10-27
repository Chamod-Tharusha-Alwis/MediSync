// Future approved execution only; importing suites must encounter their quarantine first.
require('./qaEnvironment');
const environment=require('./qaEnvironment'),qa=require('./ownedFixtures');
const crypto=require('crypto');
const common=['patients','doctors','sessiontokens','trusteddevices','phase5x_audit_qa','consultations'];
function createHarness(kind){
  if(!['profile','duration'].includes(kind))throw Error('Unknown targeted clinical suite');
  const collections=[...common,...(kind==='duration'?['prescriptions','labtests','notifications']:['admins','hospitals','pharmacies','pharmacystaffs','otpsessions'])];
  qa.configureSafety({collections,ownedReferences:true});
  global.__MEDISYNC_QA_FREEZE=qa.freeze;
  jest.doMock('uuid',()=>({v4:()=>crypto.randomUUID()}));
  jest.doMock('node-vault',()=>()=>{throw Error('Vault forbidden in targeted QA');});
  const integrations={mockedHttp:{},cloudinaryCalls:0,socketEmits:0,rejectedAxios:0,rejectedNativeFetch:0};
  const strict=require('./strictIr04Axios').createIr04AxiosMocks(integrations,key=>integrations.mockedHttp[key]=(integrations.mockedHttp[key]||0)+1);
  const client=Object.assign(strict.reject,{get:strict.get,post:strict.post,put:strict.reject,patch:strict.reject,delete:strict.reject,head:strict.reject,options:strict.reject,request:strict.reject});client.create=()=>client;
  jest.doMock('axios',()=>client);
  jest.doMock('cloudinary',()=>({v2:{config:()=>({}),uploader:{upload_stream:()=>{integrations.cloudinaryCalls++;throw Error('Cloudinary forbidden');}},url:()=>{integrations.cloudinaryCalls++;throw Error('Cloudinary forbidden');}}}));
  global.fetch=require('./strictMlFetch').createStrictMlFetch(global.fetch,integrations);
  global.ENCRYPTION_KEY=process.env.ENCRYPTION_KEY;
  const mongoose=require('mongoose'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken');
  const models=Object.fromEntries(['Admin','Doctor','Patient','Hospital','Pharmacy','PharmacyStaff','Consultation','Prescription','OTPSession','SessionToken','TrustedDevice','AuditLog'].map(name=>[name,require(`../../src/models/${name}`)]));
  const express=require('express'),app=express();app.use(express.json());app.use(require('cookie-parser')());app.set('trust proxy',1);
  const isolation=require('./ir04IsolationReceipt').createReceipt(qa);app.use(isolation.requests);
  app.set('io',{emit:()=>integrations.socketEmits++,userSocketMap:new Map(),to:()=>({emit:()=>integrations.socketEmits++})});
  for(const [prefix,route] of [['auth','auth'],['patient','patient'],['doctor','doctor'],['prescription','prescription'],['admin','admin']])app.use(`/api/${prefix}`,require(`../../src/routes/${route}Routes`));
  isolation.instrument(app);
  const http=require('./ownedHttpServer').createOwnedHttpServer(app),request=require('supertest');
  const actors={},password=crypto.randomBytes(32).toString('hex');let passwordHash,started=false;
  const call=()=>{if(!started||qa.status().frozen)throw Error('Owned listener unavailable or frozen');return request(http.server);};
  const email=label=>`${label}.${qa.owner}@qa.medisync.local`;
  async function actor(label,model,data,role){
    const doc=await models[model].create({fullName:`QA ${label}`,email:email(label),password:passwordHash,twoFactorEnabled:false,...data});
    const result=await call().post('/api/auth/login').set('x-device-fingerprint',`${qa.owner}-${label}`).send({email:doc.email,password,role});
    expect(result.status).toBe(200);expect(result.body.data?.accessToken).toEqual(expect.any(String));
    actors[label]={doc,model,role,token:result.body.data.accessToken};return actors[label];
  }
  async function setup(){
    const info=await require('../../src/config/dbGuard').connectAutomatedTestDB();qa.verifyRuntime(info);
    await http.start();started=true;passwordHash=await bcrypt.hash(password,10);
    const Patient=models.Patient;
    for(const label of (kind==='profile'?['a','b']:['a']))await actor(label,'Patient',{nic:qa.alias(label==='a'?'199012345671':'199012345672'),patientNic_bi:crypto.createHash('sha256').update(qa.alias(label==='a'?'199012345671':'199012345672')).digest('hex'),gender:'Other',dateOfBirth:new Date('1990-01-01'),district:'Colombo',allergies:['amoxicillin'],contactInfo:'QA contact',address:'QA address',bloodGroup:'O+',chronicConditions:['QA condition'],insurance:{provider:'QA',policyNumber:'QA-only'},emergencyContact:{name:'QA contact',phone:'0000000000',relationship:'QA'}},'patient');
    if(kind==='duration'){
      await actor('assigned','Doctor',{licenseNo:`L-${qa.owner}-assigned`,doctorId:`D-${qa.owner}-assigned`,isActive:true,isVerified:true,hospitals:[]},'doctor');
      return;
    }
    for(const label of ['linked','unlinked'])await actor(label,'Hospital',{name:`QA ${label}`,regNo:`H-${qa.owner}-${label}`,district:'Colombo'},'hospital_admin');
    for(const label of ['assigned','consented','unassigned','unverified','disabled','revoked'])await actor(label,'Doctor',{licenseNo:`L-${qa.owner}-${label}`,doctorId:`D-${qa.owner}-${label}`,isActive:true,isVerified:true,hospitals:label==='assigned'?[actors.linked.doc._id]:[]},'doctor');
    for(const [label,changes]of [['unverified',{isVerified:false}],['disabled',{isActive:false}]])await models.Doctor.updateOne({_id:actors[label].doc._id},{$set:changes});
    await Patient.updateOne({_id:actors.a.doc._id},{$set:{reportedDoctors:[{doctorId:actors.revoked.doc._id,reason:'QA revocation',status:'pending'}]}});
    for(const [label,role,superAdmin]of [['admin','admin',false],['super','super_admin',true],['disabledAdmin','admin',false],['invalidAdmin','super_admin',true]])await actor(label,'Admin',{role,isSuperAdmin:superAdmin,isActive:true},role);
    await models.Admin.updateOne({_id:actors.disabledAdmin.doc._id},{$set:{isActive:false}});
    await models.Admin.updateOne({_id:actors.invalidAdmin.doc._id},{$set:{isSuperAdmin:false}});
    await actor('wrongRoleAdmin','Admin',{role:'admin',isActive:true},'admin');
    await models.Admin.updateOne({_id:actors.wrongRoleAdmin.doc._id},{$set:{role:'patient'}});
    const pharmacy=await models.Pharmacy.create({name:'QA pharmacy',district:'Colombo',regNo:`PH-${qa.owner}`});
    for(const [label,role]of [['pharmacist','pharmacist'],['pharmacyAdmin','pharmacy_admin']])await actor(label,'PharmacyStaff',{pharmacyId:pharmacy._id,role,isActive:true,mustChangePassword:false},role);
    await models.Consultation.create({consultationId:`QA-${qa.owner}`,patientNic:actors.a.doc.nic,patientId:actors.a.doc._id,patientNic_bi:crypto.createHash('sha256').update(actors.a.doc.nic).digest('hex'),nicHash:crypto.createHash('sha256').update(actors.a.doc.nic).digest('hex'),doctorId:actors.assigned.doc._id,symptoms:['QA only'],diagnosis:'QA relationship',status:'active'});
  }
  const auth=(label,operation)=>operation.set('Authorization',`Bearer ${actors[label].token}`);
  const profile=(label,target='a',headers={})=>{let op=auth(label,call().get(`/api/patient/${actors[target].doc.nic}`));for(const[key,value]of Object.entries(headers))op=op.set(key,value);return op;};
  async function consent(label='consented'){
    const patientNic=actors.a.doc.nic;
    const requested=await auth(label,call().post('/api/patient/request-access')).send({patientNic,requesterRole:'doctor',requesterName:'QA doctor'});expect(requested.status).toBe(200);expect(requested.body.sessionId).toBeTruthy();
    const emails=require('../../src/utils/emailService').__getCapturedTestEmails();
    const captured=[...emails].reverse().find(item=>item.to.includes(actors.a.doc.email)&&item.otp);expect(captured?.otp).toBeTruthy();
    const verified=await auth(label,call().post('/api/patient/verify-access')).send({sessionId:requested.body.sessionId,otp:captured.otp,patientNic});expect(verified.status).toBe(200);expect(verified.body.accessToken).toBeTruthy();
    return {token:verified.body.accessToken,sessionId:requested.body.sessionId};
  }
  async function clinicalCounts(){return Object.fromEntries(await Promise.all(['consultations','prescriptions','labtests','notifications'].map(async name=>[name,await mongoose.connection.db.collection(name).countDocuments({phase5xOwner:qa.owner})])));}
  async function afterCase(){
    await isolation.drain();
    expect(environment.networkAttempts).toEqual([]);expect(environment.secretReadAttempts).toEqual([]);expect(qa.status().rejected).toBe(0);
    expect(integrations.rejectedAxios).toBe(0);expect(integrations.rejectedNativeFetch).toBe(0);expect(integrations.cloudinaryCalls).toBe(0);
  }
  async function cleanup(){
    qa.freeze();let failure;
    try{await http.close();await isolation.drain();isolation.assertCleanupReady({listener:http.status(),integrations});await qa.cleanup();const emails=require('../../src/utils/emailService');emails.__clearCapturedTestEmails();isolation.state.mockEmailsRemaining=emails.__getCapturedTestEmails().length;if(isolation.state.mockEmailsRemaining)throw Error('Mock email memory did not clear');qa.freeze();isolation.state.cleanupComplete=true;}
    catch(error){failure=error;isolation.state.recoveryRequired=true;}
    finally{await mongoose.disconnect();started=false;Object.assign(isolation.state,{disconnected:mongoose.connection.readyState===0,listener:http.status(),integrations});isolation.save();}
    if(failure)throw failure;
  }
  return {kind,qa,models,actors,collections,setup,cleanup,afterCase,call,auth,profile,consent,clinicalCounts,jwt,
    async denial(label,headers={},target='a'){
      const before=await models.AuditLog.countDocuments({actorId:String(actors[label].doc._id),action:'patient_profile:denied'});
      const response=await profile(label,target,headers);expect(response.status).toBe(403);expect(response.body).toEqual({error:'Access denied'});
      expect(await models.AuditLog.countDocuments({actorId:String(actors[label].doc._id),action:'patient_profile:denied'})).toBe(before+1);
      const event=await models.AuditLog.findOne({actorId:String(actors[label].doc._id),action:'patient_profile:denied'}).sort({_id:-1}).lean();expect(event.accessedNic).toBe('N/A');expect(event.deviceModel).toBe('N/A');
      return response;
    },
    async forgedConsent(changes={}){
      const doc=await models.OTPSession.create({userId:actors.a.doc._id,userModel:'Patient',otp:passwordHash,purpose:'patient-access',used:true,expiresAt:new Date(Date.now()+3600000),metadata:{requesterId:String(actors.assigned.doc._id),requesterRole:'doctor',accessNic:actors.a.doc.nic,accessExpiresAt:new Date(Date.now()+600000),revoked:false}});
      return jwt.sign({type:'patient-access',nic:actors.a.doc.nic,sessionId:String(doc._id),requesterId:String(actors.assigned.doc._id),requesterRole:'doctor',...changes},process.env.JWT_SECRET,changes.exp===undefined?{expiresIn:'15m'}:{});
    }
  };
}
module.exports={createHarness};
