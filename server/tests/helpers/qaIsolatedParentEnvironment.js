'use strict';
// No fs, dotenv, ambient environment, random generation, network or provider callback.
const assert=require('assert');
const contract=require('./qaIsolatedParentContract');
const {validateChildEnvironment}=require('./qaEnvironmentContract');
const sources=new WeakMap();
const environments=new WeakMap();
const FIXED='ENV5_NON_SENSITIVE_INERT_ONLY';
function createInertSecretSource({sourceRef,version,issuer,keyPolicy}){
  assert(sourceRef==='env5-inert-source'&&version==='env5-inert-version'&&issuer==='env5-inert-issuer'&&keyPolicy===contract.KEY_POLICY,'Only fixed inert secret source supported');
  const source=Object.freeze({simulationOnly:true});sources.set(source,{sourceRef,version,issuer,keyPolicy,reads:0,generations:0});return source;
}
function validateParentEnvironment(parent,policy){
  assert(parent&&typeof parent==='object'&&!Array.isArray(parent),'Explicit parent environment required');
  // Inspect keys before reading any value, including unexpected aliases.
  assert.deepEqual(Object.keys(parent).sort(),Object.keys(policy.allowedParentOsValues).sort(),'Unapproved parent environment key');
  for(const key of Object.keys(parent)){assert(Object.getOwnPropertyDescriptor(parent,key)?.get===undefined,'Environment accessor prohibited');assert.equal(parent[key],policy.allowedParentOsValues[key],'Reviewed OS value changed');}
}
function buildIsolatedQaEnvironment({context,parentEnvironment,source,uri,resolution}={}){
  const state=contract.contextState(context,{consumed:true}),p=state.policy;
  validateParentEnvironment(parentEnvironment,p);
  const record=sources.get(source);assert(record,'Untrusted secret-reader/generator rejected');
  assert(record.sourceRef===p.qaCredentialSourceRef&&record.version===p.qaCredentialVersion&&record.issuer===p.credentialIssuer&&record.keyPolicy===p.keyPolicy,'QA secret provenance mismatch');
  contract.validateQaUri(uri,p,resolution);
  // Only fixed, non-sensitive test material exists in ENV5. This is not a live secret provider.
  record.reads++;record.generations++;
  const env={...parentEnvironment,MEDISYNC_QA_CHILD_CONFIG:'5xd5-v1',NODE_ENV:'test',MEDISYNC_TEST_MODE:'true',MONGO_URI_TEST:uri,
    ENCRYPTION_KEY:FIXED+'_ENCRYPTION',SEED_TEST_PASSWORD:FIXED+'_UNUSED_SEED',JWT_SECRET:FIXED+'_JWT',JWT_REFRESH_SECRET:FIXED+'_REFRESH',INTERNAL_API_KEY:FIXED+'_INTERNAL',
    CLIENT_URL:'http://127.0.0.1:3100',ML_ENGINE_URL:'http://127.0.0.1:5101',EMAIL_SERVICE_LIVE_TEST:'false',ALLOW_SYNTHETIC_DEMO_DIRECTORY:'true',NO_PROXY:'127.0.0.1,localhost'};
  validateChildEnvironment(env);
  Object.freeze(env);environments.set(env,{context,snapshot:JSON.stringify(env)});return env;
}
function assertEnvironment(context,env){contract.contextState(context,{consumed:true});const record=environments.get(env);assert(record&&record.context===context&&record.snapshot===JSON.stringify(env),'Admitted environment replaced or changed');return true;}
function sourceStatus(source){const s=sources.get(source);assert(s);return{inertReads:s.reads,inertGenerations:s.generations,actualSecretReads:0,actualSecretGenerations:0};}
function buildLiveIsolatedQaEnvironment(){return contract.assertLiveExecutionClosed();}
module.exports={createInertSecretSource,validateParentEnvironment,buildIsolatedQaEnvironment,buildLiveIsolatedQaEnvironment,sourceStatus,assertEnvironment};
