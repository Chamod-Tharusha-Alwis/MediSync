'use strict';
const {maskLoginAlertIdentifier}=require('../src/utils/loginAlertIdentifier');
const mail=require('../src/utils/emailService');
// Synthetic identifiers only. No credential, account lookup or external transport.
const cases=[
  ['national-new','999912345678','9999*****678','patient'],
  ['national-old-v','999123456V','9991***56V','patient'],
  ['national-old-x','999123456x','9991***56x','pharmacist'],
  ['email','fixture@example.invalid','f***@example.invalid','admin'],
  ['doctor-id','DR-SYNTHETIC-42','DR-**********42','doctor'],
  ['hospital-registration','HOSP-SYNTHETIC-42','HOS************42','hospital'],
  ['pharmacy-registration','PHARM-SYNTHETIC-42','PHA*************42','pharmacy_admin'],
  ['staff-id','STAFF-SYNTHETIC-42','STA*************42','pharmacist']
];
test.each(cases)('%s display mask keeps only the approved prefix/suffix',(_,raw,expected)=>{
  expect(maskLoginAlertIdentifier(raw)).toBe(expected);
});
test.each([null,undefined,'','  ',{},[],123,'A','AB123','bad@@invalid'])('missing, short or malformed input is hidden %#',value=>{
  expect(maskLoginAlertIdentifier(value)).toBe('***');
});
test('first email character may be Unicode, and display helper never changes the original input',()=>{
  const input='  example@example.invalid  ';
  expect(maskLoginAlertIdentifier(input)).toBe('e***@example.invalid');expect(input).toBe('  example@example.invalid  ');
  expect(maskLoginAlertIdentifier('αbc@example.invalid')).toBe('α***@example.invalid');
});
describe('actual login template through inert capture',()=>{
  beforeEach(()=>mail.__clearCapturedTestEmails());
  afterEach(()=>mail.__clearCapturedTestEmails());
  test.each(cases.flatMap(c=>['en','si','ta'].map(lang=>[...c,lang])))('rendered body and recipient contract %#',async(_,raw,expected,role,lang)=>{
    const destination='recipient@example.local';
    await mail.sendLoginNotificationEmail(destination,'Synthetic role',raw,role,'Synthetic device',{},'Individual Login',null,false,{lang});
    const captured=mail.__getCapturedTestEmails();expect(captured).toHaveLength(1);
    expect(captured[0].to).toContain(destination);
    expect(captured[0].html).toContain(`<strong>Identifier:</strong> ${expected}`);
    expect(captured[0].html).not.toContain(raw);
    if(captured[0].text)expect(captured[0].text).not.toContain(raw);
    expect(captured[0].hasAttachment).toBe(false);
    expect(captured[0].subject).toContain('MediSync');
  });
  test('HTML-special characters remaining at the edges are escaped in the body',async()=>{
    await mail.sendLoginNotificationEmail('recipient@example.local','Synthetic role','<AA-SYNTHETIC-ZZ>','doctor','Synthetic device',{},'Individual Login',null,true,{lang:'en'});
    const html=mail.__getCapturedTestEmails()[0].html;
    expect(html).toContain('&lt;AA');expect(html).toContain('Z&gt;');expect(html).not.toContain('<AA');
  });
  test('existing log email masking is unchanged and independent of body masking',()=>{
    expect(mail.maskEmail('fixture@example.invalid')).toBe('f***@e***.invalid');
  });
});
