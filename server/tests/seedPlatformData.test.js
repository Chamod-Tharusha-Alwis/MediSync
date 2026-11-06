'use strict';
const crypto=require('crypto');
const {buildSeedPlatformPlan}=require('../../scripts/seedPlatformPlan.cjs');
const {parseArguments,runCli,loadKeys,selectSeedTarget,verifySeedStorage,closeSeedConnection}=require('../../scripts/seed-platform-data.js');
const {assertPlan,assertOwned,inspectOwned,prepareRecords,runSeedPlan,modelSet}=require('../../scripts/seedPlatformStore.cjs');
const NOW='2026-11-06T07:30:00.000Z';
const plan=()=>buildSeedPlatformPlan({now:NOW,compact:true});
const emptyStore=()=>({readOwned:jest.fn(async()=>[]),countNamespace:jest.fn(async()=>0),startSession:jest.fn(async()=>{throw Error('UNEXPECTED_WRITE');})});

test.each([[],['--db','test'],['--db','medisync_prod','--force'],['--db','medisync_prod','--db','medisync_prod'],
  ['--db','medisync_prod','--confirm','--dry-run'],['--db','medisync_prod','--refresh','--remove']].map(args=>[args]))('CLI rejects unsafe or ambiguous target/mode before credentials %#',args=>{
  expect(()=>parseArguments(args)).toThrow(/^SEED_/);
});
test.each(['medisync_prod','medisync_automated_test'])('CLI requires an explicit approved database and defaults to dry-run: %s',database=>{
  const result=parseArguments(['--db',database]);expect(result.database===database&&result.apply===false&&result.action==='seed').toBe(true);
});
test.each(['--refresh','--remove'])('%s alone stays dry-run',flag=>expect(parseArguments(['--db','medisync_prod',flag]).apply).toBe(false));
test('write gate is required before reading a private environment or connecting',async()=>{
  const readFile=jest.fn(()=>{throw Error('PRIVATE_READ_FORBIDDEN');});
  await expect(runCli(['--db','medisync_prod','--confirm'],{environment:{},readFile})).rejects.toThrow('SEED_WRITE_APPROVAL_REQUIRED');
  expect(readFile).not.toHaveBeenCalled();
});
test('read-only plan inspection starts no transaction and invokes no model write',async()=>{
  const store=emptyStore();const result=await runSeedPlan({plan:plan(),store,models:{},apply:false});
  expect(result.dryRun&&result.existingOrTestAccountsTouched===0&&result.wouldInsert===109).toBe(true);
  expect(store.startSession).not.toHaveBeenCalled();
});
test('fully owned existing batch is an idempotent no-op without creating a session',async()=>{
  const p=plan(),store=emptyStore();
  store.readOwned.mockImplementation(async(model,ids)=>p.records.filter(r=>r.model===model&&ids.includes(r.id)).map(r=>({_id:r.id,[r.prefix.field]:r.prefix.value,syntheticSeedBatch:p.namespace,isSynthetic:true})));
  store.countNamespace.mockImplementation(async model=>p.records.filter(r=>r.model===model).length);
  const result=await runSeedPlan({plan:p,store,models:{},apply:true});
  expect(result.idempotent&&result.inserted===0&&result.deleted===0).toBe(true);expect(store.startSession).not.toHaveBeenCalled();
});
test('unregistered namespace records block before writes rather than blanket cleanup',async()=>{
  const store=emptyStore();store.countNamespace.mockResolvedValue(1);
  await expect(inspectOwned(plan(),store)).rejects.toThrow('SEED_UNREGISTERED_OWNED_RECORDS');expect(store.startSession).not.toHaveBeenCalled();
});
test.each(['unmarked','nonprefix','wrong-id'])('existing %s record fails strict ownership',variant=>{
  const p=plan(),spec=p.records[0],row={_id:spec.id,[spec.prefix.field]:spec.prefix.value,syntheticSeedBatch:p.namespace,isSynthetic:true};
  if(variant==='unmarked')delete row.syntheticSeedBatch;
  if(variant==='nonprefix')row[spec.prefix.field]='not-owned';
  if(variant==='wrong-id')row._id='000000000000000000000001';
  expect(()=>assertOwned(row,spec,p.namespace)).toThrow('SEED_EXISTING_RECORD_NOT_OWNED');
});
test('owned-looking clinical rows cannot reference an existing or test patient outside the registry',()=>{
  const p=plan();p.records.find(r=>r.model==='Consultation').document.patientId='000000000000000000000001';
  expect(()=>assertPlan(p)).toThrow('SEED_FOREIGN_REFERENCE_NOT_OWNED');
});
test('cross-patient NIC/record links fail before storage access',()=>{
  const p=plan();p.records.find(r=>r.model==='Consultation').document.patientNic='SYNTHETIC_MISMATCH';
  expect(()=>assertPlan(p)).toThrow('SEED_PATIENT_LINK_MISMATCH');
});
test('invalid operation refuses before any store operation',async()=>{
  const store=emptyStore();await expect(runSeedPlan({plan:plan(),store,action:'drop',apply:true})).rejects.toThrow('SEED_MODE_INVALID');expect(store.readOwned).not.toHaveBeenCalled();
});
test('model preparation uses app encryption and trusted synthetic metadata without a connection',()=>{
  const saved={keys:global.ENCRYPTION_KEYS,version:global.ACTIVE_KEY_VERSION,key:global.ENCRYPTION_KEY};
  try{
    global.ENCRYPTION_KEYS={'1':crypto.randomBytes(32).toString('hex')};global.ACTIVE_KEY_VERSION=1;global.ENCRYPTION_KEY=global.ENCRYPTION_KEYS['1'];
    const mongoose=require('mongoose');require('../src/security/productionAtlasPolicy').disableAutomaticModelDdl(mongoose);
    const p=plan(),models=modelSet(mongoose),hash=require('bcryptjs').hashSync(crypto.randomBytes(48).toString('hex'),12);
    const rows=prepareRecords(p,models,{passwordHash:hash}),patient=rows.find(r=>r.model==='Patient'),consultation=rows.find(r=>r.model==='Consultation');
    expect(rows.length===p.records.length&&mongoose.connection.readyState===0).toBe(true);
    expect(patient.raw.__enc_fullName===true&&patient.raw.fullName!==patient.document.fullName).toBe(true);
    expect(typeof patient.raw.patientNic_bi==='string'&&patient.raw.patientNic_bi.length>0).toBe(true);
    expect(consultation.raw.__enc_diagnosis===true&&consultation.raw.surveillanceVerification.source==='synthetic_qa').toBe(true);
    expect(Object.values(models).every(M=>M.schema.options.autoCreate===false&&M.schema.options.autoIndex===false)).toBe(true);
  }finally{global.ENCRYPTION_KEYS=saved.keys;global.ACTIVE_KEY_VERSION=saved.version;global.ENCRYPTION_KEY=saved.key;}
});
test('production key admission rejects missing operator keys without a fallback',()=>{
  expect(()=>loadKeys({MEDISYNC_PROTOTYPE_MODE:'true',MEDISYNC_ALLOW_OPERATOR_KEYS:'true'},false)).toThrow();
});

const production=()=>{
  const env=require('./helpers/gate3OperatorEnvironment').production();
  env.MONGO_URI=env.MONGO_URI.replace('medisync.p7hjket.mongodb.net','medisync.xton2tj.mongodb.net');return env;
};
test('seed-local pin admits only the current existing production cluster through the real operator policy',()=>{
  const target=selectSeedTarget(production(),'medisync_prod');
  expect(target.connectionOptions).toMatchObject({tls:true,authSource:'admin',authMechanism:'SCRAM-SHA-256',dbName:'medisync_prod'});
});
test.each(['medisync.p7hjket.mongodb.net','another.abc12.mongodb.net','localhost'])('seed-local policy rejects an unapproved production hostname %#',host=>{
  const env=production();env.MONGO_URI=env.MONGO_URI.replace('medisync.xton2tj.mongodb.net',host);
  expect(()=>selectSeedTarget(env,'medisync_prod')).toThrow();
});
test.each(['tls=false','tlsAllowInvalidCertificates=true','authSource=other','authMechanism=PLAIN','w=0'])('seed preserves the real operator URI option rejection %#',option=>{
  const env=production();env.MONGO_URI=env.MONGO_URI.split('?')[0]+'?'+option;
  expect(()=>selectSeedTarget(env,'medisync_prod')).toThrow();
});
test('seed QA mode uses only the existing separate QA admission and refuses mixed aliases',()=>{
  const env=require('./helpers/gate3OperatorEnvironment').qa();
  expect(selectSeedTarget(env,'medisync_automated_test').mode).toBe('qa');
  expect(()=>selectSeedTarget({...env,MONGO_URI:production().MONGO_URI},'medisync_automated_test')).toThrow('MIXED_ENVIRONMENT');
});
test.each([true,false])('real storage verification is strictly read-only despite inherited provisioning flag; complete=%s',async complete=>{
  const fixture=require('./helpers/gate3StorageFixture').storageFixture({complete});
  const quiet=jest.spyOn(console,'error').mockImplementation(()=>{});
  try{
    const run=verifySeedStorage(fixture.db,{MEDISYNC_AUTO_PROVISION_STORAGE:'true'},{mode:'production'},{});
    if(complete)await expect(run).resolves.toBeUndefined();else await expect(run).rejects.toThrow('PRODUCTION_STORAGE_PREREQUISITES_NOT_VERIFIED');
    expect(fixture.writes.length).toBe(0);expect(fixture.db.createCollection).not.toHaveBeenCalled();
  }finally{quiet.mockRestore();}
});
const ownedStore=(p,session)=>({
  async readOwned(model,ids){return p.records.filter(r=>r.model===model&&ids.includes(r.id)).map(r=>({_id:r.id,[r.prefix.field]:r.prefix.value,syntheticSeedBatch:p.namespace,isSynthetic:true}));},
  async countNamespace(model){return p.records.filter(r=>r.model===model).length;},
  countForeignReferences:jest.fn(async()=>0),deleteOwned:jest.fn(async()=>1),startSession:jest.fn(async()=>session)
});
test.each(['refresh','remove'])('non-owned dependants block %s before a transaction, including dry-run',async action=>{
  const p=plan(),store=ownedStore(p,{});store.countForeignReferences.mockResolvedValue(1);
  for(const apply of [false,true])await expect(runSeedPlan({plan:p,store,action,apply})).rejects.toThrow('SEED_NON_OWNED_DEPENDENCIES_PRESENT');
  expect(store.startSession).not.toHaveBeenCalled();expect(store.deleteOwned).not.toHaveBeenCalled();
});
test('dependency metadata failure stops without deleting a record',async()=>{
  const p=plan(),store=ownedStore(p,{});store.countForeignReferences.mockRejectedValue(Error('INERT_READ_REJECTED'));
  await expect(runSeedPlan({plan:p,store,action:'remove',apply:true})).rejects.toThrow('SEED_DEPENDENCIES_UNVERIFIED');
  expect(store.deleteOwned).not.toHaveBeenCalled();
});
test('uncertain commit remains explicit even if session closure also fails; no retry or abort',async()=>{
  const p=plan(),session={startTransaction:jest.fn(),commitTransaction:jest.fn(async()=>{throw Error('LOST_ACK');}),abortTransaction:jest.fn(),endSession:jest.fn(async()=>{throw Error('CLOSE');})},store=ownedStore(p,session);
  await expect(runSeedPlan({plan:p,store,action:'remove',apply:true})).rejects.toMatchObject({code:'SEED_COMMIT_OUTCOME_UNKNOWN_NO_RETRY',sessionCleanupVerified:false});
  expect(session.commitTransaction).toHaveBeenCalledTimes(1);expect(session.abortTransaction).not.toHaveBeenCalled();
});
test('committed result with session-close failure is classified without pretending the transaction rolled back',async()=>{
  const p=plan(),session={startTransaction:jest.fn(),commitTransaction:jest.fn(async()=>{}),abortTransaction:jest.fn(),endSession:jest.fn(async()=>{throw Error('CLOSE');})},store=ownedStore(p,session);
  await expect(runSeedPlan({plan:p,store,action:'remove',apply:true})).rejects.toThrow('SEED_COMMITTED_SESSION_CLEANUP_UNVERIFIED');
  expect(session.abortTransaction).not.toHaveBeenCalled();
});
test('disconnect failure cannot hide the primary uncertain-commit category',async()=>{
  const primaryError=Object.assign(Error('SEED_COMMIT_OUTCOME_UNKNOWN_NO_RETRY'),{code:'SEED_COMMIT_OUTCOME_UNKNOWN_NO_RETRY'});
  await expect(closeSeedConnection({disconnect:async()=>{throw Error('CLOSE');}},{primaryError})).resolves.toBeUndefined();
  expect(primaryError.code==='SEED_COMMIT_OUTCOME_UNKNOWN_NO_RETRY'&&primaryError.connectionCleanupVerified===false).toBe(true);
});
test.each([false,true])('disconnect failure distinguishes a committed write from a read-only attempt: applied=%s',async applied=>{
  await expect(closeSeedConnection({disconnect:async()=>{throw Error('CLOSE');}},{applied})).rejects.toThrow(applied?'SEED_COMMITTED_CONNECTION_CLEANUP_UNVERIFIED':'SEED_CONNECTION_CLEANUP_UNVERIFIED');
});
