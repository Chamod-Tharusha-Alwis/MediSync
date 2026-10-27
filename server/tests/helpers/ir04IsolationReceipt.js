'use strict';
// Test-only Express handler tracking. Detached work needs separate lifecycle proof.
const fs = require('fs'), path = require('path');
const layerOwners = new WeakMap();
const registrationMethods = ['all', ...require('http').METHODS.map(name => name.toLowerCase())];
function createReceipt(qa) {
  const file = path.resolve(__dirname, `../../../scratch/phase5x-evidence/${qa.owner}-ir04-isolation.json`);
  if (fs.existsSync(file)) throw new Error('Existing IR-04 isolation receipt');
  const state = { owner: qa.owner, protocol:'5xd6br1-handlers-v1', mockedHttp: {}, socketEmits: 0, cloudinaryCalls: 0,
    pendingHandlers: 0, activeRequests: 0, abortedRequests: 0, errors: [], drainTimeouts:0, drained:false, cleanupComplete: false,
    instrumentation:{ready:false,rootKind:null,routers:0,routes:0,handlers:0,errorHandlers:0} };
  const token={}, graphs=[], wrappers=new Map(); let application, root, rootKind;
  const save = () => fs.writeFileSync(file, JSON.stringify(state, null, 2));
  save();
  const recordMock = kind => { state.mockedHttp[kind] = (state.mockedHttp[kind] || 0) + 1; };
  function failed(code) { state.errors.push(code); state.drained=false;state.cleanupAuthorized=false;save(); }
  function refuse(code) { failed(code); throw new Error('QA handler safety failure: '+code); }
  function resolveRoot(app) {
    if(!app || !['object','function'].includes(typeof app))return refuse('unknown-router-root');
    if(app._router!==undefined){if(!app._router || !Array.isArray(app._router.stack))return refuse('invalid-legacy-router');return {router:app._router,kind:'legacy-_router'};}
    if(Array.isArray(app.stack))return {router:app,kind:'router-stack'};
    let router;try{router=app.router;}catch(_){return refuse('unreadable-router-root');}
    if(!router || !Array.isArray(router.stack))return refuse('unknown-router-root');
    return {router,kind:'express-router'};
  }
  function lock(object,key,value) { Object.defineProperty(object,key,{value,writable:false,configurable:false,enumerable:Object.prototype.propertyIsEnumerable.call(object,key)}); }
  function rejectRegistrations(object,methods) {
    for(const method of methods)if(typeof object[method]==='function')lock(object,method,function(){return refuse('late-handler-registration');});
  }
  function invoke(original,self,args) {
    if(!state.instrumentation.ready)return refuse('handler-before-instrumentation');
    state.drained=false;state.cleanupAuthorized=false;state.pendingHandlers++;save();
    let result;
    try {
      const next=args.at(-1);
      if(typeof next==='function')args[args.length-1]=function(...values){
        if(values[0] && !['route','router'].includes(values[0]))failed('handler-next-error');
        return next.apply(this,values);
      };
      result=original.apply(self,args);
      if(!result || typeof result.then!=='function'){state.pendingHandlers--;save();return result;}
    } catch(error) { state.pendingHandlers--;failed('handler-threw');throw error; }
    return Promise.resolve(result).then(value=>{state.pendingHandlers--;save();return value;},error=>{
      state.pendingHandlers--;failed('handler-rejected');throw error;
    }); // Express receives the rejection once, using its normal next(error) path.
  }
  function assertInstrumentation() {
    if(!state.instrumentation.ready || !root || !graphs.length)return refuse('instrumentation-incomplete');
    const current=resolveRoot(application);if(current.router!==root || current.kind!==rootKind)return refuse('router-root-changed');
    for(const graph of graphs){
      if(graph.object.stack!==graph.stack || graph.stack.length!==graph.layers.length || graph.stack.some((layer,i)=>layer!==graph.layers[i]))return refuse('router-stack-changed');
      for(const entry of graph.entries)if(entry.layer.handle!==entry.handle || entry.layer.route!==entry.route)return refuse('handler-graph-changed');
    }
    return true;
  }
  function instrument(app) {
    if(application){if(app!==application)return refuse('different-application');assertInstrumentation();return state.instrumentation;}
    application=app;
    try {
      const resolved=resolveRoot(app);root=resolved.router;rootKind=resolved.kind;state.instrumentation.rootKind=rootKind;
      const visiting=new Set(),visited=new Set();
      function visit(object,kind) {
        if(!object || !Array.isArray(object.stack) || !object.stack.length)return refuse('unsupported-or-empty-stack');
        if(visiting.has(object))return refuse('cyclic-router-graph');
        if(visited.has(object))return;
        visiting.add(object);
        if(kind==='router'){
          state.instrumentation.routers++;
          if(object.params && Object.values(object.params).some(value=>!Array.isArray(value)||value.length))return refuse('unsupported-parameter-handlers');
          if(object.params){Object.freeze(object.params);lock(object,'params',object.params);}
        }else state.instrumentation.routes++;
        const stack=object.stack,entries=[];
        for(const layer of stack){
          if(!layer || typeof layer.handle!=='function')return refuse('unknown-layer-structure');
          if(layerOwners.has(layer) && layerOwners.get(layer)!==token)return refuse('foreign-instrumentation-owner');
          layerOwners.set(layer,token);
          if(layer.route){
            visit(layer.route,'route');
          }else if('stack' in layer.handle){
            if(!Array.isArray(layer.handle.stack))return refuse('unsupported-nested-router');
            visit(layer.handle,'router');
          }else {
            if(layer.handle.name==='router' || layer.handle.name==='mounted_app' || layer.handle.handle || layer.handle.length>4)return refuse('opaque-or-unsupported-handler');
            let wrapped=wrappers.get(layer);
            if(!wrapped){
              const original=layer.handle;
              wrapped=original.length===4?function(error,req,res,next){return invoke(original,this,[error,req,res,next]);}:
                function(req,res,next){return invoke(original,this,[req,res,next]);};
              wrappers.set(layer,wrapped);state.instrumentation.handlers++;
              if(original.length===4)state.instrumentation.errorHandlers++;
            }
            lock(layer,'handle',wrapped);
          }
          lock(layer,'handle',layer.handle);lock(layer,'route',layer.route);
          entries.push({layer,handle:layer.handle,route:layer.route});
        }
        graphs.push({object,stack,layers:[...stack],entries});
        rejectRegistrations(object,kind==='route'?registrationMethods:['use','route','param']);
        for(const method of ['push','pop','shift','unshift','splice','sort','reverse','fill','copyWithin'])lock(stack,method,function(){return refuse('late-stack-mutation');});
        Object.freeze(stack);lock(object,'stack',stack);
        visiting.delete(object);visited.add(object);
      }
      visit(root,'router');if(app!==root)rejectRegistrations(app,['use','route','param']);
      if(!state.instrumentation.handlers || !state.instrumentation.routes)return refuse('no-instrumented-routes-or-handlers');
      state.instrumentation.ready=true;assertInstrumentation();save();return state.instrumentation;
    } catch(error) { state.instrumentation.ready=false;if(!state.errors.length)failed('instrumentation-failed');else save();throw error; }
  }
  const requests = (req, res, next) => {
    assertInstrumentation();state.drained=false;state.cleanupAuthorized=false;state.activeRequests++;save();
    let released=false,aborted=false;
    const noteAbort=()=>{if(!aborted){aborted=true;state.abortedRequests++;failed('request-aborted');}};
    const release=()=>{if(!released){released=true;state.activeRequests--;save();}};
    req.once?.('aborted',noteAbort);
    res.once('finish',release);
    res.once('close',()=>{if(!res.writableFinished)noteAbort();release();});
    next();
  };
  function pendingNativeWrites(){
    let pending;try{pending=qa.status().pendingWrites;}catch(_){return refuse('unknown-native-write-state');}
    if(!Number.isSafeInteger(pending)||pending<0)return refuse('unknown-native-write-state');
    state.pendingNativeWrites=pending;return pending;
  }
  async function drain(timeoutMs = 7000) {
    state.drained=false;state.cleanupAuthorized=false;assertInstrumentation();
    const deadline = Date.now() + timeoutMs;
    while (state.pendingHandlers || state.activeRequests || pendingNativeWrites()) {
      if (Date.now() >= deadline){state.drainTimeouts++;save();throw new Error('IR-04 owned work did not drain; preserve recovery manifest');}
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    await new Promise(resolve => setImmediate(resolve));assertInstrumentation();
    if (state.pendingHandlers || state.activeRequests || pendingNativeWrites())throw new Error('IR-04 work resumed during drain');
    if(state.errors.length || state.abortedRequests)throw new Error('QA failed producer or request blocks clean drain');
    state.drained = true; save();
  }
  function assertCleanupReady({listener,integrations}={}) {
    assertInstrumentation();let status;try{status=qa.status();}catch(_){return refuse('cleanup-unknown-native-state');}
    if(!status || typeof status!=='object')return refuse('cleanup-unknown-native-state');
    if(!state.drained || state.pendingHandlers || state.activeRequests || state.errors.length || state.abortedRequests || state.drainTimeouts)return refuse('cleanup-without-clean-drain');
    if(!listener || listener.requestedHost!=='127.0.0.1' || listener.requestedPort!==0 || !listener.closed || listener.listening || listener.socketsRemaining!==0 || listener.shutdownTimedOut || listener.startupFailed)return refuse('cleanup-listener-not-closed');
    if(!integrations || ['rejectedAxios','rejectedNativeFetch','cloudinaryCalls'].some(key=>integrations[key]!==0))return refuse('cleanup-integration-receipt');
    if(!qa.manifest || path.resolve(qa.manifest)!==path.join(path.dirname(file),`${qa.owner}.json`))return refuse('cleanup-manifest-path');
    let manifest;try{manifest=JSON.parse(fs.readFileSync(qa.manifest,'utf8'));}catch(_){return refuse('cleanup-manifest-unavailable');}
    if(status.owner!==qa.owner || manifest.owner!==qa.owner || status.frozen!==true || manifest.frozen!==true || status.pendingWrites!==0 || manifest.pendingWrites!==0 || status.runtimeVerified!==true || manifest.runtimeVerified!==true || status.nativeFixtureGuardActive!==true || status.dbGuardActive!==true || status.testMode!==true || status.productionUriLoaded!==false || status.readOnly!==false || manifest.readOnly!==false || status.rejected!==0)return refuse('cleanup-owner-or-native-guard');
    const runtime=manifest.runtimeVerification;
    if(!runtime || runtime.database!=='medisync_automated_test' || runtime.authenticatedUsers!==1 || !Array.isArray(runtime.roles) || runtime.roles.length!==1 || runtime.roles[0].role!=='readWrite' || runtime.roles[0].db!=='medisync_automated_test' || runtime.productionUriLoaded!==false || runtime.providerSecretKeysLoaded!==0 || runtime.dbGuardActive!==true || runtime.nativeFixtureGuardActive!==true || runtime.testMode!==true || runtime.browserMode!==false)return refuse('cleanup-runtime-proof');
    if(!manifest.owned || !Array.isArray(manifest.allowedCollections) || manifest.cleanupState!=='pending' || ['rejected','networkAttempts','secretReadAttempts'].some(key=>!Array.isArray(manifest[key])||manifest[key].length))return refuse('cleanup-failure-or-manifest-scope');
    const sorted=value=>JSON.stringify(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([name,ids])=>[name,[...ids].sort()]));
    if(!qa.owned || !Array.isArray(status.allowedCollections) || !status.ownedReferences || !manifest.ownedReferences || JSON.stringify([...status.allowedCollections].sort())!==JSON.stringify([...manifest.allowedCollections].sort()))return refuse('cleanup-native-scope-mismatch');
    for(const [collection,ids] of Object.entries(manifest.owned))if(!manifest.allowedCollections.includes(collection) || !Array.isArray(ids) || ids.some(id=>!/^[a-f0-9]{24}$/.test(id)))return refuse('cleanup-owned-ids');
    if(sorted(qa.owned)!==sorted(manifest.owned))return refuse('cleanup-native-journal-mismatch');
    state.cleanupAuthorized=true;save();return true;
  }
  return { state, file, save, recordMock, instrument, requests, drain, assertCleanupReady };
}
module.exports = { createReceipt };
