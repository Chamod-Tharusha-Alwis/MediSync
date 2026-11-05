'use strict';
const { createBrowserBoundary, requestPattern, loginProof, classifyConsole, pageVerdict, adminHonesty } = require('../../scripts/authenticatedSessionBrowser.cjs');
const API = 'https://medisync-wabc.onrender.com';
function context() {
  const x = { request: {}, routeWebSocket: jest.fn(async (_, handler) => { x.ws = handler; }), route: jest.fn(async (_, handler) => { x.http = handler; }) };
  return x;
}
async function dispatch(x, path, method = 'GET') {
  const result = { continued: false, aborted: false };
  await x.http({ request: () => ({ url: () => API + path, method: () => method }),
    continue: async () => { result.continued = true; }, abort: async () => { result.aborted = true; } });
  return result;
}
test('actual routing adapter admits one login then denies any retry before transport', async () => {
  const b=createBrowserBoundary('doctor'), x=context(); await b.attach(x);
  expect(await dispatch(x,'/api/auth/login','POST')).toEqual({continued:true,aborted:false});
  expect(await dispatch(x,'/api/auth/login','POST')).toEqual({continued:false,aborted:true});
  expect(b.summary().budgetUsed.LOGIN).toBe(1);
});
test.each(['/ingest','/api/seed-demo','/api/admin/outbreak/trigger','/api/cache/clear','/api/auth/verify-otp','/api/patient/request-access','/api/doctor/consultations','/api/pharmacy/dispense','/api/auth/heartbeat'])('actual browser adapter blocks unapproved POST %s', async p => {
  const b=createBrowserBoundary('admin'), x=context();await b.attach(x);
  expect((await dispatch(x,p,'POST')).aborted).toBe(true);
  expect(b.summary().blockedRequests[0]).toMatchObject({method:'POST',count:1});
});
test('real state machine governs routed refresh and logout; no synthetic response fulfillment',async()=>{
  const b=createBrowserBoundary('patient'),x=context();await b.attach(x);
  await dispatch(x,'/api/auth/login','POST');b.observeLoginResponse(200,loginProof('patient',200,{data:{role:'patient',accessToken:'synthetic-token-with-enough-length'}}));
  expect((await dispatch(x,'/api/auth/refresh','POST')).continued).toBe(true);
  expect((await dispatch(x,'/api/auth/logout','POST')).continued).toBe(true);
  expect((await dispatch(x,'/api/auth/logout','POST')).aborted).toBe(true);
});
test('OTP pending is not authentication and permits no OTP submission',async()=>{
  const b=createBrowserBoundary('doctor'),x=context();await b.attach(x);await dispatch(x,'/api/auth/login','POST');
  b.observeLoginResponse(200,loginProof('doctor',200,{data:{requiresOTP:true,role:'doctor'}}));
  expect(b.summary().state).toBe('CLOSED');expect((await dispatch(x,'/api/auth/verify-otp','POST')).aborted).toBe(true);
});
test('WebSockets and Socket.IO polling cannot bypass the narrow session budget',async()=>{
  const b=createBrowserBoundary('admin'),x=context();await b.attach(x);const close=jest.fn();
  x.ws({url:()=>API.replace('https:','wss:')+'/socket.io/?token=private-sentinel',close});
  expect(close).toHaveBeenCalledTimes(1);expect((await dispatch(x,'/socket.io/?sid=private-sentinel')).aborted).toBe(true);
  expect(JSON.stringify(b.summary())).not.toContain('private-sentinel');
});
test('APIRequestContext bypass is unavailable and missing WebSocket fence fails closed',async()=>{
  const b=createBrowserBoundary('admin'),x=context();await b.attach(x);expect(()=>x.request.post()).toThrow('BROWSER_API_BYPASS_REJECTED');
  await expect(b.attach({})).rejects.toThrow('WEBSOCKET_FENCE_UNAVAILABLE');
});
test('method/path aggregation retains only static patterns and no private identifiers',()=>{
  expect(requestPattern(API+'/api/notifications/private-sentinel/read?token=private-sentinel','PATCH')).toEqual({method:'PATCH',pathPattern:'/api/notifications/:id/read-or-seen'});
  expect(JSON.stringify(requestPattern(API+'/api/patient/private-sentinel','GET'))).not.toContain('private-sentinel');
});
test('all supported role proofs match actual role aliases; a wrong role cannot authenticate',()=>{
  for(const [role,actual] of [['admin','admin'],['patient','patient'],['doctor','doctor'],['hospital','hospital_admin'],['pharmacy','pharmacist']]) expect(loginProof(role,200,{data:{role:actual,accessToken:'synthetic-token-with-enough-length'}}).roleMatches).toBe(true);
  expect(loginProof('doctor',200,{data:{role:'admin'}}).roleMatches).toBe(false);
});
test('console classification is sanitized; boundary errors still fail the no-console requirement',()=>{
  expect(classifyConsole('Failed ERR_BLOCKED_BY_CLIENT private-sentinel')).toBe('BOUNDARY_BLOCKED_NETWORK');
  expect(pageVerdict({rendered:true,temporaryBanner:false,consoleErrors:1,pageErrors:0})).toBe(false);
  expect(pageVerdict({rendered:true,temporaryBanner:false,consoleErrors:0,pageErrors:0})).toBe(true);
});
test('admin fallback is not accepted as verified live telemetry and absent forecast is not called available',()=>{
  expect(adminHonesty({metricsUnavailable:true,telemetryFallbackVisible:true},{mlDataPointsVerified:false}).passed).toBe(false);
  expect(adminHonesty({metricsUnavailable:true,forecastPresent:false},{})).toMatchObject({passed:true,map:'NOT_AVAILABLE_EXPLICIT',forecast:'NO_FORECAST_VIEW_IMPLEMENTED'});
  expect(adminHonesty({mapRendered:true,forecastPresent:false},{}).passed).toBe(false);
});
test('live CLI needs explicit approval, pinned commit, role and a bounded fresh email budget',()=>{
  const {argsOf,admitAttempt}=require('../../scripts/verify_five_role_sessions_live.cjs');
  const args=['--approved-session-check','--role','admin','--run-id','q1_sessions_20261104_a1b2c3d4','--email-total','1','--backend-commit','a'.repeat(40)];
  expect(argsOf(args)).toMatchObject({role:'admin',baseline:1});
  expect(()=>argsOf(args.slice(1))).toThrow();
  expect(()=>argsOf(args.map(x=>x==='1'?'24':x))).toThrow('EMAIL_BUDGET_REJECTED');
  expect(()=>argsOf([...args,'--role','doctor'])).toThrow();
  expect(()=>argsOf([...args,'--allow-clinical-writes'])).toThrow();
  const proof=argsOf([...args,'--email-display-proof']);
  expect(()=>admitAttempt(proof,[])).not.toThrow();
  expect(()=>admitAttempt(proof,['patient'])).toThrow('ATTEMPT_OR_EMAIL_BUDGET_REJECTED');
});
test('credential reader uses only the approved local password source and parses five identities without printing',()=>{
  const {credentials}=require('../../scripts/verify_five_role_sessions_live.cjs');
  let identities=['admin','patient','doctor','hospital','pharmacy'].map(r=>r+': '+r+'@example.invalid').join('\n');
  const readFile=p=>String(p).replaceAll('\\','/').endsWith('server/.env')?'TEMP_ACCOUNT_PASSWORD=InertFixtureOnly123!\nMONGO_URI=NOT_A_CONNECTION\n':identities;
  const previous=process.env.TEMP_ACCOUNT_PASSWORD;process.env.TEMP_ACCOUNT_PASSWORD='StaleInheritedFixture';
  try{const c=credentials('/inert',readFile);expect(c.password).toBe('InertFixtureOnly123!');expect(Object.keys(c.emails)).toHaveLength(5);expect(process.env.MONGO_URI).not.toBe('NOT_A_CONNECTION');
    identities+='\nadmin: second@example.invalid';expect(()=>credentials('/inert',readFile)).toThrow();
  }finally{if(previous===undefined)delete process.env.TEMP_ACCOUNT_PASSWORD;else process.env.TEMP_ACCOUNT_PASSWORD=previous;}
});
test('combined CLI scope requires explicit notification opt-in and rejects conflicting proof mode',()=>{
  const {argsOf}=require('../../scripts/verify_five_role_sessions_live.cjs');
  const args=['--approved-session-check','--role','admin','--run-id','q1_sessions_20261105_a1b2c3d4','--email-total','0','--backend-commit','a'.repeat(40),'--combined-read-only-sweep'];
  expect(()=>argsOf(args)).toThrow('COMBINED_SCOPE_REJECTED');
  expect(argsOf([...args,'--notification-transport'])).toMatchObject({combined:true,notifications:true,baseline:0});
  expect(()=>argsOf([...args,'--notification-transport','--email-display-proof'])).toThrow('COMBINED_SCOPE_REJECTED');
});
test('status evidence retains only known categories and never raw bodies',()=>{
  const {statusEvidence}=require('../../scripts/verify_five_role_sessions_live.cjs');
  expect(statusEvidence(200,{available:false,status:'unavailable',category:'auth',dataPoints:null,error:'private-sentinel'})).toEqual({httpStatus:200,state:'unavailable',category:'auth',contractValid:true});
  expect(statusEvidence(200,{available:false,status:'unavailable',category:'config',dataPoints:null})).toEqual({httpStatus:200,state:'unavailable',category:'config',contractValid:true});
  expect(statusEvidence(200,{available:true,status:'available',dataPoints:0,dataPointUnit:'reference disease profiles'})).toMatchObject({state:'available',contractValid:true});
  for(const dto of [{},null,{available:false,status:'unavailable',category:'private-sentinel',dataPoints:null}])expect(JSON.stringify(statusEvidence(503,dto))).not.toContain('private-sentinel');
});
test('combined acceptance separates no-console dashboard checks from still-unverified map data and clinical steps',()=>{
  const {combinedVerdict}=require('../../scripts/verify_five_role_sessions_live.cjs');
  const row={role:'admin',observations:[{rendered:true,temporaryBanner:false,view:'outbreak-monitor',referenceUnavailable:true}],consoleCategories:{},pageErrors:0,httpFailures:[],adminMlStatus:{contractValid:true,state:'unavailable'}};
  expect(combinedVerdict(row)).toBe(true);
  expect(combinedVerdict({...row,consoleCategories:{SOCKET_TRANSPORT_ERROR:1}})).toBe(false);
  expect(combinedVerdict({...row,observations:[{...row.observations[0],referenceUnavailable:false}]})).toBe(false);
  expect(combinedVerdict({...row,adminMlStatus:{contractValid:false}})).toBe(false);
  expect(combinedVerdict({...row,observations:[]})).toBe(false);
});
test('owned-page notification cleanup precedes exactly one real logout request and is not itself logout proof',async()=>{
  const {logoutInPage}=require('../../scripts/verify_five_role_sessions_live.cjs');
  const originalWindow=global.window,originalFetch=global.fetch,order=[];
  global.window={dispatchEvent:event=>{order.push(event.type);}};
  global.fetch=jest.fn(async()=>{order.push('logout-request');return {status:200};});
  try{
    expect(await logoutInPage({url:API+'/api/auth/logout',accessToken:'inert-only'})).toEqual({status:200});
    expect(order).toEqual(['medisync:session-cleared','logout-request']);expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch.mock.calls[0][1]).toMatchObject({method:'POST',credentials:'include',body:'{}'});
    global.fetch.mockRejectedValueOnce(Error('private-sentinel'));
    expect(await logoutInPage({url:API+'/api/auth/logout',accessToken:'inert-only'})).toEqual({status:null});
  }finally{global.window=originalWindow;global.fetch=originalFetch;}
});
test('timed admin retest requires admin notification scope and cannot combine with other live modes',()=>{
  const {argsOf}=require('../../scripts/verify_five_role_sessions_live.cjs');
  const args=['--approved-session-check','--role','admin','--run-id','q1_sessions_20261105_a1b2c3d4','--email-total','5','--backend-commit','a'.repeat(40),'--notification-transport','--admin-ml-retest'];
  expect(argsOf(args)).toMatchObject({role:'admin',adminMlRetest:true,baseline:5});
  expect(()=>argsOf(args.filter(x=>x!=='--notification-transport'))).toThrow('ADMIN_RETEST_SCOPE_REJECTED');
  expect(()=>argsOf(args.map(x=>x==='admin'?'doctor':x))).toThrow('ADMIN_RETEST_SCOPE_REJECTED');
  for(const mode of ['--combined-read-only-sweep','--email-display-proof'])expect(()=>argsOf([...args,mode])).toThrow();
});
test('timed status repeat waits sixty seconds from the first reply and performs one GET without exposing response bodies',async()=>{
  const {repeatMlStatusRead}=require('../../scripts/verify_five_role_sessions_live.cjs');let clock=10000;
  const sleep=jest.fn(async ms=>{clock+=ms;});
  const read=jest.fn(async()=>({status:200,body:{available:false,status:'unavailable',category:'config',dataPoints:null,private:'private-sentinel'}}));
  const result=await repeatMlStatusRead({firstAt:5000,now:()=>clock,sleep,read});
  expect(sleep).toHaveBeenCalledWith(55000);expect(read).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({httpStatus:200,category:'config',contractValid:true,intervalMs:60000});expect(JSON.stringify(result)).not.toContain('private-sentinel');
});
test('timed status repeat rejects early wake-up or invalid admission before reading and never retries failures',async()=>{
  const {repeatMlStatusRead}=require('../../scripts/verify_five_role_sessions_live.cjs'),read=jest.fn();
  await expect(repeatMlStatusRead({firstAt:100,now:()=>100,sleep:async()=>{},read})).rejects.toThrow('STATUS_REPEAT_INTERVAL_REJECTED');expect(read).not.toHaveBeenCalled();
  await expect(repeatMlStatusRead({firstAt:101,now:()=>100,read})).rejects.toThrow('STATUS_REPEAT_ADMISSION_REJECTED');expect(read).not.toHaveBeenCalled();
  read.mockRejectedValue(Error('inert-failure'));
  await expect(repeatMlStatusRead({firstAt:0,now:()=>60000,sleep:async()=>{},read})).rejects.toThrow('inert-failure');expect(read).toHaveBeenCalledTimes(1);
});
test('initial ML-status wait permits an already dispatched reply arriving after the five-second rendering delay',async()=>{
  const {waitForInitialMlStatus}=require('../../scripts/verify_five_role_sessions_live.cjs');let clock=5000;const samples=[];
  const sleep=jest.fn(async ms=>{clock+=ms;if(clock>=6000)samples.push({httpStatus:200,category:'bad_response'});});
  await expect(waitForInitialMlStatus({samples,now:()=>clock,sleep})).resolves.toBeUndefined();
  expect(clock).toBe(6000);expect(samples).toHaveLength(1);expect(sleep).toHaveBeenCalledTimes(10);
});
test('initial ML-status wait is bounded, has no HTTP callback, and fails closed for missing or duplicate replies',async()=>{
  const {waitForInitialMlStatus}=require('../../scripts/verify_five_role_sessions_live.cjs');let clock=0;
  await expect(waitForInitialMlStatus({samples:[],timeoutMs:200,now:()=>clock,sleep:async ms=>{clock+=ms;}})).rejects.toThrow('INITIAL_STATUS_READ_TIMEOUT');
  expect(clock).toBe(200);
  await expect(waitForInitialMlStatus({samples:[{},{}]})).rejects.toThrow('INITIAL_STATUS_READ_NOT_UNIQUE');
  await expect(waitForInitialMlStatus({samples:[],timeoutMs:60001})).rejects.toThrow('INITIAL_STATUS_WAIT_ADMISSION_REJECTED');
});
test('delayed first response followed by the repeat still separates dispatches by at least sixty seconds',async()=>{
  const {waitForInitialMlStatus,repeatMlStatusRead}=require('../../scripts/verify_five_role_sessions_live.cjs');let clock=0,firstAt;const samples=[];
  await waitForInitialMlStatus({samples,now:()=>clock,sleep:async ms=>{clock+=ms;if(clock===6100){firstAt=clock;samples.push({httpStatus:200});}}});
  const read=jest.fn(async()=>({status:200,body:{status:'unavailable',available:false,category:'bad_response',dataPoints:null}}));
  const result=await repeatMlStatusRead({firstAt,now:()=>clock,sleep:async ms=>{clock+=ms;},read});
  expect(result.intervalMs).toBe(60000);expect(clock).toBe(66100);expect(read).toHaveBeenCalledTimes(1);
});
test('P2 one-GET mode excludes repeat/other-role modes and enforces the22-email soft stop',()=>{
  const {argsOf,admitAttempt}=require('../../scripts/verify_five_role_sessions_live.cjs');
  const args=['--approved-session-check','--role','admin','--run-id','q1_sessions_20261105_a1b2c3d4','--email-total','7','--backend-commit','a'.repeat(40),'--notification-transport','--admin-ml-once'];
  const config=argsOf(args);expect(config).toMatchObject({adminMlOnce:true,adminMlRetest:false,baseline:7});
  for(const flag of ['--admin-ml-retest','--combined-read-only-sweep','--email-display-proof'])expect(()=>argsOf([...args,flag])).toThrow('ADMIN_SINGLE_GET_SCOPE_REJECTED');
  expect(()=>argsOf(args.map(x=>x==='admin'?'doctor':x))).toThrow('ADMIN_SINGLE_GET_SCOPE_REJECTED');
  expect(()=>argsOf(args.map(x=>x==='7'?'21':x))).toThrow('EMAIL_BUDGET_REJECTED');
  expect(()=>admitAttempt(config,['patient'])).toThrow('ATTEMPT_OR_EMAIL_BUDGET_REJECTED');
});
test('P2 routing dispatches exactly one authenticated ML GET and rejects every repeat before transport',async()=>{
  const b=createBrowserBoundary('admin',{notificationTransportApproved:true,mlStatusGetLimit:1}),x=context();await b.attach(x);
  expect((await dispatch(x,'/api/admin/ml-status')).aborted).toBe(true);expect(b.summary().mlStatusGetDispatches).toBe(0);
  await dispatch(x,'/api/auth/login','POST');b.observeLoginResponse(200,loginProof('admin',200,{data:{role:'admin',accessToken:'inert-token-long-enough-for-session'}}),'inert-token-long-enough-for-session');
  expect((await dispatch(x,'/api/admin/ml-status')).continued).toBe(true);
  expect((await dispatch(x,'/api/admin/ml-status')).aborted).toBe(true);
  expect(b.summary()).toMatchObject({mlStatusGetDispatches:1,mlStatusGetLimit:1});
  for(const p of ['/ingest','/api/seed-demo','/api/admin/outbreak/trigger','/api/cache/clear','/api/auth/verify-otp','/api/doctor/consultation','/api/pharmacy/dispense'])expect((await dispatch(x,p,'POST')).aborted).toBe(true);
});
test('P2 quota rejects query aliases, HEAD and non-admin configuration; OPTIONS consumes no GET',async()=>{
  expect(()=>createBrowserBoundary('doctor',{mlStatusGetLimit:1})).toThrow('ML_STATUS_LIMIT_REJECTED');
  expect(()=>createBrowserBoundary('admin',{mlStatusGetLimit:2})).toThrow('ML_STATUS_LIMIT_REJECTED');
  const b=createBrowserBoundary('admin',{notificationTransportApproved:true,mlStatusGetLimit:1}),x=context();await b.attach(x);
  expect((await dispatch(x,'/api/admin/ml-status','OPTIONS')).continued).toBe(true);
  expect((await dispatch(x,'/api/admin/ml-status?extra=fixture')).aborted).toBe(true);
  expect((await dispatch(x,'/api/admin/ml-status','HEAD')).aborted).toBe(true);
  expect(b.summary().mlStatusGetDispatches).toBe(0);
});
test.each(['/api/admin/ml-status/','/API/ADMIN/ML-STATUS','/api/admin/ml-status//'])('P2 cannot evade its single-GET quota through the route alias %s',async alias=>{
  const b=createBrowserBoundary('admin',{notificationTransportApproved:true,mlStatusGetLimit:1}),x=context();await b.attach(x);
  await dispatch(x,'/api/auth/login','POST');b.observeLoginResponse(200,loginProof('admin',200,{data:{role:'admin',accessToken:'inert-token-long-enough-for-session'}}),'inert-token-long-enough-for-session');
  expect((await dispatch(x,alias)).aborted).toBe(true);expect(b.summary().mlStatusGetDispatches).toBe(0);
  expect((await dispatch(x,'/api/admin/ml-status')).continued).toBe(true);expect(b.summary().mlStatusGetDispatches).toBe(1);
});
