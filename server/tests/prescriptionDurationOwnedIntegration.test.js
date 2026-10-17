throw new Error('Phase 5X-D6A quarantine: targeted duration execution requires separate approval and final safety review.');
const fs=require('fs'),path=require('path'),vm=require('vm');
const h=require('./helpers/targetedClinicalHarness').createHarness('duration');
jest.setTimeout(90000);
const ui={exports:{}};
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../client/src/utils/prescriptionDuration.js'),'utf8').replace('export function','function')+'\nmodule.exports={prescriptionPayload};',{module:ui});
const medicine=days=>({name:'Paracetamol',dosage:'QA dosage',frequency:'QA frequency',durationDays:days});
const sendConsultation=medicines=>h.auth('assigned',h.call().post('/api/doctor/consultation')).send({patientNic:h.actors.a.doc.nic,diagnosis:'QA synthetic diagnosis',symptoms:['QA symptom'],prescriptions:medicines,labTests:[],orderedTests:[]});
const sendStandalone=(data,label='assigned')=>h.auth(label,h.call().post('/api/prescription/issue')).send({patientNic:h.actors.a.doc.nic,drugName:'Paracetamol',dosage:'QA dosage',frequency:'QA frequency',...data});
async function reloaded(id,days){
  expect(h.qa.owned.prescriptions).toContain(String(id));
  const raw=await h.models.Prescription.collection.findOne({_id:new(require('mongoose').Types.ObjectId)(id)});
  expect(raw.phase5xOwner).toBe(h.qa.owner);expect(raw.durationDays).toBe(days);expect(+raw.expiresAt-+raw.issuedAt).toBe(days*86400000);
  const doc=await h.models.Prescription.findById(id);doc.decryptFieldsSync();expect(doc.durationDays).toBe(days);expect(doc.drugName).toBe('Paracetamol');expect(+doc.expiresAt-+doc.issuedAt).toBe(days*86400000);return doc;
}
beforeAll(h.setup);afterEach(h.afterCase);afterAll(h.cleanup);
describe('D6A owned duration endpoints — NOT EXECUTED',()=>{
  for(const days of [1,5,7,28])test(`D01 consultation ${days} days: real numeric UI payload, stored dates and reload`,async()=>{const payload=JSON.parse(JSON.stringify(ui.exports.prescriptionPayload([medicine(days)])));expect(typeof payload[0].durationDays).toBe('number');const r=await sendConsultation(payload);expect(r.status).toBe(201);expect(r.body.prescriptions).toHaveLength(1);await reloaded(r.body.prescriptions[0]._id,days);});
  for(const days of [1,5,7,28])test(`D02 standalone ${days} days: persisted dates and reload`,async()=>{const r=await sendStandalone({durationDays:days});expect(r.status).toBe(201);await reloaded(r.body._id,days);});
  test('D03 multiple medicines retain independent durations and common issuedAt',async()=>{const r=await sendConsultation(ui.exports.prescriptionPayload([medicine(1),medicine(5),medicine(28)]));expect(r.status).toBe(201);expect(r.body.prescriptions).toHaveLength(3);const docs=await Promise.all(r.body.prescriptions.map((rx,i)=>reloaded(rx._id,[1,5,28][i])));expect(new Set(docs.map(doc=>+doc.issuedAt)).size).toBe(1);});
  for(const [label,data]of [['missing',{}],['null',{durationDays:null}],['string',{durationDays:'5'}],['zero',{durationDays:0}],['negative',{durationDays:-1}],['fractional',{durationDays:1.5}],['legacy',{duration:'5 days'}],['conflicting',{durationDays:5,duration:'7 days'}]])test(`D04 ${label} duration: both endpoints reject with no clinical writes`,async()=>{const before=await h.clinicalCounts();const a=await sendConsultation([{name:'Paracetamol',...data}]);const b=await sendStandalone(data);expect(a.status).toBe(400);expect(b.status).toBe(400);expect(a.body.error).toBe('INVALID_DURATION');expect(b.body.error).toBe('INVALID_DURATION');expect(await h.clinicalCounts()).toEqual(before);});
  test('D05 later invalid medicine rejects whole consultation before clinical writes',async()=>{const before=await h.clinicalCounts();const r=await sendConsultation([medicine(5),medicine(0)]);expect(r.status).toBe(400);expect(r.body.error).toBe('INVALID_DURATION');expect(await h.clinicalCounts()).toEqual(before);});
  test('D06 owned patient role cannot prescribe; invalid authentication denied',async()=>{const before=await h.clinicalCounts();const r=await sendStandalone({durationDays:5},'a');expect(r.status).toBe(403);const second=await h.call().post('/api/doctor/consultation').set('Authorization','Bearer invalid').send({patientNic:h.actors.a.doc.nic,prescriptions:[medicine(5)]});expect(second.status).toBe(401);expect(await h.clinicalCounts()).toEqual(before);});
  test('D07 real allergy checker rejects later UI-name conflict and standalone conflict before clinical writes',async()=>{const before=await h.clinicalCounts();const a=await sendConsultation([medicine(5),{...medicine(7),name:'amoxicillin'}]);const b=await sendStandalone({drugName:'amoxicillin',durationDays:5});expect(a.status).toBe(400);expect(b.status).toBe(400);expect(a.body.error).toBe('ALLERGY_CONFLICT');expect(b.body.error).toBe('ALLERGY_CONFLICT');expect(await h.clinicalCounts()).toEqual(before);});
  test('D08 missing and conflicting aliases reject consultation before clinical writes',async()=>{const before=await h.clinicalCounts();for(const item of [{durationDays:5},{name:'',durationDays:5},{name:'Paracetamol',drugName:'amoxicillin',durationDays:5}]){const r=await sendConsultation([item]);expect(r.status).toBe(400);expect(r.body.error).toBe('INVALID_MEDICATION_NAME');}expect(await h.clinicalCounts()).toEqual(before);});
  test('D09 actual PDF renderer represents persisted durationDays without historical fallback',async()=>{
    const r=await sendStandalone({durationDays:28});expect(r.status).toBe(201);const doc=await reloaded(r.body._id,28);
    const {PDFPage}=require('pdf-lib'),original=PDFPage.prototype.drawText,rendered=[];
    const spy=jest.spyOn(PDFPage.prototype,'drawText').mockImplementation(function(text,options){rendered.push(text);return original.call(this,text,options);});
    try{const pdf=await require('../src/utils/pdfGenerator').generateLockedPrescription(doc,'QA patient',h.actors.a.doc.nic,'01/01/1990','QA doctor','personal');expect(Buffer.isBuffer(pdf)).toBe(true);expect(pdf.length).toBeGreaterThan(500);expect(rendered).toContain('28 days');expect(rendered).not.toContain('7 days');}finally{spy.mockRestore();}
  });
});
