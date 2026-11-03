'use strict';
const { DatabaseSync } = require('node:sqlite');
const seed = require('../../scripts/seed-demo-outbreak');
const batch = 'DEMO_OUTBREAK_2026_V1';
const row = { date:'2026-11-03',district:'Colombo',disease:'Dengue',icd_code:'A90',count:7,demoBatchId:batch,isSimulatedDemo:true };
let db;
beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE outbreak_tracking(id INTEGER PRIMARY KEY,date TEXT,district TEXT,disease TEXT,demoBatchId TEXT,count INTEGER,icd_code TEXT)');
});
afterEach(() => db.close());

test('actual SQLite adapter replaces snapshots on replay and preserves other batches', async () => {
  for (let i=0;i<2;i++) expect(await seed.ingestTrackingData([row],{sqliteDb:db})).toMatchObject({success:true,count:1});
  expect(db.prepare('SELECT COUNT(*) AS rows,SUM(count) AS total FROM outbreak_tracking').get()).toMatchObject({rows:1,total:7});
  await seed.ingestTrackingData([{...row,demoBatchId:'OTHER_BATCH',count:3}],{sqliteDb:db});
  await seed.ingestTrackingData([{...row,count:9}],{sqliteDb:db});
  expect(db.prepare('SELECT SUM(count) AS total FROM outbreak_tracking').get().total).toBe(12);
});

test('legacy unclassified keys reject the entire owned transaction without mutation', async () => {
  db.prepare('INSERT INTO outbreak_tracking(date,district,disease,count) VALUES(?,?,?,?)').run(row.date,row.district,row.disease,8);
  const before=db.prepare('SELECT * FROM outbreak_tracking').all();
  expect(await seed.ingestTrackingData([{...row,district:'Galle'},row],{sqliteDb:db})).toMatchObject({success:false});
  expect(db.prepare('SELECT * FROM outbreak_tracking').all()).toEqual(before);
});

test('duplicate existing keys fail closed without summing or deleting rows', async () => {
  const insert=db.prepare('INSERT INTO outbreak_tracking(date,district,disease,demoBatchId,count) VALUES(?,?,?,?,?)');
  insert.run(row.date,row.district,row.disease,batch,7);insert.run(row.date,row.district,row.disease,batch,7);
  expect(await seed.ingestTrackingData([row],{sqliteDb:db})).toMatchObject({success:false});
  expect(db.prepare('SELECT COUNT(*) AS rows,SUM(count) AS total FROM outbreak_tracking').get()).toMatchObject({rows:2,total:14});
});

test('missing batch schema is not silently migrated or written without provenance', async () => {
  const missing=new DatabaseSync(':memory:');
  try {
    missing.exec('CREATE TABLE outbreak_tracking(id INTEGER PRIMARY KEY,date TEXT,district TEXT,disease TEXT,count INTEGER,icd_code TEXT)');
    expect(await seed.ingestTrackingData([row],{sqliteDb:missing})).toMatchObject({success:false});
    expect(missing.prepare('PRAGMA table_info(outbreak_tracking)').all().some(x=>x.name==='demoBatchId')).toBe(false);
    expect(missing.prepare('SELECT COUNT(*) AS total FROM outbreak_tracking').get().total).toBe(0);
  } finally { missing.close(); }
});

test('HTTP companion sends exact batch snapshots with no automatic retry or redirect', async () => {
  const post=jest.fn(async()=>({status:201}));
  const options={env:{ML_ENGINE_URL:'https://ml.example.invalid'},transport:{post},internalToken:'owned-offline-token',warmUp:false};
  for(let i=0;i<2;i++)expect(await seed.ingestTrackingData([row],options)).toMatchObject({success:true});
  expect(post).toHaveBeenCalledTimes(2);
  expect(post.mock.calls[0]).toEqual(post.mock.calls[1]);
  expect(post.mock.calls[0][1]).toEqual({district:row.district,disease:row.disease,icd_code:row.icd_code,date:row.date,count:row.count,demoBatchId:batch,isSimulatedDemo:true});
  expect(post.mock.calls[0][2]).toMatchObject({maxRedirects:0,timeout:10000});
});

test('partial HTTP chunk rejection settles that chunk and never dispatches another chunk', async () => {
  const post=jest.fn(async(_url,body)=>{if(body.district==='Colombo')throw Error('SENSITIVE_FIXTURE');return{status:201};});
  const rows=seed.OFFICIAL_DISTRICTS.slice(0,20).map(district=>({...row,district}));
  const result=await seed.ingestTrackingData(rows,{env:{ML_ENGINE_URL:'https://ml.example.invalid'},transport:{post},internalToken:'owned-offline-token',warmUp:false});
  expect(result).toEqual({success:false,error:'TRACKING_HTTP_INGEST_FAILED_NO_RETRY',mode:'http_error'});
  expect(post).toHaveBeenCalledTimes(15);
});

test.each([{demoBatchId:undefined},{count:-1},{count:true},{isSimulatedDemo:false},{date:'2026-02-30'}])('invalid snapshot rejects before any HTTP request (%j)',async changes=>{
  const post=jest.fn();
  await expect(seed.ingestTrackingData([{...row,...changes}],{forceHttp:true,transport:{post},warmUp:false})).rejects.toThrow();
  expect(post).not.toHaveBeenCalled();
});

test('sync uses persisted dates instead of a new wall-clock seed anchor', async () => {
  const docs=Array.from({length:7},()=>({isSimulatedDemo:true,demoBatchId:batch,district:'Colombo',diagnosis:'Dengue',icdCode:'A90',createdAt:new Date('2026-10-05T14:00Z')}));
  const find=jest.fn(()=>({toArray:async()=>docs}));
  const result=await seed.trackingFromPersistedBatch({find},batch,7);
  expect(result).toEqual([{...row,date:'2026-10-05'}]);
  expect(find.mock.calls[0][1].projection).not.toHaveProperty('patientNic');
  await expect(seed.trackingFromPersistedBatch({find},batch,8)).rejects.toThrow('DEMO_BATCH_COUNT_UNVERIFIED');
});

test('legacy remote removal refuses before Mongo, tracking or cache mutations', async () => {
  const deleteMany=jest.fn();
  await expect(seed.removeDemoBatch(batch,{deleteMany},null,null,{env:{ML_ENGINE_URL:'https://ml.example.invalid'}})).rejects.toThrow('REMOTE_BATCH_REMOVAL_REQUIRES_REVIEWED_COMMAND');
  expect(deleteMany).not.toHaveBeenCalled();
});

test('failed ML synchronization stops the runner without pretending surveillance or cache refresh succeeded', async () => {
  const docs=Array.from({length:7},()=>({isSimulatedDemo:true,demoBatchId:batch,district:'Colombo',diagnosis:'Dengue',icdCode:'A90',createdAt:new Date('2026-10-05T14:00Z')}));
  const collection={countDocuments:jest.fn(async()=>7),find:jest.fn(()=>({toArray:async()=>docs})),insertMany:jest.fn(),deleteMany:jest.fn()};
  const post=jest.fn(async()=>{throw Error('SENSITIVE_FIXTURE')});
  await expect(seed.runSeed(['--sync-ml','--batch',batch],{consultationCollection:collection,env:{DEMO_SEED_ALLOW:'1',ML_ENGINE_URL:'https://ml.example.invalid'},transport:{post},internalToken:'owned-offline-token',warmUp:false,silent:true})).rejects.toThrow('TRACKING_SYNC_FAILED_NO_SURVEILLANCE_OR_CACHE_CLEAR');
  expect(post).toHaveBeenCalledTimes(1);expect(collection.insertMany).not.toHaveBeenCalled();expect(collection.deleteMany).not.toHaveBeenCalled();
});
