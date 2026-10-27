'use strict';
// Explicit alternative executable, never selected by ordinary npm start.
const fs=require('node:fs');
const {admit,createUniversityApplication}=require('./demo/universityRuntime');
async function startUniversity(environment=process.env,dependencies={}) {
  // No dotenv or credential-file discovery. Operator supplies reviewed values.
  const file=environment.MEDISYNC_DEMO_MANIFEST_PATH;
  if(!file || !fs.statSync(file).isFile() || fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size>131072)throw Error('DEMO_MANIFEST_REQUIRED');
  const bytes=fs.readFileSync(file,'utf8'),manifest=JSON.parse(bytes);
  const admission=admit(environment,manifest,bytes);
  const store=await (dependencies.connect||require('./demo/universityStore').connectUniversityStore)(admission);
  let server;
  try {
    const app=createUniversityApplication({admission,store});
    const port=Number(environment.PORT||5100);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('DEMO_PORT_DENIED');
    server=require('http').createServer(app);
    await require('./security/listenReady').listenReady(server,port,'0.0.0.0');
    let stopping;
    const close=()=>stopping||(stopping=(async()=>{if(server.listening)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await store.close();})());
    return {app,server,close};
  }catch(error){server?.close();await store.close();throw error;}
}
if(require.main===module)startUniversity().then(runtime=>{for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>runtime.close().catch(()=>{process.exitCode=1;}));console.log('[UNIVERSITY_READY] restricted synthetic runtime; clinical writes held');}).catch(()=>{console.error('[FATAL] University runtime admission failed.');process.exitCode=1;});
module.exports={startUniversity};
