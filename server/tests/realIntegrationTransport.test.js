'use strict';
const {createRealIntegrationTransport,verifyDurableClinicalEvidence}=require('./helpers/realIntegrationTransport');
const {eventHash}=require('../src/services/clinicalCommandService');
test.each(['MONGO_URI','mongo_uri','MongoDB_URI','Database_URL'])('QA pre-admission rejects a present empty production key %s',name=>{
 expect(()=>require('../src/security/qaConnectionAdmission').assertQaConnectionConfiguration({[name]:'',MEDISYNC_QA_BOOTSTRAPPED:'true',MEDISYNC_QA_CREDENTIALS_ROTATED:'true',MONGO_URI_TEST:'mongodb+srv://inert:inert@medisync.p7hjket.mongodb.net/medisync_automated_test'})).toThrow('PRODUCTION_CREDENTIALS_PRESENT_IN_QA');
});
test('QA pre-admission rejects case-varied duplicate options',()=>{
 expect(()=>require('../src/security/qaConnectionAdmission').assertQaConnectionConfiguration({MEDISYNC_QA_BOOTSTRAPPED:'true',MEDISYNC_QA_CREDENTIALS_ROTATED:'true',MONGO_URI_TEST:'mongodb+srv://inert:inert@medisync.p7hjket.mongodb.net/medisync_automated_test?tls=true&TLS=false'})).toThrow();
});
test('transport has no default clinical execution permission',async()=>{const send=jest.fn();await expect(createRealIntegrationTransport({fetchImpl:send}).request({target:'express',path:'/api/health'})).rejects.toThrow('SEPARATE_SYNTHETIC');expect(send).not.toHaveBeenCalled();});
test('actual clinical idempotency and consent headers are supported; cookies remain ephemeral', async()=>{
 const send=jest.fn(async()=>({status:201,text:async()=>JSON.stringify({consultationId:'owned'}),headers:{getSetCookie:()=>['refreshToken=owned-secret; HttpOnly']}}));
 const transport=createRealIntegrationTransport({authorize:async()=>true,fetchImpl:send});
 const result=await transport.request({target:'express',method:'POST',path:'/api/doctor/consultation',headers:{'idempotency-key':'owned-key','x-patient-access':'owned-consent',origin:'http://127.0.0.1:3100'}});
 expect(result.setCookies).toHaveLength(1);expect(JSON.stringify(transport.receipts())).not.toMatch(/owned-secret|owned-consent|owned-key/);
});
test.each([{target:'express',headers:{origin:'https://production.invalid'}},{target:'flask',headers:{cookie:'owned-cookie'}},{target:'express',headers:{'x-idempotency-key':'incorrect-header'}}])('transport refuses nonlocal origin or inappropriate session/header contract %j',async request=>{
 const send=jest.fn();await expect(createRealIntegrationTransport({authorize:async()=>true,fetchImpl:send}).request({path:'/api/health',...request})).rejects.toThrow();expect(send).not.toHaveBeenCalled();
});
test.each(['https://production.invalid/api','//production.invalid/api','/../api','/api#fragment','/api\\escape'])('transport refuses target escape %s before authorization or HTTP',async path=>{const send=jest.fn(),authorize=jest.fn();await expect(createRealIntegrationTransport({authorize,fetchImpl:send}).request({target:'express',path})).rejects.toThrow();expect(send).not.toHaveBeenCalled();expect(authorize).not.toHaveBeenCalled();});
test('each exact body/method/path needs independent approval; receipts omit tokens and bodies',async()=>{
 const send=jest.fn(async()=>({status:403,url:'http://127.0.0.1:5100/api/doctor/consultation',text:async()=>JSON.stringify({error:'denied'})})),authorize=jest.fn(async()=>true),transport=createRealIntegrationTransport({authorize,fetchImpl:send});
 const result=await transport.request({target:'express',method:'POST',path:'/api/doctor/consultation',body:{patientNic:'synthetic-only'},headers:{authorization:'Bearer opaque-owned-token'}});
 expect(result.status).toBe(403);expect(send.mock.calls[0][1]).toMatchObject({redirect:'error'});expect(authorize.mock.calls[0][0]).toMatchObject({method:'POST',path:'/api/doctor/consultation'});
 expect(JSON.stringify(transport.receipts())).not.toMatch(/synthetic-only|owned-token|patientNic/);
});
test('upstream redirects and non-JSON bodies cannot be accepted as integration results',async()=>{
 for(const response of [{redirected:true,text:async()=> '{}'}, {text:async()=> '<html>login</html>'}])await expect(createRealIntegrationTransport({authorize:async()=>true,fetchImpl:async()=>response}).request({target:'flask',path:'/health'})).rejects.toThrow();
});
const actor='a'.repeat(24),patient='b'.repeat(24),resource='c'.repeat(24),commandId='d'.repeat(24),eventId='e'.repeat(24),at='2026-10-22T00:00:00.000Z';
function evidence(){
 const event={eventId,actorId:actor,actorRole:'doctor',resourceType:'Consultation',resourceId:resource,action:'CONSULTATION_CREATED',eventAt:at,projectedAt:at};event.eventHash=eventHash(event);
 return{commands:[{_id:commandId,actorId:actor,actorRole:'doctor',patientId:patient,result:{consultationId:resource},outbox:[event]}],projections:[{_id:eventId,actorId:actor,actorRole:'doctor',action:`CLINICAL_SUCCESS:CONSULTATION_CREATED:Consultation[${resource}]`,timestamp:at}],projectionCollection:'auditlogs',expectedCommandIds:[commandId],ownedActorIds:[actor],ownedPatientIds:[patient],ownedResourceIds:[resource]};
}
test('durable audit verification requires owned journal, correct event hash and persisted projection',()=>{expect(verifyDurableClinicalEvidence(evidence())).toMatchObject({durableCommands:1,verifiedProjections:1});});
test.each([
 ['mock audit collection',e=>e.projectionCollection='phase5x_audit_qa'],['absent projection',e=>e.projections=[]],['hash corruption',e=>e.commands[0].outbox[0].eventHash='invalid'],['unowned patient',e=>e.ownedPatientIds=[]],['unowned resource',e=>e.ownedResourceIds=[]],['unprojected event',e=>delete e.commands[0].outbox[0].projectedAt],['projection actor mismatch',e=>e.projections[0].actorId='foreign'],['extra baseline evidence',e=>e.projections.push({_id:'foreign'})]
])('durable audit negative refuses %s',(_,change)=>{const e=evidence();change(e);expect(()=>verifyDurableClinicalEvidence(e)).toThrow('NOT_VERIFIED');});
