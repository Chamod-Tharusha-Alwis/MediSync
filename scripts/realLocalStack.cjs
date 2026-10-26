'use strict';
// No dotenv, application, provider or database imports before authorization.
const fs=require('fs'),path=require('path'),net=require('net'),http=require('http'),cp=require('child_process'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'..');
const PORTS=Object.freeze({react:3100,express:5100,flask:5101,redis:6379});
function cleanEnvironment(env) {
  const keys=['PATH','Path','SystemRoot','WINDIR','COMSPEC','PATHEXT','APPDATA','LOCALAPPDATA','USERPROFILE','HOME','TEMP','TMP'];
  return Object.fromEntries(keys.filter(k=>typeof env[k]==='string').map(k=>[k,env[k]]));
}
function authorize(env) {
  if(env.MEDISYNC_LOCAL_ATLAS_APPROVED!=='true') throw Error('ATLAS_AUTHORIZATION_REQUIRED: obtain separate restricted QA startup approval before setting MEDISYNC_LOCAL_ATLAS_APPROVED=true. No child startup occurred.');
  if(Object.keys(env).some(k=>/^(MONGO_URI|MONGODB_URI|VAULT_TOKEN|RESEND_API_KEY|BREVO_API_KEY)$/i.test(k))) throw Error('LOCAL_PARENT_PRODUCTION_MATERIAL_FORBIDDEN: use a clean session; do not load server/.env.');
  const qa={};
  for(const k of ['MONGO_URI_TEST','ENCRYPTION_KEY']) { if(!env[k]) throw Error('LOCAL_QA_CONFIGURATION_REQUIRED: '+k);qa[k]=env[k]; }
  require('../server/src/config/dbGuard').validateAutomatedTestConfig({testUri:qa.MONGO_URI_TEST});
  require('../server/src/security/qaConnectionAdmission').assertQaConnectionConfiguration({
    MONGO_URI_TEST:qa.MONGO_URI_TEST,MEDISYNC_QA_BOOTSTRAPPED:'true',
    MEDISYNC_QA_CREDENTIALS_ROTATED:env.MEDISYNC_QA_CREDENTIALS_ROTATED
  });
  return qa;
}
function portFree(port) {
  return new Promise((resolve,reject)=>{ const s=net.createServer();s.once('error',()=>reject(Error('LOCAL_PORT_UNAVAILABLE: '+port)));s.listen(port,'127.0.0.1',()=>s.close(resolve)); });
}
function inspectRedis(exec=cp.execFileSync) {
  let row;
  try {row=JSON.parse(exec('docker',['inspect','--format','{{json .NetworkSettings.Ports}}','medisync-redis'],{encoding:'utf8',timeout:10000,windowsHide:true,stdio:['ignore','pipe','pipe']}));}
  catch(_) {throw Error('EXISTING_REDIS_CONTAINER_UNAVAILABLE: start existing medisync-redis; no container will be created.');}
  const ports=row['6379/tcp']||[];
  if(!ports.some(p=>p.HostPort==='6379')) throw Error('EXISTING_REDIS_PORT_REQUIRED');
  return {container:'medisync-redis',port:6379,publicBinding:ports.some(p=>!['127.0.0.1','::1'].includes(p.HostIp))};
}
function redisPing() {
  return new Promise((resolve,reject)=>{
    const s=net.connect({host:'127.0.0.1',port:6379});let body='';s.setTimeout(3000);
    s.once('connect',()=>s.write('*1\r\n$4\r\nPING\r\n'));
    s.on('data',chunk=>{body+=chunk;if(body.includes('\r\n')){s.destroy();body==='+PONG\r\n'?resolve():reject(Error('REDIS_PING_FAILED'));}});
    s.once('error',()=>reject(Error('REDIS_UNAVAILABLE')));s.once('timeout',()=>{s.destroy();reject(Error('REDIS_PING_TIMEOUT'));});
  });
}
function assertRedisContainment(redis) {
  if (!redis || redis.container !== 'medisync-redis' || redis.port !== 6379 || redis.publicBinding !== false) {
    throw Error('REDIS_LOOPBACK_BINDING_REQUIRED: existing container publishes Redis beyond loopback; obtain separate containment approval before starting QA.');
  }
}
function getJson(url,expected) {
  return new Promise((resolve,reject)=>{
    const r=http.get(url,res=>{let body='';res.on('data',chunk=>{body+=chunk;if(body.length>65536)r.destroy();});res.on('error',reject);res.on('end',()=>{try{const x=JSON.parse(body);if(res.statusCode!==200||!expected(x))throw Error();resolve(x);}catch(_){reject(Error('SERVICE_NOT_READY'));}});});
    r.once('error',reject);r.setTimeout(2000,()=>r.destroy(Error('SERVICE_HEALTH_TIMEOUT')));
  });
}
async function waitFor(check,alive,timeoutMs) {
  const end=Date.now()+timeoutMs;
  while(Date.now()<end&&alive()){try{return await check();}catch(_){await new Promise(r=>setTimeout(r,250));}}
  throw Error('SERVICE_STARTUP_FAILED_OR_TIMED_OUT');
}
async function stopChildren(children,timeoutMs=3000) {
  await Promise.all(children.map(child=>new Promise(resolve=>{
    if(!Number.isSafeInteger(child.pid))return resolve();
    if(child.exitCode!==null||child.signalCode!==null)return resolve();
    child.once('exit',resolve);
    if(child.connected){try{child.send({type:'medisync-local-stop'});}catch(_){}}
    else if(process.platform==='win32'){
      // A Windows virtualenv launcher can own a second Python process. Killing
      // only that launcher can leave the actual HTTP listener behind.
      cp.spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:5000});
    }else {try{process.kill(-child.pid,'SIGTERM');}catch(_){child.kill('SIGTERM');}}
    const timer=setTimeout(()=>{
      if(child.exitCode===null&&child.signalCode===null){
        // Numeric PIDs originate only from this launcher's child handles.
        if(process.platform==='win32')cp.spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:5000});
        else {try{process.kill(-child.pid,'SIGKILL');}catch(_){child.kill('SIGKILL');}}
      }
      resolve();
    },timeoutMs);child.once('exit',()=>clearTimeout(timer));
  })));
}
async function main(env=process.env,args=process.argv.slice(2)) {
  console.log('[REAL_STACK] React 127.0.0.1:3100 | Express 127.0.0.1:5100 | Flask 127.0.0.1:5101');
  if(Number(process.versions.node.split('.')[0])<24)throw Error('NODE_24_REQUIRED');
  const redis=inspectRedis();assertRedisContainment(redis);await redisPing();
  console.log('[REDIS] Existing medisync-redis: PONG'+(redis.publicBinding?' | WARNING: Docker port 6379 is published beyond loopback; restrict host access.':' | loopback publishing'));
  for(const port of [3100,5100,5101])await portFree(port);
  const python=env.MEDISYNC_LOCAL_PYTHON||path.join(ROOT,'ml-engine','.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
  for(const file of [python,'server/node_modules/express/package.json','client/node_modules/react-scripts/scripts/start.js'])if(!fs.existsSync(path.isAbsolute(file)?file:path.join(ROOT,file)))throw Error('EXISTING_DEPENDENCY_MISSING: installation is not automatic.');
  if(args.includes('--check')){console.log('[CHECK_ONLY] Ports, dependencies and Redis checked. No Atlas access or service startup. ML startup safety and separate Atlas approval remain required.');return;}
  const qa=authorize(env);
  fs.mkdirSync(path.join(ROOT,'scratch'),{recursive:true});
  const runtime=fs.mkdtempSync(path.join(ROOT,'scratch/local-real-stack-'));
  const common={...cleanEnvironment(env),NODE_ENV:'test',MEDISYNC_TEST_MODE:'true',MEDISYNC_QA_BOOTSTRAPPED:'true',MEDISYNC_QA_CREDENTIALS_ROTATED:env.MEDISYNC_QA_CREDENTIALS_ROTATED,MEDISYNC_LOCAL_REAL_STACK:'true',NO_PROXY:'127.0.0.1,localhost'};
  const internalKey=crypto.randomBytes(48).toString('hex'),children=[];
  let stopping=false,stopPromise;
  const stop=code=>{if(stopPromise)return stopPromise;stopping=true;stopPromise=stopChildren(children).then(()=>{process.exitCode=code;});return stopPromise;};
  const signal=()=>{void stop(0);};
  for(const s of ['SIGINT','SIGTERM','SIGHUP'])process.once(s,signal);
  function launch(name,executable,script,extra) {
    const child=cp.spawn(executable,[script],{cwd:ROOT,env:{...common,...extra},windowsHide:true,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe',...(name==='ML'?[]:['ipc'])]});children.push(child);
    child.stdout.on('data',d=>process.stdout.write('['+name+'] '+d));child.stderr.on('data',d=>process.stderr.write('['+name+'] '+d));
    child.once('error',()=>{console.error('['+name+'] Process failed to start.');void stop(1);});
    child.once('exit',code=>{if(!stopping){console.error('['+name+'] Unexpected exit ('+code+'); stopping owned services.');void stop(1);}});return child;
  }
  try {
    // ML must become genuinely ready before any database-connected child starts.
    launch('ML',python,path.join(ROOT,'scripts/localRealMl.py'),{PORT:'5101',MEDISYNC_ML_QA:'true',MEDISYNC_ML_DB_PATH:path.join(runtime,'ml.sqlite3'),PYTHON_DOTENV_DISABLED:'1',PYTHONDONTWRITEBYTECODE:'1',INTERNAL_API_KEY:internalKey,CLIENT_URL:'http://127.0.0.1:3100'});
    await waitFor(()=>getJson('http://127.0.0.1:5101/health',x=>x.status==='ready'),()=>!stopping,60000);
    launch('EXPRESS',process.execPath,path.join(ROOT,'server/scripts/localRealBackend.cjs'),{...qa,MEDISYNC_LOCAL_ATLAS_APPROVED:'true',INTERNAL_API_KEY:internalKey,PORT:'5100',CLIENT_URL:'http://127.0.0.1:3100',ML_ENGINE_URL:'http://127.0.0.1:5101',REDIS_URL:'redis://127.0.0.1:6379/15',VAULT_TOKEN:'bypass',JWT_SECRET:crypto.randomBytes(48).toString('hex'),JWT_REFRESH_SECRET:crypto.randomBytes(48).toString('hex')});
    await waitFor(()=>getJson('http://127.0.0.1:5100/health',x=>x.status==='ready'&&x.service==='medisync-express'),()=>!stopping,60000);
    launch('REACT',process.execPath,path.join(ROOT,'scripts/localRealClient.cjs'),{});
    await waitFor(()=>new Promise((resolve,reject)=>{const r=http.get('http://127.0.0.1:3100',res=>{res.resume();res.statusCode===200?resolve():reject(Error());});r.once('error',reject);r.setTimeout(2000,()=>r.destroy(Error()));}),()=>!stopping,120000);
    if(stopping)throw Error('LOCAL_STARTUP_INTERRUPTED');
    console.log('[REAL_STACK_READY] http://127.0.0.1:3100 | Express :5100 | Flask :5101 | restricted QA Atlas | real Redis | external providers disabled. Ctrl+C stops owned children only.');
    await Promise.all(children.map(c=>new Promise(r=>{if(c.exitCode!==null||c.signalCode!==null)r();else c.once('exit',r);})));
  }catch(error){await stop(1);throw error;}
  finally{await stop(process.exitCode||0);for(const s of ['SIGINT','SIGTERM','SIGHUP'])process.removeListener(s,signal);}
}
module.exports={PORTS,cleanEnvironment,authorize,inspectRedis,assertRedisContainment,portFree,getJson,waitFor,stopChildren,main};
