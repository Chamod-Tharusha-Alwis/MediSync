'use strict';
const mongoose=require('mongoose');
const AuditLog=require('../src/models/AuditLog');
afterEach(()=>jest.restoreAllMocks());
const entry=()=>({actorId:'synthetic-actor',actorRole:'doctor',action:'SYNTHETIC_READ'});
test.each(['updateOne','updateMany','findOneAndUpdate','replaceOne','findOneAndReplace','deleteOne','deleteMany','findOneAndDelete'])('real query middleware blocks %s before driver dispatch',async method=>{
 const dispatch=jest.spyOn(AuditLog.collection,method).mockImplementation(()=>{throw Error('DRIVER_MUST_NOT_RUN');});
 const query=method.includes('delete')||method.includes('Delete')?AuditLog[method]({actorId:'synthetic-actor'}):AuditLog[method]({actorId:'synthetic-actor'},{$set:{action:'rewrite'}});
 await expect(query.exec()).rejects.toThrow('AUDIT_APPEND_ONLY');expect(dispatch).not.toHaveBeenCalled();
});
test('document delete middleware blocks before collection dispatch',async()=>{const spy=jest.spyOn(AuditLog.collection,'deleteOne').mockResolvedValue({deletedCount:1});await expect(new AuditLog(entry()).deleteOne()).rejects.toThrow('AUDIT_APPEND_ONLY');expect(spy).not.toHaveBeenCalled();});
test('existing document save cannot overwrite an audit',async()=>{const spy=jest.spyOn(AuditLog.collection,'updateOne').mockResolvedValue({modifiedCount:1});const row=AuditLog.hydrate({_id:new mongoose.Types.ObjectId(),...entry()});row.action='rewritten';await expect(row.save()).rejects.toThrow('AUDIT_APPEND_ONLY');expect(spy).not.toHaveBeenCalled();});
test('new document insert remains available with real save middleware',async()=>{const spy=jest.spyOn(AuditLog.collection,'insertOne').mockResolvedValue({acknowledged:true});await expect(new AuditLog(entry()).save()).resolves.toBeDefined();expect(spy).toHaveBeenCalledTimes(1);});
test.each(['updateOne','deleteOne','replaceOne'])('bulk %s rejects the entire mixed batch before driver',async op=>{const spy=jest.spyOn(AuditLog.collection,'bulkWrite').mockResolvedValue({});await expect(AuditLog.bulkWrite([{insertOne:{document:entry()}},{[op]:{filter:{actorId:'synthetic-actor'},update:{$set:{action:'rewrite'}}}}])).rejects.toThrow('AUDIT_APPEND_ONLY');expect(spy).not.toHaveBeenCalled();});
test('insert-only bulk remains available',async()=>{const spy=jest.spyOn(AuditLog.collection,'bulkWrite').mockResolvedValue({acknowledged:true});await expect(AuditLog.bulkWrite([{insertOne:{document:entry()}}])).resolves.toBeDefined();expect(spy).toHaveBeenCalledTimes(1);});
test('read-only query remains available',async()=>{jest.spyOn(AuditLog.collection,'findOne').mockResolvedValue(null);await expect(AuditLog.findOne({actorId:'synthetic-actor'}).lean()).resolves.toBeNull();});
