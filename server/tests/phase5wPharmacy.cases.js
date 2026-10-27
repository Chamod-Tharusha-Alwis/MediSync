// Real restricted Atlas transactions; all mutable fixtures belong to this run.
const path=require('path'),fs=require('fs'),crypto=require('crypto');
require('dotenv').config({path:path.resolve(__dirname,'../.env'),quiet:true});
process.env.NODE_ENV='test';process.env.MEDISYNC_TEST_MODE='true';process.env.EMAIL_SERVICE_LIVE_TEST='false';
jest.mock('uuid',()=>({v4:()=>require('crypto').randomUUID()}));
jest.mock('../src/utils/emailService',()=>({sendDispenseNotificationEmail:jest.fn().mockResolvedValue({success:true})}));
jest.mock('../src/models/AuditLog',()=>({create:jest.fn().mockResolvedValue({})}));
const mongoose=require('mongoose');
mongoose.set('autoIndex',false);mongoose.set('autoCreate',false);
const express=require('express'),request=require('supertest'),jwt=require('jsonwebtoken');
const {connectAutomatedTestDB}=require('../src/config/dbGuard');
global.ENCRYPTION_KEYS={'1':process.env.ENCRYPTION_KEY};global.ACTIVE_KEY_VERSION=1;
const Pharmacy=require('../src/models/Pharmacy'),Staff=require('../src/models/PharmacyStaff');
const Prescription=require('../src/models/Prescription'),Dispensing=require('../src/models/Dispensing');
const Patient=require('../src/models/Patient'),SessionToken=require('../src/models/SessionToken');
const protect=require('../src/middleware/auth');
const handler=require('../src/controllers/dispensingController');
const legacy=require('../src/controllers/prescriptionController');
const owner=`5w-${crypto.randomUUID()}`;
const owned={pharmacies:[],pharmacystaffs:[],prescriptions:[],patients:[],sessiontokens:[],dispensings:[]};
const manifest=path.resolve(__dirname,`../../scratch/phase5w-evidence/${owner}.json`);
function track(coll,id){if(!owned[coll].includes(String(id)))owned[coll].push(String(id));fs.writeFileSync(manifest,JSON.stringify({owner,owned},null,2));}
async function create(Model,coll,data){const _id=new mongoose.Types.ObjectId();track(coll,_id);const d=new Model({_id,...data});await d.save();return d;}
let app,pharmacy,staff,patient,rx,token,baseline;
async function discover(){
  if(!owned.pharmacies.length)return;
  for await(const d of Dispensing.collection.find({pharmacyId:{$in:owned.pharmacies.map(x=>new mongoose.Types.ObjectId(x))}})){
    if(!owned.pharmacystaffs.includes(String(d.staffId)))throw new Error('Fixture ownership mismatch');
    track('dispensings',d._id);track('prescriptions',d.prescriptionId);
  }
}
async function post(body={},url='/dispense',key){
  let r=request(app).post(url).set('Authorization',`Bearer ${token}`);
  if(key)r=r.set('Idempotency-Key',key);
  try{return await r.send({prescriptionId:rx.prescriptionId,patientNic:patient.nic,
    items:[{drugName:'Paracetamol 500mg',quantityDispensed:5,unit:'tablets'}],...body});}finally{await discover();}
}
async function state(){return {stock:(await Pharmacy.findById(pharmacy._id)).inventory[0].stock,
  status:(await Prescription.findById(rx._id)).status,receipts:await Dispensing.countDocuments({pharmacyId:pharmacy._id})};}
beforeAll(async()=>{
  await connectAutomatedTestDB();
  baseline=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../scratch/phase5w-evidence/database-before.json')));
  app=express();app.use(express.json());app.use(protect(['pharmacist','pharmacy_admin','assistant']));
  app.post('/dispense',handler.dispense);app.post('/otc',handler.dispenseOTC);app.post('/legacy/:id',legacy.dispense);
});
beforeEach(async()=>{
  pharmacy=await create(Pharmacy,'pharmacies',{name:owner,district:'Kandy',regNo:crypto.randomUUID(),inventory:[
    {drugName:'Paracetamol 500mg',stock:10,unit:'tablets'},{drugName:'Amoxicillin 500mg',stock:10,unit:'capsules'}]});
  staff=await create(Staff,'pharmacystaffs',{pharmacyId:pharmacy._id,fullName:owner,email:`${crypto.randomUUID()}@qa.medisync.local`,password:'test-hash',role:'pharmacist'});
  patient=await create(Patient,'patients',{nic:`QA${crypto.randomUUID()}`.toUpperCase(),fullName:owner,email:`${crypto.randomUUID()}@qa.medisync.local`,password:'test-hash',district:'Kandy',allergies:[]});
  rx=await create(Prescription,'prescriptions',{patientNic:patient.nic,patientId:patient._id,drugName:'Paracetamol 500mg',dosage:'500mg',status:'pending',expiresAt:new Date(Date.now()+86400000)});
  token=jwt.sign({id:String(staff._id),role:'pharmacist'},process.env.JWT_SECRET,{expiresIn:'1h'});
  await create(SessionToken,'sessiontokens',{userId:staff._id,userModel:'PharmacyStaff',tokenHash:crypto.createHash('sha256').update(token).digest('hex'),isValid:true,expiredAt:new Date(Date.now()+3600000)});
});
afterEach(()=>jest.restoreAllMocks());
afterAll(async()=>{
  try{
    await discover();
    for(const coll of ['dispensings','prescriptions','sessiontokens','patients','pharmacystaffs','pharmacies'])for(const id of owned[coll])await mongoose.connection.db.collection(coll).deleteOne({_id:new mongoose.Types.ObjectId(id)});
    const {canonical}=require('../scripts/phase5wSafety');let checked=0;
    for(const [name,c] of Object.entries(baseline.collections))for await(const doc of mongoose.connection.db.collection(name).find({datasetVersion:'MEDISYNC_UNIV_DEMO_V2'})){
      expect(crypto.createHash('sha256').update(JSON.stringify(canonical(doc))).digest('hex')).toBe(c.documents[String(doc._id)].hash);checked++;
    }
    expect(checked).toBe(74803);
  }finally{await mongoose.disconnect();}
},120000);
test('enough stock commits stock, prescription, receipt and audit together',async()=>{
  const r=await post();expect(r.status).toBe(201);expect(await state()).toEqual({stock:5,status:'dispensed',receipts:1});
  const d=await Dispensing.findOne({prescriptionId:rx._id});expect(d.audit.actorId).toBe(String(staff._id));expect(d.items[0].inventoryItemId).toEqual(pharmacy.inventory[0]._id);
});
test('exact stock decrements to zero',async()=>{expect((await post({items:[{drugName:'Paracetamol 500mg',quantity:10}]})).status).toBe(201);expect((await state()).stock).toBe(0);});
test.each([11,100])('insufficient stock %s returns 400 and rolls back claim',async q=>{
  const r=await post({items:[{drugName:'Paracetamol 500mg',quantity:q}]});expect(r.status).toBe(400);expect(r.body.code).toBe('INSUFFICIENT_STOCK');expect(await state()).toEqual({stock:10,status:'pending',receipts:0});
});
test('zero stock rejects without writes',async()=>{await Pharmacy.updateOne({_id:pharmacy._id},{$set:{'inventory.0.stock':0}});const r=await post();expect(r.body.code).toBe('INSUFFICIENT_STOCK');expect(await state()).toEqual({stock:0,status:'pending',receipts:0});});
test('unknown inventory fails closed',async()=>{await Pharmacy.updateOne({_id:pharmacy._id},{$set:{inventory:[]}});const r=await post();expect(r.status).toBe(400);expect(r.body.code).toBe('INSUFFICIENT_STOCK');});
test.each([-1,0,1.5,'ten',true,null,'',[]])('invalid quantity %j never writes',async q=>{const r=await post({items:[{drugName:'Paracetamol 500mg',quantity:q}]});expect(r.status).toBe(400);expect(r.body.code).toBe('INVALID_QUANTITY');expect((await state()).stock).toBe(10);});
test('inventory identifier and unit must match the medicine',async()=>{
  expect((await post({items:[{drugName:'Paracetamol 500mg',inventoryItemId:String(pharmacy.inventory[1]._id),quantity:1}]})).body.code).toBe('MEDICINE_MISMATCH');
  expect((await post({items:[{drugName:'Paracetamol 500mg',unit:'bottles',quantity:1}]})).body.code).toBe('INVALID_UNIT');
});
test('concurrent prescriptions cannot oversell',async()=>{
  const rx2=await create(Prescription,'prescriptions',{patientNic:patient.nic,drugName:'Paracetamol 500mg',expiresAt:new Date(Date.now()+86400000)});
  const items=[{drugName:'Paracetamol 500mg',quantity:10}];const r=await Promise.all([post({items}),post({items,prescriptionId:rx2.prescriptionId})]);
  expect(r.map(x=>x.status).sort()).toEqual([201,400]);expect((await state()).stock).toBe(0);expect(await Dispensing.countDocuments({pharmacyId:pharmacy._id})).toBe(1);
});
test('concurrent duplicate prescription creates one receipt',async()=>{const r=await Promise.all([post(),post()]);expect(r.map(x=>x.status).sort()).toEqual([201,400]);expect(await state()).toEqual({stock:5,status:'dispensed',receipts:1});});
test('duplicate line quantities are combined',async()=>{const r=await post({items:[{drugName:'Paracetamol 500mg',quantity:6},{drugName:'Paracetamol 500mg',quantity:6}]});expect(r.body.code).toBe('INSUFFICIENT_STOCK');expect((await state()).stock).toBe(10);});
test('OTC uses inventory and supports idempotent replay',async()=>{
  const key=crypto.randomUUID(),body={medications:[{name:'Paracetamol 500mg',qty:3}]};
  expect((await post(body,'/otc',key)).status).toBe(201);expect((await post(body,'/otc',key)).status).toBe(200);
  expect((await state()).stock).toBe(7);expect((await state()).receipts).toBe(1);
  expect((await post({medications:[{name:'Paracetamol 500mg',qty:4}]},'/otc',key)).status).toBe(409);
});
test('OTC requires retry identity',async()=>{expect((await post({medications:[{name:'Paracetamol 500mg',qty:3}]},'/otc')).body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');});
test('failed receipt save aborts all updates',async()=>{
  jest.spyOn(Dispensing.prototype,'save').mockRejectedValueOnce(new Error('injected save failure'));
  expect((await post()).status).toBe(503);expect(await state()).toEqual({stock:10,status:'pending',receipts:0});
});
test('second inventory failure rolls back first decrement and status',async()=>{
  const original=Pharmacy.updateOne.bind(Pharmacy);let calls=0;
  jest.spyOn(Pharmacy,'updateOne').mockImplementation((...args)=>{calls++;return calls===2?Promise.resolve({modifiedCount:0}):original(...args);});
  const r=await post({isAlternativeDispensed:true,alternativeDetails:'QA multi-item failure',items:[{drugName:'Paracetamol 500mg',quantity:2},{drugName:'Amoxicillin 500mg',quantity:2}]});
  expect(r.body.code).toBe('INSUFFICIENT_STOCK');expect(await state()).toEqual({stock:10,status:'pending',receipts:0});
});
test('legacy endpoint uses the same invariant',async()=>{const r=await post({},`/legacy/${rx._id}`);expect(r.status).toBe(201);expect(await state()).toEqual({stock:5,status:'dispensed',receipts:1});});
test('patient, pharmacy and allergy checks remain enforced',async()=>{
  expect((await post({patientNic:'WRONG'})).status).toBe(403);expect((await post({pharmacyId:String(new mongoose.Types.ObjectId())})).status).toBe(403);
  const allergicPatient=await Patient.findById(patient._id);allergicPatient.allergies=['paracetamol'];await allergicPatient.save();
  expect((await post()).body.code).toBe('ALLERGY_CONFLICT');expect((await state()).stock).toBe(10);
});
test('different prescriptions competing for stock cannot oversell',async()=>{
  const other=await create(Prescription,'prescriptions',{patientNic:patient.nic,patientId:patient._id,drugName:'Paracetamol 500mg',dosage:'500mg',status:'pending',expiresAt:new Date(Date.now()+86400000)});
  const items=[{drugName:'Paracetamol 500mg',quantity:8,unit:'tablets'}];
  const results=await Promise.all([post({items}),post({prescriptionId:other.prescriptionId,items})]);
  expect(results.map(r=>r.status).sort()).toEqual([201,400]);
  expect(results.find(r=>r.status===400).body.code).toBe('INSUFFICIENT_STOCK');
  expect((await state()).stock).toBe(2);expect((await state()).receipts).toBe(1);
});
test('cancelled and expired prescriptions cannot dispense',async()=>{
  await Prescription.updateOne({_id:rx._id},{$set:{status:'cancelled'}});expect((await post()).status).toBe(400);
  await Prescription.updateOne({_id:rx._id},{$set:{status:'pending',expiresAt:new Date(0)}});expect((await post()).body.code).toBe('PRESCRIPTION_EXPIRED');
});
test('uncertain commit returns 503; replay reconciles without another decrement',async()=>{
  const original=mongoose.startSession.bind(mongoose);
  const spy=jest.spyOn(mongoose,'startSession').mockImplementation(async()=>{
    const s=await original(),commit=s.commitTransaction.bind(s);let committed=false;
    s.commitTransaction=async()=>{if(!committed){await commit();committed=true;}throw Object.assign(new Error('injected lost acknowledgement'),{errorLabels:['UnknownTransactionCommitResult']});};return s;
  });
  const key=crypto.randomUUID();const r=await post({},'/dispense',key);expect(r.status).toBe(503);expect(r.body.code).toBe('TRANSACTION_OUTCOME_UNKNOWN');spy.mockRestore();
  expect((await post({},'/dispense',key)).status).toBe(200);expect(await state()).toEqual({stock:5,status:'dispensed',receipts:1});
});
