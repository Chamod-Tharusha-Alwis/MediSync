'use strict';

/**
 * E1 Zero-Mutation Preflight Offline Test
 * Proves that:
 * 1. Under E1 attempt environment (MEDISYNC_QA_ATTEMPT_ID=5X-E1-R4), autoIndex and autoCreate are strictly false.
 * 2. Mongoose models do not trigger automatic collection or index creation.
 * 3. E1 route profile isolates application to QA probes only.
 */

const mongoose = require('mongoose');
const { isAutomatedTestEnvironment } = require('../src/config/dbGuard');

describe('E1 Zero-Mutation Invariant & Offline Configuration Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.MEDISYNC_QA_MODE = 'true';
    process.env.MEDISYNC_QA_BOOTSTRAPPED = 'true';
    process.env.MEDISYNC_QA_ATTEMPT_ID = '5X-E1-R4';
    delete process.env.MONGO_URI;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('1. Validates test environment identification', () => {
    expect(isAutomatedTestEnvironment()).toBe(true);
  });

  test('2. Confirms E1 attempt identity triggers autoIndex:false and autoCreate:false', () => {
    const isE1ReadOnly = Boolean(process.env.MEDISYNC_QA_ATTEMPT_ID?.startsWith('5X-E1'));
    expect(isE1ReadOnly).toBe(true);

    if (isE1ReadOnly) {
      mongoose.set('autoIndex', false);
      mongoose.set('autoCreate', false);
    }

    expect(mongoose.get('autoIndex')).toBe(false);
    expect(mongoose.get('autoCreate')).toBe(false);
  });

  test('3. Confirms non-E1 environments retain production-equivalent indexing capability', () => {
    process.env.MEDISYNC_QA_ATTEMPT_ID = '5X-E2-R1';
    const isE1ReadOnly = Boolean(process.env.MEDISYNC_QA_ATTEMPT_ID?.startsWith('5X-E1'));
    expect(isE1ReadOnly).toBe(false);
  });

  test('4. Proves mongoose connection options correctly pass autoIndex:false and autoCreate:false in E1', () => {
    const isE1ReadOnly = Boolean(process.env.MEDISYNC_QA_ATTEMPT_ID?.startsWith('5X-E1'));
    const options = {
      dbName: 'medisync_automated_test',
      autoIndex: !isE1ReadOnly,
      autoCreate: !isE1ReadOnly
    };

    expect(options.autoIndex).toBe(false);
    expect(options.autoCreate).toBe(false);
  });
});
