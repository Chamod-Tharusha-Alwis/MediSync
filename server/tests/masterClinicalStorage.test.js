'use strict';
const { assertClinicalCommandStorage } = require('../src/services/clinicalCommandStorage');
const { createClinicalCommandService } = require('../src/services/clinicalCommandService');
function metadata({ rows=[{name:'clinicalcommands',type:'collection',options:{}}],indexes=[{name:'_id_',key:{_id:1}}],fail=false }={}) {
 return {databaseName:'medisync_automated_test',listCollections:jest.fn(()=>({toArray:async()=>{if(fail)throw Error('private driver detail');return rows;}})),collection:jest.fn(name=>{expect(name).toBe('clinicalcommands');return{listIndexes:()=>({toArray:async()=>indexes})};})};
}
test('existing non-capped journal with primary key is admitted using metadata reads only',async()=>{const db=metadata();await expect(assertClinicalCommandStorage(db)).resolves.toBeUndefined();expect(db.listCollections).toHaveBeenCalledWith({name:'clinicalcommands'},{nameOnly:false});});
test('actual production command factory cannot start a transaction without its existing recovery journal',async()=>{
 const mongoose=require('mongoose'),prior=mongoose.connection.db;mongoose.connection.db=metadata({rows:[]});
 const service=require('../src/services/dispensingService'),transact=jest.spyOn(service,'runTransaction');
 try{const command=require('../src/services/clinicalCommandService').productionCommandService();await expect(command({user:{id:'000000000000000000000001',role:'doctor'},kind:'consultation',idempotencyKey:'owned-operation-0001',request:{},context:{patientId:'000000000000000000000002'},write:jest.fn()})).rejects.toMatchObject({code:'CLINICAL_COMMAND_STORAGE_NOT_READY'});expect(transact).not.toHaveBeenCalled();}
 finally{transact.mockRestore();mongoose.connection.db=prior;}
});
test.each([
 ['missing',{rows:[]}],['view',{rows:[{name:'clinicalcommands',type:'view',options:{}}]}],['capped',{rows:[{name:'clinicalcommands',type:'collection',options:{capped:true}}]}],['missing primary',{indexes:[]}],['TTL',{indexes:[{name:'_id_',key:{_id:1}},{name:'expiry',key:{at:1},expireAfterSeconds:1}]}],['read failure',{fail:true}]
])('%s journal stops before transaction, consent claims or clinical writes',async(_name,options)=>{
 const transact=jest.fn(),guard=jest.fn(),write=jest.fn(),command=createClinicalCommandService({transact,guard,CommandModel:{},preflight:()=>assertClinicalCommandStorage(metadata(options))});
 await expect(command({user:{id:'000000000000000000000001',role:'doctor'},kind:'consultation',idempotencyKey:'owned-operation-0001',request:{},context:{patientId:'000000000000000000000002'},write})).rejects.toMatchObject({code:'CLINICAL_COMMAND_STORAGE_NOT_READY',status:503});
 expect(transact).not.toHaveBeenCalled();expect(guard).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled();
});
