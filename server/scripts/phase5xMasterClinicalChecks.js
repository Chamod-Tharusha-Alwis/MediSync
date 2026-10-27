'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'../..'),tag=process.argv[2];assert(/^[a-z0-9-]+$/.test(tag||''));
const output=path.join(root,'scratch/phase5x-evidence/master-clinical-'+tag+'.json');assert(!fs.existsSync(output));
const source=fs.readFileSync(path.join(root,'server/src/services/dispensingService.js'),'utf8'),moduleDouble={exports:{}};
let realModelCalls=0;const deny=()=>{realModelCalls++;throw Error('Real model/service forbidden');};
const model=new Proxy(deny,{get:()=>deny});
vm.runInNewContext(source,{module:moduleDouble,exports:moduleDouble.exports,Date,Buffer,require:name=>{
  if(name==='mongoose')return {startSession:deny,isObjectIdOrHexString:x=>/^[a-f0-9]{24}$/.test(x)};
  if(name==='crypto')return require('crypto');
  if(name.startsWith('../models/'))return model;
  if(name==='../utils/ingredientResolver')return {checkAllergyConflict:deny};
  if(name==='./clinicalAuditService')return {recordClinicalEvent:async()=>{},ACTIONS:{}};
  if(name==='../security/nicPersistence')return {nicFilter:x=>x,writeNicFields:x=>x};
  if(name==='./clinicalErrors')return {ClinicalCommandError:class extends Error{}};
  if(name==='./pharmacyCommitGuard')return {claimPharmacyAuthorization:async()=>{}};
  if(name==='./currentMedicationSafety')return {currentMedicationNames:()=>[],assertMedicationResult:()=>{}};
  throw Error('Unreviewed service import: ' + name);
}},{filename:'actual-dispensingService.js'});
const api=moduleDouble.exports,checks=[];
const check=async(name,fn)=>{try{await fn();checks.push({name,passed:true});}catch(error){checks.push({name,passed:false,detail:error.message});}};
const labelled=label=>Object.assign(Error('synthetic'),{errorLabels:[label]});
function session(){const calls={start:0,commit:0,abort:0,end:0};return {calls,startTransaction(){calls.start++;},async commitTransaction(){calls.commit++;},async abortTransaction(){calls.abort++;},async endSession(){calls.end++;},inTransaction:()=>true};}
(async()=>{
 await check('Session acquisition failure never runs callback',async()=>{let work=0;await assert.rejects(api.runTransaction(()=>work++,async()=>{throw Error('inert');}),{code:'TRANSACTION_UNAVAILABLE'});assert.equal(work,0);});
 await check('Transient transaction failures abort and retry at most three times',async()=>{const s=session();let n=0;await assert.rejects(api.runTransaction(async()=>{n++;throw labelled('TransientTransactionError');},async()=>s),{code:'TRANSACTION_FAILED'});assert.equal(n,3);assert.equal(s.calls.abort,3);assert.equal(s.calls.end,1);});
 await check('Unknown commit retries commit only',async()=>{const s=session();let n=0;s.commitTransaction=async()=>{if(++s.calls.commit===1)throw labelled('UnknownTransactionCommitResult');};assert.equal(await api.runTransaction(async()=>{n++;return 'inert-receipt';},async()=>s),'inert-receipt');assert.equal(n,1);assert.equal(s.calls.commit,2);});
 await check('Persistent commit uncertainty never reruns body or aborts',async()=>{const s=session();let n=0;s.commitTransaction=async()=>{s.calls.commit++;throw labelled('UnknownTransactionCommitResult');};await assert.rejects(api.runTransaction(async()=>{n++;},async()=>s),{code:'TRANSACTION_OUTCOME_UNKNOWN'});assert.equal(n,1);assert.equal(s.calls.commit,3);assert.equal(s.calls.abort,0);assert.equal(s.calls.end,1);});
 await check('Transient label after unknown commit never reruns body',async()=>{const s=session();let n=0;s.commitTransaction=async()=>{throw labelled(++s.calls.commit===1?'UnknownTransactionCommitResult':'TransientTransactionError');};await assert.rejects(api.runTransaction(async()=>{n++;},async()=>s),{code:'TRANSACTION_OUTCOME_UNKNOWN'});assert.equal(n,1);});
 await check('Synthetic item preserves explicit unit and positive quantity',()=>assert.equal(api.validateItems([{name:'Synthetic medicine',unit:' tablets ',quantity:2}])[0].unit,'tablets'));
 for(const quantity of [0,-1,1.5,'',null,NaN,Infinity])await check('Invalid inventory quantity '+String(quantity),()=>assert.throws(()=>api.validateItems([{name:'Synthetic',quantity}])));
 await check('Partial dispense requires separate review',()=>assert.throws(()=>api.validateItems([{name:'Synthetic',quantity:1,status:'partial'}])));
 await check('No real model, provider or transaction acquired',()=>assert.equal(realModelCalls,0));
 const receipt={timestamp:new Date().toISOString(),databaseFree:true,actualServiceSourceEvaluated:true,realModelsImported:false,realModelCalls,passed:checks.filter(x=>x.passed).length,failed:checks.filter(x=>!x.passed).length,skipped:0,checks};fs.writeFileSync(output,JSON.stringify(receipt,null,2),{flag:'wx'});console.log(JSON.stringify({passed:receipt.passed,failed:receipt.failed}));if(receipt.failed)process.exitCode=1;
})().catch(()=>{process.exitCode=1;});
