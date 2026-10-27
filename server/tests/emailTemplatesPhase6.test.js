'use strict';

/**
 * MediSync Stage 4 Email Templates & Dispatch Security Test Suite
 * Validates all 9 standardized responsive email templates under isolated sandbox transport.
 * Zero external SMTP calls, zero live network roundtrips.
 */

const emailService = require('../src/utils/emailService');

describe('Email Templates & Security Engine (Stage 4)', () => {
  beforeEach(() => {
    emailService.__clearCapturedTestEmails();
  });

  afterAll(() => {
    emailService.__clearCapturedTestEmails();
  });

  it('1. sendAccountInvitationEmail renders branded HTML, action link, and plain-text parity', async () => {
    const res = await emailService.sendAccountInvitationEmail(
      'operator@example.com',
      'Dr. Gamage',
      'https://medisync.local/activate?token=sample123',
      'doctor',
      '24 hours'
    );
    expect(res).toBeDefined();

    const captured = emailService.__getCapturedTestEmails();
    expect(captured.length).toBe(1);
    const email = captured[0];
    expect(email.to).toContain('operator@example.com');
    expect(email.subject).toContain('MediSync Platform Invitation');
    expect(email.text).toContain('https://medisync.local/activate?token=sample123');
    expect(email.html).toContain('MediSync');
    expect(email.html).toContain('#0F3B66'); // Navy brand color
    expect(email.html).toContain('Activate Account');
  });

  it('2. sendEmailVerificationEmail renders verification link and expiry', async () => {
    await emailService.sendEmailVerificationEmail(
      'user@example.com',
      'Kamal Perera',
      'https://medisync.local/verify?token=tok999',
      '24 hours'
    );
    const captured = emailService.__getCapturedTestEmails();
    expect(captured.length).toBe(1);
    const email = captured[0];
    expect(email.subject).toContain('Verify Your Email Address');
    expect(email.text).toContain('https://medisync.local/verify?token=tok999');
    expect(email.html).toContain('Verify Email Address');
  });

  it('3. sendPasswordResetEmail renders time-limited security advisory', async () => {
    await emailService.sendPasswordResetEmail(
      'user@example.com',
      'Nimal Silva',
      'https://medisync.local/reset-password?token=secReset456',
      '15 minutes'
    );
    const captured = emailService.__getCapturedTestEmails();
    expect(captured.length).toBe(1);
    const email = captured[0];
    expect(email.subject).toContain('Password Reset Request');
    expect(email.text).toContain('15 minutes');
    expect(email.html).toContain('Reset Password');
  });

  it('4. sendPatientAccessRequestEmail renders clinician name and consent explanation', async () => {
    await emailService.sendPatientAccessRequestEmail(
      'patient@example.com',
      'Saman Kumara',
      'Dr. Jayawardena',
      'Asiri Central Clinic'
    );
    const captured = emailService.__getCapturedTestEmails();
    expect(captured.length).toBe(1);
    const email = captured[0];
    expect(email.subject).toContain('Clinician Requested Record Access');
    expect(email.text).toContain('Dr. Jayawardena');
    expect(email.html).toContain('Asiri Central Clinic');
    expect(email.html).toContain('Clinical Record Access Request');
  });

  it('5. sendConsentStatusEmail renders granted vs revoked state accurately', async () => {
    await emailService.sendConsentStatusEmail('patient@example.com', 'Saman Kumara', 'Dr. Jayawardena', 'granted');
    await emailService.sendConsentStatusEmail('patient@example.com', 'Saman Kumara', 'Dr. Jayawardena', 'revoked');

    const captured = emailService.__getCapturedTestEmails();
    expect(captured.length).toBe(2);
    expect(captured[0].subject).toContain('Access Granted');
    expect(captured[0].html).toContain('AUTHORIZED');
    expect(captured[1].subject).toContain('Access Revoked');
    expect(captured[1].html).toContain('TERMINATED');
  });

  it('6. sendLabReportAvailableEmail renders diagnostic notification without leaking raw values', async () => {
    await emailService.sendLabReportAvailableEmail(
      'patient@example.com',
      'Sunil Alwis',
      'Full Blood Count (FBC)',
      'https://medisync.local/patient/dashboard'
    );
    const captured = emailService.__getCapturedTestEmails();
    expect(captured.length).toBe(1);
    const email = captured[0];
    expect(email.subject).toContain('New Diagnostic Report Available');
    expect(email.text).toContain('Full Blood Count (FBC)');
    expect(email.html).toContain('View Lab Report');
    // Ensure no raw clinical laboratory measurement values are embedded in email body
    expect(email.html).not.toContain('Platelet count:');
  });

  it('7. sendAdminReviewStatusEmail renders approved vs action-required status', async () => {
    await emailService.sendAdminReviewStatusEmail('doc@example.com', 'Dr. Perera', 'Medical Practitioner', 'approved', 'SLMC verification successful.');
    await emailService.sendAdminReviewStatusEmail('pharm@example.com', 'Mr. Bandara', 'Pharmacist', 'rejected', 'NMRA certificate expired.');

    const captured = emailService.__getCapturedTestEmails();
    expect(captured.length).toBe(2);
    expect(captured[0].html).toContain('VERIFIED & ACTIVE');
    expect(captured[1].html).toContain('APPLICATION RETURNED');
  });

  it('8. sendSupportTicketAckEmail renders ticket tracking reference', async () => {
    await emailService.sendSupportTicketAckEmail(
      'user@example.com',
      'Operator User',
      'TKT-887711',
      'Password reset assistance needed'
    );
    const captured = emailService.__getCapturedTestEmails();
    expect(captured.length).toBe(1);
    const email = captured[0];
    expect(email.subject).toContain('#TKT-887711');
    expect(email.html).toContain('TKT-887711');
  });

  it('9. sendSecurityIncidentEmail renders urgent high-priority notice', async () => {
    await emailService.sendSecurityIncidentEmail(
      'user@example.com',
      'Security Admin',
      'Repeated anomalous logins detected from untrusted IP subnet 192.0.2.1'
    );
    const captured = emailService.__getCapturedTestEmails();
    expect(captured.length).toBe(1);
    const email = captured[0];
    expect(email.subject).toContain('URGENT: MediSync Security Alert');
    expect(email.html).toContain('High-Priority Security Notice');
    expect(email.html).toContain('Repeated anomalous logins detected');
  });

  it('10. renderBrandEmailHtml produces verified Sinhala and Tamil output under lang parameter', () => {
    const siHtml = emailService.renderBrandEmailHtml({
      title: 'ගිණුම් දැනුම්දීම',
      bodyHtml: '<p>ඔබගේ ගිණුම සත්‍යාපනය කර ඇත.</p>',
      lang: 'si'
    });
    expect(siHtml).toContain('ජාතික සායනික තීරණ සහය පද්ධතිය');
    expect(siHtml).toContain('MediSync පද්ධතියෙන් නිකුත් කරන ස්වයංක්‍රීය දැනුම්දීමකි');
    expect(siHtml).toContain('lang="si"');

    const taHtml = emailService.renderBrandEmailHtml({
      title: 'கணக்கு அறிவிப்பு',
      bodyHtml: '<p>உங்கள் கணக்கு சரிபார்க்கப்பட்டது.</p>',
      lang: 'ta'
    });
    expect(taHtml).toContain('தேசிய மருத்துவ முடிவு ஆதரவு அமைப்பு');
    expect(taHtml).toContain('MediSync தளத்தின் தானியங்கி அறிவிப்பாகும்');
    expect(taHtml).toContain('lang="ta"');
  });

  it('11. transactional email templates render in recipient preferredLanguage (si, ta, and en fallback)', async () => {
    // Sinhala OTP
    await emailService.sendOTPEmail('user-si@example.com', 'සුනිල්', '654321', { preferredLanguage: 'si' });
    // Tamil OTP
    await emailService.sendOTPEmail('user-ta@example.com', 'குகன்', '123456', { lang: 'ta' });
    // Sinhala Invitation
    await emailService.sendAccountInvitationEmail(
      'doc-si@example.com',
      'දොස්තර විජේසුන්දර',
      'https://medisync.local/activate?token=si123',
      'doctor',
      '24 hours',
      { preferredLanguage: 'si' }
    );
    // Tamil Password Reset
    await emailService.sendPasswordResetEmail(
      'user-ta@example.com',
      'செல்வன்',
      'https://medisync.local/reset-password?token=ta456',
      '15 minutes',
      { preferredLanguage: 'ta' }
    );
    // Invalid lang fallback to en
    await emailService.sendOTPEmail('user-unknown@example.com', 'Sam', '999999', { preferredLanguage: 'xyz' });

    const captured = emailService.__getCapturedTestEmails();
    expect(captured.length).toBe(5);

    // 1. Sinhala OTP
    expect(captured[0].to).toContain('user-si@example.com');
    expect(captured[0].subject).toContain('ඔබගේ ආරක්ෂිත පිවිසුම් එක්වරක් භාවිත මුරපදය');
    expect(captured[0].html).toContain('විනාඩි 10ක් සඳහා වලංගු වේ');

    // 2. Tamil OTP
    expect(captured[1].to).toContain('user-ta@example.com');
    expect(captured[1].subject).toContain('உங்கள் பாதுகாப்பான உள்நுழைவு ஒருமுறை கடவுச்சொல்');
    expect(captured[1].html).toContain('கடவுச்சொல்');
    expect(captured[1].html).toContain('123456');

    // 3. Sinhala Invitation
    expect(captured[2].to).toContain('doc-si@example.com');
    expect(captured[2].subject).toContain('MediSync පද්ධති ආරාධනය');
    expect(captured[2].html).toContain('සාදරයෙන් පිළිගනිමු');
    expect(captured[2].html).toContain('ගිණුම සක්‍රිය කර මුරපදය සකසන්න');

    // 4. Tamil Password Reset
    expect(captured[3].to).toContain('user-ta@example.com');
    expect(captured[3].subject).toContain('கடவுச்சொல் மீட்டமைப்பு கோரிக்கை');
    expect(captured[3].html).toContain('கடவுச்சொல்லை மீட்டமைக்கவும்');

    // 5. Fallback English OTP
    expect(captured[4].to).toContain('user-unknown@example.com');
    expect(captured[4].subject).toBe('MediSync — Your Secure Login OTP');
  });

  it('12. legacy transactional formatters honor recipient preferredLanguage options (si, ta)', async () => {
    emailService.__clearCapturedTestEmails();

    // 1. sendTempPasswordEmail (si)
    await emailService.sendTempPasswordEmail(
      'nurse@example.com', 'සරත්', 'TempPass#123', 'https://medisync.local/login', 'National Hospital',
      { preferredLanguage: 'si' }
    );

    // 2. sendWelcomeEmail (ta)
    await emailService.sendWelcomeEmail('pharmacist@example.com', 'கார்த்திக்', 'pharmacist', { lang: 'ta' });

    // 3. sendPrescriptionEmail (si)
    await emailService.sendPrescriptionEmail(
      'patient@example.com', 'සුනිල්', Buffer.from('%PDF-1.4 dummy'), 'PDF-KEY-99',
      { preferredLanguage: 'si' }
    );

    // 4. sendReminderEmail (ta)
    await emailService.sendReminderEmail(
      'patient@example.com', 'செல்வி', '2026-11-15', 'Dr. Perera',
      { preferredLanguage: 'ta' }
    );

    // 5. sendDispenseNotificationEmail (si)
    await emailService.sendDispenseNotificationEmail(
      'patient@example.com', 'කමල්', 'City Pharmacy', 'Mr. Silva', 'Paracetamol 500mg', '10:30 AM',
      { preferredLanguage: 'si' }
    );

    // 6. sendRecoveryEmail (ta)
    await emailService.sendRecoveryEmail(
      'user@example.com', 'https://medisync.local/recover', 'Password Reset',
      { lang: 'ta' }
    );

    // 7. sendLoginNotificationEmail (si)
    await emailService.sendLoginNotificationEmail(
      'admin@example.com', 'අනූෂ', 'ADM-01', 'Admin', 'Firefox on Linux',
      { isp: 'SLT', country: 'Sri Lanka' }, 'Direct', null, false,
      { preferredLanguage: 'si' }
    );

    const captured = emailService.__getCapturedTestEmails();
    expect(captured.length).toBe(7);

    // Temp password (si)
    expect(captured[0].subject).toContain('ඔබගේ රෝහල් ගිණුම් ප්‍රවේශය');
    expect(captured[0].html).toContain('දැන්ම පිවිසෙන්න');

    // Welcome (ta)
    expect(captured[1].subject).toContain('MediSync தளத்திற்கு உங்களை வரவேற்கிறோம்');
    expect(captured[1].html).toContain('உங்கள் போர்ட்டலை அணுகவும்');

    // Prescription (si)
    expect(captured[2].subject).toContain('ඔබගේ ආරක්ෂිත ඊ-බෙහෙත් වට්ටෝරුව');
    expect(captured[2].html).toContain('රහස්‍ය වෛද්‍ය ලේඛනයකි');
    expect(captured[2].html).not.toContain('PDF-KEY-99');

    // Reminder (ta)
    expect(captured[3].subject).toContain('சந்திப்பு நினைவூட்டல்');
    expect(captured[3].html).toContain('2026-11-15');

    // Dispense (si)
    expect(captured[4].subject).toContain('ඔබගේ ඖෂධ නිකුත් කර ඇත');
    expect(captured[4].html).toContain('Paracetamol 500mg');

    // Recovery (ta)
    expect(captured[5].subject).toContain('கணக்கு மீட்டெடுப்பு');
    expect(captured[5].html).toContain('கணக்கை மீட்டெடுக்கவும்');

    // Login notification (si)
    expect(captured[6].subject).toContain('ආරක්ෂක අනතුරු ඇඟවීම');
    expect(captured[6].html).toContain('Firefox on Linux');

    // 8. sendLabReportAvailableEmail (si)
    await emailService.sendLabReportAvailableEmail(
      'patient-si@example.com', 'සුනිල්', 'Lipid Profile', 'https://medisync.local/portal',
      { preferredLanguage: 'si' }
    );
    // 9. sendLabReportAvailableEmail (ta)
    await emailService.sendLabReportAvailableEmail(
      'patient-ta@example.com', 'குகன்', 'Lipid Profile', 'https://medisync.local/portal',
      { preferredLanguage: 'ta' }
    );
    // 10. sendAdminReviewStatusEmail (si - approved)
    await emailService.sendAdminReviewStatusEmail(
      'doc-si@example.com', 'වෛද්‍ය ජයවර්ධන', 'Doctor', 'approved', 'SLMC අනුමතයි',
      { preferredLanguage: 'si' }
    );
    // 11. sendSupportTicketAckEmail (si)
    await emailService.sendSupportTicketAckEmail(
      'user-si@example.com', 'කමල්', 'TKT-9911', 'මුරපදය නැවත සැකසීම',
      { preferredLanguage: 'si' }
    );
    // 12. sendSecurityIncidentEmail (ta)
    await emailService.sendSecurityIncidentEmail(
      'user-ta@example.com', 'கார்த்திக்', 'அசாதாரண உள்நுழைவு முயற்சி',
      { preferredLanguage: 'ta' }
    );
    // 13. sendAnomalyEmail (si)
    await emailService.sendAnomalyEmail(
      'user-si@example.com', 'Chrome on Windows', 'Colombo',
      { preferredLanguage: 'si' }
    );
    // 14. sendDeviceRemovedEmail (ta)
    await emailService.sendDeviceRemovedEmail(
      'user-ta@example.com', 'iPhone 15',
      { preferredLanguage: 'ta' }
    );

    const extCaptured = emailService.__getCapturedTestEmails();
    expect(extCaptured.length).toBe(14);
    expect(extCaptured[7].subject).toContain('නව රසායනාගාර වාර්තාවක් නිකුත් කර ඇත');
    expect(extCaptured[8].subject).toContain('புதிய ஆய்வக அறிக்கை தயாராக உள்ளது');
    expect(extCaptured[9].subject).toContain('ගිණුම් සමාලෝචනය අනුමත කරන ලදී');
    expect(extCaptured[10].subject).toContain('ගැටළුව ලියාපදිංචි කරගන්නා ලදී');
    expect(extCaptured[11].subject).toContain('அவசரம்: MediSync பாதுகாப்பு எச்சரிக்கை');
    expect(extCaptured[12].subject).toContain('අනවසර පිවිසුම් උත්සාහයක් හඳුනා ගන්නා ලදී');
    expect(extCaptured[13].subject).toContain('நம்பகமான சாதனம் அகற்றப்பட்டது');
  });

  it('13. contextual HTML escaping sanitizes untrusted input across templates', async () => {
    emailService.__clearCapturedTestEmails();

    const maliciousName = '<script>alert("xss")</script>';
    const maliciousClinic = '<img src=x onerror="alert(1)">';
    const maliciousSubject = 'Test <iframe src="evil.com"></iframe>';
    const maliciousDetails = 'Breach: <b>Fake bold</b> & "quotes"';

    await emailService.sendPatientAccessRequestEmail(
      'victim@example.com',
      maliciousName,
      'Dr. Attacker',
      maliciousClinic
    );
    await emailService.sendSupportTicketAckEmail(
      'victim@example.com',
      'Normal User',
      'TKT-101',
      maliciousSubject
    );
    await emailService.sendSecurityIncidentEmail(
      'victim@example.com',
      'Normal User',
      maliciousDetails
    );

    const captured = emailService.__getCapturedTestEmails();
    expect(captured.length).toBe(3);

    // Template 4: Access request
    expect(captured[0].html).not.toContain('<script>');
    expect(captured[0].html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(captured[0].html).not.toContain('<img src=x');
    expect(captured[0].html).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');

    // Template 8: Support Ack
    expect(captured[1].html).not.toContain('<iframe');
    expect(captured[1].html).toContain('&lt;iframe src=&quot;evil.com&quot;&gt;&lt;/iframe&gt;');

    // Template 9: Security Incident
    expect(captured[2].html).not.toContain('<b>Fake bold</b>');
    expect(captured[2].html).toContain('&lt;b&gt;Fake bold&lt;/b&gt;');
    expect(captured[2].html).toContain('&amp; &quot;quotes&quot;');
  });

  it('14. sanitizeActionUrl neutralizes dangerous, deceptive, and protocol-relative links', () => {
    const { sanitizeActionUrl } = emailService;

    // Allowed trusted URLs and root-relative paths
    expect(sanitizeActionUrl('http://localhost:3000/verify')).toBe('http://localhost:3000/verify');
    expect(sanitizeActionUrl('https://medisync.chamodtharusha.com.lk/reset')).toBe('https://medisync.chamodtharusha.com.lk/reset');
    expect(sanitizeActionUrl('/patient/dashboard')).toBe('/patient/dashboard');

    // Dangerous / hostile inputs must fall back safely to '#'
    expect(sanitizeActionUrl('javascript:alert(1)')).toBe('#');
    expect(sanitizeActionUrl('data:text/html,<script>alert(1)</script>')).toBe('#');
    expect(sanitizeActionUrl('//evil.com/phish')).toBe('#');
    expect(sanitizeActionUrl('https://evil-attacker.com/login')).toBe('#');
    expect(sanitizeActionUrl('https://medisync.chamodtharusha.com.lk.evil.com/')).toBe('#');
    expect(sanitizeActionUrl('http://admin:secret@localhost:3000/')).toBe('#');
    expect(sanitizeActionUrl(null)).toBe('#');
    expect(sanitizeActionUrl('')).toBe('#');
  });

  it('15. verifies trilingual plain-text parity in all transactional templates', async () => {
    emailService.__clearCapturedTestEmails();

    // Sinhala access request plain-text
    await emailService.sendPatientAccessRequestEmail(
      'patient@example.com', 'සමන්', 'පෙරේරා', 'නවලෝක රෝහල', { lang: 'si' }
    );
    // Tamil access request plain-text
    await emailService.sendPatientAccessRequestEmail(
      'patient@example.com', 'குமார்', 'செல்வன்', 'யாழ்ப்பாணம் வைத்தியசாலை', { lang: 'ta' }
    );

    const captured = emailService.__getCapturedTestEmails();
    expect(captured.length).toBe(2);
    expect(captured[0].text).toContain('සායනික කාලරේඛාව වෙත ප්‍රවේශය ඉල්ලා ඇත');
    expect(captured[1].text).toContain('மருத்துவப் பதிவுகள் அணுகலைக் கோரியுள்ளார்');
  });

  it('16. verifies plain text never leaks untrusted URLs across all 12 localized template paths', async () => {
    const untrustedUrl = 'https://attacker-domain.evil/steal-credentials';
    const langs = ['en', 'si', 'ta'];

    for (const l of langs) {
      emailService.__clearCapturedTestEmails();

      // Path 1: Invitation
      await emailService.sendAccountInvitationEmail('u@test.local', 'Test User', untrustedUrl, 'doctor', '24h', { lang: l });
      // Path 2: Verification
      await emailService.sendEmailVerificationEmail('u@test.local', 'Test User', untrustedUrl, '24h', { lang: l });
      // Path 3: Password reset
      await emailService.sendPasswordResetEmail('u@test.local', 'Test User', untrustedUrl, '15m', { lang: l });
      // Path 4: Lab report available
      await emailService.sendLabReportAvailableEmail('u@test.local', 'Test User', 'Blood Test', untrustedUrl, { lang: l });

      const captured = emailService.__getCapturedTestEmails();
      expect(captured.length).toBe(4);

      for (const sent of captured) {
        expect(sent.text).not.toContain(untrustedUrl);
        expect(sent.html).not.toContain(untrustedUrl);
      }
    }
  });

  it('17. rejects malformed absolute URLs containing newline or carriage return characters', () => {
    const { validateActionUrl } = emailService;
    const maliciousNewline = 'https://medisync.chamodtharusha.com.lk/verify\n?token=steal';
    const maliciousCR = 'https://medisync.chamodtharusha.com.lk/verify\r\n?token=steal';
    const maliciousTab = 'https://medisync.chamodtharusha.com.lk/verify\t?token=steal';

    expect(validateActionUrl(maliciousNewline)).toBe('#');
    expect(validateActionUrl(maliciousCR)).toBe('#');
    expect(validateActionUrl(maliciousTab)).toBe('#');
  });

  it('18. accepts approved QA loopback origin http://127.0.0.1:3100 and http://localhost:3100', () => {
    const { validateActionUrl } = emailService;
    expect(validateActionUrl('http://127.0.0.1:3100/verify?token=qa123')).toBe('http://127.0.0.1:3100/verify?token=qa123');
    expect(validateActionUrl('http://localhost:3100/reset?token=qa456')).toBe('http://localhost:3100/reset?token=qa456');
  });

  it('19. ensures query parameters like &lang=si are not double-escaped into &amp;amp;lang=si in HTML href', async () => {
    emailService.__clearCapturedTestEmails();
    const trustedWithQuery = 'https://medisync.chamodtharusha.com.lk/verify?token=tok123&lang=si';

    await emailService.sendEmailVerificationEmail(
      'user@example.com',
      'Kamal',
      trustedWithQuery
    );

    const captured = emailService.__getCapturedTestEmails();
    expect(captured.length).toBe(1);
    const html = captured[0].html;

    // Must contain exactly single HTML escape for ampersand in attribute
    expect(html).toContain('token=tok123&amp;lang=si');
    // Must NOT contain double escaped &amp;amp;
    expect(html).not.toContain('&amp;amp;');
    // Plain text must carry unescaped query string
    expect(captured[0].text).toContain('token=tok123&lang=si');
  });
});
