'use strict';
// IR-04 test preparation only. No environment, model, transport or DB imports.
const IR04_COLLECTIONS=Object.freeze(['admins','doctors','patients','hospitals','pharmacies','pharmacystaffs','consultations','prescriptions','dispensings','labtests','notifications','phase5x_audit_qa','sessiontokens','trusteddevices','otpsessions','consultationratings','banrecords','outbreakalerts']);
const collections=Object.freeze({Admin:'admins',Doctor:'doctors',Patient:'patients',Hospital:'hospitals',Pharmacy:'pharmacies',PharmacyStaff:'pharmacystaffs'});
const transactionPrototypes=new WeakSet();
function need(value,code){if(!value)throw Error('IR-04 fixture safety: '+code);}
function createTransactionTracker(Session,{isFrozen=()=>false,save=()=>{}}={}){
 const proto=Session?.prototype;need(proto&&!transactionPrototypes.has(proto),'transaction-instrumentation-unavailable');
 for(const method of ['startTransaction','commitTransaction','abortTransaction','endSession','inTransaction'])need(typeof proto[method]==='function','transaction-method-unavailable');
 const sessions=new Set(),failures=[],wrappers={};let pendingOperations=0;
 const status=()=>({installed:Object.entries(wrappers).every(([name,fn])=>proto[name]===fn),pendingTransactions:sessions.size,pendingOperations,failures:[...failures]});
 const record=()=>save(status()),start=proto.startTransaction;
 wrappers.startTransaction=function(...args){if(isFrozen()){failures.push('late-transaction-start');record();throw Error('IR-04 transactions frozen');}try{const value=start.apply(this,args);sessions.add(this);record();return value;}catch(error){failures.push('transaction-start-failed');record();throw error;}};
 for(const name of ['commitTransaction','abortTransaction','endSession']){const original=proto[name];wrappers[name]=async function(...args){pendingOperations++;record();try{const value=await original.apply(this,args),active=this.inTransaction();need(typeof active==='boolean','unknown-transaction-state');if(!active)sessions.delete(this);return value;}catch(error){sessions.add(this);failures.push('transaction-settlement-failed');throw error;}finally{pendingOperations--;record();}};}
 for(const [name,fn]of Object.entries(wrappers))proto[name]=fn;transactionPrototypes.add(proto);record();return{status};
}
function ownedId(qa,collection,id){need(/^[a-f0-9]{24}$/.test(String(id))&&qa.owned[collection]?.includes(String(id)),'foreign-'+collection+'-reference');}
function assertScope(qa){const s=qa.status();need(s.runtimeVerified===true&&s.nativeFixtureGuardActive===true&&s.dbGuardActive===true&&s.testMode===true&&s.productionUriLoaded===false&&s.readOnly===false,'runtime-not-verified');need(s.ownedReferences===true&&Array.isArray(s.allowedCollections)&&JSON.stringify([...s.allowedCollections].sort())===JSON.stringify([...IR04_COLLECTIONS].sort()),'scope-mismatch');return s;}
function validateActorReferences(qa,kind,values){
 for(const id of values.hospitals||[])ownedId(qa,'hospitals',id);
 for(const login of values.orgLogins||[])ownedId(qa,'hospitals',login.hospitalId);
 for(const report of values.reportedDoctors||[])ownedId(qa,'doctors',report.doctorId);
 for(const id of values.doctors||[])ownedId(qa,'doctors',id);
 if(values.pharmacyId)ownedId(qa,'pharmacies',values.pharmacyId);
 if(kind==='PharmacyStaff')need(values.pharmacyId,'staff-owned-pharmacy-required');
 if(values.createdBy)ownedId(qa,'pharmacystaffs',values.createdBy);
 if(values.adminId)ownedId(qa,'pharmacystaffs',values.adminId);
}
function actorOverrides(qa,kind,passwordHash,overrides={}){
 need(collections[kind],'unknown-actor-model');need(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(passwordHash||''),'fresh-bcrypt-hash-required');
 for(const key of ['password','role','isActive','isVerified','isSuperAdmin','datasetVersion','isSynthetic','testRunId','phase5xOwner'])need(!Object.hasOwn(overrides,key),'protected-actor-state-'+key);
 const value={twoFactorEnabled:false,otpSecret:undefined,tempPassword:undefined,passwordChangedAt:undefined,lastLoginAt:undefined,lastSignOutAt:undefined,
  hospitals:undefined,orgLogins:undefined,reportedDoctors:undefined,doctors:undefined,pharmacyId:undefined,adminId:undefined,createdBy:undefined,
  sessions:undefined,sessionTokens:undefined,trustedDevices:undefined,devices:undefined,otpSessions:undefined,recoveryToken:undefined,recoveryTokens:undefined,refreshToken:undefined,...overrides,password:passwordHash};
 if(kind==='Doctor'){value.hospitals=overrides.hospitals||[];value.orgLogins=overrides.orgLogins||[];value.personalEmail=undefined;}
 if(kind==='Patient')value.reportedDoctors=overrides.reportedDoctors||[];
 if(kind==='Hospital')value.doctors=overrides.doctors||[];
 if(kind==='Pharmacy'){value.adminId=overrides.adminId;value.inventory=overrides.inventory||[];}
 if(kind==='PharmacyStaff')value.createdBy=overrides.createdBy;
 validateActorReferences(qa,kind,value);return value;
}
async function cloneActor(qa,Model,filter,passwordHash,overrides={}){
 assertScope(qa);const kind=Model.modelName,values=actorOverrides(qa,kind,passwordHash,overrides),doc=await qa.clone(Model,filter,values);
 ownedId(qa,collections[kind],doc._id);const raw=await Model.collection.findOne({_id:doc._id});
 need(raw&&raw.phase5xOwner===qa.owner&&raw.isSynthetic===true&&raw.datasetVersion!== 'MEDISYNC_UNIV_DEMO_V2','cloned-record-not-owned');
 need(raw.password===passwordHash&&raw.email&&String(raw.email).endsWith('@qa.medisync.local'),'clone-credentials-or-identity');
 validateActorReferences(qa,kind,raw);return doc;
}
async function setOwnedReportedDoctors(qa,Patient,patientId,reports){
 assertScope(qa);ownedId(qa,'patients',patientId);need(Array.isArray(reports),'relationship-array-required');
 for(const report of reports)ownedId(qa,'doctors',report.doctorId);
 const raw=await Patient.collection.findOne({_id:patientId});need(raw&&raw.phase5xOwner===qa.owner&&raw.isSynthetic===true,'relationship-patient-not-owned');
 return Patient.updateOne({_id:patientId},{$set:{reportedDoctors:reports}});
}
async function verifyOwnedGraph(qa,db){
 assertScope(qa);need(db&&typeof db.collection==='function','owned-graph-database-unavailable');
 const rows=[],registered=new Set(),patientHashes=new Set(),clinicalLabels=new Set();
 function collect(value){if(!value||typeof value!=='object')return;if(value._id)registered.add(String(value._id));for(const child of Object.values(value))if(Array.isArray(child))child.forEach(collect);else if(child&&typeof child==='object'&&!child._bsontype&&!(child instanceof Date))collect(child);}
 for(const [name,ids]of Object.entries(qa.owned)){
  need(IR04_COLLECTIONS.includes(name),'owned-graph-collection');
  const documents=await db.collection(name).find({_id:{$in:ids.map(id=>db.bsonId?db.bsonId(id):id)}}).toArray();
  for(const doc of documents){ownedId(qa,name,doc._id);need(doc.phase5xOwner===qa.owner&&doc.isSynthetic===true&&doc.datasetVersion!=='MEDISYNC_UNIV_DEMO_V2','owned-graph-record');collect(doc);rows.push({name,doc});if(name==='patients'&&doc.patientNic_bi)patientHashes.add(doc.patientNic_bi);if(['labtests','prescriptions'].includes(name))for(const key of ['labTestId','reportId','prescriptionId'])if(doc[key])clinicalLabels.add(String(doc[key]));}
 }
 function refs(value,key=''){
  if(!value)return;
  if(value._bsontype==='ObjectId'){if(key!=='_id')need(registered.has(String(value)),'foreign-object-reference');return;}
  if(typeof value==='string'&&/^[a-f0-9]{24}$/.test(value)&&/(?:Id|Ids)$/.test(key)){need(registered.has(value),'foreign-string-reference');return;}
  if(Array.isArray(value)){value.forEach(v=>refs(v,key));return;}if(typeof value==='object'&&!(value instanceof Date))for(const[k,v]of Object.entries(value))refs(v,k);
 }
 for(const {name,doc}of rows){refs(doc);if(['consultations','prescriptions','labtests'].includes(name)){const hash=doc.patientNic_bi||doc.nicHash;if(hash)need(patientHashes.has(hash),'foreign-patient-blind-index');}if(name==='notifications'&&doc.referenceId)need(clinicalLabels.has(String(doc.referenceId)),'foreign-notification-reference');}
 return {documents:rows.length,registeredOwnedIds:registered.size};
}
function assertLedgers(qa,isolation,environment){
 const s=assertScope(qa),state=isolation.state;need(s.pendingWrites===0&&s.rejected===0,'native-write-state');
 need(state.instrumentation?.ready===true&&state.drained===true&&state.pendingHandlers===0&&state.activeRequests===0&&state.abortedRequests===0&&state.drainTimeouts===0&&Array.isArray(state.errors)&&state.errors.length===0,'unclean-controller-drain');
 for(const key of ['networkAttempts','secretReadAttempts'])need(Array.isArray(environment[key])&&environment[key].length===0,'unexpected-'+key);
 for(const key of ['rejectedAxios','rejectedNativeFetch','cloudinaryCalls'])need(state[key]===0,'unexpected-'+key);
 const tx=state.transactionStatus;need(tx?.installed===true&&tx.pendingTransactions===0&&tx.pendingOperations===0&&Array.isArray(tx.failures)&&tx.failures.length===0,'unsettled-or-failed-transaction');
 return s;
}
async function verifyCaseBoundary(qa,isolation,environment,transactions){
 try{await isolation.drain();need(transactions&&typeof transactions.status==='function','transaction-proof-unavailable');isolation.state.transactionStatus=transactions.status();const s=assertLedgers(qa,isolation,environment);need(!s.frozen,'failure-stop-active');isolation.state.cleanCaseBoundaries=(isolation.state.cleanCaseBoundaries||0)+1;isolation.save();}
 catch(error){qa.freeze();isolation.state.caseBoundaryFailure=true;isolation.state.failureStopObserved=true;isolation.state.recoveryRequired=true;isolation.save();throw error;}
}
module.exports={IR04_COLLECTIONS,createTransactionTracker,assertScope,ownedId,validateActorReferences,actorOverrides,cloneActor,setOwnedReportedDoctors,verifyOwnedGraph,assertLedgers,verifyCaseBoundary};
