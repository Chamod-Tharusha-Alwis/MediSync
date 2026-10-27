'use strict';
const {canonical,compare,installReadOnlyGuard}=require('../scripts/closureQaReadOnly.cjs');
test('snapshot comparison detects changed, missing and added exact IDs',()=>{
  const before={collections:{rows:{documents:{one:{hash:'original'},two:{hash:'same'}}}}},after={collections:{rows:{documents:{one:{hash:'changed'},three:{hash:'new'}}}}};
  expect(compare(before,after)).toEqual({changed:[{collection:'rows',id:'one'}],missing:[{collection:'rows',id:'two'}],added:[{collection:'rows',id:'three'}]});
  expect(canonical({z:new Date('2026-01-01T00:00:00Z'),a:1})).toEqual({a:1,z:{$date:'2026-01-01T00:00:00.000Z'}});
});
test('actual native driver rejects writes, DDL, raw mutation commands and other database selection before network access',()=>{
  const driver=require('mongoose').mongo;installReadOnlyGuard(driver);
  const client=new driver.MongoClient('mongodb://127.0.0.1:27017/medisync_automated_test');
  const db=client.db('medisync_automated_test'),collection=db.collection('owned');
  for(const action of [()=>collection.insertOne({}),()=>collection.updateMany({},{}),()=>collection.deleteOne({}),()=>collection.bulkWrite([]),()=>collection.createIndex({a:1}),()=>collection.aggregate([{$out:'blocked'}]),()=>db.admin(),()=>client.bulkWrite([]),()=>db.createCollection('x'),()=>db.command({update:'owned',updates:[]}),()=>db.command({find:'owned',$db:'test'}),()=>client.db('test')])expect(action).toThrow(/QA_PREFLIGHT_/);
});
