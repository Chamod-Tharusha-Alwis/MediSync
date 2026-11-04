require('./liveVerificationReadOnly.cjs').install();
'use strict';

// This verifies read-only health and local contracts. It cannot accept clinical
// inference, Mongo persistence or a rendered Doctor workflow on their behalf.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),https=require('https');
const {isColdStartError,inferencePredictions}=require('../server/src/utils/inferenceResponse');
const ROOT=path.resolve(__dirname,'..');
const BACKEND='https://medisync-wabc.onrender.com/health';
const ML='https://medisync-ml.onrender.com/health';
const error=code=>Object.assign(Error(code),{code});
const validCommit=value=>typeof value==='string'&&value.length===40&&/^[a-f0-9]{40}$/i.test(value);
const CATEGORIES=new Set(['HEALTH_TIMEOUT','HEALTH_RESPONSE_INVALID','HEALTH_RESPONSE_TOO_LARGE','HEALTH_IO_FAILURE','HEALTH_TLS_FAILURE','HEALTH_DNS_FAILURE','HEALTH_TARGET_REJECTED']);
function ioFailure(failure){
  const code=typeof failure?.code==='string'?failure.code:'';
  if(['ENOTFOUND','EAI_AGAIN'].includes(code))return error('HEALTH_DNS_FAILURE');
  if(/CERT|^ERR_(?:TLS|SSL)_|UNABLE_TO_VERIFY|DEPTH_ZERO_SELF_SIGNED/.test(code))return error('HEALTH_TLS_FAILURE');
  if(['ETIMEDOUT','ESOCKETTIMEDOUT'].includes(code))return error('HEALTH_TIMEOUT');
  return error('HEALTH_IO_FAILURE');
}

function fetchJson(url,timeoutMs=65000,transport=https){
  if(![BACKEND,ML].includes(url))return Promise.reject(error('HEALTH_TARGET_REJECTED'));
  return new Promise((resolve,reject)=>{
    let done=false,bytes=0,request,deadline;
    const chunks=[];
    const finish=(failure,value)=>{if(done)return;done=true;clearTimeout(deadline);failure?reject(failure):resolve(value)};
    // An idle socket timeout alone does not bound a slow, continually streaming peer.
    deadline=setTimeout(()=>{finish(error('HEALTH_TIMEOUT'));request?.destroy();},timeoutMs);
    try{
      request=transport.get(url,{timeout:timeoutMs,rejectUnauthorized:true},response=>{
        response.on('data',chunk=>{
          if(done)return;
          bytes+=Buffer.byteLength(chunk);
          if(bytes>65536){finish(error('HEALTH_RESPONSE_TOO_LARGE'));request?.destroy();return;}
          chunks.push(Buffer.from(chunk));
        });
        response.on('error',failure=>finish(ioFailure(failure)));
        response.on('end',()=>{
          if(done)return;
          try{
            const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if(!Number.isInteger(response.statusCode)||!body||typeof body!=='object'||Array.isArray(body))throw Error();
            finish(null,{status:response.statusCode,ready:body.status==='ready',commit:validCommit(body.commit)?body.commit.toLowerCase():null});
          }catch(_){finish(error('HEALTH_RESPONSE_INVALID'));}
        });
      });
      request.on('timeout',()=>{finish(error('HEALTH_TIMEOUT'));request.destroy();});
      request.on('error',failure=>finish(ioFailure(failure)));
    }catch(failure){finish(ioFailure(failure));}
  });
}

function verifyProtectedHashes(){
  const ledger=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/release/PROTECTED_HASHES.json'),'utf8'));
  if(!Array.isArray(ledger.files)||ledger.files.length!==15||new Set(ledger.files.map(row=>row?.path)).size!==15)throw error('PROTECTED_LEDGER_INVALID');
  for(const row of ledger.files){
    if(!row||typeof row.path!=='string'||row.path.includes('..')||/(^|[\\/])\.env/.test(row.path)||!/^([a-f0-9]{64})$/.test(row.releaseCandidateSha256||''))throw error('PROTECTED_LEDGER_INVALID');
    const full=path.resolve(ROOT,row.path);
    if(!full.startsWith(ROOT+path.sep)||crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex')!==row.releaseCandidateSha256)throw error('PROTECTED_HASH_MISMATCH');
  }
  return ledger.files.length;
}

function verifyLocalContracts(){
  const positive=[{response:{status:503}},{response:{status:502}},{response:{status:504}},{code:'ECONNABORTED'},{code:'ERR_NETWORK'},{response:{data:{availability:'waking_up'}}}];
  const negative=[null,{response:{status:400}},{response:{status:401}},{response:{status:403}},{response:{status:404}}];
  const predictions=inferencePredictions({availability:'available',predictions:[{disease:'Dengue',confidence:80,icd_code:'A90',extra:'drop'}]});
  let malformedRejected=false;
  try{inferencePredictions({predictions:[{disease:'Dengue',confidence:101}]});}catch(_){malformedRejected=true;}
  if(!positive.every(isColdStartError)||negative.some(isColdStartError)||predictions.length!==1||predictions[0].extra!==undefined||predictions[0].confidence!==80||!malformedRejected)throw error('LOCAL_CONTRACT_FAILED');
  return true;
}

async function health(url,{request,sleep}){
  const attempts=[];
  for(let n=0;n<2;n++){
    let result;
    try{result=await request(url);}catch(failure){result={status:null,ready:false,commit:null,category:CATEGORIES.has(failure?.code)?failure.code:'HEALTH_IO_FAILURE'};}
    if(!result||typeof result!=='object')result={status:null,ready:false,commit:null,category:'HEALTH_RESPONSE_INVALID'};
    const row={status:Number.isInteger(result.status)?result.status:null,ready:result.ready===true,commit:validCommit(result.commit)?result.commit.toLowerCase():null};
    if(result.category)row.category=CATEGORIES.has(result.category)?result.category:'HEALTH_IO_FAILURE';
    attempts.push(row);
    const retry=[502,503,504].includes(row.status)||['HEALTH_TIMEOUT','HEALTH_IO_FAILURE'].includes(row.category);
    if((row.status===200&&row.ready)||!retry||n===1)break;
    await sleep(60000);
  }
  return {attempts,...attempts[attempts.length-1]};
}

async function runVerification({expectedCommit,request=fetchJson,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  if(!validCommit(expectedCommit))throw error('EXPECTED_COMMIT_REQUIRED');
  const result={at:new Date().toISOString(),scope:'READ_ONLY_HEALTH_AND_LOCAL_CONTRACTS',expectedCommit:expectedCommit.toLowerCase(),passed:false,clinicalBrowserAcceptance:'NOT_VERIFIED',liveInference:'NOT_RUN',mlDeploymentIdentity:'NOT_EXPOSED_BY_HEALTH'};
  result.protectedFiles=verifyProtectedHashes();
  result.localContracts=verifyLocalContracts();
  const source=fs.readFileSync(path.join(ROOT,'client/src/pages/doctor/NewConsultation.jsx'),'utf8');
  result.clinicalDisclaimer={sourceMarkersPresent:source.includes('data-testid="clinical-validation-disclaimer"')&&source.includes('clinicalValidation: not_established'),browserVerified:false};
  result.backendHealth=await health(BACKEND,{request,sleep});
  result.backendRevisionMatches=result.backendHealth.commit===result.expectedCommit;
  // An old/unknown backend deployment must not be accepted by local assertions.
  if(!result.backendRevisionMatches){result.category='DEPLOYMENT_REVISION_NOT_VERIFIED';return result;}
  result.mlHealth=await health(ML,{request,sleep});
  result.passed=result.protectedFiles===15&&result.localContracts&&result.backendHealth.status===200&&result.backendHealth.ready&&result.backendRevisionMatches&&result.mlHealth.status===200&&result.mlHealth.ready;
  result.category=result.passed?'READ_ONLY_CHECKS_VERIFIED':'HEALTH_CHECK_FAILED';
  return result;
}

async function main(argv=process.argv.slice(2)){
  let result;
  try{
    if(argv.length!==2||argv[0]!=='--expected-commit'||!validCommit(argv[1]))throw error('EXPECTED_COMMIT_REQUIRED');
    result=await runVerification({expectedCommit:argv[1]});
  }catch(failure){
    const safe=new Set(['EXPECTED_COMMIT_REQUIRED','PROTECTED_LEDGER_INVALID','PROTECTED_HASH_MISMATCH','LOCAL_CONTRACT_FAILED']);
    result={at:new Date().toISOString(),scope:'READ_ONLY_HEALTH_AND_LOCAL_CONTRACTS',passed:false,category:safe.has(failure?.code)?failure.code:'VERIFICATION_FAILED',clinicalBrowserAcceptance:'NOT_VERIFIED',liveInference:'NOT_RUN'};
  }
  const name='CODEX_C4_READONLY_'+new Date().toISOString().replace(/[^0-9]/g,'')+'_'+crypto.randomUUID().slice(0,8)+'.json';
  const output=path.join(ROOT,'docs/temp',name);
  fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({passed:result.passed,category:result.category,scope:result.scope,receipt:'docs/temp/'+name,clinicalBrowserAcceptance:'NOT_VERIFIED'}));
  process.exitCode=result.passed?0:1;
  return result;
}
if(require.main===module)main().catch(()=>{console.error('VERIFICATION_RECEIPT_FAILED');process.exitCode=1;});
module.exports={fetchJson,verifyProtectedHashes,verifyLocalContracts,runVerification,main,BACKEND,ML};
