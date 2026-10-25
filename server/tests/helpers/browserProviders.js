'use strict';
// Pure/counted seams. No SDK, transport, environment or clinical imports.
function createBrowserProviders(lifecycle,receipt){
  for(const key of ['rejectedAxios','rejectedNativeFetch','rejectedProviders','cloudinaryCalls','socketEmits'])receipt[key]=0;
  receipt.mockedHttp={};
  const reject=kind=>{receipt[kind]=(receipt[kind]||0)+1;lifecycle.fail('unexpected-'+kind);throw Error('Unreviewed QA provider operation');};
  const record=key=>{lifecycle.assertWrite();receipt.mockedHttp[key]=(receipt.mockedHttp[key]||0)+1;};
  const strict=require('./strictIr04Axios').createIr04AxiosMocks(receipt,record);
  const validOptions=options=>!options||(typeof options==='object'&&!Array.isArray(options)&&Object.keys(options).every(k=>['headers','timeout'].includes(k))&&
    (options.timeout===undefined||(Number.isFinite(options.timeout)&&options.timeout>0&&options.timeout<=60000))&&
    (!options.headers||Object.entries(options.headers).every(([key,value])=>['x-internal-key','Content-Type'].includes(key)&&typeof value==='string'&&value.length>0)));
  const guard=fn=>async(...args)=>{lifecycle.assertWrite();try{return await fn(...args);}catch(error){lifecycle.fail('unexpected-axios');throw error;}};
  const axios=Object.assign(()=>reject('rejectedAxios'),{get:guard((url,options)=>{if(typeof url!=='string'||!validOptions(options)||new URL(url).origin!=='http://127.0.0.1:5101')return reject('rejectedAxios');return strict.get(url);}),post:guard((url,body,options)=>{if(typeof url!=='string'||!validOptions(options))return reject('rejectedAxios');return strict.post(url,body);})});
  for(const key of ['request','put','patch','delete','head','options'])axios[key]=()=>reject('rejectedAxios');axios.create=()=>axios;
  // Unknown SDK property access also refuses; no live callable object survives.
  const throwing=()=>reject('rejectedProviders');
  const cloudinary={v2:{config:()=>{lifecycle.assertWrite();receipt.mockedCloudinaryConfig=(receipt.mockedCloudinaryConfig||0)+1;return{};},url:()=>reject('cloudinaryCalls'),uploader:{upload_stream:()=>reject('cloudinaryCalls')}}};
  const strictFetch=require('./strictMlFetch').createStrictMlFetch(async()=>{lifecycle.fail('unexpected-fetch');throw Error('Unreviewed QA fetch refused');},receipt);
  return{axios,cloudinary,vault:throwing,socket:{userSocketMap:new Map(),emit:()=>reject('socketEmits'),to(){return this;},on(){}},
    fetch:async(...args)=>{lifecycle.assertWrite();return strictFetch(...args);},reject};
}
function installBrowserProviderModules(providers){
  // This is an isolated dedicated QA child, never a production/shared process.
  for(const [name,value]of [['axios',providers.axios],['cloudinary',providers.cloudinary],['node-vault',providers.vault]]){
    const file=require.resolve(name);if(require.cache[file])throw Error('Provider SDK loaded before QA seams');
    require.cache[file]={id:file,filename:file,loaded:true,exports:value};
  }
}
module.exports={createBrowserProviders,installBrowserProviderModules};
