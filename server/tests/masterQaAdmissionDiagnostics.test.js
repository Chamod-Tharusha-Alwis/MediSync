'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const {classifyAdmissionFailure,recordAdmissionFailure}=require('../scripts/qaReadOnlyAdmissionDiagnostics.cjs');
const {assertQaConnectionConfiguration}=require('../src/security/qaConnectionAdmission');
const valid={MEDISYNC_QA_BOOTSTRAPPED:'true',MEDISYNC_QA_CREDENTIALS_ROTATED:'true',MONGO_URI_TEST:'mongodb+srv://offline-user:offline-password@qa-project-medisync.gwprp27.mongodb.net/medisync_automated_test?tls=true'};
test('synthetic URI parsing alone preserves the exact existing QA policy without any connection',()=>expect(assertQaConnectionConfiguration(valid)).toMatchObject({dbName:'medisync_automated_test',credentialRotationAttested:'NOT_VERIFIED'}));
test.each([
 ['PRODUCTION_CREDENTIALS_PRESENT_IN_QA',{MONGO_URI:'private-do-not-print'}],
 ['QA_BOOTSTRAP_REQUIRED',{MEDISYNC_QA_BOOTSTRAPPED:'false'}],
 ['OPERATOR_CREDENTIAL_ROTATION_ATTESTATION_REQUIRED',{MEDISYNC_QA_CREDENTIALS_ROTATED:'false'}],
 ['QA_URI_INVALID',{MONGO_URI_TEST:'private-invalid-input'}],
 ['QA_EXISTING_CLUSTER_AND_DATABASE_REQUIRED',{MONGO_URI_TEST:valid.MONGO_URI_TEST.replace('medisync_automated_test','test')}],
 ['QA_EXISTING_CLUSTER_AND_DATABASE_REQUIRED',{MONGO_URI_TEST:valid.MONGO_URI_TEST.replace('qa-project-medisync.gwprp27','unrelated')}],
 ['QA_TLS_OR_DATABASE_OVERRIDE_FORBIDDEN',{MONGO_URI_TEST:valid.MONGO_URI_TEST.replace('tls=true','tls=false')}],
 ['QA_TLS_OR_DATABASE_OVERRIDE_FORBIDDEN',{MONGO_URI_TEST:valid.MONGO_URI_TEST+'&dbName=test'}]
])('actual configuration denial %s remains fail-closed and classified without values', (code,override)=>{
 let failure;try{assertQaConnectionConfiguration({...valid,...override});}catch(error){failure=error;}
 expect(failure).toBeDefined();const receipt=classifyAdmissionFailure(failure,{stage:'QA_CONFIGURATION',connectionStarted:false});expect(receipt.failureCode).toBe(code);expect(receipt.atlasContacted).toBe(false);expect(JSON.stringify(receipt)).not.toMatch(/offline-password|private-do-not-print|private-invalid-input|mongodb/);
});
test.each(['QA_PREFLIGHT_BASELINE_HASH_CHANGED','QA_PREFLIGHT_BASELINE_CONTRACT_CHANGED','QA_PREFLIGHT_SEPARATE_READONLY_APPROVAL_REQUIRED'])('existing pre-admission denial %s has an explicit code',code=>expect(classifyAdmissionFailure(Error(code),{stage:'PLAN'}).failureCode).toBe(code));
test('unknown exception text, stack and arbitrary code are never emitted',()=>{
 const error=Object.assign(Error('mongodb+srv://private-user:private-password@example.invalid/test'),{code:'PRIVATE_CODE'});const receipt=classifyAdmissionFailure(error,{stage:'PRIVATE_STAGE'});expect(receipt.failureCode).toBe('UNCLASSIFIED_ADMISSION_FAILURE');expect(receipt.stage).toBe('UNKNOWN');expect(JSON.stringify(receipt)).not.toContain('private');expect(JSON.stringify(receipt)).not.toContain('PRIVATE_');
});
test('failure after connection starts cannot claim Atlas was not contacted',()=>expect(classifyAdmissionFailure(Error('private'),{stage:'DATABASE_ATTEMPT',connectionStarted:true})).toMatchObject({event:'QA_PREFLIGHT_POST_ADMISSION_FAILURE',atlasContacted:'NOT VERIFIED',retryAuthorized:false}));
test('diagnostic receipt writes only the classified safe object to an owned directory',()=>{
 const writes=[],fakeFs={mkdirSync:()=>{},mkdtempSync:prefix=>prefix+'owned',writeFileSync:(file,body,options)=>writes.push({file,body,options})};
 const r=recordAdmissionFailure(Error('QA_URI_INVALID'),{stage:'QA_CONFIGURATION'},{fs:fakeFs,root:path.resolve(__dirname,'../..')});expect(r.diagnosticReceiptStatus).toBe('WRITTEN');expect(writes).toHaveLength(1);expect(writes[0].options.flag).toBe('wx');expect(JSON.parse(writes[0].body)).toEqual(r);expect(r.retryAuthorized).toBe(false);
});
test('receipt filesystem failure still emits no raw error, path or credentials',()=>{
 const r=recordAdmissionFailure(Error('private'),{stage:'RECEIPT_DIRECTORY'},{root:'private-root',fs:{mkdirSync:()=>{throw Error('private-filesystem-detail');}}});expect(r.diagnosticReceiptStatus).toBe('UNAVAILABLE');expect(r.receiptDirectory).toBeUndefined();expect(JSON.stringify(r)).not.toContain('private');
});
test('actual CLI catches baseline failure before any driver load or connection and reports sanitized stage',async()=>{
 const logs=[],writes=[],loaded=[];const io={readFileSync:()=>{throw Object.assign(Error('PRIVATE_PATH_OR_SECRET'),{code:'ENOENT'});},mkdirSync:()=>{},mkdtempSync:p=>p+'offline',writeFileSync:(p,b)=>writes.push(JSON.parse(b))};
 const mod={exports:{}},box={module:mod,__dirname:path.join(__dirname,'../scripts'),console:{error:x=>logs.push(x),log:x=>logs.push(x)},process:{argv:[],env:{},exitCode:0},require:Object.assign(name=>{loaded.push(name);if(name==='fs')return io;if(name==='path')return path;if(name==='crypto')return require('crypto');if(name==='./qaReadOnlyAdmissionDiagnostics.cjs')return{recordAdmissionFailure};throw Error('UNEXPECTED_DEPENDENCY');},{main:mod})};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../scripts/closureQaReadOnly.cjs'),'utf8'),box);await new Promise(resolve=>setImmediate(resolve));expect(box.process.exitCode).toBe(1);expect(loaded).not.toContain('mongoose');expect(loaded).not.toContain('../src/config/dbGuard');expect(writes[0]).toMatchObject({stage:'PLAN',failureCode:'ADMISSION_FILESYSTEM_ENOENT',connectionStarted:false});expect(JSON.stringify(logs)).not.toContain('PRIVATE_PATH_OR_SECRET');
});
