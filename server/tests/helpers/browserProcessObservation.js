'use strict';
// The trusted parent must bind child.pid and the startup identity before exit.
// ESRCH is the only absence result; EPERM/EACCES/unknown/reused PID fail closed.
function observeOwnedProcess({identity,expected,probe=pid=>process.kill(pid,0)}){
  require('./e1AttemptIdentity').assertBinding(identity,expected);
  if(!identity||!expected||identity.owner!==expected.owner||identity.approvalId!==expected.approvalId||identity.processId!==expected.processId||identity.nonce!==expected.nonce||
    !Number.isSafeInteger(expected.processId)||expected.processId<=0||expected.processId===process.pid||!/^[a-f0-9]{64}$/.test(expected.nonce||''))throw Error('Owned process identity uncertain');
  let absent=false;try{probe(expected.processId);}catch(error){if(error.code!=='ESRCH')throw Error('OS process inspection uncertain');absent=true;}
  if(!absent)throw Error('Owned process still alive or PID reused');
  return Object.freeze({protocolPhase:expected.protocolPhase,attemptId:expected.attemptId,approvalSha256:expected.approvalSha256,osObserved:true,absent:true,identityVerified:true,processId:expected.processId,owner:expected.owner,nonce:expected.nonce});
}
module.exports={observeOwnedProcess};
