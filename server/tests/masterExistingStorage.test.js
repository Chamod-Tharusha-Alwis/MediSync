'use strict';
const {assertExistingCollections}=require('../src/services/existingCollections');
test.each(['valid','missing','wrong-name','view','capped','collection-ttl','index-ttl','missing-primary'])('existing storage metadata is admitted only for the durable expected collection: %s',async mode=>{
 const row={name:mode==='wrong-name'?'other':'reviews',type:mode==='view'?'view':'collection',options:mode==='capped'?{capped:true}:mode==='collection-ttl'?{expireAfterSeconds:1}:{}};
 const indexes=mode==='missing-primary'?[]:[{name:'_id_',key:{_id:1}},...(mode==='index-ttl'?[{name:'expiry',key:{at:1},expireAfterSeconds:1}]:[])];
 const db={databaseName:'medisync_automated_test',listCollections:()=>({toArray:async()=>mode==='missing'?[]:[row]}),collection:name=>{expect(name).toBe('reviews');return{listIndexes:()=>({toArray:async()=>indexes})};}};
 if(mode==='valid')await expect(assertExistingCollections(db,['reviews'])).resolves.toBeUndefined();else await expect(assertExistingCollections(db,['reviews'])).rejects.toMatchObject({code:'STORAGE_REVIEW_REQUIRED',status:503});
});
