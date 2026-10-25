'use strict';
jest.mock('../src/models/SupportTicket',()=>({findById:jest.fn(),find:jest.fn()}));
jest.mock('../src/models/Patient',()=>({}));
jest.mock('../src/utils/emailService',()=>({sendEmail:jest.fn(),escapeHtml:jest.requireActual('../src/utils/emailService').escapeHtml}));
const Ticket=require('../src/models/SupportTicket'),email=require('../src/utils/emailService');
const controller=require('../src/controllers/supportController');
const id='000000000000000000000001';
function response(){return{status:jest.fn().mockReturnThis(),json:jest.fn()};}
function ticket(){const row={_id:id,subject:'Question',message:'<img src=x onerror=bad()>',status:'Open',patientId:{_id:id,fullName:'<a href="https://untrusted.invalid">Name</a>',email:'synthetic@example.invalid',password:'private-secret',allergies:['private-clinical'],__enc_fullName:true},save:jest.fn().mockResolvedValue(undefined)};row.toObject=()=>({...row,save:undefined,toObject:undefined});return row;}
beforeEach(()=>jest.clearAllMocks());
test('support email escapes patient name, original message and reply; response excludes private patient fields',async()=>{
 const row=ticket();Ticket.findById.mockReturnValue({populate:jest.fn().mockResolvedValue(row)});email.sendEmail.mockResolvedValue({providerAccepted:true,deliveryConfirmed:false});const res=response();
 await controller.replyTicket({params:{id},body:{reply:'<script>bad()</script>'}},res);
 expect(row.save).toHaveBeenCalledTimes(1);const html=email.sendEmail.mock.calls[0][0].html;
 expect(html).not.toContain('<script>');expect(html).not.toContain('<img src=x');expect(html).not.toContain('<a href="https://untrusted.invalid">');expect(html).toContain('&lt;script&gt;');
 const result=res.json.mock.calls[0][0];expect(result.data.patientId).not.toHaveProperty('password');expect(result.data.patientId).not.toHaveProperty('allergies');expect(result.data.patientId).not.toHaveProperty('__enc_fullName');expect(result.notifications.deliveryConfirmed).toBe(false);
});
test('provider failure cannot turn a committed support reply into a failed write or expose diagnostics',async()=>{
 const row=ticket();Ticket.findById.mockReturnValue({populate:jest.fn().mockResolvedValue(row)});email.sendEmail.mockRejectedValue(Error('private provider details'));const res=response();
 await controller.replyTicket({params:{id},body:{reply:'Synthetic answer'}},res);
 expect(row.save).toHaveBeenCalledTimes(1);expect(res.status).not.toHaveBeenCalledWith(500);expect(res.json).toHaveBeenCalledWith(expect.objectContaining({notifications:{requested:true,providerAccepted:false,deliveryConfirmed:false}}));expect(JSON.stringify(res.json.mock.calls)).not.toContain('private provider details');
});
test.each([' ',{},['answer'],'x'.repeat(5001)])('invalid support reply %p is rejected before any lookup',async reply=>{
 const res=response();await controller.replyTicket({params:{id},body:{reply}},res);expect(res.status).toHaveBeenCalledWith(400);expect(Ticket.findById).not.toHaveBeenCalled();expect(email.sendEmail).not.toHaveBeenCalled();
});
test('malformed ticket identifier is rejected before storage access',async()=>{
 const res=response();await controller.replyTicket({params:{id:'not-an-id'},body:{reply:'answer'}},res);expect(res.status).toHaveBeenCalledWith(400);expect(Ticket.findById).not.toHaveBeenCalled();
});
test('patient ticket query failures never expose driver errors',async()=>{
 Ticket.find.mockReturnValue({sort:jest.fn().mockRejectedValue(Error('private URI and clinical detail'))});const res=response();await controller.getPatientTickets({user:{id}},res);expect(res.status).toHaveBeenCalledWith(500);expect(JSON.stringify(res.json.mock.calls)).not.toContain('private URI');expect(Ticket.find).toHaveBeenCalledWith({patientId:id});
});
