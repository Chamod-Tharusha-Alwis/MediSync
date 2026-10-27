'use strict';
// Protocol identity is stable; only the specifically reviewed R3 attempt is admitted.
const crypto=require('crypto');
const PROTOCOL_PHASE='5X-E1',ATTEMPT_ID='5X-E1-R3';
function assertAttempt(phase,attemptId){if(phase!==PROTOCOL_PHASE||attemptId!==ATTEMPT_ID)throw Error('Exact E1 protocol and R3 attempt identity required');}
const approvalDigest=a=>crypto.createHash('sha256').update(JSON.stringify(a)).digest('hex');
function binding(a){assertAttempt(a.phase,a.attemptId);return{protocolPhase:a.phase,attemptId:a.attemptId,approvalSha256:approvalDigest(a)};}
function assertBinding(value,expected){
 assertAttempt(value?.protocolPhase,value?.attemptId);assertAttempt(expected?.protocolPhase,expected?.attemptId);
 if(!/^[a-f0-9]{64}$/.test(value.approvalSha256||'')||value.approvalSha256!==expected.approvalSha256)throw Error('E1 approved-attempt digest mismatch');
 return true;
}
module.exports={PROTOCOL_PHASE,ATTEMPT_ID,assertAttempt,approvalDigest,binding,assertBinding};
