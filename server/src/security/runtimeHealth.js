'use strict';
function createRuntimeHealth({requireRedis=true,requireAdmission=false,admissionReady=()=>false,stopping=()=>false,mongoReady=()=>require('mongoose').connection.readyState===1,redisReady=()=>require('../config/redis').isUsingPersistentRedis()}={}){
  return (_req,res)=>{
    let ready=false;
    try { ready=!stopping()&&mongoReady()&&(!requireRedis||redisReady())&&(!requireAdmission||admissionReady()); } catch (_) { /* Health dependency failures are unavailable, never a 500/ready. */ }
    return res.status(ready?200:503).json({status:ready?'ready':'unavailable',service:'medisync-express'});
  };
}
function hasProductionAdmission(info){
  const required=require('./productionStorageManifest.json').collections.filter(row=>!row.whenAll);
  return info?.dbName==='medisync_prod'&&info.authenticatedUserCount===1&&info.authenticatedRoles?.length===1&&info.authenticatedRoles[0].role==='readWrite'&&info.authenticatedRoles[0].db==='medisync_prod'&&info.storageProfile==='current-model-contract-no-migration'&&info.transactionTopologyVerified===true&&info.verifiedCollections>=required.length&&info.verifiedRequiredIndexes>=required.reduce((n,row)=>n+row.indexes.length,0);
}
module.exports={createRuntimeHealth,hasProductionAdmission};
