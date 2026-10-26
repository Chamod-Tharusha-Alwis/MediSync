'use strict';

const { isTargetAllowed, redactUri } = require('../scripts/bootstrapSyntheticAccounts');

describe('Bootstrap Synthetic Accounts Safety & Policy', () => {
  test('isTargetAllowed strictly accepts allowlisted targets and rejects forbidden ones', () => {
    // Approved production Option B with exact cluster host
    expect(isTargetAllowed('medisync.p7hjket.mongodb.net', 'medisync_prod')).toBe(true);

    // Bare host or wrong prefix rejected
    expect(isTargetAllowed('p7hjket.mongodb.net', 'medisync_prod')).toBe(false);
    expect(isTargetAllowed('cluster0.p7hjket.mongodb.net', 'medisync_prod')).toBe(false);

    // Approved QA
    expect(isTargetAllowed('qa-project-medisync.gwprp27.mongodb.net', 'medisync_automated_test')).toBe(true);

    // Strictly forbidden "test" database
    expect(isTargetAllowed('p7hjket.mongodb.net', 'test')).toBe(false);
    expect(isTargetAllowed('localhost', 'test')).toBe(false);

    // Forbidden databases on production cluster
    expect(isTargetAllowed('p7hjket.mongodb.net', 'admin')).toBe(false);
    expect(isTargetAllowed('p7hjket.mongodb.net', 'medisync_staging')).toBe(false);

    // Unknown hosts
    expect(isTargetAllowed('attacker.mongodb.net', 'medisync_prod')).toBe(false);
    expect(isTargetAllowed('localhost', 'medisync_prod')).toBe(false);
  });

  test('redactUri safely extracts host and database without leaking credentials', () => {
    const raw = 'mongodb+srv://secretUser:superSecretPassword123@p7hjket.mongodb.net/medisync_prod?retryWrites=true&w=majority';
    const redacted = redactUri(raw);
    expect(redacted.host).toBe('p7hjket.mongodb.net');
    expect(redacted.database).toBe('medisync_prod');
    expect(JSON.stringify(redacted)).not.toContain('secretUser');
    expect(JSON.stringify(redacted)).not.toContain('superSecretPassword123');
  });

  test('bootstrapSyntheticData refuses execution if target is not allowlisted', async () => {
    const { bootstrapSyntheticData } = require('../scripts/bootstrapSyntheticAccounts');
    await expect(bootstrapSyntheticData({
      uri: 'mongodb+srv://u:p@p7hjket.mongodb.net/test',
      isApply: false
    })).rejects.toThrow(/not in the allowlist/i);
  });

  test('bootstrapSyntheticData in apply mode fails closed if passwords are missing', async () => {
    const { bootstrapSyntheticData } = require('../scripts/bootstrapSyntheticAccounts');
    await expect(bootstrapSyntheticData({
      uri: 'mongodb+srv://u:p@medisync.p7hjket.mongodb.net/medisync_prod',
      isApply: true,
      passwords: {},
      skipConnection: true
    })).rejects.toThrow(/Missing required password environment variables/i);
  });

  test('validateSyntheticEmail accepts valid synthetic domain and strictly refuses .local and .internal', () => {
    const { validateSyntheticEmail } = require('../scripts/bootstrapSyntheticAccounts');
    expect(validateSyntheticEmail('admin.synth@medisync.synthetic', 'admin')).toBe('admin.synth@medisync.synthetic');
    expect(validateSyntheticEmail('doctor.synth@example.com', 'doctor')).toBe('doctor.synth@example.com');

    expect(() => validateSyntheticEmail('admin.synth@medisync.local', 'admin')).toThrow(/forbidden "\.local"/i);
    expect(() => validateSyntheticEmail('user@test.internal', 'patient')).toThrow(/forbidden "\.local"/i);
    expect(() => validateSyntheticEmail('', 'admin')).toThrow(/Invalid email address/i);
  });

  test('bootstrapSyntheticData fails closed if .local email is provided', async () => {
    const { bootstrapSyntheticData } = require('../scripts/bootstrapSyntheticAccounts');
    await expect(bootstrapSyntheticData({
      uri: 'mongodb+srv://u:p@medisync.p7hjket.mongodb.net/medisync_prod',
      isApply: false,
      emails: { admin: 'forbidden@domain.local' }
    })).rejects.toThrow(/forbidden "\.local"/i);
  });
});
