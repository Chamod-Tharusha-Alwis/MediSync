'use strict';
// Pure, dependency-injected orchestration. Importing this module has no I/O.
const assert=require('assert'),crypto=require('crypto');
const {BROWSER_COLLECTIONS,validateBrowserRunConfig}=require('./browserRunConfig');
const attempt=require('./e1AttemptIdentity');
const UUID=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const parentSources=Object.freeze([...require('./qaIsolatedParentContract').SOURCES,'server/scripts/phase5xE1LifecycleRun.js','server/tests/helpers/e1TrustedParent.js','server/tests/helpers/e1ParentIo.js','server/scripts/phase5xE1ParentChecks.js','server/tests/helpers/e1AttemptIdentity.js','server/tests/helpers/e1WindowsInventory.js','server/scripts/phase5xE1R3C1Checks.js','server/scripts/phase5xE1Env3Checks.js','server/tests/helpers/browserInertProof.js']);
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
function validateAdmission(a,now=Date.now()){
  assert(a&&a.authorizedByHuman===true&&a.phase==='5X-E1'&&a.scope==='one-read-only-zero-actor-lifecycle-attempt');
  attempt.assertAttempt(a.phase,a.attemptId);
  if(Object.hasOwn(a,'isolatedQa'))require('./qaIsolatedParentContract').validateIsolatedShape(a);
  assert(a.purpose==='E1-lifecycle-only'&&a.oneAttemptOnly===true&&a.database==='medisync_automated_test'&&a.backend==='http://127.0.0.1:5100','Exact approved E1 mode and endpoint required');
  assert(UUID.test(a.id||'')&&a.owner===`5xc-b-${a.ownerUuid}`&&UUID.test(a.ownerUuid||''));
  assert(a.parentLauncherReviewedByHuman===true&&a.parentReviewScope==='E1-trusted-parent-v1','Separate review of the new trusted parent required');
  const age=now-Date.parse(a.confirmedAt);assert(Number.isFinite(age)&&age>=0&&age<900000&&a.otherWritersIdle===true,'Fresh idle window required');
  assert(a.readOnly===true&&a.clinicalMutationsAllowed===false&&a.fixtureSetupAllowed===false&&a.attemptLimit===1);
  assert(a.ownedReferences===true);assert.deepEqual([...a.allowedCollections].sort(),[...BROWSER_COLLECTIONS].sort());
  for(const f of parentSources)assert(/^[a-f0-9]{64}$/.test(a.sourceHashes?.[f]||''),'Reviewed parent source missing');
  for(const key of ['sourceProofSha256','parentProofSha256'])assert(/^[a-f0-9]{64}$/.test(a[key]||''));
  assert(/^5xd7c-inert-[a-z0-9-]+\.json$/.test(a.sourceProofFile||''));assert(/^5xe1-parent-inert-[a-z0-9-]+\.json$/.test(a.parentProofFile||''));
  assert(a.foundationEvidence&&['handlers','ir04','d5','d6a','ownership','failure','bootstrap','windowsInventory'].every(k=>/^[a-z0-9-]+\.json$/.test(a.foundationEvidence[k]||'')));
  return true;
}
function configFor(a){return validateBrowserRunConfig({phase:a.phase,attemptId:a.attemptId,approvalSha256:attempt.approvalDigest(a),owner:a.owner,approvalId:a.id,authorizedByHuman:true,confirmedAt:a.confirmedAt,purpose:'E1-lifecycle-only',protocol:'5xd7c-owned-v4',frontend:'http://127.0.0.1:3100',backend:'http://127.0.0.1:5100',ml:'http://127.0.0.1:5101',database:'medisync_automated_test',clinicalMutationsAllowed:false,fixtureSetupAllowed:false,ownedReferences:true,allowedCollections:a.allowedCollections,sourceProofFile:a.sourceProofFile,sourceProofSha256:a.sourceProofSha256,...(Object.hasOwn(a,'isolatedQa')?{isolatedQaContractSha256:require('./qaIsolatedParentContract').validateIsolatedShape(a)}:{})});}
function verifyReadOnly(r){
  require('../../scripts/phase5xD6TargetedRun').preservation(r);
  assert.equal(r.inventory.length,25);assert.equal(r.referencesChecked,234);assert.equal(r.blindIndicesChecked,55);
  assert(r.nativeFixtureGuardActive&&r.schemaGuardActive&&r.runtimeVerification?.nativeFixtureGuardActive&&r.runtimeVerification?.dbGuardActive);
  assert(r.runtimeVerification.testMode&&r.runtimeVerification.productionUriLoaded===false&&r.runtimeVerification.providerSecretKeysLoaded===0);
  return true;
}
function compareSnapshots(before,after){
  const canonical=s=>Object.entries(s.collections).sort(([a],[b])=>a.localeCompare(b)).map(([name,c])=>[name,c.baselineCount,Object.entries(c.documents).sort(([a],[b])=>a.localeCompare(b))]);
  assert.deepEqual(canonical(before),canonical(after),'Original inventory/ID/content hash mismatch');return true;
}
function bindIdentity(identity,child,a){
  attempt.assertBinding(identity,attempt.binding(a));
  assert(child&&Number.isSafeInteger(child.pid)&&child.pid>0&&child.alive===true&&child.osIdentityVerified===true,'Actual live spawned PID/OS identity required');
  assert(identity?.processId===child.pid&&identity.owner===a.owner&&identity.approvalId===a.id&&/^[a-f0-9]{64}$/.test(identity.nonce||'')&&identity.sourceProofSha256===a.sourceProofSha256,'Startup identity mismatch');
  return Object.freeze({...identity});
}
function verifyStatus(response,a,pid){
  attempt.assertBinding(response.body,attempt.binding(a));
  const b=response.body;assert.equal(response.status,200);assert(b&&b.owner===a.owner&&b.processId===pid&&b.database==='medisync_automated_test'&&b.protocol==='5xd5-drain-v1'&&b.lifecycleVersion==='5xd7c-v1');
  assert.deepEqual(b.roles,[{role:'readWrite',db:'medisync_automated_test'}]);
  assert(b.readOnly===true&&b.runtimeVerified===true&&b.ownedReferences===true&&b.nativeFixtureGuardActive===true&&b.dbGuardActive===true&&b.testMode===true&&b.productionUriLoaded===false&&b.frozen===false&&b.phase==='accepting'&&b.rejected===0);
  assert.deepEqual([...b.allowedCollections].sort(),[...a.allowedCollections].sort());assert(b.instrumentation?.ready&&b.transactionInstrumentation===true&&b.externalProviders==='mocked');
  assert(b.frontend==='http://127.0.0.1:3100'&&b.backend==='http://127.0.0.1:5100'&&b.ml==='http://127.0.0.1:5101');return true;
}
async function runE1(a,io){
  if(a&&Object.hasOwn(a,'isolatedQa'))require('./qaIsolatedParentContract').assertLiveExecutionClosed();
  // Admission fails before any environment read, record creation, spawn or Atlas.
  validateAdmission(a,io.now());
  const admittedDigest=attempt.approvalDigest(a),checkUnchanged=()=>assert.equal(attempt.approvalDigest(a),admittedDigest,'Approval changed after admission');
  const record={phase:'5X-E1',attemptId:a.attemptId,approvalSha256:admittedDigest,approvalId:a.id,owner:a.owner,attempts:1,started:io.timestamp(),status:'PREPARED',clinicalWritesPermitted:false,backendStarted:false,freezeRequested:false,errors:[],databaseDeletions:0};
  let before,child,identity,closed=false,identityAttempted=false;
  const save=()=>io.save(record);
  const freeze=async()=>{record.freezeRequested=true;try{save();}catch(_){record.errors.push({stage:'freeze-checkpoint',category:'EvidenceWriteFailure'});}const reply=await io.control('freeze',a.owner);attempt.assertBinding(reply.body,{protocolPhase:'5X-E1',attemptId:record.attemptId,approvalSha256:admittedDigest});assert.equal(reply.status,200);assert(reply.body.owner===a.owner&&reply.body.processId===child.pid&&reply.body.shutdownInitiated===true&&reply.body.frozen===true);};
  try{
    await io.verifyProofs(a);checkUnchanged();await io.assertQuarantines();await io.inspectExclusive();checkUnchanged();await io.assertUnused(a);checkUnchanged();await io.consume(a);checkUnchanged();save();
    const env=await io.buildEnvironment();before=await io.snapshot('pre',env,a);verifyReadOnly(before.result);record.before=before.evidence;save();
    // The window/proofs/process inventory are checked again after snapshot work.
    checkUnchanged();validateAdmission(a,io.now());await io.verifyProofs(a);await io.inspectExclusive();checkUnchanged();
    const config=configFor(a);await io.writeConfig(config);child=await io.startBackend(env,config);record.backendStarted=true;record.backendPid=child.pid;save();
    identityAttempted=true;const startup=await io.waitIdentity(child,a);identity=bindIdentity(startup.identity,startup.child,a);record.processIdentity=identity;record.spawnObservation=startup.child;save();
    checkUnchanged();verifyStatus(await io.control('status',a.owner),a,child.pid);
    const denied=[['invalidOwner',403,'QA owner header required'],['clinicalDenied',423,'E1 permits lifecycle controls only'],['mockEmailDenied',403,'No E1 actors or OTP access permitted']];
    record.controls=[{kind:'status',status:200}];
    for(const[kind,status,error]of denied){const response=await io.control(kind,a.owner);assert.equal(response.status,status);assert.deepEqual(response.body,{error});record.controls.push({kind,status});save();}
    await freeze();
  }catch(error){record.errors.push({stage:record.backendStarted?'backend-or-controls':'preflight',category:error.code||error.name||'Error'});record.status='BLOCKED';try{save();}catch(_){record.errors.push({stage:'failure-checkpoint',category:'EvidenceWriteFailure'});}}
  finally{
    // The adapter retains a spawned handle even if writing its PID receipt fails.
    // Recover that exact handle for safe shutdown; never spawn a replacement.
    if(!child&&io.getStartedBackend?.()){
      child=io.getStartedBackend();record.backendStarted=true;record.backendPid=child.pid;
    }
    if(child){
      if(!identity&&!identityAttempted){identityAttempted=true;try{const startup=await io.waitIdentity(child,a);identity=bindIdentity(startup.identity,startup.child,a);record.processIdentity=identity;}catch(error){record.errors.push({stage:'spawn-receipt-recovery',category:error.code||error.name});}}
      if(identity&&!record.freezeRequested){try{await freeze();}catch(error){record.errors.push({stage:'safe-freeze',category:error.code||error.name});}}
      let exit;
      try{exit=await io.waitExit(child);record.exit=exit;assert(exit.exited===true);}catch(error){record.errors.push({stage:'exit-observation',category:error.code||error.name});}
      try{
        closed=await io.observePidAbsent(child.pid);assert(closed===true);
        if(!identity)throw Error('No bound startup identity');
        const final=await io.finalProof(a,identity);record.finalProof=final;assert(exit&&exit.code===0&&!exit.signal,'Backend failed naturally');
      }catch(error){record.errors.push({stage:'shutdown-proof',category:error.code||error.name});}
      if(closed){try{const after=await io.snapshot('post',await io.buildEnvironment(),a);verifyReadOnly(after.result);assert(before);compareSnapshots(before.snapshot,after.snapshot);record.after=after.evidence;record.preservationPassed=true;}catch(error){record.errors.push({stage:'postflight',category:error.code||error.name});}}
      else record.postflight='PENDING; owned process absence uncertain';
    }
    try{await io.assertQuarantines();record.quarantinesClosed=true;}catch(error){record.errors.push({stage:'quarantine',category:error.code||error.name});}
    try{checkUnchanged();}catch(_){record.errors.push({stage:'approval-binding',category:'ApprovalChanged'});}
    record.completed=io.timestamp();record.recoveryRequired=record.errors.length>0;
    record.status=child&&identity&&record.finalProof&&record.preservationPassed&&!record.errors.length?'PASS':'BLOCKED';try{save();}catch(_){record.errors.push({stage:'final-checkpoint',category:'EvidenceWriteFailure'});record.status='BLOCKED';record.recoveryRequired=true;}
  }
  return record;
}
module.exports={runE1,validateAdmission,configFor,verifyReadOnly,compareSnapshots,bindIdentity,verifyStatus,parentSources,sha};
