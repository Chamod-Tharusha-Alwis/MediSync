'use strict';
const { createAtomicOtpStore, CONSUME_SCRIPT, INCREMENT_SCRIPT } = require('../src/security/atomicOtpStore');
const key = 'synthetic:patient:report';
const record = () => ({ otp: '123456', purpose: 'patient-lab-download', patientId: 'owned-patient', testObjectId: 'owned-report', expiresAt: Date.now() + 60000 });
test('inert Redis adapter receives exact compare/TTL/attempt/delete Lua and has one winner across clients', async () => {
  const payload = record(); let raw = JSON.stringify(payload);
  const evaluate = jest.fn(async (script, options) => {
    expect(script).toBe(CONSUME_SCRIPT); expect(script).toContain("redis.call('PTTL'"); expect(script).toContain('attempts >= 5'); expect(options.keys).toHaveLength(3);
    if (raw !== options.arguments[0]) return 0; raw = null; return 1;
  });
  const first = createAtomicOtpStore({ evaluate }), second = createAtomicOtpStore({ evaluate });
  expect((await Promise.all([first.consume(key, payload), second.consume(key, payload)])).sort()).toEqual([false, true]);
});
test('memory proof cannot consume a replacement OTP or bypass lockout', async () => {
  const payload = record(), memory = new Map([['medisync:otp:' + key, { data: payload, expiresAt: payload.expiresAt }]]);
  const store = createAtomicOtpStore({ memory, allowMemory: true });
  expect(await store.consume(key, { ...payload, otp: '654321' })).toBe(false);
  memory.set('medisync:otp-attempts:' + key, { data: 5, expiresAt: payload.expiresAt });
  expect(await store.consume(key, payload)).toBe(false); expect(memory.has('medisync:otp:' + key)).toBe(true);
});
test.each([null, {}, { expiresAt: 'invalid' }, { expiresAt: new Date(0) }])('malformed/expired evidence is denied %#', async proof => {
  const evaluate = jest.fn(); expect(await createAtomicOtpStore({ evaluate }).consume(key, proof)).toBe(false); expect(evaluate).not.toHaveBeenCalled();
});
test('Redis outage never falls through to a second memory store', async () => {
  const memory = new Map(), store = createAtomicOtpStore({ evaluate: async () => { throw new Error('private service details'); }, memory, allowMemory: true });
  await expect(store.consume(key, record())).rejects.toThrow(/^SECURITY_STORE_UNAVAILABLE$/); expect(memory.size).toBe(0);
});
test('production consume and startup reject the development override without a live Redis service', async () => {
  const old = process.env.NODE_ENV; process.env.NODE_ENV = 'production'; process.env.SINGLE_INSTANCE_DEV_MODE = 'true';
  try {
    const redis = require('../src/config/redis'); await expect(redis.consumeOtp(key, record())).rejects.toThrow('SECURITY_STORE_UNAVAILABLE');
    const fs = require('fs'), path = require('path'), vm = require('vm'), module = { exports: {} };
    const createClient = jest.fn(() => { throw new Error('synthetic startup failure'); });
    vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/config/redis.js'), 'utf8'), { module, exports: module.exports, Map, process: { env: { NODE_ENV: 'production', SINGLE_INSTANCE_DEV_MODE: 'true', REDIS_URL: 'rediss://:synthetic-only@remote.example.invalid' } }, console: { warn() {}, error() {}, log() {} }, require: name => { if (name === '../security/redisConnectionPolicy') return require('../src/security/redisConnectionPolicy'); if (name === 'redis') return { createClient }; throw new Error('Unexpected dependency'); } });
    await expect(module.exports.initRedis()).rejects.toThrow('SECURITY_STORE_UNAVAILABLE');
    expect(createClient).toHaveBeenCalledTimes(1);
  }
  finally { process.env.NODE_ENV = old; delete process.env.SINGLE_INSTANCE_DEV_MODE; }
  expect(INCREMENT_SCRIPT).toContain("redis.call('PEXPIRE'");
});

test('actual Redis initializer denies invalid production configuration before loading the client', async () => {
  const fs = require('fs'), path = require('path'), vm = require('vm'), module = { exports: {} }, clientLoad = jest.fn();
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/config/redis.js'), 'utf8'), { module, Map, process: { env: { NODE_ENV: 'production', REDIS_URL: 'redis://remote.example.invalid' } }, console: { warn() {}, error() {}, log() {} }, require: name => {
    if (name === '../security/redisConnectionPolicy') return require('../src/security/redisConnectionPolicy'); clientLoad(); throw new Error('Client must not load');
  } });
  await expect(module.exports.initRedis()).rejects.toThrow('SECURITY_STORE_UNAVAILABLE'); expect(clientLoad).not.toHaveBeenCalled();
});

test('development Redis startup never logs credential-bearing provider errors', async () => {
  const fs = require('fs'), path = require('path'), vm = require('vm'), module = { exports: {} }, warnings = [];
  const privateError = 'redis://synthetic-user:synthetic-private-password@127.0.0.1:6379';
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/config/redis.js'), 'utf8'), { module, Map,
    process: { env: { NODE_ENV: 'development' } }, console: { warn: (...args) => warnings.push(args), error() {}, log() {} },
    require: name => {
      if (name === '../security/redisConnectionPolicy') return require('../src/security/redisConnectionPolicy');
      if (name === 'redis') return { createClient() { throw new Error(privateError); } };
      throw new Error('UNEXPECTED_REDIS_DEPENDENCY');
    }
  });
  await module.exports.initRedis(); expect(warnings.length).toBeGreaterThan(0); expect(JSON.stringify(warnings)).not.toContain('synthetic-private-password');
  expect(JSON.stringify(warnings)).not.toContain(privateError);
});

test.each([-1, 1.5, NaN, Infinity, '1.5', '1junk', '-1', '00', ' 1', '', false, {}, undefined, null])('corrupt active memory attempt counter %j cannot release an OTP', async value => {
  const payload = record(), memory = new Map([['medisync:otp:' + key, { data: payload, expiresAt: payload.expiresAt }], ['medisync:otp-attempts:' + key, { data: value, expiresAt: payload.expiresAt }]]);
  expect(await createAtomicOtpStore({ memory, allowMemory: true }).consume(key, payload)).toBe(false);
  expect(memory.has('medisync:otp:' + key)).toBe(true);
});
async function redisHarness(raw, increment) {
  const fs = require('fs'), path = require('path'), vm = require('vm'), module = { exports: {} };
  const client = { on() {}, connect: async () => {}, get: async () => raw, eval: async () => increment };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/config/redis.js'), 'utf8'), { module, Map,
    process: { env: { NODE_ENV: 'production', REDIS_URL: 'rediss://:synthetic-only@redis.example.invalid' } }, console: { warn() {}, error() {}, log() {} },
    require: name => { if (name === '../security/redisConnectionPolicy') return require('../src/security/redisConnectionPolicy'); if (name === '../security/atomicOtpStore') return require('../src/security/atomicOtpStore'); if (name === 'redis') return { createClient: () => client }; throw new Error('UNEXPECTED_REDIS_DEPENDENCY'); }
  });
  await module.exports.initRedis(); return module.exports;
}
test.each(['1junk', '1.5', '-1', '', '00', ' 1', '9007199254740992', undefined])('actual Redis getAttempts denies malformed counter %j instead of parseInt/NaN fail-open', async raw => {
  await expect((await redisHarness(raw)).getAttempts('synthetic-only')).rejects.toThrow(/^SECURITY_STORE_UNAVAILABLE$/);
});
test.each([null, '0', '1', '5', '9007199254740991'])('actual Redis getAttempts accepts canonical missing/whole counter %j', async raw => {
  expect(await (await redisHarness(raw)).getAttempts('synthetic-only')).toBe(raw === null ? 0 : Number(raw));
});
test.each([0, -1, 1.5, '1junk', undefined])('actual Redis increment response %j fails closed without fallback', async response => {
  const redis = await redisHarness(null, response); await expect(redis.incrementAttempts('synthetic-only')).rejects.toThrow(/^SECURITY_STORE_UNAVAILABLE$/);
});
test('actual Redis increment accepts one canonical server result', async () => {
  expect(await (await redisHarness(null, 1)).incrementAttempts('synthetic-only')).toBe(1);
});
test.each(['otp', 'attempts'])('corrupt %s expiry cannot consume a memory proof', async variant => {
  const payload = record(), memory = new Map([['medisync:otp:' + key, { data: payload, expiresAt: variant === 'otp' ? NaN : payload.expiresAt }], ['medisync:otp-attempts:' + key, { data: 0, expiresAt: variant === 'attempts' ? NaN : payload.expiresAt }]]);
  expect(await createAtomicOtpStore({ memory, allowMemory: true }).consume(key, payload)).toBe(false);
  expect(memory.has('medisync:otp:' + key)).toBe(true);
});
