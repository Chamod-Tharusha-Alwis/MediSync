'use strict';
// Pure plan generation ONLY. This module has no connector or DDL executor.
const {createUniversityDemoPolicy}=require('../security/universityDemoPolicy');
const {ACTOR_COLLECTION,INFRA,hash,VERSION}=require('./universityRuntime');
const {REQUIRED_INDEXES}=require('./universityStore');
function buildProvisionPlan(manifest,passwordHashes,manifestBytes) {
  const config=createUniversityDemoPolicy(manifest).config;
  if(typeof manifestBytes!=='string'||JSON.stringify(JSON.parse(manifestBytes))!==JSON.stringify(manifest))throw Error('EXACT_MANIFEST_BYTES_REQUIRED');
  if (!passwordHashes || Object.keys(passwordHashes).sort().join(',')!==Object.keys(ACTOR_COLLECTION).sort().join(',') || Object.values(passwordHashes).some(v=>typeof v!=='string'||!/^\$2[aby]\$1[2-6]\$[./A-Za-z0-9]{53}$/.test(v)) || new Set(Object.values(passwordHashes)).size!==5) throw Error('INDEPENDENT_ROLE_HASHES_REQUIRED');
  const collections=[...new Set([...Object.values(ACTOR_COLLECTION),'pharmacies',...INFRA])];
  if(Object.keys(config.recordIds).sort().join(',')!==collections.filter(c=>!INFRA.includes(c)).sort().join(',') || Object.values(config.recordIds).some(ids=>ids.length!==1))throw Error('INITIAL_SIX_RECORD_SCOPE_REQUIRED');
  const records=config.actors.map(a=>({collection:ACTOR_COLLECTION[a.role],document:{_id:a.id,email:a.email,role:a.role,password:passwordHashes[a.role],name:'Synthetic '+a.role,fullName:'Synthetic '+a.role,isActive:true,isVerified:true,isSynthetic:true,universityDemoNamespace:config.namespace}}));
  records.push({collection:'pharmacies',document:{_id:config.recordIds.pharmacies[0],name:'Synthetic University Pharmacy',isActive:true,isVerified:true,isSynthetic:true,universityDemoNamespace:config.namespace}});
  if(new Set(records.map(r=>r.document._id)).size!==6 || config.actors.some(a=>!config.recordIds[ACTOR_COLLECTION[a.role]].includes(a.id)))throw Error('EXACT_UNIQUE_FIXTURES_REQUIRED');
  return Object.freeze({version:VERSION,status:'PLAN_ONLY_REQUIRES_SEPARATE_APPROVAL',database:config.database,cluster:config.cluster,applicationRole:{role:'readWrite',db:config.database},applicationAuthSource:'admin',credentialScope:'dedicated account; no other roles or database grants',manifestSha256:hash(manifestBytes),collections:collections.map(name=>({name,options:{},mustBeNewOrExactlyCompatible:true})),indexes:Object.entries(REQUIRED_INDEXES).flatMap(([collection,indexes])=>indexes.map(definition=>({collection,...definition}))),records,idempotency:'Exact-ID insert-if-absent after full namespace/schema/hash comparison. Any existing conflicting document, index or collection option aborts; no update, drop, replace, reset or delete operation.',retention:'Sessions expire after 15 minutes with TTL removal. Audits retained until separately authorized exact namespace/ID archival. Clinical data immutable. No visitor password/security changes or resets.',attestations:['independent random password per role; different salted hashes alone do not prove different plaintext','dedicated credentials rotated and never shared with operational or QA identities','separate provisioning account never loaded by runtime'],noExecution:true});
}
module.exports={buildProvisionPlan};
