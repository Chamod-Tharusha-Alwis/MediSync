'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const guard=require('../../scripts/liveVerificationReadOnly.cjs');

test.each(['POST','PUT','PATCH','DELETE'])('rejects %s before a transport dispatch',method=>{
  const policy=guard.createPolicy(),dispatch=jest.fn();const transport={request:dispatch,get:dispatch};
  guard.wrapNodeTransport(transport,policy);
  expect(()=>transport.request('https://backend.example.invalid/api/public/health-stats',{method})).toThrow(guard.BLOCKED);
  expect(dispatch).not.toHaveBeenCalled();expect(policy.violations()).toBe(1);
});

test.each(['/ingest','/api/admin/outbreak/trigger','/seed-demo','/api/cache/clear','/%69ngest','/invalidate-cache'])('rejects write endpoint %s even with GET',pathname=>{
  expect(()=>guard.createPolicy().assertRequest('https://backend.example.invalid'+pathname)).toThrow(guard.BLOCKED);
});

test('permits real HTTP read signatures and preserves transport callbacks',()=>{
  const dispatch=jest.fn(),transport={request:dispatch,get:dispatch},policy=guard.createPolicy(),callback=()=>{};
  guard.wrapNodeTransport(transport,policy);
  transport.get(new URL('https://backend.example.invalid/health'),callback);
  transport.request({protocol:'https:',hostname:'backend.example.invalid',path:'/api/public/health-stats?rangeDays=30',method:'GET'},callback);
  expect(dispatch).toHaveBeenCalledTimes(2);expect(policy.violations()).toBe(0);
});

test('Playwright browser routes abort POST and allow GET without fake responses',async()=>{
  const policy=guard.createPolicy(),context={route:jest.fn()},continuation=jest.fn(),abort=jest.fn();
  await guard.guardContext(context,policy);const route=context.route.mock.calls[0][1];
  await route({request:()=>({url:()=> 'https://backend.example.invalid/ingest',method:()=> 'POST'}),continue:continuation,abort});
  expect(abort).toHaveBeenCalledWith('blockedbyclient');expect(continuation).not.toHaveBeenCalled();
  await route({request:()=>({url:()=> 'https://backend.example.invalid/health',method:()=> 'GET'}),continue:continuation,abort});
  expect(continuation).toHaveBeenCalledTimes(1);expect(()=>context.unrouteAll()).toThrow(guard.BLOCKED);
});

test('Playwright APIRequestContext and browser-context API methods cannot bypass routing',async()=>{
  const post=jest.fn(),get=jest.fn(),context={route:jest.fn(),request:{post,get,head:jest.fn(),fetch:jest.fn()}};
  const policy=guard.createPolicy();await guard.guardContext(context,policy);
  expect(()=>context.request.post('https://backend.example.invalid/ingest')).toThrow(guard.BLOCKED);expect(post).not.toHaveBeenCalled();
  context.request.get('https://backend.example.invalid/health');expect(get).toHaveBeenCalledWith('https://backend.example.invalid/health',{maxRedirects:0});
  expect(()=>context.request.fetch('https://backend.example.invalid/ingest',{method:'POST'})).toThrow(guard.BLOCKED);
});

test('browser contexts block service workers and persistent/remote bypasses',async()=>{
  const context={route:jest.fn(),newPage:jest.fn()},newContext=jest.fn(async()=>context),browser={newContext};
  const launcher={launch:async()=>browser},policy=guard.createPolicy();guard.guardPlaywright({chromium:launcher},policy);
  const protectedBrowser=await launcher.launch();await protectedBrowser.newContext({serviceWorkers:'allow'});
  expect(newContext).toHaveBeenCalledWith({serviceWorkers:'block'});
  expect(()=>launcher.launchPersistentContext()).toThrow(guard.BLOCKED);
  expect(()=>launcher.connectOverCDP()).toThrow(guard.BLOCKED);
});

test('default install fences DB/seed imports, fetch writes, subprocesses and zero-exit masking',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../../scripts/liveVerificationReadOnly.cjs'),'utf8');
  const dispatched=jest.fn(),spawn=jest.fn(),exit=jest.fn(),events={},loader=jest.fn();
  const cp={spawn},Module={_load:loader},globalObject={fetch:dispatched},fakeProcess={exit,once:(event,fn)=>{events[event]=fn}};
  const deps={http:{get:dispatched,request:dispatched},https:{get:dispatched,request:dispatched},module:Module,'child_process':cp,'../client/node_modules/playwright':{}};
  const module={exports:{}};vm.runInNewContext(source,{module,exports:module.exports,URL,global:globalObject,process:fakeProcess,require:name=>{if(!deps[name])throw Error('UNEXPECTED_IMPORT');return deps[name]}});
  const policy=module.exports.install();
  globalObject.fetch('https://backend.example.invalid/health');expect(dispatched).toHaveBeenCalledWith('https://backend.example.invalid/health',{redirect:'error'});
  expect(()=>globalObject.fetch('https://backend.example.invalid/health',{method:'POST'})).toThrow(guard.BLOCKED);
  for(const name of ['mongoose','node:sqlite','redis','dotenv','C:\\fixture\\node_modules\\mongodb','./seed-demo-outbreak.js'])expect(()=>Module._load(name)).toThrow(guard.BLOCKED);
  expect(()=>cp.spawn('powershell.exe',['-Command','fixture'])).toThrow(guard.BLOCKED);expect(spawn).not.toHaveBeenCalled();
  cp.spawn('C:/fixture/ms-playwright/chromium_headless_shell/chrome-headless-shell-win64/chrome-headless-shell.exe',[]);expect(spawn).toHaveBeenCalledTimes(1);
  fakeProcess.exit(0);expect(exit).toHaveBeenCalledWith(1);expect(policy.violations()).toBeGreaterThan(0);
  expect(String(guard.BLOCKED)).not.toMatch(/https?:|fixture/);
});

test('all tracked live verification entry points install the fence before other imports',()=>{
  // verify_b6_flow_live.cjs and verify_c1_flow_live.cjs were retired (they needed the removed TEST_OTP bypass).
  for(const retired of ['verify_b6_flow_live.cjs','verify_c1_flow_live.cjs'])expect(fs.existsSync(path.resolve(__dirname,'../../scripts',retired))).toBe(false);
  const files=['verify_c2_flow_live.cjs','verify_c3_map_live.cjs','verify_live_public_health_browser.js','verify_m2_step23_live.cjs','verify_phase1_ml.js','verify_phase2_reference_data.js','verify_phase3_consultation_409.js','verify_public_health_live.cjs'];
  for(const file of files)expect(fs.readFileSync(path.resolve(__dirname,'../../scripts',file),'utf8').split(/\r?\n/)[0]).toBe("require('./liveVerificationReadOnly.cjs').install();");
});
