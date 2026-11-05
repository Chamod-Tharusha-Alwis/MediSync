'use strict';
const {readAdminMlStatus,createStatusGet}=require('../src/services/adminMlStatusService');
const payload=()=>({status:'active',dataPoints:0,dataPointUnit:'reference disease profiles',
  clinicalValidation:'not established',models:{diseasePrediction:'TF-IDF + Cosine Similarity',outbreakForecasting:'unavailable'}});
const options=()=>({get:jest.fn().mockResolvedValue({data:payload()}),token:jest.fn(()=> 'inert-hmac'),baseUrl:'https://inert.invalid',log:jest.fn()});
test('actual status service preserves zero reference profiles, never invents training, forecast or clinical totals',async()=>{
  const o=options(),r=await readAdminMlStatus(o);
  expect(r).toMatchObject({available:true,dataPoints:0,forecastAvailable:false,nextRun:null,lastTrained:null});
  expect(r).not.toHaveProperty('totalAlerts');expect(o.log).not.toHaveBeenCalled();
  expect(o.get).toHaveBeenCalledTimes(1);
  expect(o.get.mock.calls[0][1]).toMatchObject({timeout:10000,maxRedirects:0,maxContentLength:65536,headers:{'x-internal-key':'inert-hmac'}});
});
test.each([
  [{response:{status:401}},'auth'],[{response:{status:403}},'auth'],[{response:{status:404}},'not_found'],
  [{code:'ECONNABORTED'},'timeout'],[{code:'ETIMEDOUT'},'timeout'],[{code:'ENOTFOUND'},'dns'],[{code:'EAI_AGAIN'},'dns'],
  [{code:'ECONNREFUSED'},'connection'],[{code:'ECONNRESET'},'connection'],[{code:'ERR_TLS_CERT_ALTNAME_INVALID'},'connection'],
  [{response:{status:503}},'bad_response'],[{},'bad_response']
])('fixed failure category; single request, no retry or raw error leak %#',async(error,category)=>{
  const o=options();o.get.mockRejectedValue({...error,message:'private-sentinel',config:{url:'private-sentinel'},response:{...error.response,data:'private-sentinel'}});
  const r=await readAdminMlStatus(o);expect(r).toMatchObject({available:false,status:'unavailable',category,dataPoints:null});
  expect(o.get).toHaveBeenCalledTimes(1);expect(o.log.mock.calls).toEqual([[`[AdminMlStatus] category=${category}`]]);
  expect(JSON.stringify([r,o.log.mock.calls])).not.toContain('private-sentinel');
});
test('missing HMAC dependency is sanitized config, with zero HTTP requests',async()=>{
  const o=options();o.token.mockImplementation(()=>{throw Error('private-sentinel');});
  expect(await readAdminMlStatus(o)).toMatchObject({category:'config',available:false});expect(o.get).not.toHaveBeenCalled();
});
test.each([null,{}, {...payload(),dataPoints:-1},{...payload(),dataPoints:1.5},{...payload(),dataPoints:'0'},
  {...payload(),dataPointUnit:'patients'},{...payload(),clinicalValidation:'established'},
  {...payload(),models:{diseasePrediction:'private-sentinel',outbreakForecasting:'unavailable'}}
])('malformed upstream cannot become available or leak arbitrary strings %#',async data=>{
  const o=options();o.get.mockResolvedValue({data});const r=await readAdminMlStatus(o);
  expect(r).toMatchObject({category:'bad_response',available:false,dataPoints:null});expect(JSON.stringify(r)).not.toContain('private-sentinel');
});

test('real controller emits explicit HTTP 200 unavailable envelope; no raw upstream error',async()=>{
  const previous=process.env.ML_ENGINE_URL;process.env.ML_ENGINE_URL='https://inert.invalid';
  for(const model of ['Admin','Doctor','Patient','Hospital','PharmacyStaff','Consultation','Prescription','AuditLog','SessionToken','BanRecord'])jest.doMock('../src/models/'+model,()=>({}));
  jest.doMock('../src/utils/emailService',()=>({}));
  jest.doMock('uuid',()=>({v4:()=> 'inert-unused-id'}));
  jest.doMock('../src/utils/internalAuth',()=>({generateToken:()=> 'inert-hmac'}));
  jest.doMock('axios',()=>({get:jest.fn().mockRejectedValue({request:{},code:'ENOTFOUND',message:'private-sentinel'})}));
  const warn=jest.spyOn(console,'warn').mockImplementation(()=>{});
  try{
    const {getMLStatus}=require('../src/controllers/adminController');
    const res={json:jest.fn(),status:jest.fn()};await getMLStatus({},res);
    expect(res.status).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith(expect.objectContaining({available:false,category:'dns'}));
    expect(warn).toHaveBeenCalledWith('[AdminMlStatus] category=dns');
  }finally{warn.mockRestore();if(previous===undefined)delete process.env.ML_ENGINE_URL;else process.env.ML_ENGINE_URL=previous;}
});

test.each([400,405,408,413,429,500,502,503,504,301,302,307,308])('an HTTP %i rejection is bad_response, not evidence of a cold start',async status=>{
  const o=options();o.get.mockRejectedValue({response:{status,data:'private-upstream-body'},code:'ERR_BAD_RESPONSE'});
  expect(await readAdminMlStatus(o)).toMatchObject({available:false,category:'bad_response'});
  expect(o.get).toHaveBeenCalledTimes(1);expect(o.log.mock.calls).toEqual([['[AdminMlStatus] category=bad_response']]);
});
test.each([
  '<!doctype html><title>Unrelated frontend application</title>',
  {status:'ok',service:'unrelated'},
  {data:payload()},
  {...payload(),dataPointUnit:undefined},
  {...payload(),clinicalValidation:'not_established'},
  {...payload(),models:{...payload().models,outbreakForecasting:'active'}}
])('wrong service or incompatible HTTP200 schema is unavailable, without leaking the reply %#',async data=>{
  const o=options();o.get.mockResolvedValue({data});const result=await readAdminMlStatus(o);
  expect(result).toMatchObject({available:false,dataPoints:null,category:'bad_response'});
  expect(JSON.stringify(result)).not.toContain('Unrelated frontend application');
  expect(o.log.mock.calls).toEqual([['[AdminMlStatus] category=bad_response']]);
});
test('trailing slash is normalized before dispatch and redirect rejection remains unchanged',async()=>{
  const o=options();o.baseUrl='https://inert.invalid/';o.get.mockRejectedValue({response:{status:308}});
  expect(await readAdminMlStatus(o)).toMatchObject({category:'bad_response'});
  expect(o.get.mock.calls[0][0]).toBe('https://inert.invalid/model-status');
  expect(o.get.mock.calls[0][1].maxRedirects).toBe(0);
});
test.each(['ERR_INVALID_URL','ERR_BAD_OPTION_VALUE','ERR_CANCELED','UNCLASSIFIED'])('pre-request errors with no Axios request/response evidence use config (%s)',async code=>{
  const o=options();o.get.mockRejectedValue({code,message:'private-upstream-body'});
  expect(await readAdminMlStatus(o)).toMatchObject({category:'config'});
  expect(JSON.stringify(o.log.mock.calls)).not.toContain('private-upstream-body');
});

test.each([undefined,null,'',' ',{},42,'inert.invalid','ftp://inert.invalid','http://inert.invalid',
  'https://fixture:inert@inert.invalid','https://inert.invalid/api','https://inert.invalid/model-status',
  'https://inert.invalid/?q=fixture','https://inert.invalid/#fixture','https://inert.invalid/?',
  'https://inert.invalid/#','https://inert.invalid\\','https://inert.\ninvalid/',
  'https://inert.invalid:99999','http://localhost:5101','https://localhost','http://127.0.0.1:5101',
  'https:inert.invalid','https://inert.invalid/api/../','https://inert.invalid/%2e/'
])('invalid or missing URL is config before token preparation or HTTP invocation %#',async baseUrl=>{
  const o=options();o.baseUrl=baseUrl;const r=await readAdminMlStatus(o);
  expect(r).toMatchObject({available:false,category:'config',dataPoints:null});
  expect(o.token).not.toHaveBeenCalled();expect(o.get).not.toHaveBeenCalled();
  expect(o.log.mock.calls).toEqual([['[AdminMlStatus] category=config']]);
});
test.each(['https://inert.invalid','https://inert.invalid/','https://inert.invalid////','HTTPS://INERT.INVALID:443/'])('root URL joins exactly once without relaxing redirects %#',async baseUrl=>{
  const o=options();o.baseUrl=baseUrl;expect(await readAdminMlStatus(o)).toMatchObject({available:true});
  expect(o.get.mock.calls[0][0]).toBe('https://inert.invalid/model-status');
  expect(o.get.mock.calls[0][1]).toMatchObject({maxRedirects:0,timeout:10000});
});
test('explicit nonproduction loopback supports local Flask; the flag cannot allow remote cleartext HTTP',async()=>{
  const o=options();o.allowLoopbackHttp=true;o.baseUrl='http://127.0.0.1:5101/';
  expect(await readAdminMlStatus(o)).toMatchObject({available:true});expect(o.get.mock.calls[0][0]).toBe('http://127.0.0.1:5101/model-status');
  o.get.mockClear();o.baseUrl='http://inert.invalid/';
  expect(await readAdminMlStatus(o)).toMatchObject({category:'config'});expect(o.get).not.toHaveBeenCalled();
});
test.each([undefined,null,'',' ',' key ','key\nvalue','key\0value',{}])('invalid token preparation fails config before HTTP %#',async key=>{
  const o=options();o.token.mockReturnValue(key);
  expect(await readAdminMlStatus(o)).toMatchObject({category:'config'});expect(o.get).not.toHaveBeenCalled();
});
test('missing client, thrown synchronous preparation and invalid client return are config',async()=>{
  const o=options();o.get=undefined;expect(await readAdminMlStatus(o)).toMatchObject({category:'config'});
  o.get=jest.fn(()=>{throw Error('private-sentinel');});expect(await readAdminMlStatus(o)).toMatchObject({category:'config'});
  o.get.mockReturnValue({data:payload()});expect(await readAdminMlStatus(o)).toMatchObject({category:'config'});
  expect(JSON.stringify(o.log.mock.calls)).not.toContain('private-sentinel');
});
test('real Axios interceptor exception before its inert adapter is config and dispatches zero times',async()=>{
  const axios=jest.requireActual('axios');let dispatches=0;
  const client=axios.create({proxy:false,adapter:async config=>{dispatches++;return {status:200,statusText:'OK',headers:{},config,data:payload(),request:{inert:true}};}});
  client.interceptors.request.use(()=>{throw Error('private-sentinel');});
  const o=options();o.get=jest.fn(createStatusGet(client,axios.getAdapter));
  expect(await readAdminMlStatus(o)).toMatchObject({category:'config'});expect(dispatches).toBe(0);
  expect(o.get).toHaveBeenCalledTimes(1);expect(JSON.stringify(o.log.mock.calls)).not.toContain('private-sentinel');
});
test('real Axios inert response keeps strict response validation and transport errors keep their categories',async()=>{
  const axios=jest.requireActual('axios');let dispatches=0;
  const client=axios.create({proxy:false,adapter:async config=>{dispatches++;return {status:200,statusText:'OK',headers:{},config,data:'<html>Unrelated</html>',request:{inert:true}};}});
  const o=options();o.get=jest.fn(createStatusGet(client,axios.getAdapter));
  expect(await readAdminMlStatus(o)).toMatchObject({category:'bad_response'});expect(dispatches).toBe(1);
  o.get.mockRejectedValueOnce({request:{},code:'ENOTFOUND',message:'private-sentinel'});
  expect(await readAdminMlStatus(o)).toMatchObject({category:'dns'});
  o.get.mockRejectedValueOnce({request:{},code:'UNCLASSIFIED',message:'private-sentinel'});
  expect(await readAdminMlStatus(o)).toMatchObject({category:'bad_response'});
});
test.each([undefined,'','http://127.0.0.1:5101'])('real production controller refuses missing configuration or loopback fallback %#',async value=>{
  const oldUrl=process.env.ML_ENGINE_URL,oldMode=process.env.NODE_ENV;
  if(value===undefined)delete process.env.ML_ENGINE_URL;else process.env.ML_ENGINE_URL=value;
  process.env.NODE_ENV='production';
  const get=jest.fn(),warn=jest.spyOn(console,'warn').mockImplementation(()=>{});
  for(const model of ['Admin','Doctor','Patient','Hospital','PharmacyStaff','Consultation','Prescription','AuditLog','SessionToken','BanRecord'])jest.doMock('../src/models/'+model,()=>({}));
  jest.doMock('../src/utils/emailService',()=>({}));jest.doMock('uuid',()=>({v4:()=> 'inert-unused-id'}));
  jest.doMock('../src/utils/internalAuth',()=>({generateToken:()=> 'inert-hmac'}));jest.doMock('axios',()=>({get}));
  try{
    let controller;jest.isolateModules(()=>{controller=require('../src/controllers/adminController');});
    const res={json:jest.fn(),status:jest.fn()};await controller.getMLStatus({},res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({category:'config',available:false}));
    expect(get).not.toHaveBeenCalled();expect(res.status).not.toHaveBeenCalled();
    expect(warn.mock.calls).toEqual([['[AdminMlStatus] category=config']]);
  }finally{
    warn.mockRestore();if(oldUrl===undefined)delete process.env.ML_ENGINE_URL;else process.env.ML_ENGINE_URL=oldUrl;
    if(oldMode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldMode;
  }
});
test.each(['get','token'])('missing %s dependency is config with no HTTP call',async field=>{
  const o=options(),get=o.get;o[field]=undefined;
  expect(await readAdminMlStatus(o)).toMatchObject({category:'config'});expect(get).not.toHaveBeenCalled();
});
test.each(['ERR_INVALID_URL','ERR_BAD_OPTION','ERR_BAD_OPTION_VALUE','ERR_NOT_SUPPORT','ERR_DEPRECATED'])('local Axios option error remains config even if a request object was allocated (%s)',async code=>{
  const o=options();o.get.mockRejectedValue({code,request:{},message:'private-sentinel'});
  expect(await readAdminMlStatus(o)).toMatchObject({category:'config'});
  expect(o.log.mock.calls).toEqual([['[AdminMlStatus] category=config']]);
});
test('operator-confirmed public root is resolved offline without reading any environment or making a request',()=>{
  const {modelStatusUrl}=require('../src/services/adminMlStatusService');
  expect(modelStatusUrl('https://medisync-ml.onrender.com')).toBe('https://medisync-ml.onrender.com/model-status');
});
test('real Axios response interceptor failure after an inert reply is not mislabeled as pre-request config',async()=>{
  const axios=jest.requireActual('axios');let dispatches=0;
  const client=axios.create({proxy:false,adapter:async config=>{dispatches++;return {status:200,statusText:'OK',headers:{},config,data:payload(),request:{inert:true}};}});
  client.interceptors.response.use(()=>{throw Error('private-sentinel');});
  const o=options();o.get=createStatusGet(client,axios.getAdapter);
  expect(await readAdminMlStatus(o)).toMatchObject({category:'bad_response'});expect(dispatches).toBe(1);
});
test('adapter resolution failure is config before any transport invocation, with no retry',async()=>{
  const axios=jest.requireActual('axios'),adapter=jest.fn();
  const client=axios.create({proxy:false,adapter});
  const resolve=jest.fn(()=>{throw Error('private-sentinel');});
  const o=options();o.get=createStatusGet(client,resolve);
  expect(await readAdminMlStatus(o)).toMatchObject({category:'config'});
  expect(resolve).toHaveBeenCalledTimes(1);expect(adapter).not.toHaveBeenCalled();
  expect(o.log.mock.calls).toEqual([['[AdminMlStatus] category=config']]);
});
test.each([
  ['ERR_BAD_OPTION_VALUE','config'],['ENOTFOUND','dns'],['ERR_TLS_CERT_ALTNAME_INVALID','connection'],
  ['ETIMEDOUT','timeout'],['UNCLASSIFIED','bad_response']
])('actual Axios adapter boundary preserves %s classification with one inert attempt',async(code,category)=>{
  const axios=jest.requireActual('axios');
  const adapter=jest.fn(async()=>{throw Object.assign(Error('private-sentinel'),{code});});
  const client=axios.create({proxy:false,adapter}),o=options();o.get=createStatusGet(client,axios.getAdapter);
  expect(await readAdminMlStatus(o)).toMatchObject({category});expect(adapter).toHaveBeenCalledTimes(1);
  expect(o.log.mock.calls).toEqual([[`[AdminMlStatus] category=${category}`]]);
});
test('response-interceptor option-shaped error after a reply stays bad_response',async()=>{
  const axios=jest.requireActual('axios');
  const adapter=jest.fn(async config=>({status:200,statusText:'OK',headers:{},config,data:payload(),request:{inert:true}}));
  const client=axios.create({proxy:false,adapter});
  client.interceptors.response.use(()=>{throw Object.assign(Error('private-sentinel'),{code:'ERR_BAD_OPTION_VALUE'});});
  const o=options();o.get=createStatusGet(client,axios.getAdapter);
  expect(await readAdminMlStatus(o)).toMatchObject({category:'bad_response'});expect(adapter).toHaveBeenCalledTimes(1);
  expect(o.log.mock.calls).toEqual([['[AdminMlStatus] category=bad_response']]);
});
test('actual Axios adapter receives unchanged request limits and valid status is available',async()=>{
  const axios=jest.requireActual('axios');
  const adapter=jest.fn(async config=>({status:200,statusText:'OK',headers:{},config,data:payload(),request:{inert:true}}));
  const client=axios.create({proxy:false,adapter}),o=options();o.get=createStatusGet(client,axios.getAdapter);
  expect(await readAdminMlStatus(o)).toMatchObject({available:true,forecastAvailable:false});
  expect(adapter).toHaveBeenCalledTimes(1);
  expect(adapter.mock.calls[0][0]).toMatchObject({url:'https://inert.invalid/model-status',method:'get',timeout:10000,maxRedirects:0,maxContentLength:65536});
  expect(adapter.mock.calls[0][0].headers.get('x-internal-key')).toBe('inert-hmac');
  expect(o.log).not.toHaveBeenCalled();
});
