'use strict';

const fs = require('fs');
const path = require('path');

describe('S4 — Stop logging login notification details, device models, roles and result objects', () => {
  const authControllerPath = path.resolve(__dirname, '../src/controllers/authController.js');
  const pharmacyControllerPath = path.resolve(__dirname, '../src/controllers/pharmacyController.js');

  const authCode = fs.readFileSync(authControllerPath, 'utf8');
  const pharmacyCode = fs.readFileSync(pharmacyControllerPath, 'utf8');

  test('authController does not use console.log, console.warn or console.error for login notifications', () => {
    // Neither login nor verifyLoginOTP should use console.log or console.error for login notifications
    expect(authCode).not.toMatch(/console\.(log|warn|error)\([^)]*AUTH LOGIN NOTIFICATION/);
    expect(authCode).not.toMatch(/console\.(log|warn|error)\([^)]*AUTH LOGIN OTP NOTIFICATION/);
    expect(authCode).not.toMatch(/console\.(log|warn|error)\([^)]*AUTH LOGIN NOTIFICATION RESULT/);
    expect(authCode).not.toMatch(/console\.(log|warn|error)\([^)]*AUTH LOGIN OTP NOTIFICATION RESULT/);
  });

  test('authController uses debug-level logging without personal data or device models for login notifications', () => {
    const debugMatches = authCode.match(/console\.debug\([^)]*LOGIN (OTP )?NOTIFICATION[^)]*\)/g) || [];
    expect(debugMatches.length).toBeGreaterThanOrEqual(4);

    for (const statement of debugMatches) {
      // Must not contain personal data, roles, device models or result objects
      expect(statement).not.toContain('${actualRole}');
      expect(statement).not.toContain('${deviceModel}');
      expect(statement).not.toContain('${isTrusted}');
      expect(statement).not.toContain('resNotification');
      expect(statement).not.toContain('emailToSend');
      expect(statement).not.toContain('idField');
    }
  });

  test('pharmacyController does not use console.log, console.warn or console.error for pharmacy login notifications', () => {
    expect(pharmacyCode).not.toMatch(/console\.(log|warn|error)\([^)]*AUTH LOGIN NOTIFICATION/);
    expect(pharmacyCode).not.toMatch(/console\.(log|warn|error)\([^)]*AUTH LOGIN NOTIFICATION RESULT/);
  });

  test('pharmacyController uses debug-level logging without personal data or device models for pharmacy login notifications', () => {
    const debugMatches = pharmacyCode.match(/console\.debug\([^)]*Pharmacy login notification[^)]*\)/g) || [];
    expect(debugMatches.length).toBeGreaterThanOrEqual(2);

    for (const statement of debugMatches) {
      expect(statement).not.toContain('${staff.role}');
      expect(statement).not.toContain('${parsedModel}');
      expect(statement).not.toContain('${isTrusted}');
      expect(statement).not.toContain('resNotification');
      expect(statement).not.toContain('staff.email');
      expect(statement).not.toContain('staff.fullName');
    }
  });

  test('all login notification debug logs use fixed, unparameterized informational messages', () => {
    const allNotificationLogs = [
      ...((authCode.match(/console\.debug\(\s*['"][^'"]*LOGIN[^'"]*['"]\s*\)/g)) || []),
      ...((pharmacyCode.match(/console\.debug\(\s*['"][^'"]*Pharmacy login notification[^'"]*['"]\s*\)/g)) || [])
    ];

    expect(allNotificationLogs.length).toBeGreaterThanOrEqual(6);
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    const nicRegex = /\b(\d{9}[vVxX]|\d{12})\b/;

    for (const logCall of allNotificationLogs) {
      expect(logCall).not.toMatch(emailRegex);
      expect(logCall).not.toMatch(nicRegex);
      expect(logCall).not.toContain('Role:');
      expect(logCall).not.toContain('Device:');
    }
  });
});
