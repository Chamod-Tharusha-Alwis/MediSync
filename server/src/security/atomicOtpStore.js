'use strict';
// Redis executes this compare-and-delete as one operation across server processes.
const CONSUME_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if not current or current ~= ARGV[1] then return 0 end
if redis.call('PTTL', KEYS[1]) <= 0 then return 0 end
local rawAttempts = redis.call('GET', KEYS[2])
local attempts = tonumber(rawAttempts or '0')
if not attempts or attempts < 0 or attempts ~= math.floor(attempts) or attempts >= 5 then return 0 end
if rawAttempts and tostring(attempts) ~= rawAttempts then return 0 end
redis.call('DEL', KEYS[1], KEYS[2], KEYS[3])
return 1
`;
const INCREMENT_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
local prior = tonumber(raw or '0')
if not prior or prior < 0 or prior >= 9007199254740991 or prior ~= math.floor(prior) or (raw and tostring(prior) ~= raw) then
  return redis.error_reply('SECURITY_STORE_UNAVAILABLE')
end
local count = redis.call('INCR', KEYS[1])
if redis.call('PTTL', KEYS[1]) < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return count
`;
function parseAttemptCount(value) {
  if (value === null) return 0;
  if ((typeof value !== 'number' && (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,15})$/.test(value))) || !Number.isSafeInteger(Number(value)) || Number(value) < 0) throw new Error('SECURITY_STORE_UNAVAILABLE');
  return Number(value);
}
function createAtomicOtpStore({ evaluate, memory, allowMemory = false, now = Date.now }) {
  return {
    async consume(key, expected) {
      if (typeof key !== 'string' || !key.length || key.length > 512 || !expected || !Number.isFinite(new Date(expected.expiresAt).getTime()) || new Date(expected.expiresAt).getTime() <= now()) return false;
      const keys = ['medisync:otp:' + key, 'medisync:otp-attempts:' + key, 'medisync:otp-cooldown:' + key];
      const proof = JSON.stringify(expected);
      if (evaluate) {
        try { return await evaluate(CONSUME_SCRIPT, { keys, arguments: [proof] }) === 1; }
        catch (_) { throw new Error('SECURITY_STORE_UNAVAILABLE'); }
      }
      if (!allowMemory || !memory) throw new Error('SECURITY_STORE_UNAVAILABLE');
      // Synchronous critical section; test/development only, not multi-process storage.
      const entry = memory.get(keys[0]), attempts = memory.get(keys[1]);
      if (!entry || !Number.isFinite(entry.expiresAt) || entry.expiresAt <= now() || JSON.stringify(entry.data) !== proof) return false;
      if (attempts) {
        if (!Number.isFinite(attempts.expiresAt) || attempts.data === null) return false;
        if (attempts.expiresAt > now()) { try { if (parseAttemptCount(attempts.data) >= 5) return false; } catch (_) { return false; } }
      }
      for (const name of keys) memory.delete(name);
      return true;
    }
  };
}
module.exports = { createAtomicOtpStore, parseAttemptCount, CONSUME_SCRIPT, INCREMENT_SCRIPT };
