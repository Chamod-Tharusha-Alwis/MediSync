'use strict';
const { ConnectionString }=require('mongodb-connection-string-url');
const installed=new WeakSet();
function fail(code){throw new Error(code);}
function isValidAtlasSrvHost(host){
  if(typeof host!=='string'||!host)return false;
  const h=host.toLowerCase();
  if(h.includes('*')||h.includes('?')||h.includes(' ')||h.includes(':')||h.includes('/'))return false;
  if(h.includes('localhost')||h.includes('127.0.0.1')||h.includes('0.0.0.0'))return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+\.mongodb\.net$/.test(h);
}
function assertProductionAtlasConfiguration(environment,rawUri=environment?.MONGO_URI){
  if(!environment||environment.NODE_ENV!=='production')fail('PRODUCTION_RUNTIME_MODE_REQUIRED');
  const forbidden=new Set(['MONGO_URI_TEST','MONGODB_URI_TEST','MONGO_URI_STAGING','SEED_TEST_PASSWORD']);
  if(Object.getOwnPropertyNames(environment).some(name=>forbidden.has(name.toUpperCase())||/^MEDISYNC_(?:QA_|TEST_|COMBINED_|DEMO_)/i.test(name)))fail('PRODUCTION_ATLAS_QA_MATERIAL_FORBIDDEN');
  if(!rawUri||typeof rawUri!=='string'||!rawUri.trim())fail('PRODUCTION_ATLAS_URI_INVALID');
  let uri;try{uri=new ConnectionString(rawUri.trim());}catch(_){fail('PRODUCTION_ATLAS_URI_INVALID');}
  const host=uri.hosts?.[0]?.toLowerCase();
  if(!uri.isSRV||!Array.isArray(uri.hosts)||uri.hosts.length!==1||!isValidAtlasSrvHost(host)||uri.pathname!=='/medisync_prod'||!uri.username||!uri.password)fail('PRODUCTION_EXISTING_CLUSTER_AND_DATABASE_REQUIRED');
  const seen=new Set(),allowed=new Set(['tls','ssl','tlsinsecure','tlsallowinvalidcertificates','tlsallowinvalidhostnames','sslvalidate','retrywrites','w','appname','authsource','authmechanism','readpreference']);
  for(const [rawName,rawValue]of uri.searchParams){
    const name=rawName.toLowerCase(),value=rawValue.toLowerCase();
    if(seen.has(name)||!allowed.has(name))fail('PRODUCTION_ATLAS_URI_OPTION_FORBIDDEN');seen.add(name);
    if((['tls','ssl','sslvalidate'].includes(name)&&value!=='true')||(['tlsinsecure','tlsallowinvalidcertificates','tlsallowinvalidhostnames'].includes(name)&&value!=='false'))fail('PRODUCTION_ATLAS_TLS_REQUIRED');
    if((name==='w'&&value!=='majority')||(name==='readpreference'&&value!=='primary')||(name==='retrywrites'&&!['true','false'].includes(value))||(name==='authsource'&&value!=='admin')||(name==='authmechanism'&&rawValue!=='SCRAM-SHA-256'))fail('PRODUCTION_ATLAS_URI_OPTION_FORBIDDEN');
  }
  return Object.freeze({database:'medisync_prod',cluster:host,tlsRequired:true});
}
function disableAutomaticModelDdl(mongoose){
  if(!mongoose||typeof mongoose.set!=='function'||typeof mongoose.plugin!=='function')fail('MONGOOSE_DDL_POLICY_REQUIRED');
  mongoose.set('autoCreate',false);mongoose.set('autoIndex',false);
  const suppress=schema=>{schema.set('autoCreate',false);schema.set('autoIndex',false);};
  if(!installed.has(mongoose)){mongoose.plugin(suppress);installed.add(mongoose);}
  for(const model of Object.values(mongoose.models||{}))if(model.schema)suppress(model.schema);
}
async function verifyProductionIdentity(db){
  if(db?.databaseName!=='medisync_prod'||typeof db.command!=='function')fail('PRODUCTION_DATABASE_IDENTITY_MISMATCH');
  let proof;try{proof=await db.command({connectionStatus:1});}catch(_){fail('PRODUCTION_AUTHENTICATED_ROLE_UNVERIFIED');}
  const users=proof?.authInfo?.authenticatedUsers,roles=proof?.authInfo?.authenticatedUserRoles;
  if(!Array.isArray(users)||users.length!==1||!Array.isArray(roles)||roles.length!==1||roles[0].role!=='readWrite'||roles[0].db!=='medisync_prod')fail('PRODUCTION_AUTHENTICATED_ROLE_DENIED');
  return Object.freeze({dbName:'medisync_prod',authenticatedUserCount:1,authenticatedRoles:[{role:'readWrite',db:'medisync_prod'}]});
}
module.exports={assertProductionAtlasConfiguration,disableAutomaticModelDdl,verifyProductionIdentity};
