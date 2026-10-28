'use strict';
const manifest=require('./productionStorageManifest.json');
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
freeze(manifest);
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const keyOf=index=>JSON.stringify(Object.entries(index.key||{}));
const empty=value=>value===undefined||(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===0);
function fail(){throw new Error('PRODUCTION_STORAGE_PREREQUISITES_NOT_VERIFIED');}
function indexesCompatible(actual,required){
  if(!Array.isArray(actual)||actual.length===0||actual.length>256||new Set(actual.map(i=>i.name)).size!==actual.length)return false;
  for(const index of actual){
    if(!index||typeof index.name!=='string'||!index.name||!index.key||Object.values(index.key).some(v=>v!==1&&v!==-1))return false;
    if(['unique','sparse','hidden','prepareUnique'].some(key=>own(index,key)&&typeof index[key]!=='boolean'))return false;
    if(index.hidden===true||index.ready===false||own(index,'buildUUID')||index.prepareUnique===true||!empty(index.partialFilterExpression)||!empty(index.wildcardProjection)||!empty(index.storageEngine))return false;
    if(index.collation!==undefined&&!equal(index.collation,{locale:'simple'}))return false;
    const expected=required.find(row=>keyOf(row)===keyOf(index));
    // Additional ordinary performance indexes are harmless; new constraints,
    // retention or partial/hidden indexes require explicit manifest review.
    if(!expected){if(index.unique===true||index.sparse===true||own(index,'expireAfterSeconds'))return false;continue;}
    if(index.name==='_id_'&&keyOf(index)!=='[["_id",1]]')return false;
    const primary=expected.name==='_id_';
    if(primary&&index.name!=='_id_')return false;
    if((primary?index.unique===false:(index.unique===true)!==expected.unique)||(index.sparse===true)!==expected.sparse)return false;
    if(own(expected,'expireAfterSeconds')?index.expireAfterSeconds!==expected.expireAfterSeconds:own(index,'expireAfterSeconds'))return false;
  }
  return required.every(row=>actual.filter(index=>keyOf(index)===keyOf(row)).length===1);
}
function collectionCompatible(row,spec){
  if(!row||row.name!==spec.name||row.type!=='collection')return false;
  const options=row.options||{};
  if(options.timeseries||options.clusteredIndex||options.encryptedFields||own(options,'expireAfterSeconds'))return false;
  if(options.collation!==undefined&&!equal(options.collation,{locale:'simple'}))return false;
  if(spec.capped){if(options.capped!==true||options.size!==spec.capped.size||options.max!==spec.capped.max)return false;}
  else if(options.capped===true)return false;
  if(spec.validator){if(!equal(options.validator,spec.validator)||(options.validationLevel||'strict')!=='strict'||(options.validationAction||'error')!=='error')return false;}
  else if(!empty(options.validator))return false;
  return true;
}
async function metadata(cursor){
  if(!cursor||typeof cursor.toArray!=='function')fail();
  try{return await cursor.toArray();}
  finally{if(typeof cursor.close==='function')await cursor.close();}
}
async function verifyProductionStorage(db,environment){
  try{
    if(db?.databaseName!==manifest.database||typeof db.listCollections!=='function'||typeof db.collection!=='function'||typeof db.command!=='function'||!environment)fail();
    const hello=await db.command({hello:1},{maxTimeMS:5000});
    if(hello?.isWritablePrimary!==true||!Number.isFinite(hello.logicalSessionTimeoutMinutes)||hello.logicalSessionTimeoutMinutes<=0||!Number.isInteger(hello.maxWireVersion)||hello.maxWireVersion<7||(!hello.setName&&hello.msg!=='isdbgrid'))fail();
    const required=manifest.collections.filter(row=>!row.whenAll||row.whenAll.every(flag=>environment[flag]==='true'));

    const missingCollections=[];
    const incompatibleCollections=[];
    const missingIndexes=[];
    const incompatibleIndexes=[];

    for(const spec of required){
      const rows=await metadata(db.listCollections({name:spec.name},{nameOnly:false,authorizedCollections:false,maxTimeMS:5000,batchSize:100}));
      if(!Array.isArray(rows)||rows.length===0){
        missingCollections.push(spec.name);
        for(const idx of spec.indexes){
          missingIndexes.push({collection:spec.name,...idx});
        }
        continue;
      }
      if(rows.length!==1||!collectionCompatible(rows[0],spec)){
        incompatibleCollections.push({collection:spec.name,reason:'COLLECTION_INCOMPATIBLE'});
        continue;
      }
      const indexes=await metadata(db.collection(spec.name).listIndexes({maxTimeMS:5000,batchSize:100}));
      const presentRequired=[];
      for(const reqIdx of spec.indexes){
        if(indexes.some(idx=>keyOf(idx)===keyOf(reqIdx))){
          presentRequired.push(reqIdx);
        }else{
          missingIndexes.push({collection:spec.name,...reqIdx});
        }
      }
      if(!indexesCompatible(indexes,presentRequired)){
        incompatibleIndexes.push({collection:spec.name,reason:'INDEX_INCOMPATIBLE'});
      }
    }

    if(missingCollections.length>0||missingIndexes.length>0||incompatibleCollections.length>0||incompatibleIndexes.length>0){
      if(incompatibleCollections.length>0||incompatibleIndexes.length>0){
        const details=[...incompatibleCollections.map(c=>`${c.collection}:${c.reason}`),...incompatibleIndexes.map(i=>`${i.collection}:${i.reason}`)].join(', ');
        console.error(`[FATAL][STORAGE-ADMISSION] Storage incompatible: ${details}`);
      }
      const isAutoProvision=environment?.MEDISYNC_AUTO_PROVISION_STORAGE==='true'&&incompatibleCollections.length===0&&incompatibleIndexes.length===0;
      if(missingCollections.length>0||missingIndexes.length>0){
        const logFn=isAutoProvision?console.log:console.error;
        const prefix=isAutoProvision?'[STORAGE-ADMISSION]':'[FATAL][STORAGE-ADMISSION]';
        logFn(`${prefix} Missing storage detected: ${missingCollections.length} collections, ${missingIndexes.length} indexes missing.`);
        if(missingCollections.length>0)logFn(`${prefix} Missing collections: ${missingCollections.join(', ')}`);
        if(missingIndexes.length>0)logFn(`${prefix} Missing indexes: ${missingIndexes.map(i=>`${i.collection}.${i.name||JSON.stringify(i.key)}`).join(', ')}`);
      }

      if(isAutoProvision){
        console.log('[STORAGE-ADMISSION] MEDISYNC_AUTO_PROVISION_STORAGE active: creating missing storage additively...');
        for(const collName of missingCollections){
          if(typeof db.createCollection!=='function')fail();
          const spec=manifest.collections.find(row=>row.name===collName);
          const options={};
          if(spec.capped)Object.assign(options,{capped:true,size:spec.capped.size,max:spec.capped.max});
          if(spec.validator)Object.assign(options,{validator:structuredClone(spec.validator),validationLevel:'strict',validationAction:'error'});
          await db.createCollection(collName,options);
        }
        for(const item of missingIndexes){
          if(item.name==='_id_'||(item.key&&Object.keys(item.key).length===1&&item.key._id))continue;
          const coll=db.collection(item.collection);
          if(typeof coll?.createIndex!=='function')fail();
          const options={name:item.name};
          if(item.unique)options.unique=true;
          if(item.sparse)options.sparse=true;
          if(Object.hasOwn(item,'expireAfterSeconds'))options.expireAfterSeconds=item.expireAfterSeconds;
          await coll.createIndex(item.key,options);
        }
        let postCount=0;
        for(const spec of required){
          const rows=await metadata(db.listCollections({name:spec.name},{nameOnly:false,authorizedCollections:false,maxTimeMS:5000,batchSize:100}));
          if(!Array.isArray(rows)||rows.length!==1||!collectionCompatible(rows[0],spec))fail();
          const indexes=await metadata(db.collection(spec.name).listIndexes({maxTimeMS:5000,batchSize:100}));
          if(!indexesCompatible(indexes,spec.indexes))fail();
          postCount+=spec.indexes.length;
        }
        return Object.freeze({storageProfile:manifest.profile,verifiedCollections:required.length,verifiedRequiredIndexes:postCount,transactionTopologyVerified:true});
      }

      fail();
    }

    let indexCount=0;
    for(const spec of required){
      indexCount+=spec.indexes.length;
    }
    return Object.freeze({storageProfile:manifest.profile,verifiedCollections:required.length,verifiedRequiredIndexes:indexCount,transactionTopologyVerified:true});
  }catch(_){fail();}
}

async function provisionMissingStorage(db,environment=process.env){
  return verifyProductionStorage(db,{...environment,MEDISYNC_AUTO_PROVISION_STORAGE:'true'});
}

module.exports={verifyProductionStorage,manifest,indexesCompatible,collectionCompatible,provisionMissingStorage};

