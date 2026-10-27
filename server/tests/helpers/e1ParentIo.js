'use strict';
// Trusted-parent adapter. Import is inert; methods are called only after admission.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert'),{spawn,execFileSync}=require('child_process');
const attempt=require('./e1AttemptIdentity'),windowsInventory=require('./e1WindowsInventory');
const root=path.resolve(__dirname,'../../..'),server=path.join(root,'server'),evidence=path.join(root,'scratch/phase5x-evidence');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),read=name=>{assert(/^[a-z0-9-]+\.json$/.test(name)||/^5xc-b-[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(identity|server|shutdown)\.json$/.test(name));return JSON.parse(fs.readFileSync(path.join(evidence,name),'utf8'));};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function powershell(script){return JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; "+script],{env:windowsInventory.inspectionEnvironment(),encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:1024*1024}).replace(/^\uFEFF/,''));}
function createE1Io(approval){
  if(approval&&Object.hasOwn(approval,'isolatedQa'))require('./qaIsolatedParentContract').assertLiveExecutionClosed();
  let checkpoint=0,backendHandle,lastInventoryObservation,consumedDigest;const children=[],prefix='5xe1-'+approval.id,paths={config:`5xe1-config-${approval.owner}.json`,identity:`${approval.owner}.identity.json`,manifest:`${approval.owner}.server.json`,shutdown:`${approval.owner}.shutdown.json`,consumed:`5xe1-parent-consumed-${approval.id}.json`};
  const write=(name,value)=>fs.writeFileSync(path.join(evidence,name),JSON.stringify(value,null,2),{flag:'wx'});
  const fileHash=name=>sha(fs.readFileSync(path.join(evidence,name)));
  const bounded=async(promise,ms)=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('Owned wait expired'),{code:'E1_WAIT_TIMEOUT'})),ms);})]);}finally{clearTimeout(timer);}};
  const pidAbsent=pid=>{assert(Number.isSafeInteger(pid)&&pid>0&&pid!==process.pid);try{process.kill(pid,0);return false;}catch(error){if(error.code!=='ESRCH')throw Error('OS PID inspection uncertain');return true;}};
  function child(script,args,env,label){
    const started=Date.now(),proc=spawn(process.execPath,[path.join(server,script),...args],{cwd:server,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    const handle={pid:proc.pid,proc,started,label,output:'',outputExceeded:false};children.push(handle);
    const capture=chunk=>{if(handle.output.length+chunk.length>1024*1024){handle.outputExceeded=true;return;}handle.output+=chunk;};proc.stdout.on('data',capture);proc.stderr.on('data',capture);
    handle.closed=new Promise((resolve,reject)=>{proc.once('error',reject);proc.once('close',(code,signal)=>resolve({code,signal,exited:true}));});
    // A startup error can occur before the caller starts awaiting this promise.
    handle.closed.catch(()=>{});return handle;
  }
  const sanitize=(output,env)=>{let text=output.replace(/mongodb(?:\+srv)?:\/\/[^\s"']+/g,'<redacted-uri>').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'<redacted-token>');for(const value of Object.values(env||{}))if(typeof value==='string'&&value.length>8)text=text.split(value).join('<redacted-secret>');return text;};
  const io={now:Date.now,timestamp:()=>new Date().toISOString(),
    save(record){write(`${prefix}-checkpoint-${checkpoint++}.json`,record);},
    async verifyProofs(a){
      require('./browserSourceProof').verifyBrowserSourceProof(a);
      const parentBytes=fs.readFileSync(path.join(evidence,a.parentProofFile));assert.equal(sha(parentBytes),a.parentProofSha256);const parent=JSON.parse(parentBytes),age=Date.now()-Date.parse(parent.timestamp);
      assert(parent.databaseFree&&parent.atlasConnections===0&&parent.backendStarts===0&&parent.failed===0&&parent.passed>=30&&Array.isArray(parent.checks)&&parent.checks.length===parent.passed&&parent.checks.every(c=>c.passed)&&age>=0&&age<1800000,'Fresh actual parent inert proof required');
      const sources={...read(a.sourceProofFile).sourceHashes,...parent.sourceHashes};
      for(const file of require('./e1TrustedParent').parentSources)assert(parent.sourceHashes?.[file]===a.sourceHashes[file]);
      for(const[file,hash]of Object.entries(sources)){assert(/^(server|client)\/[A-Za-z0-9_./-]+\.(js|jsx|ts|tsx|json)$/.test(file)&&!file.split('/').includes('..'));assert.equal(sha(fs.readFileSync(path.join(root,file))),hash,'Reviewed source drift');assert.equal(a.sourceHashes[file],hash,'Approval source map incomplete');}
      for(const[name,count]of Object.entries({handlers:54,ir04:59,d5:90,d6a:34,ownership:15,failure:4})){const file=a.foundationEvidence[name],r=read(file),stamp=r.timestamp?Date.parse(r.timestamp):fs.statSync(path.join(evidence,file)).mtimeMs;assert(Date.now()-stamp>=0&&Date.now()-stamp<1800000&&r.databaseFree&&!r.atlasConnections);assert.equal(r.passed??r.checks?.filter(c=>c.passed).length,count);assert(!r.failed);if(typeof r.checks?.[0]==='object')assert(r.checks.every(c=>c.passed));}
      const b=read(a.foundationEvidence.bootstrap),ageB=Date.now()-Date.parse(b.timestamp);assert(b.actualChildProcess&&b.bootstrapPassed&&b.databaseFree&&!b.atlasConnections&&!b.envFilesRead&&!b.realTransportAttempts&&b.intentionalReadRejectedBeforeDispatch&&ageB>=0&&ageB<1800000);
      const w=read(a.foundationEvidence.windowsInventory),ageW=Date.now()-Date.parse(w.timestamp);
      assert(w.phase==='5X-E1-R3-ENV3'&&w.databaseFree===true&&w.executionAuthorized===false&&w.atlasConnections===0&&w.localMongoConnections===0&&w.liveE1Attempts===0&&w.backendStarts===0&&w.compilerInvocations===0&&w.failed===0&&w.passed>=36&&Array.isArray(w.checks)&&w.checks.length===w.passed&&w.checks.every(c=>c.passed===true)&&ageW>=0&&ageW<1800000,'Fresh actual ENV3 inventory safety proof required');
      for(const file of require('./e1TrustedParent').parentSources)assert.equal(w.sourceHashes?.[file],a.sourceHashes[file],'Inventory safety proof source mismatch');
      for(const key of ['envReads','realOsOrCompilerCalls','realTransport','realBackendStarts','realDatabaseConnections','realConsumptionWrites'])assert(w.counters?.[key]===0,'Inventory safety proof must be inert');
    },
    async assertQuarantines(){for(const file of ['server/tests/ir04BackendIntegration.test.js','server/tests/patientProfileOwnedIntegration.test.js','server/tests/prescriptionDurationOwnedIntegration.test.js','server/tests/lab.test.js','server/tests/universityDemoSeedVerify.test.js','client/tests/ir04-isolated-five-role-e2e.spec.js']){const bytes=fs.readFileSync(path.join(root,file));assert(/throw new Error\([^\n]*quarantine/i.test(bytes.toString()));assert.equal(sha(bytes),approval.sourceHashes[file]);}},
    async inspectExclusive(){
      const r=windowsInventory.collectWindowsInventory({run:powershell,selfPid:process.pid}),decision=windowsInventory.classifyWindowsInventory(r,{previousObservation:lastInventoryObservation,confirmedAt:approval.confirmedAt,expectedSourceSha256:approval.sourceHashes['server/tests/helpers/e1WindowsInventory.js'],expectedInspectorPid:process.pid});
      write(`${prefix}-process-inspection-${checkpoint++}.json`,{timestamp:new Date().toISOString(),...r,decision});assert(decision.allowed,'Exclusive QA window/ports or service identity not established');lastInventoryObservation=decision.observation;
    },
    async assertUnused(){for(const name of [...Object.values(paths),`5xe1-consumed-${approval.id}.json`])assert(!fs.existsSync(path.join(evidence,name)),'Owner/approval evidence already exists');},
    async consume(a){attempt.assertAttempt(a.phase,a.attemptId);const digest=attempt.approvalDigest(a);write(paths.consumed,{phase:a.phase,attemptId:a.attemptId,approvalSha256:digest,approvalId:a.id,owner:a.owner,scope:a.scope,consumedAt:new Date().toISOString()});consumedDigest=digest;},
    async buildEnvironment(){return require('./qaParentEnvironment').buildQaChildEnvironment();},
    async snapshot(stage,env,a){
      assert(['pre','post'].includes(stage));const tag=`e1-${stage}-${a.id}`,handle=child('scripts/phase5xD6AReadOnlyChild.js',[tag],env,stage);
      const exit=await bounded(handle.closed,180000);write(`${prefix}-${stage}-observer.json`,{phase:a.phase,attemptId:a.attemptId,approvalSha256:consumedDigest,pid:handle.pid,exit,role:'read-only preservation observer; not an actor owner'});
      fs.writeFileSync(path.join(evidence,`${prefix}-${stage}.log`),sanitize(handle.output,env),{flag:'wx'});assert(exit.code===0&&!exit.signal&&!handle.outputExceeded&&pidAbsent(handle.pid));
      const resultFile=`5xc-${tag}-preservation.json`,snapshotFile=`5xc-${tag}-database-current.json`;return{result:read(resultFile),snapshot:read(snapshotFile),evidence:{result:resultFile,snapshot:snapshotFile,snapshotSha256:fileHash(snapshotFile)}};
    },
    async writeConfig(config){attempt.assertBinding({protocolPhase:config.phase,attemptId:config.attemptId,approvalSha256:config.approvalSha256},attempt.binding(approval));assert(consumedDigest===config.approvalSha256);write(paths.config,config);},
    async startBackend(env,config){assert(consumedDigest===config.approvalSha256&&consumedDigest===attempt.approvalDigest(approval));attempt.assertAttempt(config.phase,config.attemptId);const childEnv=require('./qaEnvironmentContract').validateChildEnvironment({...env,MEDISYNC_QA_BROWSER_EXECUTION_APPROVED:'true',MEDISYNC_QA_BROWSER_OWNER:config.owner});const handle=child('scripts/phase5xBrowserBackend.js',[],childEnv,'backend');backendHandle=handle;handle.env=childEnv;assert(Number.isSafeInteger(handle.pid)&&handle.pid>0);write(`${prefix}-spawn.json`,{protocolPhase:config.phase,attemptId:config.attemptId,approvalSha256:consumedDigest,pid:handle.pid,parentPid:process.pid,started:new Date(handle.started).toISOString(),script:'scripts/phase5xBrowserBackend.js',owner:config.owner,approvalId:config.approvalId});return handle;},
    getStartedBackend:()=>backendHandle,
    async waitIdentity(handle,a){
      const deadline=Date.now()+30000;while(!fs.existsSync(path.join(evidence,paths.identity))||!handle.output.includes('[QA_E1_READY]')){assert(!pidAbsent(handle.pid),'Child exited before startup identity');assert(Date.now()<deadline,'Startup identity timeout');await delay(25);}
      const observed=powershell(`$p=Get-CimInstance Win32_Process -Filter 'ProcessId = ${handle.pid}'; if(!$p){throw 'Spawned child absent'}; [pscustomobject]@{PID=$p.ProcessId;ParentPID=$p.ParentProcessId;Created=$p.CreationDate.ToUniversalTime().ToString('o');CommandMatches=([string]$p.CommandLine -match 'phase5xBrowserBackend\.js')} | ConvertTo-Json -Compress`);
      assert(observed.PID===handle.pid&&observed.ParentPID===process.pid&&observed.CommandMatches&&Math.abs(Date.parse(observed.Created)-handle.started)<10000&&!pidAbsent(handle.pid));
      const identity=read(paths.identity);attempt.assertBinding(identity,attempt.binding(a));return{identity,child:{pid:handle.pid,alive:true,osIdentityVerified:true,creationTime:observed.Created,parentPid:observed.ParentPID}};
    },
    async control(kind,owner){
      const routes={status:['GET','/api/qa/status',owner],invalidOwner:['GET','/api/qa/status','invalid-e1-owner'],clinicalDenied:['GET','/api/patient/e1-denied',owner],mockEmailDenied:['GET','/api/qa/mock-email',owner],freeze:['POST','/api/qa/freeze',owner]};assert(Object.hasOwn(routes,kind));const[method,url,header]=routes[kind];
      return new Promise((resolve,reject)=>{
        let timer;const done=value=>{clearTimeout(timer);resolve(value);},failed=error=>{clearTimeout(timer);reject(error);};
        const req=require('http').request({host:'127.0.0.1',port:5100,path:url,method,agent:false,headers:{'x-medisync-qa-owner':header,Connection:'close'}},res=>{
          let body='';res.on('data',chunk=>{body+=chunk;if(body.length>65536)req.destroy(Error('Oversized control reply'));});
          res.once('error',failed);res.once('aborted',()=>failed(Error('Control response aborted')));
          res.on('end',()=>{try{done({status:res.statusCode,body:JSON.parse(body)});}catch(_){failed(Error('Non-JSON control reply'));}});
        });
        timer=setTimeout(()=>req.destroy(Error('Control request deadline')),5000);
        req.setTimeout(5000,()=>req.destroy(Error('Control request timeout')));req.once('error',failed);req.end();
      });
    },
    async waitExit(handle){const exit=await bounded(handle.closed,20000);fs.writeFileSync(path.join(evidence,`${prefix}-backend.log`),sanitize(handle.output,handle.env),{flag:'wx'});assert(!handle.outputExceeded);return exit;},
    async observePidAbsent(pid){return pidAbsent(pid);},
    async finalProof(a,identity){
      const receipt=read(paths.shutdown),bytes=fs.readFileSync(path.join(evidence,paths.manifest)),manifest=JSON.parse(bytes);
      const observation=require('./browserProcessObservation').observeOwnedProcess({identity:receipt.processIdentity,expected:identity});
      const verifier=require('./browserCleanupProof');verifier.verifyBrowserCleanupProof(receipt,{owner:a.owner,processId:identity.processId,processAlive:false,processObservation:observation,manifestSha256:sha(bytes)});verifier.verifyBrowserManifest(manifest,{owner:a.owner,allowedCollections:a.allowedCollections});
      attempt.assertBinding(receipt.processIdentity,attempt.binding(a));const proof={...attempt.binding(a),shutdown:paths.shutdown,journal:paths.manifest,journalSha256:sha(bytes),shutdownSha256:fileHash(paths.shutdown),processObservation:observation,ownedIds:0,databaseDeletions:0};write(`${prefix}-shutdown-verification.json`,proof);return proof;
    }
  };return io;
}
function createE1IsolatedIo(){return require('./qaIsolatedParentContract').assertLiveExecutionClosed();}
module.exports={createE1Io,createE1IsolatedIo};
