'use strict';
// QA-only Express 5 graph sealing. Layer params/path/keys stay writable for routing.
const owners = new WeakMap();
const methods = ['all', ...require('http').METHODS.map(name => name.toLowerCase())];
function createBrowserExpressGraph({ invoke, fail }) {
  const token = {}, graphs = [], counts = { ready:false, rootKind:null, routers:0, routes:0, handlers:0, errorHandlers:0 };
  let application, root;
  const refuse = code => { fail(code); throw Error('QA graph refused: ' + code); };
  const lock = (object, key, value) => Object.defineProperty(object,key,{value,writable:false,configurable:false,enumerable:Object.prototype.propertyIsEnumerable.call(object,key)});
  function resolve(app) {
    if(!app || !['object','function'].includes(typeof app)) return refuse('missing-router-root');
    const router = app.router;
    if(!router || typeof router!=='function' || !Array.isArray(router.stack) || typeof router.handle!=='function') return refuse('unsupported-router-root');
    return router;
  }
  function prohibit(object, keys) { for(const key of keys)if(typeof object[key]==='function')lock(object,key,function(){return refuse('late-registration');}); }
  function immutableArray(array) {
    Object.freeze(array);
    return new Proxy(array,{set(){return refuse('late-stack-change');},deleteProperty(){return refuse('late-stack-change');},defineProperty(){return refuse('late-stack-change');}});
  }
  function instrument(app) {
    if(application){if(application!==app)return refuse('different-application');verify();return status();}
    try {
      application=app;root=resolve(app);counts.rootKind='express-router';
      const visited=new Set(),visiting=new Set();
      function visit(object, kind) {
        if(visiting.has(object))return refuse('cyclic-graph');if(visited.has(object))return;
        if(!object || !Array.isArray(object.stack) || !object.stack.length)return refuse('empty-or-unsupported-stack');
        if(owners.has(object)&&owners.get(object)!==token)return refuse('conflicting-graph-owner');owners.set(object,token);visiting.add(object);
        counts[kind==='router'?'routers':'routes']++;
        if(kind==='router'){
          if(object.params&&Object.values(object.params).some(value=>!Array.isArray(value)||value.length))return refuse('unsupported-param-producer');
          if(object.params){for(const value of Object.values(object.params))Object.freeze(value);lock(object,'params',Object.freeze(object.params));}
          lock(object,'handle',object.handle);
        }else {
          if(!object.methods || typeof object.dispatch!=='function')return refuse('unsupported-route');
          lock(object,'methods',Object.freeze(object.methods));lock(object,'path',Array.isArray(object.path)?Object.freeze(object.path):object.path);lock(object,'dispatch',object.dispatch);
        }
        const entries=[];
        for(const layer of object.stack){
          if(!layer || typeof layer.handle!=='function' || typeof layer.handleRequest!=='function' || typeof layer.handleError!=='function' || !Array.isArray(layer.matchers))return refuse('unsupported-layer');
          if(owners.has(layer)&&owners.get(layer)!==token)return refuse('conflicting-layer-owner');owners.set(layer,token);
          if(layer.route)visit(layer.route,'route');
          else if('stack' in layer.handle){if(typeof layer.handle.handle!=='function')return refuse('unsupported-nested-router');visit(layer.handle,'router');}
          else {
            const original=layer.handle;
            if(original.name==='mounted_app'||original.name==='router'||original.handle||original.length>4)return refuse('opaque-handler');
            const wrapped=original.length===4?function(error,req,res,next){return invoke(original,this,[error,req,res,next]);}:function(req,res,next){return invoke(original,this,[req,res,next]);};
            lock(layer,'handle',wrapped);counts.handlers++;if(original.length===4)counts.errorHandlers++;
          }
          for(const key of ['handle','route','method','match','handleRequest','handleError'])lock(layer,key,layer[key]);
          lock(layer,'matchers',Object.freeze(layer.matchers));
          entries.push({layer,handle:layer.handle,route:layer.route,prototype:Object.getPrototypeOf(layer)});
        }
        const stack=immutableArray(object.stack);lock(object,'stack',stack);
        prohibit(object,kind==='route'?methods:['use','route','param',...methods]);
        graphs.push({object,stack,entries,prototype:Object.getPrototypeOf(object)});visiting.delete(object);visited.add(object);
      }
      visit(root,'router');if(!counts.routes||!counts.handlers)return refuse('incomplete-graph');
      lock(app,'router',root);lock(app,'handle',app.handle);prohibit(app,['use','route','param']);
      counts.ready=true;verify();return status();
    }catch(error){counts.ready=false;fail('instrumentation-failed');throw error;}
  }
  function verify() {
    if(!counts.ready||!application||resolve(application)!==root)return refuse('stale-or-missing-graph');
    for(const graph of graphs){
      if(graph.object.stack!==graph.stack||Object.getPrototypeOf(graph.object)!==graph.prototype||graph.stack.length!==graph.entries.length)return refuse('stale-graph');
      for(let i=0;i<graph.entries.length;i++){const e=graph.entries[i];if(graph.stack[i]!==e.layer||e.layer.handle!==e.handle||e.layer.route!==e.route||Object.getPrototypeOf(e.layer)!==e.prototype)return refuse('stale-layer');}
    }
    return true;
  }
  const status=()=>({...counts});
  return {instrument,verify,status};
}
module.exports={createBrowserExpressGraph};
