'use strict';
test('actual routed doctor handler is the approved transaction command adapter',()=>{
  const doctor=require('../src/controllers/doctorController');
  const command=require('../src/controllers/clinicalCommandController');
  expect(doctor.createConsultation).toBe(command.createConsultation);
  expect(doctor.createConsultation.securityCommandVersion).toBe(1);
});
test('failed transactional command cannot produce a success DTO or read downstream prescriptions',async()=>{
  const prescriptions=jest.fn(),labs=jest.fn();
  const handler=require('../src/controllers/clinicalCommandController').createConsultationHandler({execute:async()=>{throw Error('synthetic prescription failure');},prescriptions,labs});
  const res={status:jest.fn().mockReturnThis(),json:jest.fn()};
  await handler({user:{id:'000000000000000000000001'},clinicalAuthorization:{patientId:'000000000000000000000002'}},res);
  expect(res.status).toHaveBeenCalledWith(503);expect(prescriptions).not.toHaveBeenCalled();expect(labs).not.toHaveBeenCalled();
  expect(res.json.mock.calls[0][0]).not.toHaveProperty('consultationId');
});
