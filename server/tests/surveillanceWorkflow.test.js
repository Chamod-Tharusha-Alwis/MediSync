require('dotenv').config({path:require('path').resolve(__dirname,'../.env'),quiet:true});
process.env.NODE_ENV='test';process.env.MEDISYNC_TEST_MODE='true';
jest.mock('uuid',()=>({v4:()=>require('crypto').randomUUID()}));
jest.mock('axios',()=>({post:jest.fn()}));
jest.mock('../src/utils/emailService',()=>({sendMassOutbreakAlert:jest.fn(),sendOutbreakAlert:jest.fn()}));
const mongoose=require('mongoose'),fs=require('fs'),path=require('path'),crypto=require('crypto');
mongoose.set('autoIndex',false);mongoose.set('autoCreate',false);
global.ENCRYPTION_KEYS={'1':process.env.ENCRYPTION_KEY};global.ACTIVE_KEY_VERSION=1;
const service=require('../src/services/surveillanceService');
const admin=require('../src/controllers/adminController'),alerts=require('../src/controllers/alertController');
const Alert=require('../src/models/OutbreakAlert');
const owner=`5ws-${crypto.randomUUID()}`,owned={};
const manifest=path.resolve(__dirname,`../../scratch/phase5w-evidence/${owner}.json`);
const track=(coll,id)=>{(owned[coll] ||= []).push(String(id));fs.writeFileSync(manifest,JSON.stringify({owner,owned},null,2));};
let db,reviewer,realReviewer,patient,doctor,consultation,alertId;
const res=()=>({status:jest.fn().mockReturnThis(),json:jest.fn()});
const io={emit:jest.fn(),to:jest.fn()};
async function create(coll,body){const _id=new mongoose.Types.ObjectId();track(coll,_id);await db.collection(coll).insertOne({_id,phase5wOwner:owner,...body});return _id;}
beforeAll(async()=>{
  await require('../src/config/dbGuard').connectAutomatedTestDB();db=mongoose.connection.db;
  reviewer=await create('admins',{email:`${owner}@qa.medisync.local`,isActive:true,isSynthetic:true});
  // Intentionally missing provenance to model an ordinary account; ownership is
  // still recorded by exact ID in the manifest before insertion.
  realReviewer=await create('admins',{email:`real-${owner}@qa.medisync.local`,isActive:true,phase5wOwner:null});
  patient=await create('patients',{nic:owner,email:`p-${owner}@qa.medisync.local`,isSynthetic:true});
  doctor=await create('doctors',{doctorId:owner,email:`d-${owner}@qa.medisync.local`,isSynthetic:true});
  consultation=await create('consultations',{patientId:patient,doctorId:doctor,createdAt:new Date(),isSynthetic:true,icdVersion:'ICD-10',icdCode:'A90',district:'Colombo',
    surveillanceVerification:{status:'verified',source:'synthetic_qa',verifiedBy:reviewer,verifiedAt:new Date(),diagnosisStatus:'confirmed',caseDefinitionReference:'QA-only-nonclinical',episodeId:owner}});
  require('axios').post.mockResolvedValue({data:{results:[{district:'Colombo',disease:'ICD10:A90',anomaly:true,severity:'low'}]}});
});
afterAll(async()=>{
  try{
    if(db){for await(const d of db.collection('outbreakalerts').find({sourceConsultationIds:consultation}))track('outbreakalerts',d._id);
    for(const [coll,ids] of Object.entries(owned).reverse())for(const id of ids)await db.collection(coll).deleteOne({_id:new mongoose.Types.ObjectId(id)});}
  }finally{await mongoose.disconnect();}
});
test('legacy baseline is excluded from real analysis without contacting ML',async()=>{require('axios').post.mockClear();const result=await service.runAnalysis({mode:'real'});expect(result.consultations_analysed).toBe(0);expect(require('axios').post).not.toHaveBeenCalled();});
test('genuine reviewer cannot request simulation',async()=>{const response=res();await admin.triggerMLDetection({user:{id:String(realReviewer),role:'admin'},body:{mode:'simulation'}},response);expect(response.status).toHaveBeenCalledWith(403);});
test('synthetic review creates pending signal and repeats do not duplicate',async()=>{
  const req={user:{id:String(reviewer),role:'admin'},body:{mode:'simulation'},app:{get:()=>io}};
  const response=res();await admin.triggerMLDetection(req,response);const result=response.json.mock.calls[0][0];
  expect(result.consultations_analysed).toBe(1);alertId=result.results[0].alertId;track('outbreakalerts',alertId);
  expect((await Alert.findById(alertId)).status).toBe('Pending');await admin.triggerMLDetection(req,res());
  expect(await Alert.countDocuments({sourceConsultationIds:consultation})).toBe(1);expect(io.emit).not.toHaveBeenCalled();
});
test('simulation approval records review without socket/email/broadcast/notification',async()=>{
  const response=res();await admin.approveAlert({params:{id:alertId},body:{emailScope:'none'},user:{id:String(reviewer),role:'admin'},app:{get:()=>io}},response);
  expect(response.json.mock.calls[0][0].data.status).toBe('Active');expect(io.emit).not.toHaveBeenCalled();
  expect(require('../src/utils/emailService').sendMassOutbreakAlert).not.toHaveBeenCalled();
});
test('patients and genuine reviewers cannot retrieve simulation alerts',async()=>{
  const patientResponse=res();await alerts.getActiveAlerts({user:{id:String(patient),role:'patient'},query:{}},patientResponse);expect(patientResponse.json).toHaveBeenCalledWith({data:[]});
  const response=res();await alerts.getActiveAlerts({user:{id:String(realReviewer),role:'admin'},query:{mode:'simulation'}},response);expect(response.status).toHaveBeenCalledWith(403);
});
