throw new Error('Phase 5X-D6A quarantine: targeted profile execution requires separate approval and final safety review.');
const h=require('./helpers/targetedClinicalHarness').createHarness('profile');
jest.setTimeout(90000);
const patientFields=['_id','nic','fullName','dateOfBirth','gender','district','email','contactInfo','address','bloodGroup','allergies','chronicConditions','emergencyContact','insurance','height','weight','riskScore','riskLevel','profilePicture'];
const doctorFields=['_id','nic','fullName','dateOfBirth','gender','bloodGroup','allergies','chronicConditions','height','weight','riskScore','riskLevel'];
const adminFields=['_id','nic','fullName','email','district','isActive','createdAt','updatedAt'];
function projection(body,allowed){
  expect(body.data).toBeTruthy();expect(Object.keys(body.data).every(key=>allowed.includes(key))).toBe(true);
  expect(JSON.stringify(body)).not.toMatch(/__enc_|patientNic_bi|password|keyVersion|twoFactorEnabled|reportedDoctors|lastLoginAt|tokenHash/);
}
beforeAll(h.setup);afterEach(h.afterCase);afterAll(h.cleanup);
describe('D6A owned patient profile endpoints — NOT EXECUTED',()=>{
  test('P01 patient A self: AES storage and hydration, nested allowlists',async()=>{
    const raw=await h.models.Patient.collection.findOne({_id:h.actors.a.doc._id});expect(raw.fullName).not.toBe('QA a');expect(raw.__enc_allergies_d).toBeTruthy();
    const r=await h.profile('a');expect(r.status).toBe(200);projection(r.body,patientFields);expect(r.body.data.fullName).toBe('QA a');expect(r.body.data.allergies).toEqual(['amoxicillin']);expect(r.body.data.contactInfo).toBe('QA contact');
    expect(Object.keys(r.body.data.insurance).every(key=>['provider','policyNumber','expiryDate'].includes(key))).toBe(true);
    expect(Object.keys(r.body.data.emergencyContact).every(key=>['name','phone','relationship'].includes(key))).toBe(true);
  });
  test('P02 patient A cannot read owned patient B; denial audit',async()=>{await h.denial('a',{},'b');});
  test('P03 active verified assigned doctor: clinical minimum and AES allergy',async()=>{const r=await h.profile('assigned');expect(r.status).toBe(200);projection(r.body,doctorFields);expect(r.body.data.allergies).toEqual(['amoxicillin']);expect(r.body.data.fullName).toBe('QA a');expect(r.body.data.email).toBeUndefined();});
  test('P04 valid consent from actual OTP endpoints authorizes unassigned doctor',async()=>{const c=await h.consent();const r=await h.profile('consented','a',{'x-patient-access':c.token});expect(r.status).toBe(200);projection(r.body,doctorFields);expect(r.body.data.allergies).toEqual(['amoxicillin']);});
  for(const label of ['unassigned','unverified','disabled','revoked'])test(`P05 ${label} doctor denied with audit`,async()=>{await h.denial(label);});
  for(const [label,headers]of [['malformed',{'x-patient-access':'malformed'}],['empty',{'x-patient-access':''}],['conflicting',{'x-patient-access':'one','x-patient-access-token':'two'}]])test(`P06 ${label} explicit consent cannot fall back to assignment`,async()=>{await h.denial('assigned',headers);});
  for(const label of ['expired','wrong-patient','wrong-requester','wrong-role','missing-session'])test(`P07 ${label} consent denied despite assignment`,async()=>{
    const missingSessionId=String(new(require('mongoose').Types.ObjectId)());
    if(label==='missing-session')expect(await h.models.OTPSession.findById(missingSessionId)).toBeNull();
    const changes=label==='expired'?{exp:Math.floor(Date.now()/1000)-60}:label==='wrong-patient'?{nic:h.actors.b.doc.nic}:label==='wrong-requester'?{requesterId:String(h.actors.unassigned.doc._id)}:label==='wrong-role'?{requesterRole:'pharmacist'}:{sessionId:missingSessionId};
    const token=await h.forgedConsent(changes);await h.denial('assigned',{'x-patient-access':token});
  });
  for(const role of ['admin','super'])test(`P08 ${role} account projection excludes clinical fields`,async()=>{const r=await h.profile(role);expect(r.status).toBe(200);projection(r.body,adminFields);expect(r.body.data.email).toBe(h.actors.a.doc.email);for(const field of ['allergies','dateOfBirth','bloodGroup','insurance','chronicConditions'])expect(r.body.data[field]).toBeUndefined();});
  for(const role of ['disabledAdmin','invalidAdmin','wrongRoleAdmin'])test(`P09 ${role} stored identity denied`,async()=>{await h.denial(role);});
  for(const role of ['pharmacist','pharmacyAdmin','linked','unlinked'])test(`P10 ${role} institutional clinical profile denied with audit`,async()=>{await h.denial(role);});
  test('P11 existing admin user management remains available for owned patient',async()=>{for(const label of ['admin','super']){const r=await h.auth(label,h.call().get('/api/admin/users').query({role:'patient',search:h.actors.a.doc.email}));expect(r.status).toBe(200);expect(r.body.data).toHaveLength(1);expect(String(r.body.data[0]._id)).toBe(String(h.actors.a.doc._id));expect(r.body.data[0].password).toBeUndefined();expect(r.body.data[0].allergies).toBeUndefined();}});
  test('P12 invalid authentication is rejected without a clinical response',async()=>{const r=await h.call().get(`/api/patient/${h.actors.a.doc.nic}`).set('Authorization','Bearer invalid');expect(r.status).toBe(401);expect(r.body.data).toBeUndefined();});
});
