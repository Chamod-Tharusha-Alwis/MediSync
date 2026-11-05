'use strict';
// Explicit local browser qualification, not a production or clinical E2E test.
// Browser URLs are fixture labels only: every HTTP request is fulfilled locally
// or relayed to this test's owned loopback server. No external request continues.
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),http=require('http'),crypto=require('crypto');
const {Server}=require('../server/node_modules/socket.io');
const {chromium}=require('../client/node_modules/playwright');
const parser=require('../client/node_modules/@babel/parser');
const traverse=require('../client/node_modules/@babel/traverse').default;
const babel=require('../client/node_modules/@babel/core');
const {createBrowserBoundary,loginProof}=require('./authenticatedSessionBrowser.cjs');
const {logoutInPage}=require('./verify_five_role_sessions_live.cjs');
const before=require('./fixtures/adminSocketEffectBeforeSessionCleanup.cjs');
const API='https://medisync-wabc.onrender.com',FRONTEND='https://medisync.chamodtharusha.com.lk';
const TOKEN='inert-only-not-a-real-session-token';
const root=path.resolve(__dirname,'..'),measurements=[];
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

function effectFrom(source){
  let result;
  traverse(parser.parse(source,{sourceType:'module',plugins:['jsx']}),{CallExpression(p){
    if(p.node.callee.type!=='Identifier'||p.node.callee.name!=='useEffect')return;
    let found=false;
    p.get('arguments.0').traverse({CallExpression(q){if(q.node.callee.type==='Identifier'&&q.node.callee.name==='io')found=true;}});
    if(found){assert.equal(result,undefined,'socket effect must be unambiguous');result=source.slice(p.node.arguments[0].start,p.node.arguments[0].end);}
  }});
  assert.ok(result,'actual production socket effect missing');return result;
}
function safeDisconnectSource(){
  const source=fs.readFileSync(path.join(root,'client/src/utils/safeSocketDisconnect.js'),'utf8');let result;
  traverse(parser.parse(source,{sourceType:'module'}),{VariableDeclarator(p){if(p.node.id.name==='safeDisconnectSocket')result=source.slice(p.node.init.start,p.node.init.end);}});
  assert.ok(result);return result;
}
function compile(effect){return babel.transformSync('('+effect+')',{babelrc:false,configFile:false,
  plugins:[require.resolve('../client/node_modules/@babel/plugin-transform-react-jsx')]}).code;}

async function rehearsal(effect,{negative=false}={}){
  let browser,context,server,io;const counters={fixtureLogins:0,fixtureLogouts:0,relayRequests:0,verifiedLoopbackRelays:0,nonLoopbackRelayPeers:0,applicationEvents:0,unexpectedBrowserOrigins:0,webSocketAttempts:0};
  const boundary=createBrowserBoundary('admin',{notificationTransportApproved:true});
  try{
    server=http.createServer((req,res)=>{
      res.setHeader('Access-Control-Allow-Origin',FRONTEND);res.setHeader('Access-Control-Allow-Credentials','true');
      res.setHeader('Access-Control-Allow-Headers','authorization,content-type');
      res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
      if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
      if(req.url==='/api/auth/login'&&req.method==='POST'){
        counters.fixtureLogins++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:{role:'admin',accessToken:TOKEN}}));return;
      }
      if(req.url==='/api/auth/logout'&&req.method==='POST'){
        counters.fixtureLogouts++;res.setHeader('Content-Type','application/json');res.end('{}');
        setTimeout(()=>io.emit('notification',{synthetic:true}),60);return;
      }
      res.writeHead(404);res.end();
    });
    io=new Server(server,{cors:{origin:FRONTEND,credentials:true},transports:['polling'],pingInterval:60000});
    io.use((socket,next)=>socket.handshake.auth.token===TOKEN?next():next(Error('INERT_AUTH_REJECTED')));
    io.on('connection',socket=>socket.onAny(()=>{counters.applicationEvents++;}));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    assert.equal(server.address().address,'127.0.0.1');const port=server.address().port;
    async function relay(request,route){
      const u=new URL(request.url());
      if(u.origin===FRONTEND){await route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Inert socket lifecycle fixture</title><main>Offline fixture</main>'});return;}
      assert.equal(u.origin,API);counters.relayRequests++;
      // Never pass the browser URL, credentials, cookies or arbitrary hostname
      // to Node transport. Only exact local destination, method and wire bytes.
      const payload=request.postDataBuffer();
      const reply=await new Promise((resolve,reject)=>{
        const req=http.request({hostname:'127.0.0.1',port,path:u.pathname+u.search,method:request.method(),agent:false,
          headers:{origin:FRONTEND,...(payload?{'content-type':request.headers()['content-type']||'text/plain','content-length':payload.length}:{})}},res=>{
          const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
        });
        req.on('socket',socket=>socket.once('connect',()=>{
          if(socket.remoteAddress==='127.0.0.1'&&socket.remotePort===port)counters.verifiedLoopbackRelays++;
          else{counters.nonLoopbackRelayPeers++;req.destroy(Error('NON_LOOPBACK_RELAY_REJECTED'));}
        }));
        req.on('error',reject);req.setTimeout(5000,()=>req.destroy(Error('INERT_RELAY_TIMEOUT')));req.end(payload||undefined);
      });
      const headers={};for(const name of ['content-type','access-control-allow-origin','access-control-allow-credentials','access-control-allow-headers','access-control-allow-methods'])if(reply.headers[name])headers[name]=String(reply.headers[name]);
      await route.fulfill({status:reply.status,headers,body:reply.body});
    }
    browser=await chromium.launch({headless:true});context=await browser.newContext({serviceWorkers:'block'});
    // Polling-only profile: actual Chromium WebSocket attempts are denied before
    // connection, and must stay zero. Existing policy unit tests cover WSS.
    await context.routeWebSocket('**/*',ws=>{counters.webSocketAttempts++;ws.close();});
    let routed;
    await boundary.attach({request:{},routeWebSocket:async()=>{},route:async(_,handler)=>{routed=handler;}});
    await context.route('**/*',async route=>{
      const request=route.request(),origin=new URL(request.url()).origin;
      if(![API,FRONTEND].includes(origin)){counters.unexpectedBrowserOrigins++;await route.abort();return;}
      await routed({request:()=>request,abort:reason=>route.abort(reason),continue:()=>relay(request,route)}).catch(()=>{});
    });
    const page=await context.newPage();
    await page.goto(FRONTEND+'/inert-socket-fixture');
    await page.addScriptTag({path:path.join(root,'client/node_modules/socket.io-client/dist/socket.io.js')});
    const login=await page.evaluate(async url=>{const r=await fetch(url,{method:'POST'});return {status:r.status,body:await r.json()};},API+'/api/auth/login');
    boundary.observeLoginResponse(login.status,loginProof('admin',login.status,login.body),login.body.data.accessToken);
    await page.evaluate(({effect,disconnect,token,url})=>{
      window.safeDisconnectSocket=(0,eval)('('+disconnect+')');
      window.fixtureEffect=(0,eval)(effect);
      window.SOCKET_SERVER_URL=url;window.toast={error:()=>{},info:()=>{}};window.setActiveAlerts=()=>{};window.React={createElement:()=>({})};
      localStorage.setItem('token',token);
      window.fixtureClients=[];const actualIO=window.io;
      window.io=(destination,options)=>{const socket=actualIO(destination,{...options,transports:['polling'],forceNew:true,reconnection:false});window.fixtureClients.push(socket);return socket;};
      window.fixtureDisposers=Array.from({length:3},()=>window.fixtureEffect());
    },{effect:compile(effect),disconnect:safeDisconnectSource(),token:TOKEN,url:API});
    await page.waitForFunction(()=>window.fixtureClients.length===3&&window.fixtureClients.every(s=>s.connected),{},{timeout:7000});
    const connectedBefore=io.engine.clientsCount;assert.equal(connectedBefore,3);
    if(negative){
      await page.evaluate(async base=>{
        for(const suffix of ['/ingest','/api/seed','/api/admin/outbreak/trigger','/api/cache/clear','/api/auth/verify-otp','/api/doctor/consultations','/api/pharmacy/dispense'])await fetch(base+suffix,{method:'POST'}).catch(()=>{});
        window.fixtureClients[0].emit('dispense',{synthetic:true});
      },API);
      await page.waitForTimeout(150);
    }
    const logout=await page.evaluate(logoutInPage,{url:API+'/api/auth/logout',accessToken:TOKEN});
    await page.waitForTimeout(450);
    const result={connectedBefore,logoutStatus:logout.status,boundary:boundary.summary(),...counters};
    await page.evaluate(()=>window.fixtureDisposers.forEach(dispose=>dispose()));
    return result;
  }finally{
    if(context)await context.close().catch(()=>{});if(browser)await browser.close().catch(()=>{});
    if(io)await new Promise(resolve=>io.close(resolve));
    if(server?.listening)await new Promise(resolve=>server.close(resolve));
  }
}

test('pre-fix production effect reproduces three post-logout polling GET denials offline',{timeout:25000},async()=>{
  assert.equal(hash(before.effectSource),before.effectSha256);
  const r=await rehearsal(before.effectSource);measurements.push({case:'PRE_FIX_REPRODUCTION',...r});
  assert.equal(r.boundary.blockedRequests.filter(x=>x.method==='GET'&&x.pathPattern==='/socket.io/').reduce((n,x)=>n+x.count,0),3);
  assert.equal(r.boundary.blockedTransportReasons.CLOSED_SESSION,3);assert.equal(r.logoutStatus,200);
  assert.ok(r.verifiedLoopbackRelays>0);assert.equal(r.verifiedLoopbackRelays,r.relayRequests);assert.equal(r.nonLoopbackRelayPeers,0);assert.equal(r.unexpectedBrowserOrigins,0);assert.equal(r.webSocketAttempts,0);
});
test('current real production effect disconnects three clients before the boundary closes',{timeout:25000},async()=>{
  const effect=effectFrom(fs.readFileSync(path.join(root,'client/src/pages/admin/Dashboard.jsx'),'utf8'));
  const r=await rehearsal(effect);measurements.push({case:'POST_FIX',...r});
  assert.deepEqual(r.boundary.blockedRequests,[]);assert.equal(r.fixtureLogins,1);assert.equal(r.fixtureLogouts,1);
  assert.equal(r.logoutStatus,200);assert.ok(r.verifiedLoopbackRelays>0);assert.equal(r.verifiedLoopbackRelays,r.relayRequests);assert.equal(r.nonLoopbackRelayPeers,0);assert.equal(r.unexpectedBrowserOrigins,0);assert.equal(r.webSocketAttempts,0);
});
test('real polling profile still denies clinical/OTP/maintenance and Socket.IO application writes',{timeout:25000},async()=>{
  const effect=effectFrom(fs.readFileSync(path.join(root,'client/src/pages/admin/Dashboard.jsx'),'utf8'));
  const r=await rehearsal(effect,{negative:true});measurements.push({case:'DENY_NEGATIVES',...r});
  assert.equal(r.applicationEvents,0);assert.equal(r.fixtureLogins,1);assert.equal(r.fixtureLogouts,1);
  assert.ok(r.boundary.blockedRequests.filter(x=>x.method==='POST').reduce((n,x)=>n+x.count,0)>=8);
  assert.ok(r.verifiedLoopbackRelays>0);assert.equal(r.verifiedLoopbackRelays,r.relayRequests);assert.equal(r.nonLoopbackRelayPeers,0);assert.equal(r.webSocketAttempts,0);
});
after(()=>{
  const stamp=new Date().toISOString().replace(/[-:.]/g,'');
  const receipt=path.join(root,'docs/temp','CODEX_ADMIN_SOCKET_INERT_BROWSER_'+stamp+'.json');
  const sourceFiles=['client/src/pages/admin/Dashboard.jsx','client/src/utils/safeSocketDisconnect.js','scripts/authenticatedSessionBrowser.cjs','scripts/notificationTransportPolicy.cjs','scripts/verify_five_role_sessions_live.cjs','scripts/adminSocketCleanupOffline.test.cjs','scripts/fixtures/adminSocketEffectBeforeSessionCleanup.cjs'];
  fs.writeFileSync(receipt,JSON.stringify({at:new Date().toISOString(),scope:'OFFLINE_SYNTHETIC_LOOPBACK_ONLY_NO_REAL_LOGIN_NO_EMAIL',source:Object.fromEntries(sourceFiles.map(file=>[file,hash(fs.readFileSync(path.join(root,file)))])),measurements,limitations:['Production admin retest NOT RUN','Polling profile only; WSS policy covered separately','Actual effect executed without a full React app; not clinical UI/persistence acceptance']},null,2)+'\n',{flag:'wx'});
  console.log('SANITIZED_RECEIPT='+path.relative(root,receipt));
});
