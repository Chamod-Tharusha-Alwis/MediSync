// Shared pure assertions; called by quarantined IR cases and standalone D3 checks.
const { publicationHarness } = require('./doctorPublicationMemoryHarness');
const approved = 'MEDISYNC_UNIV_DEMO_V2';
const normal = { _id:'doctor-memory-verified',doctorId:'DOC-MEMORY',fullName:'Dr. Anura Jayawardena',email:'anura@clinic.lk',
  role:'doctor',isActive:true,isVerified:true,isSynthetic:false,password:'inert-private-value',licenseNo:'inert-private-license',hospitals:[] };
async function verifiedPublication(expect) {
  const unverified = { ...normal,_id:'doctor-memory-unverified',email:'unverified@clinic.lk',isVerified:false };
  const missing = { ...normal,_id:'doctor-memory-missing',email:'missing@clinic.lk' }; delete missing.isVerified;
  const demo = { ...normal,_id:'demo-memory',email:'dr.silva@demo.medisync.local',isSynthetic:true,isDemoData:true,datasetVersion:approved };
  const harness = publicationHarness([normal,unverified,missing,demo],{ nodeEnv:'production',allowDemo:'true',testMode:true });
  const result = await harness.directory(); expect(result.status).toBe(200);
  const doctors = result.body.data;
  expect(doctors.length).toBeGreaterThanOrEqual(1);
  expect(doctors.some(doc => doc.email === normal.email)).toBe(true);
  expect(doctors.some(doc => doc.email === unverified.email)).toBe(false);
  expect(doctors.some(doc => doc.email === missing.email)).toBe(false);
  expect(doctors.some(doc => doc.email === demo.email)).toBe(false);
  for (const doc of doctors) {
    expect(doc.isVerified).toBe(true); expect(doc.isActive).toBe(true);
    expect(doc.licenseNo).toBeUndefined(); expect(doc.password).toBeUndefined();
  }
  // Verification is independent of synthetic classification in both directions.
  expect(harness.policy({ ...normal,isVerified:false })).toBe(false);
  expect(harness.policy({ ...normal,isVerified:'true' })).toBe(false);
  expect(harness.policy({ ...normal,isVerified:1 })).toBe(false);
  expect(harness.policy({ ...normal,isActive:false })).toBe(false);
  expect(harness.policy(normal,new Set([normal._id]))).toBe(false);
  expect(harness.policy({ ...normal,role:'patient' })).toBe(false);
  expect(harness.policy({ ...normal,loginType:'hospital',orgLogins:[{ isActive:false }] })).toBe(false);
}
async function syntheticPublication(expect) {
  const demos = Array.from({ length:5 },(_,index) => ({ ...normal,_id:`demo-memory-${index}`,doctorId:`DOC-DEMO-MEMORY-${index}`,
    email:index === 0 ? 'dr.silva@demo.medisync.local' : `memory-${index}@demo.medisync.local`,isSynthetic:true,isDemoData:true,datasetVersion:approved }));
  const bad = { ...demos[0],_id:'unapproved-memory',email:'unapproved@test.medisync.local',datasetVersion:'UNAPPROVED_DATASET_V1' };
  const unverified = { ...demos[0],_id:'unverified-demo-memory',email:'unverified@demo.medisync.local',isVerified:false };
  const missing = { ...demos[0],_id:'missing-demo-memory',email:'missing@demo.medisync.local' }; delete missing.isVerified;
  const missingSynthetic = { ...demos[0],_id:'missing-label-memory',email:'missing-label@demo.medisync.local' }; delete missingSynthetic.isSynthetic;
  const objects = [...demos,bad,unverified,missing,missingSynthetic];
  const demoMode = publicationHarness(objects,{ allowDemo:'true' });
  const result = await demoMode.directory(); expect(result.status).toBe(200);
  const docs = result.body.data; expect(docs.length).toBe(5);
  expect(docs.some(doc => doc.email === 'dr.silva@demo.medisync.local')).toBe(true);
  for (const doc of docs) {
    expect(doc.isSynthetic).toBe(true); expect(doc.isVerified).toBe(true);
    expect(doc.syntheticLabel).toBe('Demo Doctor — Synthetic Profile'); expect(doc.slmcRegistered).toBe(false);
    expect(doc.licenseNo).toBeUndefined(); expect(doc.password).toBeUndefined();
  }
  for (const excluded of [bad,unverified,missing,missingSynthetic]) expect(docs.some(doc => doc.email === excluded.email)).toBe(false);
  const prod = await publicationHarness(objects,{ nodeEnv:'production',allowDemo:'true' }).directory();
  expect(prod.status).toBe(200); expect(prod.body.data.some(doc => doc.isSynthetic === true)).toBe(false);
  expect(prod.body.data.some(doc => doc.email === 'dr.silva@demo.medisync.local')).toBe(false);
  const disabled = await publicationHarness(objects,{ allowDemo:'false' }).directory();
  expect(disabled.status).toBe(200); expect(disabled.body.data.some(doc => doc.isSynthetic === true)).toBe(false);
  for (const options of [{ database:'test' },{ readyState:0 },{ testMode:false },{ allowDemo:undefined }]) {
    expect(publicationHarness(objects,options).demoAllowed()).toBe(false);
  }
  expect(demoMode.policy(demos[0],new Set(),{ allowApprovedDemoDataset:false })).toBe(false);
}
module.exports = { verifiedPublication, syntheticPublication };
