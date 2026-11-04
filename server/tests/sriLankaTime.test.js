'use strict';
const {formatSriLankaDateTime,formatSriLankaDate,formatCalendarDate}=require('../src/utils/sriLankaTime');
const mail=require('../src/utils/emailService');
const instant='2026-11-04T17:36:43.000Z';
const expected='11/4/2026, 11:06:43 PM (Sri Lanka time, UTC+05:30)';
test('fixed UTC instant is converted to Sri Lanka time with an explicit zone',()=>{
  expect(formatSriLankaDateTime(instant)).toBe(expected);
});
test('20:00 UTC rolls over to the next date in Sri Lanka',()=>{
  expect(formatSriLankaDateTime('2026-11-04T20:00:00Z')).toBe('11/5/2026, 1:30:00 AM (Sri Lanka time, UTC+05:30)');
  expect(formatSriLankaDate('2026-12-31T20:00:00Z')).toBe('1/1/2027 (Sri Lanka time, UTC+05:30)');
});
test('Date storage and ISO wire values are not changed, and timezone overrides cannot undo the pin',()=>{
  const d=new Date(instant),utc=d.toISOString();
  expect(formatSriLankaDateTime(d,'en-US',{year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true,timeZone:'UTC'})).toBe(expected);
  expect(d.toISOString()).toBe(utc);
  expect(formatCalendarDate('2026-11-04')).toBe('11/4/2026');
});
test.each([undefined,null,'','not-a-date',{},[],true,'2026-11-04T20:00:00','2026-02-30'])('invalid or timezone-ambiguous input is unavailable (%#)',value=>{
  expect(formatSriLankaDateTime(value)).toBe('—');
});
describe('actual email templates, inert capture only',()=>{
  let previous;
  beforeEach(()=>{previous=process.env.TEST_OTP_ENABLED;process.env.TEST_OTP_ENABLED='false';jest.useFakeTimers();jest.setSystemTime(new Date(instant));mail.__clearCapturedTestEmails();});
  afterEach(()=>{jest.useRealTimers();if(previous===undefined)delete process.env.TEST_OTP_ENABLED;else process.env.TEST_OTP_ENABLED=previous;mail.__clearCapturedTestEmails();});
  const templates={
    login:lang=>mail.sendLoginNotificationEmail('fixture@example.local','Fixture','fixture-ref','admin','Fixture device',{},'Individual Login',null,false,{lang}),
    otp:lang=>mail.sendOTPEmail('fixture@example.local','Fixture','000111',{lang}),
    prescription:lang=>mail.sendPrescriptionEmail('fixture@example.local','Fixture',null,null,{lang}),
    passwordReset:lang=>mail.sendPasswordResetEmail('fixture@example.local','Fixture','https://medisync.local/reset','15 minutes',{lang}),
    appointment:lang=>mail.sendReminderEmail('fixture@example.local','Fixture',new Date('2026-11-04T20:00:00Z'),'Fixture',{lang}),
    dispense:lang=>mail.sendDispenseNotificationEmail('fixture@example.local','Fixture','Fixture','Fixture','Fixture',new Date(instant),{lang}),
    consent:lang=>mail.sendConsentStatusEmail('fixture@example.local','Fixture','Fixture','granted',{lang})
  };
  test.each(Object.keys(templates).flatMap(name=>['en','si','ta'].map(lang=>[name,lang])))('%s/%s displays a zoned timestamp without sending email',async(name,lang)=>{
    const result=await templates[name](lang);expect(result.providerAccepted).toBe(true);
    const captured=mail.__getCapturedTestEmails();expect(captured).toHaveLength(1);
    expect(captured[0].html).toContain(expected);
    expect(captured[0].html).toContain('data-medisync-sent-at="Asia/Colombo"');
    if(captured[0].text)expect(captured[0].text).toContain(expected);
    expect(captured[0].capturedAt).toBe(instant);
    if(name==='login')expect(captured[0].html).toContain('<strong>Time:</strong> '+expected);
    if(name==='prescription')expect(captured[0].hasAttachment).toBe(false);
    if(name==='appointment')expect(captured[0].subject).toContain('11/5/2026 (Sri Lanka time, UTC+05:30)');
  });
  test('email expiry can be an absolute UTC instant, while relative validity remains relative',async()=>{
    await mail.sendPasswordResetEmail('fixture@example.local','Fixture','https://medisync.local/reset',new Date('2026-11-04T20:00:00Z'));
    expect(mail.__getCapturedTestEmails()[0].text).toContain('11/5/2026, 1:30:00 AM (Sri Lanka time, UTC+05:30)');
  });
});
