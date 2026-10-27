'use strict';
const {createReconciliation}=require('../src/controllers/clinicalReconciliationController'),{digest}=require('../src/services/clinicalCommandService');
const actor='000000000000000000000001',key='owned-command-reference-0001',consultation='000000000000000000000002';
const command=digest({domain:'clinical-command-v1',actorId:actor,role:'doctor',kind:'consultation',idempotencyKey:key}).slice(0,24);
test.each(['committed','absent','foreign','corrupt','outage'])('actual reconciliation handler returns only a confirmed owned outcome: %s',async mode=>{
 const lookup=jest.fn(async filter=>{expect(filter).toEqual({_id:command,actorId:actor,actorRole:'doctor',kind:'consultation'});if(mode==='outage')throw Error('private');if(mode==='absent')return null;return{_id:command,actorId:mode==='foreign'?consultation:actor,actorRole:'doctor',kind:'consultation',result:{consultationId:mode==='corrupt'?'invalid':consultation},patientId:'private'};});
 const res={status:jest.fn().mockReturnThis(),json:jest.fn()};await createReconciliation({lookup,preflight:async()=>{}})({params:{key},user:{id:actor,role:'doctor'}},res);
 if(mode==='committed')expect(res.json).toHaveBeenCalledWith({state:'committed',operationKey:key,consultationId:consultation});else expect(res.status).toHaveBeenCalledWith(mode==='absent'?409:503);expect(JSON.stringify(res.json.mock.calls)).not.toContain('private');
});
