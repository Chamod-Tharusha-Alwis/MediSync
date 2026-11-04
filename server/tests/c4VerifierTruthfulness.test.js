'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),https=require('https');
const {EventEmitter}=require('events');
const root=path.resolve(__dirname,'../..'),expected='a'.repeat(40);
function load({transport=https,ledger}={}){
  const writes=[],reads=[],processObject={argv:[],env:{},exitCode:undefined},module={exports:{}};
  const files={...fs,readFileSync(file,...args){reads.push(String(file));if(ledger&&String(file).endsWith('PROTECTED_HASHES.json'))return JSON.stringify(ledger);return fs.readFileSync(file,...args)},writeFileSync(file,value,options){writes.push({file,value:JSON.parse(value),options})}};
  const deps={fs:files,path,crypto:require('crypto'),https:transport,'./liveVerificationReadOnly.cjs':{install:jest.fn()},'../server/src/utils/inferenceResponse':require('../src/utils/inferenceResponse')};
  const loader=name=>{if(!Object.hasOwn(deps,name))throw Error('UNEXPECTED_IMPORT');return deps[name]};
  loader.main={};
  vm.runInNewContext(fs.readFileSync(path.join(root,'scripts/verify_c4_ai_resilience_live.cjs'),'utf8'),{module,exports:module.exports,__dirname:path.join(root,'scripts'),require:loader,URL,Buffer,console:{log:jest.fn(),error:jest.fn()},process:processObject,setTimeout,clearTimeout});
  return{api:module.exports,writes,reads,processObject};
}
const ok=(commit=null)=>({status:200,ready:true,commit});
test('actual verifier accepts only the narrowed health/local-contract scope',async()=>{
  const {api}=load(),request=jest.fn(async url=>ok(url===api.BACKEND?expected:null)),sleep=jest.fn();
  const result=await api.runVerification({expectedCommit:expected,request,sleep});
  expect(result).toMatchObject({passed:true,protectedFiles:15,backendRevisionMatches:true,scope:'READ_ONLY_HEALTH_AND_LOCAL_CONTRACTS',clinicalBrowserAcceptance:'NOT_VERIFIED',liveInference:'NOT_RUN'});
  expect(result.clinicalDisclaimer.browserVerified).toBe(false);expect(request).toHaveBeenCalledTimes(2);expect(sleep).not.toHaveBeenCalled();
});
test('backend timeouts cannot become success from passing local checks',async()=>{
  const {api}=load(),request=jest.fn(async()=>{throw Object.assign(Error('owned-private-sentinel'),{code:'HEALTH_TIMEOUT'})}),sleep=jest.fn(async()=>{});
  const result=await api.runVerification({expectedCommit:expected,request,sleep});
  expect(result.passed).toBe(false);expect(result.backendRevisionMatches).toBe(false);expect(request).toHaveBeenCalledTimes(2);expect(sleep).toHaveBeenCalledWith(60000);expect(result.mlHealth).toBeUndefined();
  expect(JSON.stringify(result)).not.toContain('owned-private-sentinel');
});
test('ML timeout fails after at most one delayed retry',async()=>{
  const {api}=load(),request=jest.fn(async url=>{if(url===api.BACKEND)return ok(expected);throw Object.assign(Error('owned-private-sentinel'),{code:'HEALTH_TIMEOUT'})}),sleep=jest.fn(async()=>{});
  const result=await api.runVerification({expectedCommit:expected,request,sleep});
  expect(result).toMatchObject({passed:false,category:'HEALTH_CHECK_FAILED'});expect(result.mlHealth.attempts).toHaveLength(2);expect(request).toHaveBeenCalledTimes(3);expect(sleep).toHaveBeenCalledTimes(1);
});
test.each([null,'b'.repeat(40)])('missing or stale backend identity stops acceptance (%p)',async commit=>{
  const {api}=load(),request=jest.fn(async()=>ok(commit));
  const result=await api.runVerification({expectedCommit:expected,request,sleep:jest.fn()});
  expect(result).toMatchObject({passed:false,category:'DEPLOYMENT_REVISION_NOT_VERIFIED'});expect(request).toHaveBeenCalledTimes(1);expect(result.mlHealth).toBeUndefined();
});
test.each([{status:502,ready:false},{status:503,ready:false},{status:504,ready:false},{status:500,ready:false},{status:200,ready:false},{status:403,ready:false},{status:302,ready:false}])('unhealthy ML cannot count as live success (%p)',async unhealthy=>{
  const {api}=load(),sleep=jest.fn(async()=>{}),request=jest.fn(async url=>url===api.BACKEND?ok(expected):unhealthy);
  const result=await api.runVerification({expectedCommit:expected,request,sleep});expect(result.passed).toBe(false);
  expect(request.mock.calls.filter(([url])=>url===api.ML)).toHaveLength([502,503,504].includes(unhealthy.status)?2:1);
});
test('cold start recovery has two attempts, exact delay and no third retry',async()=>{
  const {api}=load(),sleep=jest.fn(async()=>{});let mlCalls=0;
  const request=jest.fn(async url=>url===api.BACKEND?ok(expected):++mlCalls===1?{status:503,ready:false}:ok());
  const result=await api.runVerification({expectedCommit:expected,request,sleep});expect(result.passed).toBe(true);expect(mlCalls).toBe(2);expect(sleep.mock.calls).toEqual([[60000]]);
});
test.each([undefined,'short','a'.repeat(40)+'\n'])('invalid expected commit is rejected before network (%p)',async expectedCommit=>{
  const {api}=load(),request=jest.fn();await expect(api.runVerification({expectedCommit,request})).rejects.toMatchObject({code:'EXPECTED_COMMIT_REQUIRED'});expect(request).not.toHaveBeenCalled();
});
function inertResponse(body,status=200){
  const request=new EventEmitter(),response=new EventEmitter();response.statusCode=status;request.destroy=jest.fn();
  const transport={get:jest.fn((_url,_options,callback)=>{queueMicrotask(()=>{callback(response);response.emit('data',Buffer.from(body));response.emit('end')});return request})};
  return{transport,request,response};
}
test('real HTTP reader keeps TLS verification and projects out unknown/private body fields',async()=>{
  const h=inertResponse(JSON.stringify({status:'ready',commit:expected,privateValue:'owned-private-sentinel'})),{api}=load();
  expect(await api.fetchJson(api.BACKEND,1000,h.transport)).toEqual({status:200,ready:true,commit:expected});
  expect(h.transport.get.mock.calls[0][1]).toMatchObject({rejectUnauthorized:true,timeout:1000});
});
test.each(['{','[]','null'])('malformed or non-object HTTP body is sanitized (%s)',async body=>{
  const h=inertResponse(body),{api}=load();await expect(api.fetchJson(api.ML,1000,h.transport)).rejects.toMatchObject({code:'HEALTH_RESPONSE_INVALID'});
});
test('oversized response is rejected and its owned request destroyed',async()=>{
  const h=inertResponse('x'.repeat(65537)),{api}=load();await expect(api.fetchJson(api.ML,1000,h.transport)).rejects.toMatchObject({code:'HEALTH_RESPONSE_TOO_LARGE'});expect(h.request.destroy).toHaveBeenCalledTimes(1);
});
test.each([['CERT_HAS_EXPIRED','HEALTH_TLS_FAILURE'],['ENOTFOUND','HEALTH_DNS_FAILURE']])('actual reader classifies %s without leaking or retrying it',async(code,category)=>{
  const {api}=load(),transport={get:jest.fn(()=>{throw Object.assign(Error('owned-private-sentinel'),{code})})},sleep=jest.fn();
  const request=url=>api.fetchJson(url,1000,transport);
  const result=await api.runVerification({expectedCommit:expected,request,sleep});
  expect(result.passed).toBe(false);expect(result.backendHealth.category).toBe(category);expect(transport.get).toHaveBeenCalledTimes(1);expect(sleep).not.toHaveBeenCalled();expect(JSON.stringify(result)).not.toContain('owned-private-sentinel');
});
test('absolute deadline closes a continually streaming peer without waiting for idle timeout',async()=>{
  jest.useFakeTimers();try{
    const request=new EventEmitter(),response=new EventEmitter();request.destroy=jest.fn();response.statusCode=200;
    const transport={get:(_url,_options,callback)=>{callback(response);return request}}, {api}=load();
    const pending=api.fetchJson(api.ML,25,transport);response.emit('data',Buffer.from(' '));jest.advanceTimersByTime(20);response.emit('data',Buffer.from(' '));jest.advanceTimersByTime(5);
    await expect(pending).rejects.toMatchObject({code:'HEALTH_TIMEOUT'});expect(request.destroy).toHaveBeenCalledTimes(1);expect(jest.getTimerCount()).toBe(0);
  }finally{jest.useRealTimers()}
});
test('unexpected target is rejected before transport dispatch',async()=>{
  const {api}=load(),get=jest.fn();await expect(api.fetchJson('https://other.example.invalid/health',1000,{get})).rejects.toMatchObject({code:'HEALTH_TARGET_REJECTED'});expect(get).not.toHaveBeenCalled();
});
test('CLI invalid input writes only a unique sanitized failure receipt and exits unsuccessfully',async()=>{
  const {api,writes,processObject}=load(),result=await api.main(['--expected-commit','owned-private-sentinel']);
  expect(result.passed).toBe(false);expect(processObject.exitCode).toBe(1);expect(writes).toHaveLength(1);expect(writes[0].options).toEqual({flag:'wx'});
  expect(writes[0].file).toContain(path.join('docs','temp','CODEX_C4_READONLY_'));expect(JSON.stringify(writes)).not.toContain('owned-private-sentinel');expect(writes[0].file).not.toContain('live_c4_ai_resilience_log');
});
test.each(['empty','duplicate','wrong-hash','private-path'])('invalid protected manifest fails closed without private reads (%s)',kind=>{
  const ledger=JSON.parse(fs.readFileSync(path.join(root,'docs/release/PROTECTED_HASHES.json'),'utf8'));
  if(kind==='empty')ledger.files=[];
  if(kind==='duplicate')ledger.files[1]=ledger.files[0];
  if(kind==='wrong-hash')ledger.files[0].releaseCandidateSha256='0'.repeat(64);
  if(kind==='private-path')ledger.files[0].path='server/.env';
  const {api,reads}=load({ledger});expect(()=>api.verifyProtectedHashes()).toThrow();expect(reads.some(file=>file.endsWith(path.join('server','.env')))).toBe(false);
});
