'use strict';
const path=require('path');
const stages=new Set(['PLAN','APPROVAL','QA_CONFIGURATION','DRIVER_GUARD','RECEIPT_DIRECTORY','DATABASE_ATTEMPT']);
const reasons=new Set([
 'QA_PREFLIGHT_BASELINE_HASH_CHANGED','QA_PREFLIGHT_BASELINE_CONTRACT_CHANGED','QA_PREFLIGHT_SEPARATE_READONLY_APPROVAL_REQUIRED',
 'PRODUCTION_CREDENTIALS_PRESENT_IN_QA','QA_BOOTSTRAP_REQUIRED','OPERATOR_CREDENTIAL_ROTATION_ATTESTATION_REQUIRED',
 'QA_URI_INVALID','QA_EXISTING_CLUSTER_AND_DATABASE_REQUIRED','QA_TLS_OR_DATABASE_OVERRIDE_FORBIDDEN'
]);
// Never serialize Error objects, URI text, environment values or stack traces.
function classifyAdmissionFailure(error,state={}){
 const stage=stages.has(state.stage)?state.stage:'UNKNOWN',started=state.connectionStarted===true;
 const message=typeof error?.message==='string'?error.message:'';
 const filesystem=['ENOENT','EACCES','EPERM','ENOSPC','EROFS'].includes(error?.code)?error.code:null;
 const reason=reasons.has(message)?message:filesystem?'ADMISSION_FILESYSTEM_'+filesystem:'UNCLASSIFIED_ADMISSION_FAILURE';
 return{at:new Date().toISOString(),status:'BLOCKED',event:started?'QA_PREFLIGHT_POST_ADMISSION_FAILURE':'QA_PREFLIGHT_ADMISSION_BLOCKED',stage,failureCode:reason,connectionStarted:started,atlasContacted:started?'NOT VERIFIED':false,databaseWritesAllowed:false,retryAuthorized:false};
}
function recordAdmissionFailure(error,state,{fs,root}){
 const receipt=classifyAdmissionFailure(error,state);
 try{
  const parent=path.join(root,'scratch');fs.mkdirSync(parent,{recursive:true});
  const out=fs.mkdtempSync(path.join(parent,'closure-qa-admission-'));
  receipt.receiptDirectory=path.relative(root,out);receipt.diagnosticReceiptStatus='WRITTEN';
  fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2),{flag:'wx'});
 }catch(_){delete receipt.receiptDirectory;receipt.diagnosticReceiptStatus='UNAVAILABLE';}
 return receipt;
}
module.exports={classifyAdmissionFailure,recordAdmissionFailure};
