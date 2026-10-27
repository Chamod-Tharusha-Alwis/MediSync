'use strict';
// ENV5: pure validation and explicitly inert capabilities. No live authority issuer.
const assert = require('assert');
const crypto = require('crypto');
const attempt = require('./e1AttemptIdentity');
const PROFILE = 'isolated-e1-qa-parent-v1';
const LAUNCHER = 'server/scripts/phase5xE1IsolatedQaRun.js';
const KEY_POLICY = 'ephemeral-qa-bootstrap-no-clinical-decryption-v1';
const DB = 'medisync_automated_test';
const ROLES = Object.freeze(['observer-pre', 'backend', 'observer-post']);
const FIELDS = Object.freeze(['schema','launcher','hostId','hostEpoch','hostProofFile','hostProofSha256','policyFile','policySha256','qaCredentialSourceRef','qaCredentialVersion','keyPolicy','ledgerEpoch','noProductionMaterialRequired']);
const DRIVER_FILES = Object.freeze(['server/node_modules/mongodb/lib/mongo_client.js','server/node_modules/mongodb/lib/connection_string.js','server/node_modules/mongoose/lib/connection.js','server/node_modules/mongoose/lib/mongoose.js','server/node_modules/mongoose/lib/drivers/node-mongodb-native/connection.js','server/node_modules/mongodb/package.json','server/node_modules/mongoose/package.json']);
const SOURCES = Object.freeze(['server/tests/helpers/qaIsolatedParentContract.js','server/tests/helpers/qaIsolatedParentEnvironment.js','server/tests/helpers/qaIsolatedConnectionPolicy.js',LAUNCHER,'server/scripts/phase5xE1IsolatedQaChild.js','server/scripts/phase5xE1QaOnlyContractChecks.js']);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const hashJson = value => sha(JSON.stringify(value));
const clone = value => JSON.parse(JSON.stringify(value));
const authorities = new WeakMap(), contexts = new WeakMap();
function assertData(value,depth=0){
  assert(depth<50,'Bounded QA data required');
  if(value===null||['string','number','boolean'].includes(typeof value))return;
  assert(value&&typeof value==='object','Only inert data permitted');
  for(const key of Object.keys(value)){const descriptor=Object.getOwnPropertyDescriptor(value,key);assert(descriptor&&Object.hasOwn(descriptor,'value'),'QA data accessors prohibited');assertData(descriptor.value,depth+1);}
}
function closed(value, keys) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'QA object required');
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), 'Closed QA schema required');
  for (const key of keys) assert(Object.getOwnPropertyDescriptor(value,key)?.get === undefined, 'QA accessors prohibited');
}
function parseUniqueJson(text) {
  assert(typeof text === 'string' && text.length < 1024 * 1024, 'Bounded JSON required');
  const value = JSON.parse(text); let offset = 0;
  const space = () => { while (/\s/.test(text[offset] || '') && offset < text.length) offset++; };
  const string = () => { const start=offset++; while(offset<text.length){const c=text[offset++];if(c==='\\')offset++;else if(c==='"')return JSON.parse(text.slice(start,offset));}throw Error('Incomplete JSON'); };
  function visit() {
    space(); const c=text[offset];
    if(c==='{'){offset++;space();const seen=new Set();while(text[offset]!=='}'){const key=string();assert(!seen.has(key)&&!['__proto__','prototype','constructor'].includes(key),'Duplicate/unsafe JSON field');seen.add(key);space();assert(text[offset++]===':');visit();space();if(text[offset]!==',')break;offset++;space();}assert(text[offset++]==='}');}
    else if(c==='['){offset++;space();while(text[offset]!==']'){visit();space();if(text[offset]!==',')break;offset++;space();}assert(text[offset++]===']');}
    else if(c==='"')string();else{while(offset<text.length&&!/[\s,\]}]/.test(text[offset]))offset++;}
    space();
  }
  visit(); assert.equal(offset,text.length,'Trailing JSON'); return value;
}
function validateIsolatedShape(approval) {
  attempt.assertAttempt(approval?.phase,approval?.attemptId);
  assert(Object.hasOwn(approval,'isolatedQa'),'Own isolated profile required for original JSON digest');
  const i=approval.isolatedQa;closed(i,FIELDS);
  assert(i.schema===PROFILE&&i.launcher===LAUNCHER&&i.keyPolicy===KEY_POLICY&&i.noProductionMaterialRequired===true,'Exact isolated profile required');
  for(const key of ['hostId','hostEpoch','qaCredentialSourceRef','qaCredentialVersion','ledgerEpoch'])assert(typeof i[key]==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,100}$/.test(i[key]),'Invalid QA reference');
  for(const key of ['hostProofFile','policyFile'])assert(typeof i[key]==='string'&&/^[a-z0-9-]+\.json$/.test(i[key]),'Invalid QA evidence path');
  for(const key of ['hostProofSha256','policySha256'])assert(typeof i[key]==='string'&&/^[a-f0-9]{64}$/.test(i[key]),'QA hash required');
  return hashJson(i);
}
function assertLiveExecutionClosed() {
  // Fixed source gate. No argument, environment variable, approval or callback opens it.
  throw Object.assign(Error('ENV5 isolated QA live execution is closed pending separate source review'),{code:'ENV5_LIVE_CLOSED'});
}
const POLICY_FIELDS = ['schema','approvedSrvHost','approvedSrvTargets','database','authSource','expectedQaPrincipalSha256','qaCredentialSourceRef','qaCredentialVersion','credentialIssuer','hostId','hostEpoch','ledgerEpoch','keyPolicy','driverOptions','driverSourceHashes','allowedParentOsValues','uriOptions'];
function validatePolicy(p) {
  assertData(p);
  closed(p,POLICY_FIELDS);
  assert(p.schema==='isolated-e1-qa-policy-v1'&&p.database===DB&&p.authSource==='admin'&&p.keyPolicy===KEY_POLICY,'Exact QA policy required');
  assert(typeof p.approvedSrvHost==='string'&&/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.mongodb\.net$/.test(p.approvedSrvHost),'Reviewed Atlas SRV host required');
  assert(Array.isArray(p.approvedSrvTargets)&&p.approvedSrvTargets.length>0,'Resolved targets required');
  const seen=new Set();for(const target of p.approvedSrvTargets){closed(target,['name','port']);assert(typeof target.name==='string'&&/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.mongodb\.net$/.test(target.name)&&Number.isInteger(target.port)&&target.port>0&&target.port<=65535,'Invalid SRV target');const key=JSON.stringify(target);assert(!seen.has(key),'Duplicate SRV target');seen.add(key);}
  assert(/^[a-f0-9]{64}$/.test(p.expectedQaPrincipalSha256||''),'Full approved principal fingerprint required');
  closed(p.uriOptions,['authSource','tls']);assert.deepEqual(p.uriOptions,{authSource:'admin',tls:'true'});
  closed(p.driverOptions,['dbName','tls','retryWrites','retryReads','maxPoolSize','minPoolSize','serverSelectionTimeoutMS','connectTimeoutMS','waitQueueTimeoutMS']);
  const o=p.driverOptions;assert(o.dbName===DB&&o.tls===true&&o.retryWrites===false&&o.retryReads===false&&o.minPoolSize===0&&Number.isInteger(o.maxPoolSize)&&o.maxPoolSize>0&&o.maxPoolSize<=5,'Fixed QA driver options required');
  for(const key of ['serverSelectionTimeoutMS','connectTimeoutMS','waitQueueTimeoutMS'])assert(Number.isInteger(o[key])&&o[key]>0&&o[key]<=30000,'Reviewed bounded driver timeout required');
  closed(p.driverSourceHashes,DRIVER_FILES);for(const h of Object.values(p.driverSourceHashes))assert(/^[a-f0-9]{64}$/.test(h),'Driver source hash required');
  assert(p.allowedParentOsValues&&Object.keys(p.allowedParentOsValues).length>0,'Reviewed OS values required');
  const allowed=new Set(require('./qaEnvironmentContract').OS_KEYS);for(const key of Object.keys(p.allowedParentOsValues))assert(allowed.has(key)&&typeof p.allowedParentOsValues[key]==='string','Only reviewed OS metadata permitted');
  return true;
}
function validateQaUri(uri,policy,resolution) {
  validatePolicy(policy);
  assert(typeof uri==='string'&&uri.length<8192&&!/[\s#]/.test(uri),'Explicit unambiguous QA URI required');
  // Deliberately narrow lexical language; encoded keys/host/path are not normalized into acceptance.
  const match=/^mongodb\+srv:\/\/([^:@/?]+):([^@/?]+)@([a-z0-9.-]+)\/medisync_automated_test\?(.+)$/.exec(uri);
  assert(match&&match[3]===policy.approvedSrvHost,'Exact QA scheme/host/path required');
  const options={};for(const pair of match[4].split('&')){const parts=pair.split('=');assert(parts.length===2&&['authSource','tls'].includes(parts[0])&&!Object.hasOwn(options,parts[0]),'Unapproved/duplicate URI option');options[parts[0]]=parts[1];}
  assert.deepEqual(options,policy.uriOptions,'Explicit secure URI options required');
  let principal;try{principal=decodeURIComponent(match[1]);decodeURIComponent(match[2]);}catch(_){throw Error('Invalid QA credential encoding');}
  assert(principal&&sha(principal)===policy.expectedQaPrincipalSha256,'Approved QA principal required');
  closed(resolution,['srv','txt','sourceHashes']);
  assert.deepEqual(resolution.srv,policy.approvedSrvTargets,'Reviewed SRV resolution required');
  // No TXT options are silently merged. A nonempty TXT result needs a new reviewed policy version.
  assert(Array.isArray(resolution.txt)&&resolution.txt.length===0,'Unreviewed TXT options prohibited');
  assert.deepEqual(resolution.sourceHashes,policy.driverSourceHashes,'Resolved driver source drift');
  return {database:DB,principalSha256:policy.expectedQaPrincipalSha256,driverOptions:clone(policy.driverOptions)};
}
function createInertAuthority(records) {
  // Data-only fake issuer. Cannot authenticate a real host or enable a driver/secret callback.
  assertData(records);closed(records,['policy','hostProof','sourceHashes','issuer','hostId','hostEpoch','ledgerEpoch','now']);
  assert(records.issuer==='env5-inert-issuer'&&records.hostId==='env5-inert-host'&&records.hostEpoch==='env5-inert-epoch'&&records.ledgerEpoch==='env5-inert-ledger','Only explicit ENV5 inert authority supported');
  const authority=Object.freeze({simulationOnly:true});authorities.set(authority,clone(records));return authority;
}
function admitInert(approval,authority) {
  const trusted=authorities.get(authority);assert(trusted,'No authenticated QA authority (live issuer is closed)');
  assert(approval&&(Object.getPrototypeOf(approval)===Object.prototype||Object.getPrototypeOf(approval)===null),'Own JSON approval data required');assertData(approval);
  require('./e1TrustedParent').validateAdmission(approval);
  const i=approval.isolatedQa;validateIsolatedShape(approval);validatePolicy(trusted.policy);
  const p=trusted.policy,h=trusted.hostProof;
  closed(h,['issuer','hostId','hostEpoch','ledgerEpoch','policySha256','sourceMapSha256','approvalId','owner','issuedAt','expiresAt']);
  assert(hashJson(p)===i.policySha256&&hashJson(h)===i.hostProofSha256,'Reviewed policy/host hash required');
  assert.deepEqual(approval.sourceHashes,trusted.sourceHashes,'Reviewed source map required');
  for(const [key,expected]of Object.entries({hostId:trusted.hostId,hostEpoch:trusted.hostEpoch,ledgerEpoch:trusted.ledgerEpoch}))assert(i[key]===expected&&p[key]===expected&&h[key]===expected,'Host/epoch/ledger mismatch');
  assert(h.issuer===trusted.issuer&&p.credentialIssuer===trusted.issuer&&h.policySha256===i.policySha256&&h.sourceMapSha256===hashJson(trusted.sourceHashes)&&h.approvalId===approval.id&&h.owner===approval.owner,'Authenticated inert issuer binding required');
  assert(Number.isFinite(trusted.now)&&trusted.now>=Date.parse(h.issuedAt)&&trusted.now<Date.parse(h.expiresAt)&&Date.parse(h.expiresAt)-Date.parse(h.issuedAt)<=900000,'Fresh host proof required');
  assert(p.qaCredentialSourceRef===i.qaCredentialSourceRef&&p.qaCredentialVersion===i.qaCredentialVersion,'QA source/version mismatch');
  const context=Object.freeze({simulationOnly:true,executionAuthorized:false});
  contexts.set(context,{approval,approvalSha256:attempt.approvalDigest(approval),contractSha256:hashJson(i),policy:p,consumed:false,preflight:false,owner:approval.owner});return context;
}
function contextState(context,{consumed=false}={}) {
  const state=contexts.get(context);assert(state,'Explicit inert QA capability required');
  assert.equal(attempt.approvalDigest(state.approval),state.approvalSha256,'Original approval mutated');
  if(consumed)assert(state.consumed,'Secret/connection access before in-memory consumption');
  return {...state,policy:clone(state.policy)};
}
function consumeInert(context){const s=contextState(context);assert(!s.consumed,'Consumed approval cannot be reused');contexts.get(context).consumed=true;return Object.freeze({simulationOnly:true,approvalSha256:s.approvalSha256,contractSha256:s.contractSha256});}
function markInertPreflight(context,proof,preservation){
  const policy=require('./qaIsolatedConnectionPolicy');policy.assertConnectionProof(context,proof,'observer-pre');policy.assertReleasedProof(proof);
  require('./e1TrustedParent').verifyReadOnly(preservation);contexts.get(context).preflight=true;
}
module.exports={PROFILE,LAUNCHER,KEY_POLICY,DB,ROLES,FIELDS,DRIVER_FILES,SOURCES,sha,hashJson,parseUniqueJson,validateIsolatedShape,validatePolicy,validateQaUri,assertLiveExecutionClosed,createInertAuthority,admitInert,contextState,consumeInert,markInertPreflight};
