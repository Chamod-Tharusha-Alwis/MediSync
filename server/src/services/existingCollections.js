'use strict';
const {ClinicalCommandError}=require('./clinicalErrors');
async function assertExistingCollections(db,names) {
 try {
  if(!db||!['test','medisync_automated_test'].includes(db.databaseName))throw Error();
  for(const name of names){
   const rows=await db.listCollections({name},{nameOnly:false}).toArray();
   if(rows.length!==1||rows[0].name!==name||rows[0].type!=='collection'||rows[0].options?.capped===true||rows[0].options?.expireAfterSeconds!==undefined)throw Error();
   const indexes=await db.collection(name).listIndexes().toArray();
   if(!indexes.some(row=>row.name==='_id_'&&row.key?._id===1)||indexes.some(row=>row.expireAfterSeconds!==undefined))throw Error();
  }
 }catch(_){throw new ClinicalCommandError('STORAGE_REVIEW_REQUIRED',503);}
}
module.exports={assertExistingCollections};
