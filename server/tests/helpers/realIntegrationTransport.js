'use strict';
// Preparation only: no dotenv, fixture bootstrap, database client or automatic run.
// A separately approved parent must authorize every exact request and supply its
// owned-data guards before this transport is used against a real local stack.
const crypto=require('crypto');
const origins=Object.freeze({express:'http://127.0.0.1:5100',flask:'http://127.0.0.1:5101'});
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
function createRealIntegrationTransport({authorize,fetchImpl=global.fetch}={}){
  const receipts=[];
  return {async request({target,method='GET',path,body,headers={}}){
    if(typeof authorize!=='function')throw Error('SEPARATE_SYNTHETIC_HTTP_SCOPE_REQUIRED');
    if(!origins[target]||!['GET','POST','PUT','PATCH','DELETE'].includes(method)||typeof path!=='string'||!path.startsWith('/')||path.startsWith('//')||/[\\#]/.test(path))throw Error('LOCAL_HTTP_TARGET_DENIED');
    const url=new URL(path,origins[target]);
    if(url.origin!==origins[target]||url.pathname+url.search!==path)throw Error('LOCAL_HTTP_TARGET_DENIED');
    const serialized=body===undefined?undefined:JSON.stringify(body);
    if(serialized!==undefined&&Buffer.byteLength(serialized)>65536)throw Error('HTTP_FIXTURE_BODY_TOO_LARGE');
    if(Object.keys(headers).some(key=>!['authorization','content-type','x-device-fingerprint','idempotency-key','x-patient-access','x-patient-access-token','x-internal-key','cookie','origin'].includes(key.toLowerCase())))throw Error('HTTP_HEADER_NOT_REVIEWED');
    const origin=Object.entries(headers).find(([key])=>key.toLowerCase()==='origin')?.[1];
    if(origin!==undefined&&origin!=='http://127.0.0.1:3100')throw Error('QA_BROWSER_ORIGIN_DENIED');
    if(target==='flask'&&Object.keys(headers).some(key=>!['x-internal-key','content-type'].includes(key.toLowerCase())))throw Error('FLASK_SESSION_MATERIAL_DENIED');
    const descriptor=Object.freeze({target,method,path,bodySha256:serialized===undefined?null:digest(serialized)});
    if(await authorize(descriptor)!==true)throw Error('EXACT_SYNTHETIC_HTTP_REQUEST_NOT_AUTHORIZED');
    const response=await fetchImpl(url.href,{method,headers:{'content-type':'application/json',...headers},body:serialized,redirect:'error',signal:AbortSignal.timeout(10000)});
    if(response.redirected||response.url&&new URL(response.url).origin!==origins[target])throw Error('HTTP_RESPONSE_TARGET_DENIED');
    const text=await response.text();if(Buffer.byteLength(text)>2*1024*1024)throw Error('HTTP_RESPONSE_TOO_LARGE');
    let json;try{json=JSON.parse(text);}catch(_){throw Error('HTTP_JSON_RESPONSE_REQUIRED');}
    // Never retain bodies, bearer tokens, NICs, cookies, OTPs or clinical fields.
    receipts.push({target,method,pathSha256:digest(path),bodySha256:descriptor.bodySha256,status:response.status});
    return{status:response.status,body:json,setCookies:response.headers?.getSetCookie?.()||[]};
  },receipts:()=>receipts.map(row=>({...row}))};
}
function verifyDurableClinicalEvidence({commands=[],dispensings=[],projections=[],projectionCollection,expectedCommandIds=[],expectedDispensingIds=[],ownedActorIds=[],ownedPatientIds=[],ownedResourceIds=[],ownedFacilityIds=[]}={}){
  const {eventHash}=require('../../src/services/clinicalCommandService');
  const id=value=>String(value),equalIds=(rows,ids)=>rows.length===ids.length&&new Set(rows.map(r=>id(r._id))).size===rows.length&&rows.every(r=>ids.includes(id(r._id)));
  function deny(){throw Error('DURABLE_CLINICAL_EVIDENCE_NOT_VERIFIED');}
  if(projectionCollection!=='auditlogs'||!equalIds(commands,expectedCommandIds)||!equalIds(dispensings,expectedDispensingIds)||!commands.length&&!dispensings.length)deny();
  const expectedProjections=[];
  function projection(projectionId,actorId,actorRole,action,at){
    if(expectedProjections.includes(projectionId))deny();expectedProjections.push(projectionId);
    const matches=projections.filter(row=>id(row._id)===projectionId);
    if(matches.length!==1)deny();const row=matches[0];
    if(row.actorId!==actorId||row.actorRole!==actorRole||row.action!==action||!Number.isFinite(+new Date(at))||+new Date(row.timestamp)!==+new Date(at))deny();
  }
  for(const command of commands){
    if(!ownedActorIds.includes(id(command.actorId))||!ownedPatientIds.includes(id(command.patientId))||!Array.isArray(command.outbox)||!command.outbox.length)deny();
    if(!command.result||Object.values(command.result).flat().some(value=>!ownedResourceIds.includes(id(value))))deny();
    for(const event of command.outbox){
      if(event.actorId!==id(command.actorId)||event.actorRole!==command.actorRole||!ownedResourceIds.includes(event.resourceId)||event.eventHash!==eventHash(event)||!event.projectedAt)deny();
      projection(event.eventId,event.actorId,event.actorRole,`CLINICAL_SUCCESS:${event.action}:${event.resourceType}[${event.resourceId}]`,event.eventAt);
    }
  }
  for(const row of dispensings){
    const audit=row.audit;
    if(!ownedActorIds.includes(id(row.staffId))||!ownedFacilityIds.includes(id(row.pharmacyId))||!ownedResourceIds.includes(id(row.prescriptionId))||!audit||audit.actorId!==id(row.staffId)||!audit.projectedAt)deny();
    const projectionId=digest(JSON.stringify(['dispensing-audit-v1',id(row._id),'SUCCESS'])).slice(0,24);
    projection(projectionId,audit.actorId,audit.actorRole,`CLINICAL_SUCCESS:${audit.action}:Dispensing[${id(row._id)}]`,audit.timestamp);
  }
  if(projections.length!==expectedProjections.length)deny();
  return Object.freeze({durableCommands:commands.length,durableDispensings:dispensings.length,verifiedProjections:projections.length,scope:'Exact owned identifiers only; read adapter and real storage remain separately gated'});
}
module.exports={createRealIntegrationTransport,verifyDurableClinicalEvidence};
