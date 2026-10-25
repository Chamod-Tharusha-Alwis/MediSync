'use strict';
// QA-only producer lifecycle; OS-observed process exit is a separate cleanup gate.
const { AsyncLocalStorage, createHook } = require('async_hooks');
const { createBrowserExpressGraph } = require('./browserExpressGraph');
const installedSessions=new WeakSet();
function createBrowserLifecycle({owner,freeze,pendingWrites,save=()=>{},timeoutMs=7000,requireGraph=false}) {
  const context=new AsyncLocalStorage(),resources=new Map(),transactions=new Set(),callbacks=new Set(),jobs=new Set();
  let phase='accepting',activeRequests=0,admittedRequests=0,pendingHandlers=0,pendingTransactionOperations=0,abortedRequests=0,drainTimeouts=0,failures=[],shutdownPromise,memoryCleared=false,transactionProof=null,startupReleaseState=null;
  const known=new Set(['PROMISE','Timeout','Immediate','TickObject','Microtask']);
  // Driver/HTTP/stream resources require their independent request/native/job
  // settlement conditions; unknown contextual types remain a sticky blocker.
  const infrastructure=new Set(['HTTPINCOMINGMESSAGE','TCPWRAP','TCPCONNECTWRAP','SHUTDOWNWRAP','WRITEWRAP','TLSWRAP','DNSCHANNEL','GETADDRINFOREQWRAP','QUERYWRAP']);
  const unknownTypes=new Set();
  const hook=createHook({init(id,type){if(context.getStore()!==owner)return;if(known.has(type))resources.set(id,type);else if(!infrastructure.has(type)){unknownTypes.add(type);failures.push('unsupported-async-resource');}},destroy(id){resources.delete(id);},promiseResolve(id){resources.delete(id);}});hook.enable();
  function fail(code){failures.push(code);record();}
  function refuse(code){fail(code);throw Error('QA lifecycle refused: '+code);}
  const graph=createBrowserExpressGraph({fail,invoke});
  const nativePending=()=>{let n;try{n=pendingWrites();}catch(_){n=null;}if(!Number.isSafeInteger(n)||n<0){if(!failures.includes('unknown-native-writes'))failures.push('unknown-native-writes');return null;}return n;};
  const status=()=>({owner,protocol:'5xd5-drain-v1',lifecycleVersion:'5xd7c-v1',processId:process.pid,phase,frozen:phase!=='accepting',activeRequests,pendingHandlers,pendingCallbacks:callbacks.size,pendingJobs:jobs.size,pendingResources:resources.size,pendingTransactions:transactions.size,pendingTransactionOperations,pendingWrites:nativePending(),abortedRequests,drainTimeouts,unknownResourceTypes:[...unknownTypes],instrumentation:graph.status(),transactionInstrumentation:transactionProof?transactionProof():false,resourceTypes:Object.fromEntries([...new Set(resources.values())].map(type=>[type,[...resources.values()].filter(v=>v===type).length])),failures:[...failures],memoryCleared,...(startupReleaseState||{})});
  function record(){context.exit(()=>save(status()));}
  function assertWrite(){if(phase!=='accepting')refuse('late-memory-write');}
  function run(fn){if(phase!=='accepting')return refuse('late-job');return context.run(owner,fn);}
  function observe(result,kind,onDone=()=>{}) {
    if(!result||typeof result.then!=='function'){onDone();return result;}
    return Promise.resolve(result).then(value=>{onDone();return value;},error=>{onDone();fail(kind);throw error;});
  }
  function invoke(original,self,args){
    graph.verify();pendingHandlers++;
    return context.run(owner,()=>{try{const next=args.at(-1);args[args.length-1]=function(...values){if(values[0]&&!['route','router'].includes(values[0]))fail('handler-next-error');return next.apply(this,values);};return observe(original.apply(self,args),'handler-rejected',()=>{pendingHandlers--;record();});}catch(error){pendingHandlers--;fail('handler-threw');throw error;}});
  }
  function callback(fn){
    if(phase!=='accepting')return refuse('late-callback-registration');const token={};callbacks.add(token);let called=false;
    return function(...args){if(called)return refuse('repeated-owned-callback');called=true;return context.run(owner,()=>{try{return observe(fn.apply(this,args),'callback-rejected',()=>{callbacks.delete(token);record();});}catch(error){callbacks.delete(token);fail('callback-threw');throw error;}});};
  }
  function job(fn){if(phase!=='accepting')return refuse('late-job');const token={};jobs.add(token);return context.run(owner,()=>{try{return observe(fn(),'job-rejected',()=>{jobs.delete(token);record();});}catch(error){jobs.delete(token);fail('job-threw');throw error;}});}
  function request(req,res,next){
    if(phase!=='accepting')return res.status(423).json({error:'QA admission closed'});
    if(requireGraph)graph.verify();activeRequests++;admittedRequests++;let done=false,aborted=false;
    const abort=()=>{if(!aborted){aborted=true;abortedRequests++;fail('request-aborted');}};
    const finish=()=>{if(!done){done=true;activeRequests--;if(res.statusCode>=500)fail('unexpected-http-5xx');record();}};
    req.once?.('aborted',abort);res.once('finish',finish);res.once('close',()=>{if(!res.writableFinished)abort();finish();});
    return run(next);
  }
  function installTransactions(Session){
    const proto=Session?.prototype;if(!proto||installedSessions.has(proto))return refuse('transaction-instrumentation-unavailable');
    for(const name of ['startTransaction','commitTransaction','abortTransaction','endSession','inTransaction'])if(typeof proto[name]!=='function')return refuse('transaction-method-unavailable');
    const wrappers={},start=proto.startTransaction;
    wrappers.startTransaction=function(...args){assertWrite();try{const result=start.apply(this,args);transactions.add(this);record();return result;}catch(error){fail('transaction-start-failed');throw error;}};
    for(const name of ['commitTransaction','abortTransaction','endSession']){const original=proto[name];wrappers[name]=async function(...args){pendingTransactionOperations++;record();try{const value=await original.apply(this,args),active=this.inTransaction();if(typeof active!=='boolean')return refuse('unknown-transaction-outcome');if(!active)transactions.delete(this);return value;}catch(error){transactions.add(this);fail('transaction-settlement-failed');throw error;}finally{pendingTransactionOperations--;record();}};}
    for(const[name,fn]of Object.entries(wrappers))proto[name]=fn;installedSessions.add(proto);transactionProof=()=>Object.entries(wrappers).every(([name,fn])=>proto[name]===fn);record();
  }
  function stop(){if(phase==='accepting'){phase='draining';try{freeze();}catch(error){fail('freeze-failed');throw error;}record();}}
  const waitTick=()=>new Promise(resolve=>setTimeout(resolve,10));
  function shutdown({closeListener,listenerStatus,clearMemory,disconnect,interrupted=false}){
    if(shutdownPromise)return shutdownPromise;
    shutdownPromise=context.exit(async()=>{
      const deadline=Date.now()+timeoutMs;let listenerClosed=false,disconnected=false;
      const bounded=async fn=>{let timer;try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('QA shutdown timeout')),Math.max(1,deadline-Date.now()));})]);}finally{clearTimeout(timer);}};
      const work=()=>activeRequests||pendingHandlers||callbacks.size||jobs.size||resources.size||transactions.size||pendingTransactionOperations||nativePending();
      try{
        try{stop();}catch(_){} // A freeze failure is sticky; still close this owned listener.
        await bounded(closeListener);listenerClosed=true;
        if(listenerStatus){const s=listenerStatus();if(!s.closed||s.listening||s.socketsRemaining!==0||s.shutdownTimedOut||s.startupFailed)throw Error('Owned listener not closed');}
        while(work()){if(Date.now()>=deadline){drainTimeouts++;throw Error('QA work did not drain');}await waitTick();}
        await new Promise(resolve=>setImmediate(resolve));
        if(requireGraph){graph.verify();if(!transactionProof?.())throw Error('Missing transaction instrumentation');}
        if(work()||failures.length||interrupted)throw Error('QA drain requires recovery');
        await bounded(disconnect);disconnected=true;
        if(work()||failures.length||(requireGraph&&!transactionProof()))throw Error('QA work resumed during disconnect');
        await bounded(clearMemory);memoryCleared=true;
        if(work()||failures.length)throw Error('QA work resumed during memory cleanup');
        phase='stopped';const receipt={...status(),drained:true,listenerClosed,disconnected,recoveryRequired:false,shutdownComplete:true};save(receipt);return receipt;
      }catch(_){phase='failed';failures.push(interrupted?'interrupted':'drain-failed');const receipt={...status(),drained:false,listenerClosed,disconnected,recoveryRequired:true,shutdownComplete:false};save(receipt);return receipt;}
      finally{if(phase==='stopped')hook.disable();}
    });return shutdownPromise;
  }
  // Resource release after a failed startup is never a successful E1 shutdown.
  // This shares the one shutdown promise, so failure handlers cannot race closes.
  function releaseFailedStartup({identity,expectedIdentity,startup,ownedState,listenerStatus,closeListener,disconnect,connectionState}){
    if(shutdownPromise)return shutdownPromise;
    shutdownPromise=context.exit(async()=>{
      const result={startupFailed:true,resourceReleaseAttempted:true,resourceReleaseCompleted:false,databaseDisconnectAttempted:false,databaseDisconnectCompleted:false,disconnected:false,listenerClosed:false,drained:false,shutdownComplete:false,recoveryRequired:true};
      startupReleaseState=result;
      const deadline=Date.now()+timeoutMs;
      const reject=code=>{throw Object.assign(Error(code),{releaseCode:code});};
      const persist=()=>{try{save({...status(),...result,phase:'failed',admittedRequests,startupAcquisition:{...startup}});}catch(_){if(!failures.includes('startup-release-evidence-failed'))failures.push('startup-release-evidence-failed');reject('startup-release-evidence-failed');}};
      const bounded=async(fn,label)=>{let timer;try{return await Promise.race([Promise.resolve().then(fn).catch(()=>reject('startup-release-'+label+'-rejected')),new Promise((_,no)=>{timer=setTimeout(()=>no(Object.assign(Error('Release deadline'),{releaseCode:'startup-release-'+label+'-timeout'})),Math.max(1,deadline-Date.now()));})]);}finally{clearTimeout(timer);}};
      const settled=()=>{
        if(activeRequests||admittedRequests||pendingHandlers||callbacks.size||jobs.size||resources.size||transactions.size||pendingTransactionOperations||nativePending()!==0||unknownTypes.size||abortedRequests||drainTimeouts)
          reject('startup-release-unsettled-work');
        if(!transactionProof?.())reject('startup-release-transaction-proof-missing');
        if(failures.some(code=>!['startup-failed','interrupted','listener-start-failed'].includes(code)))reject('startup-release-sticky-unsafe-failure');
        const owned=ownedState();
        if(!owned||owned.frozen!==true||owned.readOnly!==true||owned.pendingWrites!==0||owned.nativeFixtureGuardActive!==true||owned.dbGuardActive!==true||owned.testMode!==true||owned.productionUriLoaded!==false||owned.ownedReferences!==true||owned.ownedIds!==0)
          reject('startup-release-ownership-unknown');
      };
      try{
        try{stop();}catch(_){reject('startup-release-freeze-failed');}phase='failed';
        if(!identity||!expectedIdentity||identity.owner!==owner||identity.owner!==expectedIdentity.owner||identity.approvalId!==expectedIdentity.approvalId||identity.nonce!==expectedIdentity.nonce||identity.processId!==expectedIdentity.processId||identity.processId!==process.pid||!/^[a-f0-9]{64}$/.test(identity.nonce||'')||!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(identity.approvalId||''))reject('startup-release-identity-mismatch');
        if(!startup||startup.settled!==true||startup.ready!==false||startup.runtimeHandoff!==true||startup.roleWorkSettled!==true||startup.databaseAcquired!==true||startup.mockMemoryInitialized!==true||startup.evidenceFailed!==false)
          reject('startup-release-acquisition-unknown');
        const g=graph.status();
        if(g.ready)graph.verify();
        else if(startup.stage!=='runtime-verification'||g.routers||g.routes||g.handlers||g.errorHandlers)reject('startup-release-graph-state-unknown');
        settled();persist();
        const listener=listenerStatus();
        if(!listener||typeof listener.created!=='boolean')reject('startup-release-listener-unknown');
        if(listener.created){
          if(!g.ready)reject('startup-release-listener-without-graph');
          await bounded(closeListener,'listener');const closed=listenerStatus();
          if(!closed.closed||closed.listening!==false||closed.socketsRemaining!==0||closed.shutdownTimedOut)reject('startup-release-listener-not-closed');
        }else if(listener.listening!==false||listener.socketsRemaining!==0||g.ready||startup.stage!=='runtime-verification')reject('startup-release-listener-unknown');
        result.listenerClosed=true;settled();
        if(connectionState()!==1)reject('startup-release-connection-state-unknown');
        result.databaseDisconnectAttempted=true;persist();
        await bounded(disconnect,'disconnect');
        if(connectionState()!==0)reject('startup-release-connection-state-inconsistent');
        result.databaseDisconnectCompleted=true;result.disconnected=true;settled();
        result.resourceReleaseCompleted=true;persist();hook.disable();
      }catch(error){
        phase='failed';result.resourceReleaseCompleted=false;
        const code=error.releaseCode||'startup-release-state-unknown';if(!failures.includes(code))failures.push(code);
        try{persist();}catch(_){} // Return a failed verdict even if storage is unavailable.
      }
      return{...status(),...result,phase:'failed',admittedRequests,startupAcquisition:{...startup}};
    });return shutdownPromise;
  }
  return{status,request,instrument:graph.instrument,verifyGraph:graph.verify,run,job,callback,assertWrite,installTransactions,stop,shutdown,releaseFailedStartup,fail,orchestrate:fn=>context.exit(fn),dispose:()=>hook.disable()};
}
module.exports={createBrowserLifecycle};
