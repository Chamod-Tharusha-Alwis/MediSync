'use strict';
const {transportUrl,permittedFrames}=require('../../scripts/notificationTransportPolicy.cjs');
const {createBrowserBoundary,loginProof}=require('../../scripts/authenticatedSessionBrowser.cjs');
const {Encoder,PacketType}=require('socket.io-parser');
const eio=require('engine.io-parser');
const API='https://medisync-wabc.onrender.com',PATH='/socket.io/?EIO=4&transport=polling';
const TOKEN='inert-session-token-with-enough-length';
async function wire(packet){const encoded=new Encoder().encode(packet)[0];return new Promise(resolve=>eio.encodePacket({type:'message',data:encoded},false,resolve));}
function context(){const x={request:{},routeWebSocket:jest.fn(async(_,f)=>{x.ws=f;}),route:jest.fn(async(_,f)=>{x.http=f;})};return x;}
async function send(x,path,method='GET',data='',type='text/plain;charset=UTF-8'){
 const r={continue:jest.fn(),abort:jest.fn()};r.request=()=>({url:()=>API+path,method:()=>method,postData:()=>data,headers:()=>({'content-type':type})});
 await x.http(r);return r;
}
async function authenticated(){const b=createBrowserBoundary('doctor',{notificationTransportApproved:true}),x=context();await b.attach(x);
 await send(x,'/api/auth/login','POST');b.observeLoginResponse(200,loginProof('doctor',200,{data:{role:'doctor',accessToken:TOKEN}}),TOKEN);return {b,x};}
test.each(['GET','POST'])('only exact polling URL with required sid for POST %s',method=>{
 expect(transportUrl(API+PATH+'&sid=inert_id','polling',method)).toBe(true);
});
test.each(['/socket.io-other/?EIO=4&transport=polling','/socket.io/?EIO=3&transport=polling',PATH+'&token=inert',PATH+'&transport=polling',PATH+'&sid=',
 '/socket.io/../ingest?EIO=4&transport=polling','/socket.io/%2e%2e/ingest?EIO=4&transport=polling'])('invalid transport URL rejected %s',p=>{
 expect(transportUrl(API+p,'polling','GET')).toBe(false);
});
test('HTTP, foreign origin, query credentials, absent POST sid and non-GET WSS fail closed',()=>{
 expect(transportUrl(API.replace('https:','http:')+PATH,'polling','GET')).toBe(false);
 expect(transportUrl('https://inert.invalid'+PATH,'polling','GET')).toBe(false);
 expect(transportUrl(API+PATH,'polling','POST')).toBe(false);
 expect(transportUrl(API.replace('https:','wss:')+'/socket.io/?EIO=4&transport=websocket','websocket','POST')).toBe(false);
});
test('actual installed Socket.IO and Engine.IO encoders: session CONNECT allowed; application events denied',async()=>{
 const connect=await wire({type:PacketType.CONNECT,nsp:'/',data:{token:TOKEN}});
 expect(permittedFrames(connect,TOKEN)).toBe(true);
 for(const name of ['ingest','seed','trigger','cache-clear','otp','save','dispense','mark_read']){
  expect(permittedFrames(await wire({type:PacketType.EVENT,nsp:'/',data:[name,{}]}),TOKEN)).toBe(false);
 }
 expect(permittedFrames(await wire({type:PacketType.CONNECT,nsp:'/admin',data:{token:TOKEN}}),TOKEN)).toBe(false);
});
test.each(['42["save",{}]','40{}','40{"token":"wrong"}','40{"token":"inert","extra":true}','40null','40[1]','40{','2','bAA==',Buffer.from('3'),'3'.repeat(16385)])('invalid or unapproved outbound frame rejected %#',data=>{
 expect(permittedFrames(data,TOKEN)).toBe(false);
});
test('control packets and bounded polling batches only; logout allows close, not heartbeats or reconnect',()=>{
 expect(permittedFrames('3\x1e41',TOKEN)).toBe(true);
 expect(permittedFrames('2probe',TOKEN,{websocket:true})).toBe(true);
 expect(permittedFrames('5',TOKEN,{websocket:true})).toBe(true);
 expect(permittedFrames('3',TOKEN,{closed:true})).toBe(false);
 expect(permittedFrames('41',TOKEN,{closed:true})).toBe(true);
 expect(permittedFrames(Array(9).fill('3').join('\x1e'),TOKEN)).toBe(false);
});
test('actual browser route enforces authenticated opt-in and token binding without leaking frame payload',async()=>{
 const {b,x}=await authenticated();
 expect((await send(x,PATH)).continue).toHaveBeenCalledTimes(1);
 const connect=await wire({type:PacketType.CONNECT,nsp:'/',data:{token:TOKEN}});
 expect((await send(x,PATH+'&sid=inert','POST',connect)).continue).toHaveBeenCalledTimes(1);
 expect((await send(x,PATH+'&sid=inert','POST','42["dispense",{}]')).abort).toHaveBeenCalledTimes(1);
 expect((await send(x,PATH+'&sid=inert','POST',connect,'application/json')).abort).toHaveBeenCalledTimes(1);
 await send(x,'/api/auth/logout','POST');expect((await send(x,PATH)).abort).toHaveBeenCalledTimes(1);
 expect((await send(x,PATH+'&sid=inert','POST','41')).continue).toHaveBeenCalledTimes(1);
 expect(JSON.stringify(b.summary())).not.toContain(TOKEN);
});
test('opt-in cannot authorize pre-login transport or clinical mutations',async()=>{
 const b=createBrowserBoundary('admin',{notificationTransportApproved:true}),x=context();await b.attach(x);
 expect((await send(x,PATH)).abort).toHaveBeenCalledTimes(1);
 for(const path of ['/ingest','/api/seed','/api/admin/outbreak/trigger','/api/cache/clear','/api/auth/verify-otp','/api/doctor/consultations','/api/pharmacy/dispense']){
  expect((await send(x,path,'POST')).abort).toHaveBeenCalledTimes(1);
 }
});
test('actual WSS relay passes incoming notifications/control only, denies writes and closes once',async()=>{
 const {x}=await authenticated();
 function socket(){const s={send:jest.fn(),close:jest.fn(()=>s.closeHandler?.()),onClose:f=>{s.closeHandler=f;},onMessage:f=>{s.message=f;}};return s;}
 const ws=socket(),server=socket();ws.url=()=>API.replace('https:','wss:')+'/socket.io/?EIO=4&transport=websocket';ws.connectToServer=jest.fn(()=>server);
 x.ws(ws);expect(ws.connectToServer).toHaveBeenCalledTimes(1);
 ws.message('2probe');expect(server.send).toHaveBeenCalledWith('2probe');
 server.message('42["notification",{}]');expect(ws.send).toHaveBeenCalledWith('42["notification",{}]');
 ws.message('42["save",{}]');expect(server.send).toHaveBeenCalledTimes(1);
 expect(ws.close).toHaveBeenCalledTimes(1);expect(server.close).toHaveBeenCalledTimes(1);
});
test('logout closes owned WSS transport; server notifications cannot continue after the session scope closes',async()=>{
 const {x}=await authenticated();
 const ws={url:()=>API.replace('https:','wss:')+'/socket.io/?EIO=4&transport=websocket',send:jest.fn(),close:jest.fn(),onMessage:jest.fn(),onClose:jest.fn()};
 const server={send:jest.fn(),close:jest.fn(),onMessage:f=>{server.message=f;},onClose:jest.fn()};ws.connectToServer=()=>server;
 x.ws(ws);await send(x,'/api/auth/logout','POST');expect(ws.close).toHaveBeenCalledTimes(1);expect(server.close).toHaveBeenCalledTimes(1);
 server.message('42["notification",{}]');expect(ws.send).not.toHaveBeenCalled();
});
