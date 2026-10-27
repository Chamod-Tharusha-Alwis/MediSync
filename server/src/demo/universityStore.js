'use strict';
const { ACTOR_COLLECTION, INFRA } = require('./universityRuntime');
const { CLUSTER } = require('../security/universityDemoPolicy');
const REQUIRED_INDEXES = Object.freeze({
  universitysessions:[{key:{tokenHash:1},unique:true},{key:{expiresAt:1},expireAfterSeconds:0}],
  universityaudits:[{key:{universityDemoNamespace:1,actorId:1,createdAt:1}}]
});
function compatible(actual, expected) {
  return JSON.stringify(actual.key)===JSON.stringify(expected.key) && Boolean(actual.unique)===Boolean(expected.unique) && actual.expireAfterSeconds===expected.expireAfterSeconds && !actual.partialFilterExpression && !actual.sparse && !actual.hidden && !actual.collation;
}
async function connectUniversityStore(admission, MongoClient = require('mongodb').MongoClient) {
  const {ObjectId}=require('mongodb'), config=admission.policy.config;
  const client=new MongoClient(admission.uri,{tls:true,retryWrites:false,serverSelectionTimeoutMS:5000,connectTimeoutMS:5000,socketTimeoutMS:5000,maxPoolSize:5,minPoolSize:0});
  let qualified=false;
  client.on?.('topologyClosed',()=>{qualified=false;});
  const marker={isSynthetic:true,universityDemoNamespace:config.namespace};
  const normalize=row=>row?{...row,_id:String(row._id),...(row.userId?{userId:String(row.userId)}:{})}:null;
  try {
    await client.connect();
    const db=client.db(config.database);
    const status=await db.command({connectionStatus:1,showPrivileges:false});
    const info=status.authInfo;
    if (info?.authenticatedUsers?.length!==1 || info.authenticatedUsers[0].user!==config.username || info.authenticatedUsers[0].db!=='admin') throw Error('DEMO_AUTHENTICATED_USER_DENIED');
    admission.policy.assertDatabaseIdentity({database:db.databaseName,username:info.authenticatedUsers[0].user,cluster:CLUSTER,tls:true,roles:info.authenticatedUserRoles});
    const topology=await db.command({hello:1});
    if (topology.setName!=='atlas-qgzylw-shard-0' || !topology.isWritablePrimary || !Number.isInteger(topology.logicalSessionTimeoutMinutes) || !Array.isArray(topology.hosts) || topology.hosts.length!==3 || topology.hosts.some(h=>typeof h!=='string'||!/^[a-z0-9-]+\.p7hjket\.mongodb\.net:27017$/.test(h))) throw Error('DEMO_TRANSACTION_TOPOLOGY_REQUIRED');
    const collections=[...new Set([...Object.values(ACTOR_COLLECTION),'pharmacies',...Object.keys(config.recordIds),...INFRA])];
    const metadata=await db.listCollections({},{nameOnly:false}).toArray();
    // This is a newly approved dedicated DB, never operational or QA. Unknown
    // collections block admission; nothing is dropped or repaired on startup.
    if (metadata.some(c=>!collections.includes(c.name))) throw Error('DEMO_UNEXPECTED_COLLECTION');
    for(const name of collections) {
      const meta=metadata.find(c=>c.name===name);
      if (!meta || meta.type!=='collection' || meta.options?.capped || meta.options?.timeseries || meta.options?.validator) throw Error('DEMO_STORAGE_PREREQUISITE_MISSING');
      const indexes=await db.collection(name).listIndexes().toArray();
      if (!indexes.some(i=>JSON.stringify(i.key)==='{"_id":1}' && !i.partialFilterExpression)) throw Error('DEMO_ID_INDEX_REQUIRED');
      for(const expected of REQUIRED_INDEXES[name]||[]) if(!indexes.some(i=>compatible(i,expected))) throw Error('DEMO_INDEX_INCOMPATIBLE');
      if(await db.collection(name).countDocuments({$or:[{isSynthetic:{$ne:true}},{universityDemoNamespace:{$ne:config.namespace}}]},{limit:1,maxTimeMS:3000})) throw Error('DEMO_UNOWNED_STORAGE');
      if(!INFRA.includes(name)) {
        const ids=config.recordIds[name]||[];
        if(await db.collection(name).countDocuments({...marker,_id:{$nin:ids.map(id=>new ObjectId(id))}},{limit:1,maxTimeMS:3000})) throw Error('DEMO_UNMANIFESTED_RECORD');
        if(await db.collection(name).countDocuments({...marker,_id:{$in:ids.map(id=>new ObjectId(id))}},{maxTimeMS:3000})!==ids.length) throw Error('DEMO_FIXTURE_MISSING');
      }
    }
    const owned=name=>db.collection(name);
    const ensure=()=>{if(!qualified)throw Error('DEMO_STORE_CLOSED');};
    const event=(data)=>({...data,...marker,createdAt:new Date()});
    async function transaction(work) { ensure(); const session=client.startSession();try{return await session.withTransaction(()=>work(session),{readConcern:{level:'snapshot'},writeConcern:{w:'majority'},maxCommitTimeMS:5000});}finally{await session.endSession();} }
    const store={
      get qualified(){return qualified;},
      async actor(lookup){ensure();const actor=config.actors.find(a=>a.id===lookup.filter._id && a.email===lookup.filter.email);if(!actor)throw Error('DEMO_ACTOR_DENIED');const row=normalize(await owned(ACTOR_COLLECTION[actor.role]).findOne({...marker,email:actor.email,role:actor.role,_id:new ObjectId(actor.id)},{maxTimeMS:3000}));return row;},
      async publicRows(collection){ensure();if(!['doctors','hospitals','pharmacies'].includes(collection))throw Error('DEMO_PUBLIC_COLLECTION_DENIED');const ids=config.recordIds[collection]||[];const rows=(await owned(collection).find({...marker,_id:{$in:ids.map(id=>new ObjectId(id))},isActive:true,isVerified:true},{maxTimeMS:3000}).limit(1000).toArray()).map(normalize);const seen=new Set();for(const row of rows){if(!ids.includes(row._id)||seen.has(row._id)||row.isSynthetic!==true||row.universityDemoNamespace!==config.namespace||row.isActive!==true||row.isVerified!==true)throw Error('DEMO_PUBLIC_RESULT_OWNERSHIP_DENIED');seen.add(row._id);}return rows;},
      async session(tokenHash){ensure();return normalize(await owned('universitysessions').findOne({...marker,tokenHash},{maxTimeMS:3000}));},
      async audit(data){ensure();await owned('universityaudits').insertOne(event(data),{writeConcern:{w:'majority'}});},
      createSessionAndAudit(data,audit){return transaction(async session=>{await owned('universitysessions').insertOne({...event(data),userId:new ObjectId(data.userId)},{session});await owned('universityaudits').insertOne(event(audit),{session});});},
      revokeAndAudit(tokenHash,audit){return transaction(async session=>{const result=await owned('universitysessions').updateOne({...marker,tokenHash,userId:new ObjectId(audit.actorId),isValid:true},{$set:{isValid:false}},{session});if(result.matchedCount!==1)throw Error('DEMO_SESSION_REVOKE_FAILED');await owned('universityaudits').insertOne(event(audit),{session});});},
      async close(){qualified=false;await client.close();}
    };
    qualified=true;
    for(const actor of config.actors){const lookup=admission.policy.loginLookup(actor.role,actor.email);const row=await store.actor(lookup);admission.policy.admitPersistedActor({id:actor.id,role:actor.role,model:lookup.model},row);if(!/^\$2[aby]\$1[2-6]\$/.test(row.password||''))throw Error('DEMO_STRONG_HASH_REQUIRED');}
    return Object.freeze(store);
  } catch(error) {qualified=false;await client.close();throw Error('DEMO_STORAGE_ADMISSION_FAILED');}
}
module.exports={REQUIRED_INDEXES,compatible,connectUniversityStore};
