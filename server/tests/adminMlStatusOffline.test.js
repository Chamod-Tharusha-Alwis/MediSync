'use strict';
const {readAdminMlStatus}=require('../src/services/adminMlStatusService');
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
test('missing HMAC dependency is sanitized auth, with zero HTTP requests',async()=>{
  const o=options();o.token.mockImplementation(()=>{throw Error('private-sentinel');});
  expect(await readAdminMlStatus(o)).toMatchObject({category:'auth',available:false});expect(o.get).not.toHaveBeenCalled();
});
test.each([null,{}, {...payload(),dataPoints:-1},{...payload(),dataPoints:1.5},{...payload(),dataPoints:'0'},
  {...payload(),dataPointUnit:'patients'},{...payload(),clinicalValidation:'established'},
  {...payload(),models:{diseasePrediction:'private-sentinel',outbreakForecasting:'unavailable'}}
])('malformed upstream cannot become available or leak arbitrary strings %#',async data=>{
  const o=options();o.get.mockResolvedValue({data});const r=await readAdminMlStatus(o);
  expect(r).toMatchObject({category:'bad_response',available:false,dataPoints:null});expect(JSON.stringify(r)).not.toContain('private-sentinel');
});

test('real controller emits explicit HTTP 200 unavailable envelope; no raw upstream error',async()=>{
  for(const model of ['Admin','Doctor','Patient','Hospital','PharmacyStaff','Consultation','Prescription','AuditLog','SessionToken','BanRecord'])jest.doMock('../src/models/'+model,()=>({}));
  jest.doMock('../src/utils/emailService',()=>({}));
  jest.doMock('uuid',()=>({v4:()=> 'inert-unused-id'}));
  jest.doMock('../src/utils/internalAuth',()=>({generateToken:()=> 'inert-hmac'}));
  jest.doMock('axios',()=>({get:jest.fn().mockRejectedValue({code:'ENOTFOUND',message:'private-sentinel'})}));
  const warn=jest.spyOn(console,'warn').mockImplementation(()=>{});
  try{
    const {getMLStatus}=require('../src/controllers/adminController');
    const res={json:jest.fn(),status:jest.fn()};await getMLStatus({},res);
    expect(res.status).not.toHaveBeenCalled();expect(res.json).toHaveBeenCalledWith(expect.objectContaining({available:false,category:'dns'}));
    expect(warn).toHaveBeenCalledWith('[AdminMlStatus] category=dns');
  }finally{warn.mockRestore();}
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
test('a trailing slash is not normalized; a rejected slash redirect is bad_response',async()=>{
  const o=options();o.baseUrl='https://inert.invalid/';o.get.mockRejectedValue({response:{status:308}});
  expect(await readAdminMlStatus(o)).toMatchObject({category:'bad_response'});
  expect(o.get.mock.calls[0][0]).toBe('https://inert.invalid//model-status');
  expect(o.get.mock.calls[0][1].maxRedirects).toBe(0);
});
test.each(['ERR_INVALID_URL','ERR_BAD_OPTION_VALUE','ERR_CANCELED','UNCLASSIFIED'])('other unmapped errors use bad_response (%s)',async code=>{
  const o=options();o.get.mockRejectedValue({code,message:'private-upstream-body'});
  expect(await readAdminMlStatus(o)).toMatchObject({category:'bad_response'});
  expect(JSON.stringify(o.log.mock.calls)).not.toContain('private-upstream-body');
});
