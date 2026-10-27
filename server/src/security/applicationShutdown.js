'use strict';
// Own only the resources registered by this startup. Never kill other processes.
function createApplicationShutdown({disconnect,closeRedis,signals=process,timeoutMs=10000}={}){
  const resources={},handlers=new Map();let stopping=false,promise;
  const bounded=work=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('RESOURCE_DRAIN_TIMEOUT')),timeoutMs);
    Promise.resolve().then(work).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
  });
  function releaseSignals(){for(const [name,handler]of handlers)signals.removeListener(name,handler);handlers.clear();}
  function stop(){
    if(promise)return promise;
    stopping=true;
    promise=(async()=>{
      const failures=[];
      for(const resource of [resources.monitor,resources.jobs])if(resource?.stop)try{await bounded(()=>resource.stop());}catch(_){failures.push('background');}
      try{
        if(resources.io?.close)await bounded(()=>new Promise((resolve,reject)=>resources.io.close(error=>error&&error.code!=='ERR_SERVER_NOT_RUNNING'?reject(error):resolve())));
        if(resources.httpServer?.listening)await bounded(()=>new Promise((resolve,reject)=>{
          resources.httpServer.close(error=>error?reject(error):resolve());resources.httpServer.closeIdleConnections?.();
        }));
      }catch(_){failures.push('transport');}
      // A failed transport drain may still have active clinical work. Do not
      // close its backing stores or claim successful shutdown underneath it.
      if(!failures.includes('transport')&&!failures.includes('background')){
        for(const [name,close]of [['redis',closeRedis],['mongo',disconnect]])if(close)try{await bounded(close);}catch(_){failures.push(name);}
      }
      releaseSignals();return Object.freeze({status:failures.length?'failed':'closed',failures});
    })();
    return promise;
  }
  function installSignals(){
    for(const name of ['SIGINT','SIGTERM'])if(!handlers.has(name)){
      const handler=()=>{void stop().then(result=>{if(result.status!=='closed')process.exitCode=1;});};
      handlers.set(name,handler);signals.once(name,handler);
    }
  }
  return {bind:values=>Object.assign(resources,values),stop,installSignals,get stopping(){return stopping;}};
}
module.exports={createApplicationShutdown};
