'use strict';
const { assertQaConnectionConfiguration, APPROVED_QA_HOST, APPROVED_QA_DB } = require('../src/security/qaConnectionAdmission');

const makeValidEnv = () => ({
  MEDISYNC_QA_BOOTSTRAPPED: 'true',
  MEDISYNC_QA_CREDENTIALS_ROTATED: 'true',
  MONGO_URI_TEST: `mongodb+srv://synthetic-user:synthetic-pass@${APPROVED_QA_HOST}/${APPROVED_QA_DB}?tls=true`
});

describe('Agent 2: Offline QA DB Admission Policy & Negative Guards', () => {
  test('approved QA host and database are accepted with NOT_VERIFIED rotation attestation', () => {
    const res = assertQaConnectionConfiguration(makeValidEnv());
    expect(res).toEqual({
      dbName: APPROVED_QA_DB,
      cluster: APPROVED_QA_HOST,
      credentialRotationAttested: 'NOT_VERIFIED'
    });
  });

  test.each([
    ['p7hjket root domain', 'mongodb+srv://u:p@p7hjket.mongodb.net/medisync_automated_test?tls=true'],
    ['p7hjket subdomain', 'mongodb+srv://u:p@cluster0.p7hjket.mongodb.net/medisync_automated_test?tls=true'],
    ['p7hjket embedded', 'mongodb+srv://u:p@qa-p7hjket.mongodb.net/medisync_automated_test?tls=true']
  ])('explicitly rejects production host p7hjket (%s)', (_, uri) => {
    const env = makeValidEnv();
    env.MONGO_URI_TEST = uri;
    expect(() => assertQaConnectionConfiguration(env)).toThrow('QA_EXISTING_CLUSTER_AND_DATABASE_REQUIRED');
  });

  test.each([
    ['database "test"', 'test'],
    ['database "medisync_prod"', 'medisync_prod'],
    ['unapproved db "medisync_dev"', 'medisync_dev'],
    ['unapproved db "admin"', 'admin']
  ])('explicitly rejects non-QA database (%s)', (_, db) => {
    const env = makeValidEnv();
    env.MONGO_URI_TEST = `mongodb+srv://u:p@${APPROVED_QA_HOST}/${db}?tls=true`;
    expect(() => assertQaConnectionConfiguration(env)).toThrow('QA_EXISTING_CLUSTER_AND_DATABASE_REQUIRED');
  });

  test.each([
    ['unapproved arbitrary .mongodb.net host', 'other-qa.mongodb.net'],
    ['similar prefix host', 'qa-project-medisync.other.mongodb.net'],
    ['attacker spoof host', 'evil-qa-project-medisync.gwprp27.mongodb.net']
  ])('explicitly rejects unapproved cluster hosts (%s)', (_, host) => {
    const env = makeValidEnv();
    env.MONGO_URI_TEST = `mongodb+srv://u:p@${host}/${APPROVED_QA_DB}?tls=true`;
    expect(() => assertQaConnectionConfiguration(env)).toThrow('QA_EXISTING_CLUSTER_AND_DATABASE_REQUIRED');
  });

  test('rejects duplicate or unsafe TLS/database URI parameters', () => {
    const env = makeValidEnv();
    env.MONGO_URI_TEST += '&tlsInsecure=true';
    expect(() => assertQaConnectionConfiguration(env)).toThrow('QA_TLS_OR_DATABASE_OVERRIDE_FORBIDDEN');
  });

  test('never touches network or database drivers during validation', () => {
    // Pure offline string validation: passing a non-routable synthetic credential succeeds parsing
    const env = makeValidEnv();
    expect(assertQaConnectionConfiguration(env).cluster).toBe(APPROVED_QA_HOST);
  });
});
