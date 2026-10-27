jest.mock('uuid',()=>({v4:()=>require('crypto').randomUUID()}));
jest.mock('axios',()=>({post:jest.fn()}));
jest.mock('../src/models/Consultation',()=>({collection:{find:jest.fn()}}));
jest.mock('../src/models/OutbreakAlert',()=>({updateOne:jest.fn().mockResolvedValue({}),findById:jest.fn(),findOneAndUpdate:jest.fn()}));
jest.mock('../src/models/Admin',()=>({collection:{findOne:jest.fn()}}));
const service=require('../src/services/surveillanceService');
const now=new Date('2026-10-14T12:00:00Z');
const fixture=(changes={})=>({_id:'507f1f77bcf86cd799439011',patientId:'p1',createdAt:new Date(+now-86400000),district:'Colombo',icdVersion:'ICD-10',icdCode:'A90',
  surveillanceVerification:{status:'verified',source:'clinical_review',verifiedBy:'reviewer',verifiedAt:now,caseDefinitionReference:'approved-protocol-example',episodeId:'episode-1',diagnosisStatus:'confirmed'},...changes});
test('legacy missing provenance fails closed',()=>expect(service.selectCases([fixture({surveillanceVerification:undefined})],{now}).cases).toHaveLength(0));
test.each(['isDemoData','isSynthetic','isUniversityDemo','isSyntheticUniversityData','datasetVersion','isSimulation','isTestFixture','testRunId','phase5wOwner'])('%s cannot enter real surveillance',field=>expect(service.selectCases([fixture({[field]:true})],{now}).cases).toHaveLength(0));
test.each(['suspected','suggested','predicted',undefined])('diagnosis %s is not a confirmed case',diagnosisStatus=>{const c=fixture();c.surveillanceVerification.diagnosisStatus=diagnosisStatus;expect(service.selectCases([c],{now}).cases).toHaveLength(0);});
test.each([{district:'Unknown'},{patientId:null},{icdCode:''},{createdAt:'invalid'},{createdAt:new Date(+now+1)}])('invalid case rejected: %j',change=>expect(service.selectCases([fixture(change)],{now}).cases).toHaveLength(0));
test('ICD formatting normalizes; labels do not determine identity',()=>{expect(service.diseaseId({icdVersion:'ICD-10',icdCode:'a90.0'})).toBe('ICD10:A900');expect(service.diseaseId({icdVersion:'ICD10',icdCode:'A900'})).toBe('ICD10:A900');});
test('repeat visits count once, verified separate episodes remain separate',()=>{const a=fixture(),b=fixture({_id:'other'}),c=fixture({_id:'third'});c.surveillanceVerification.episodeId='episode-2';expect(service.selectCases([a,b,c],{now}).cases).toHaveLength(2);});
test('simulation accepts only explicitly synthetic verified cases',()=>{const c=fixture({isSynthetic:true});c.surveillanceVerification.source='synthetic_qa';expect(service.selectCases([fixture(),c],{now,mode:'simulation'}).cases).toHaveLength(1);});
test('ML sees only aggregate data and signals remain pending with traceability',async()=>{
  const c=fixture({isSynthetic:true});c.surveillanceVerification.source='synthetic_qa';
  require('../src/models/Consultation').collection.find.mockReturnValue({toArray:async()=>[c]});
  require('axios').post.mockResolvedValue({data:{results:[{district:'Colombo',disease:'ICD10:A90',anomaly:true,severity:'high'}]}});
  process.env.INTERNAL_API_KEY='local-test-key';
  const io={emit:jest.fn()};const result=await service.runAnalysis({mode:'simulation',now,io});
  expect(result.results[0].status).toBe('Pending');expect(io.emit).not.toHaveBeenCalled();
  const sent=require('axios').post.mock.calls.at(-1)[1];expect(JSON.stringify(sent)).not.toMatch(/patient|consultation|507f1/);
  expect(require('../src/models/OutbreakAlert').updateOne.mock.calls.at(-1)[1].$setOnInsert).toMatchObject({isSimulation:true,status:'Pending',sourceConsultationIds:[c._id]});
});
test('missing eligible cases makes no ML request',async()=>{require('axios').post.mockClear();require('../src/models/Consultation').collection.find.mockReturnValue({toArray:async()=>[fixture({surveillanceVerification:undefined})]});expect((await service.runAnalysis({now})).consultations_analysed).toBe(0);expect(require('axios').post).not.toHaveBeenCalled();});
test('legacy broadcast endpoint rejects without side effects',async()=>{const res={status:jest.fn().mockReturnThis(),json:jest.fn()};await require('../src/controllers/alertController').broadcastAlert({body:{district:'Colombo',message:'test'}},res);expect(res.status).toHaveBeenCalledWith(409);});
