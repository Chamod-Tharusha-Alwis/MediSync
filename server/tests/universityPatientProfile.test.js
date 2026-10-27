'use strict';
const { controllerHarness } = require('./helpers/phase5xD5InertHarness');
const policy = require('../src/security/patientProfileUpdate');
const id = 'a'.repeat(24), nic = '199012345678';

function setup() {
  const doc = { _id: id, nic, fullName: 'Synthetic Patient', email: 'synthetic@example.invalid', contactInfo: 'Old phone', height: 170, weight: 65,
    allergies: ['old'], emergencyContact: { name: 'Synthetic Contact', phone: '0000000000', relationship: 'Other' },
    password: 'PRIVATE_HASH', keyVersion: 9, __enc_fullName: true, __enc_fullName_d: 'PRIVATE_CIPHER', patientNic_bi: 'PRIVATE_INDEX', lastLoginAt: 'PRIVATE_LOGIN', twoFactorEnabled: true };
  doc.save = jest.fn(async () => {});
  doc.decryptFieldsSync = jest.fn();
  doc.toObject = () => ({ ...doc, save: undefined, decryptFieldsSync: undefined, toObject: undefined });
  const query = () => { const q = { select: jest.fn(() => q), then: (ok, fail) => Promise.resolve(doc).then(ok, fail) }; return q; };
  const Patient = { findById: jest.fn(query), findOne: jest.fn(query) };
  const harness = controllerHarness('patientController', { dependencies: { '../models/Patient': Patient, '../security/patientProfileUpdate': policy } });
  const request = body => ({ user: { id, role: 'patient' }, body });
  return { doc, Patient, invoke: (method, req) => harness.invoke(method, req), request };
}

test('self profile update uses authenticated ID without requiring the optional NIC subject claim', async () => {
  const x = setup(), result = await x.invoke('updatePatientProfile', x.request({ contactInfo: 'New phone' }));
  expect(result.status).toBe(200); expect(x.Patient.findById).toHaveBeenCalledWith(id); expect(x.Patient.findOne).not.toHaveBeenCalled();
  expect(x.doc.contactInfo).toBe('New phone'); expect(x.doc.save).toHaveBeenCalledTimes(1);
});

test('a stale or foreign subject NIC cannot select another Patient for profile writes', async () => {
  const x = setup(), req = x.request({ allergies: ['synthetic allergen'] }); req.user.sub = '198012345679';
  const result = await x.invoke('updatePatientProfile', req);
  expect(result.status).toBe(200); expect(x.Patient.findById).toHaveBeenCalledWith(id); expect(x.Patient.findOne).not.toHaveBeenCalled();
});

test('saved profile response is the existing patient allowlist, excluding secrets and encryption metadata', async () => {
  const x = setup(), req = x.request({ bloodGroup: 'O+' }); req.user.sub = nic;
  const result = await x.invoke('updatePatientProfile', req);
  expect(result.status).toBe(200); expect(result.body.data).toMatchObject({ _id: id, fullName: 'Synthetic Patient', bloodGroup: 'O+' });
  for (const key of ['password', 'keyVersion', '__enc_fullName', '__enc_fullName_d', 'patientNic_bi', 'lastLoginAt', 'twoFactorEnabled']) expect(result.body.data).not.toHaveProperty(key);
  expect(x.doc.decryptFieldsSync).toHaveBeenCalledTimes(1);
});

test.each([
  null, [], 'profile', {}, { height: [] }, { height: {} }, { height: true }, { height: -1 }, { height: 0 }, { height: Infinity }, { height: 'NaN' }, { height: '0x10' },
  { weight: NaN }, { weight: 1001 }, { allergies: [{}] }, { allergies: Array(51).fill('x') }, { contactInfo: {} }, { bloodGroup: 'UNKNOWN' },
  { emergencyContact: { phone: {} } }, { emergencyContact: { password: 'attempt' } }, { isActive: true }, { email: 'other@example.invalid' }
])('invalid profile input is rejected with 400 before any account lookup or write: %p', async body => {
  const x = setup(), req = x.request(body); req.user.sub = nic;
  const result = await x.invoke('updatePatientProfile', req);
  expect(result.status).toBe(400); expect(x.Patient.findById).not.toHaveBeenCalled(); expect(x.Patient.findOne).not.toHaveBeenCalled(); expect(x.doc.save).not.toHaveBeenCalled();
});

test('valid measurements, comma allergy input and partial emergency contact preserve the established form contract', async () => {
  const x = setup();
  const result = await x.invoke('updatePatientProfile', x.request({ height: '171.5', weight: 66, allergies: 'Synthetic A, , Synthetic B', emergencyContact: { phone: '0000000001' } }));
  expect(result.status).toBe(200); expect(x.doc).toMatchObject({ height: 171.5, weight: 66, allergies: ['Synthetic A', 'Synthetic B'], emergencyContact: { name: 'Synthetic Contact', relationship: 'Other', phone: '0000000001' } });
});

test('explicit blank/null measurements clear a value; omitted values stay unchanged', async () => {
  const x = setup(); const result = await x.invoke('updatePatientProfile', x.request({ height: '', weight: null, bloodGroup: '' }));
  expect(result.status).toBe(200); expect(x.doc.height).toBeNull(); expect(x.doc.weight).toBeNull(); expect(x.doc.bloodGroup).toBe('');
});

test('non-patient direct handler calls cannot write a patient profile', async () => {
  const x = setup(), req = x.request({ contactInfo: 'Denied' }); req.user = { id, role: 'doctor', sub: nic };
  const result = await x.invoke('updatePatientProfile', req);
  expect(result.status).toBe(403); expect(x.Patient.findById).not.toHaveBeenCalled(); expect(x.doc.save).not.toHaveBeenCalled();
});

test('legacy NIC route keeps contactInfo a string and binds the stored write to authenticated ID', async () => {
  const x = setup(), req = x.request({ contactInfo: '0000000002', address: 'Synthetic address', allergies: [] }); req.params = { nic };
  const result = await x.invoke('updatePatient', req);
  expect(result.status).toBe(200); expect(x.doc.contactInfo).toBe('0000000002'); expect(x.Patient.findOne).toHaveBeenCalledWith(expect.objectContaining({ _id: id }));
  expect(result.body.data).not.toHaveProperty('password'); expect(result.body.data).not.toHaveProperty('keyVersion');
});

test('legacy NIC route denies a different patient without any save', async () => {
  const x = setup(), req = x.request({ contactInfo: 'Denied' }); req.params = { nic: '198012345679' };
  const result = await x.invoke('updatePatient', req);
  expect(result.status).toBe(403); expect(x.doc.save).not.toHaveBeenCalled();
});

test('missing patient and storage failures return bounded errors without exposing diagnostic text', async () => {
  const x = setup(); x.Patient.findById.mockResolvedValueOnce(null);
  expect((await x.invoke('updatePatientProfile', x.request({ allergies: [] }))).status).toBe(404);
  x.Patient.findById.mockRejectedValueOnce(Error('PRIVATE URI AND PATIENT DIAGNOSTIC'));
  const result = await x.invoke('updatePatientProfile', x.request({ allergies: [] }));
  expect(result.status).toBe(500); expect(JSON.stringify(result.body)).not.toContain('PRIVATE'); expect(x.doc.save).not.toHaveBeenCalled();
});
