/**
 * Redis OTP Store — Enterprise-grade OTP persistence & throttling
 *
 * Replaces in-memory JS `Map` objects with Redis SETEX/GET/DEL commands
 * so that OTPs survive server restarts and scale across multiple instances.
 *
 * Graceful fallback: If Redis is not available (e.g., local dev without Docker),
 * falls back to an in-memory Map with console warnings.
 *
 * Required .env variable (optional — falls back if not set):
 *   REDIS_URL=redis://127.0.0.1:6379
 */

let redisClient = null;
let redisAvailable = false;

// In-memory fallback store
const memoryStore = new Map();

/**
 * Initialize Redis connection (called once at app startup).
 * Non-blocking — never throws. Sets `redisAvailable` flag.
 */
async function initRedis() {
  try {
    const redis = require('redis');
    const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

    redisClient = redis.createClient({
      url,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 3) return new Error('Max retries reached');
          return 1000;
        },
      },
    });

    redisClient.on('error', (err) => {
      if (redisAvailable) {
        if (process.env.NODE_ENV === 'production' && process.env.SINGLE_INSTANCE_DEV_MODE !== 'true') {
          console.error('FATAL: [Redis] Connection lost in production:', err.message);
          process.exit(1);
        } else {
          console.warn('[Redis] Connection lost — falling back to in-memory store:', err.message);
          redisAvailable = false;
        }
      }
    });

    redisClient.on('connect', () => {
      console.log('[Redis] Connected successfully.');
      redisAvailable = true;
    });

    await redisClient.connect();
    redisAvailable = true;
  } catch (err) {
    if (process.env.NODE_ENV === 'production' && process.env.SINGLE_INSTANCE_DEV_MODE !== 'true') {
      console.error('FATAL: [Redis] Connection failed in production environment:', err.message);
      process.exit(1);
    }
    console.warn('');
    console.warn('╔══════════════════════════════════════════════════════════════╗');
    console.warn('║  ⚠️  [Redis] Not available — using in-memory OTP store.      ║');
    console.warn('║     OTPs will NOT survive server restarts.                  ║');
    console.warn('║     Install Redis for production: docker run -p 6379:6379 redis ║');
    console.warn('╚══════════════════════════════════════════════════════════════╝');
    console.warn('');
    console.warn('[Redis] Error:', err.message);
    redisAvailable = false;
  }
}

// ── OTP Helpers ─────────────────────────────────────────────────────────────

const OTP_PREFIX = 'medisync:otp:';
const COOLDOWN_PREFIX = 'medisync:otp-cooldown:';

/**
 * Store an OTP with a TTL (time-to-live) in seconds.
 * Security Note (Phase 4B.1E Task 3):
 * Do NOT clear `medisync:otp-attempts:<key>` when issuing a new OTP so that
 * attackers cannot bypass the 5-attempt brute-force lockout by repeatedly
 * requesting fresh OTPs. Failed attempt counters are only cleared when a valid
 * OTP is verified and consumed (or after the lockout window expires).
 *
 * @param {string} key    — unique key (e.g., NIC hash, doctorId, patientId:reportId)
 * @param {object} data   — OTP payload
 * @param {number} ttlSec — TTL in seconds (default: 600 = 10 minutes)
 */
async function setOtp(key, data, ttlSec = 600) {
  const fullKey = OTP_PREFIX + key;

  if (redisAvailable && redisClient) {
    try {
      await redisClient.setEx(fullKey, ttlSec, JSON.stringify(data));
      return;
    } catch (err) {
      if (process.env.NODE_ENV === 'production' && process.env.SINGLE_INSTANCE_DEV_MODE !== 'true') {
        throw new Error(`[Redis] setOtp failed in production: ${err.message}`);
      }
      console.warn('[Redis] setOtp failed, falling back to memory:', err.message);
    }
  } else if (process.env.NODE_ENV === 'production' && process.env.SINGLE_INSTANCE_DEV_MODE !== 'true') {
    throw new Error('[Redis] setOtp failed in production: Redis not available');
  }

  // In-memory fallback
  memoryStore.set(fullKey, { data, expiresAt: Date.now() + ttlSec * 1000 });
}

/**
 * Retrieve an OTP by key.
 * @param {string} key — unique key
 * @returns {object|null} — the stored data, or null if expired/missing
 */
async function getOtp(key) {
  const fullKey = OTP_PREFIX + key;

  if (redisAvailable && redisClient) {
    try {
      const raw = await redisClient.get(fullKey);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      if (process.env.NODE_ENV === 'production' && process.env.SINGLE_INSTANCE_DEV_MODE !== 'true') {
        throw new Error(`[Redis] getOtp failed in production: ${err.message}`);
      }
      console.warn('[Redis] getOtp failed, falling back to memory:', err.message);
    }
  } else if (process.env.NODE_ENV === 'production' && process.env.SINGLE_INSTANCE_DEV_MODE !== 'true') {
    throw new Error('[Redis] getOtp failed in production: Redis not available');
  }

  // In-memory fallback
  const entry = memoryStore.get(fullKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryStore.delete(fullKey);
    return null;
  }
  return entry.data;
}

/**
 * Delete (consume) an OTP.
 * @param {string} key — unique key
 * @param {object} [options]
 * @param {boolean} [options.clearAttempts=true] — whether to clear failed attempt counters (true on valid consumption, false on expiry/rollback)
 */
async function deleteOtp(key, options = {}) {
  const shouldClearAttempts = options.clearAttempts !== false;
  const fullKey = OTP_PREFIX + key;
  const attemptsKey = 'medisync:otp-attempts:' + key;
  const cooldownKey = COOLDOWN_PREFIX + key;

  if (redisAvailable && redisClient) {
    try {
      await redisClient.del(fullKey);
      await redisClient.del(cooldownKey);
      if (shouldClearAttempts) {
        await redisClient.del(attemptsKey);
      }
      return;
    } catch (err) {
      if (process.env.NODE_ENV === 'production' && process.env.SINGLE_INSTANCE_DEV_MODE !== 'true') {
        throw new Error(`[Redis] deleteOtp failed in production: ${err.message}`);
      }
      console.warn('[Redis] deleteOtp failed, falling back to memory:', err.message);
    }
  } else if (process.env.NODE_ENV === 'production' && process.env.SINGLE_INSTANCE_DEV_MODE !== 'true') {
    throw new Error('[Redis] deleteOtp failed in production: Redis not available');
  }

  // In-memory fallback
  memoryStore.delete(fullKey);
  memoryStore.delete(cooldownKey);
  if (shouldClearAttempts) {
    memoryStore.delete(attemptsKey);
  }
}

/**
 * Clear failed verification attempts and active resend cooldown explicitly (called after valid OTP verification).
 */
async function clearAttempts(key) {
  const fullKey = 'medisync:otp-attempts:' + key;
  const cooldownKey = COOLDOWN_PREFIX + key;
  const reqAcctKey = 'medisync:otp-attempts:req-acct:' + key;
  if (redisAvailable && redisClient) {
    try {
      await redisClient.del(fullKey);
      await redisClient.del(cooldownKey);
      await redisClient.del(reqAcctKey);
    } catch (err) {
      console.warn('[Redis] clearAttempts failed:', err.message);
    }
  }
  memoryStore.delete(fullKey);
  memoryStore.delete(cooldownKey);
  memoryStore.delete(reqAcctKey);
}

/**
 * Increment failed attempts counter with a TTL.
 */
async function incrementAttempts(key, ttlSec = 900) {
  const fullKey = 'medisync:otp-attempts:' + key;
  if (redisAvailable && redisClient) {
    try {
      const current = await redisClient.incr(fullKey);
      if (current === 1) await redisClient.expire(fullKey, ttlSec);
      return current;
    } catch (err) {
      console.warn('[Redis] incrementAttempts failed:', err.message);
    }
  }
  const existing = memoryStore.get(fullKey);
  if (!existing || Date.now() > existing.expiresAt) {
    const fresh = { data: 1, expiresAt: Date.now() + ttlSec * 1000 };
    memoryStore.set(fullKey, fresh);
    return 1;
  }
  existing.data += 1;
  memoryStore.set(fullKey, existing);
  return existing.data;
}

/**
 * Get current failed attempts.
 */
async function getAttempts(key) {
  const fullKey = 'medisync:otp-attempts:' + key;
  if (redisAvailable && redisClient) {
    try {
      const raw = await redisClient.get(fullKey);
      return raw ? parseInt(raw, 10) : 0;
    } catch (err) {
      console.warn('[Redis] getAttempts failed:', err.message);
    }
  }
  const entry = memoryStore.get(fullKey);
  if (!entry) return 0;
  if (Date.now() > entry.expiresAt) {
    memoryStore.delete(fullKey);
    return 0;
  }
  return entry.data;
}

/**
 * Normalize arguments for checkOtpRequestThrottle and recordOtpRequestSent.
 * Supports both:
 *   checkOtpRequestThrottle(accountKey, ipKey, options)
 * and:
 *   checkOtpRequestThrottle({ accountKey, ipKey, attemptKey, cooldownSeconds, maxPerAccount, maxPerIp })
 */
function normalizeThrottleArgs(arg1, arg2, arg3 = {}) {
  if (arg1 && typeof arg1 === 'object') {
    return {
      accountKey: arg1.accountKey || null,
      ipKey: arg1.ipKey || null,
      attemptKey: arg1.attemptKey || arg1.accountKey || null,
      cooldownSeconds: arg1.cooldownSeconds !== undefined ? arg1.cooldownSeconds : 60,
      maxPerAccount: arg1.maxPerAccount !== undefined ? arg1.maxPerAccount : 5,
      maxPerIp: arg1.maxPerIp !== undefined ? arg1.maxPerIp : 15,
      windowSeconds: arg1.windowSeconds !== undefined ? arg1.windowSeconds : 900,
    };
  }
  const opts = arg3 && typeof arg3 === 'object' ? arg3 : {};
  return {
    accountKey: arg1 || null,
    ipKey: arg2 || null,
    attemptKey: opts.attemptKey || arg1 || null,
    cooldownSeconds: opts.cooldownSeconds !== undefined ? opts.cooldownSeconds : 60,
    maxPerAccount: opts.maxPerAccount !== undefined ? opts.maxPerAccount : 5,
    maxPerIp: opts.maxPerIp !== undefined ? opts.maxPerIp : 15,
    windowSeconds: opts.windowSeconds !== undefined ? opts.windowSeconds : 900,
  };
}

/**
 * Check OTP request throttling:
 * 1. Blocks OTP generation if the target key is already locked out due to >= 5 failed verification attempts.
 * 2. Enforces resend cooldown (default 60s) between OTP requests for the same accountKey.
 * 3. Enforces per-account OTP request limit (default 5 per 15 minutes).
 * 4. Enforces per-IP OTP request limit (default 15 per 15 minutes).
 */
async function checkOtpRequestThrottle(arg1, arg2, arg3) {
  const {
    accountKey,
    ipKey,
    attemptKey,
    cooldownSeconds,
    maxPerAccount,
    maxPerIp,
  } = normalizeThrottleArgs(arg1, arg2, arg3);

  // Always enforce cumulative failed-verification lockout even in test mode
  if (attemptKey) {
    const failedAttempts = await getAttempts(attemptKey);
    if (failedAttempts >= 5) {
      return {
        allowed: false,
        status: 429,
        statusCode: 429,
        reason: 'otp_attempts_locked',
        retryAfterSeconds: 900,
        message: 'Too many failed OTP verification attempts. Please wait before requesting a new OTP.',
      };
    }
  }

  const enforceRateLimits =
    process.env.NODE_ENV !== 'test' || process.env.ENFORCE_OTP_THROTTLE === 'true';

  if (!enforceRateLimits) {
    return { allowed: true };
  }

  if (accountKey && cooldownSeconds > 0) {
    const cooldownFullKey = COOLDOWN_PREFIX + accountKey;
    let cooldownExpiresAt = null;

    if (redisAvailable && redisClient) {
      try {
        const ttl = await redisClient.ttl(cooldownFullKey);
        if (ttl > 0) {
          cooldownExpiresAt = Date.now() + ttl * 1000;
        }
      } catch (err) {
        console.warn('[Redis] cooldown ttl check failed:', err.message);
      }
    } else {
      const entry = memoryStore.get(cooldownFullKey);
      if (entry && Date.now() < entry.expiresAt) {
        cooldownExpiresAt = entry.expiresAt;
      } else if (entry) {
        memoryStore.delete(cooldownFullKey);
      }
    }

    if (cooldownExpiresAt) {
      const retryAfterSeconds = Math.max(1, Math.ceil((cooldownExpiresAt - Date.now()) / 1000));
      return {
        allowed: false,
        status: 429,
        statusCode: 429,
        reason: 'otp_resend_cooldown',
        retryAfterSeconds,
        message: `Please wait ${retryAfterSeconds} seconds before requesting another OTP code.`,
      };
    }
  }

  if (accountKey && maxPerAccount > 0) {
    const acctReqCount = await getAttempts('req-acct:' + accountKey);
    if (acctReqCount >= maxPerAccount) {
      return {
        allowed: false,
        status: 429,
        statusCode: 429,
        reason: 'otp_account_rate_limit',
        retryAfterSeconds: 900,
        message: 'Too many OTP requests for this account. Please wait before trying again.',
      };
    }
  }

  if (ipKey && maxPerIp > 0) {
    const cleanIp = String(ipKey).trim();
    const ipReqCount = await getAttempts('req-ip:' + cleanIp);
    if (ipReqCount >= maxPerIp) {
      return {
        allowed: false,
        status: 429,
        statusCode: 429,
        reason: 'otp_ip_rate_limit',
        retryAfterSeconds: 900,
        message: 'Too many OTP requests from this network address. Please wait before trying again.',
      };
    }
  }

  return { allowed: true };
}

/**
 * Record a successfully provider-accepted OTP request for cooldown & window rate-limiting.
 * Call ONLY after at least one email provider accepts the OTP dispatch.
 */
async function recordOtpRequestSent(arg1, arg2, arg3) {
  const {
    accountKey,
    ipKey,
    cooldownSeconds,
    windowSeconds,
  } = normalizeThrottleArgs(arg1, arg2, arg3);

  const enforceRateLimits =
    process.env.NODE_ENV !== 'test' || process.env.ENFORCE_OTP_THROTTLE === 'true';

  if (!enforceRateLimits) return;

  if (accountKey) {
    const cooldownFullKey = COOLDOWN_PREFIX + accountKey;
    if (cooldownSeconds > 0) {
      if (redisAvailable && redisClient) {
        try {
          await redisClient.setEx(cooldownFullKey, cooldownSeconds, '1');
        } catch (err) {
          console.warn('[Redis] set cooldown failed:', err.message);
        }
      } else {
        memoryStore.set(cooldownFullKey, {
          data: '1',
          expiresAt: Date.now() + cooldownSeconds * 1000,
        });
      }
    }
    await incrementAttempts('req-acct:' + accountKey, windowSeconds);
  }

  if (ipKey) {
    const cleanIp = String(ipKey).trim();
    await incrementAttempts('req-ip:' + cleanIp, windowSeconds);
  }
}

/**
 * Generic Cache Setter
 */
async function setCache(key, data, ttlSec = 300) {
  if (redisAvailable && redisClient) {
    try {
      await redisClient.setEx(key, ttlSec, JSON.stringify(data));
      return;
    } catch (err) {
      console.warn('[Redis] setCache failed, falling back to memory:', err.message);
    }
  }
  memoryStore.set(key, { data, expiresAt: Date.now() + ttlSec * 1000 });
}

/**
 * Generic Cache Getter
 */
async function getCache(key) {
  if (redisAvailable && redisClient) {
    try {
      const raw = await redisClient.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.warn('[Redis] getCache failed, falling back to memory:', err.message);
    }
  }
  const entry = memoryStore.get(fullKeyFromCache(key));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return entry.data;
}

function fullKeyFromCache(key) {
  return key;
}

const EMAIL_QUOTA_PREFIX = 'medisync:email-quota:';

function getUtcDateKey(provider = 'brevo') {
  const day = new Date().toISOString().slice(0, 10);
  return `${EMAIL_QUOTA_PREFIX}${provider}:${day}`;
}

/**
 * Get today's immediate-send count for an email provider (UTC day).
 */
async function getDailyEmailCount(provider = 'brevo') {
  const fullKey = getUtcDateKey(provider);
  if (redisAvailable && redisClient) {
    try {
      const raw = await redisClient.get(fullKey);
      return raw ? parseInt(raw, 10) : 0;
    } catch (err) {
      console.warn('[Redis] getDailyEmailCount failed:', err.message);
    }
  }
  const entry = memoryStore.get(fullKey);
  if (!entry) return 0;
  if (Date.now() > entry.expiresAt) {
    memoryStore.delete(fullKey);
    return 0;
  }
  return entry.data;
}

/**
 * Increment today's immediate-send count for an email provider (TTL: 24h).
 */
async function incrementDailyEmailCount(provider = 'brevo', ttlSec = 86400) {
  const fullKey = getUtcDateKey(provider);
  if (redisAvailable && redisClient) {
    try {
      const current = await redisClient.incr(fullKey);
      if (current === 1) await redisClient.expire(fullKey, ttlSec);
      return current;
    } catch (err) {
      console.warn('[Redis] incrementDailyEmailCount failed:', err.message);
    }
  }
  const existing = memoryStore.get(fullKey);
  if (!existing || Date.now() > existing.expiresAt) {
    const fresh = { data: 1, expiresAt: Date.now() + ttlSec * 1000 };
    memoryStore.set(fullKey, fresh);
    return 1;
  }
  existing.data += 1;
  memoryStore.set(fullKey, existing);
  return existing.data;
}

/**
 * Atomically reserve 1 slot in today's immediate-send allowance before making an outbound HTTP call.
 * Prevents concurrent race conditions when multiple requests arrive near the 300/day boundary.
 * Returns { reserved: boolean, count: number, persistentRedis: boolean }.
 */
async function reserveDailyEmailSlot(provider = 'brevo', maxDaily = 300, ttlSec = 86400) {
  const fullKey = getUtcDateKey(provider);
  const limit = Number(maxDaily);

  if (redisAvailable && redisClient) {
    try {
      const current = await redisClient.incr(fullKey);
      if (current === 1) {
        await redisClient.expire(fullKey, ttlSec);
      }
      if (limit > 0 && current > limit) {
        await redisClient.decr(fullKey);
        return { reserved: false, count: current - 1, persistentRedis: true };
      }
      return { reserved: true, count: current, persistentRedis: true };
    } catch (err) {
      console.warn('[Redis] reserveDailyEmailSlot failed, falling back to memory:', err.message);
    }
  }

  // Synchronous in-memory reservation (single-threaded Node.js event loop guarantees atomicity before first await)
  const now = Date.now();
  const existing = memoryStore.get(fullKey);
  if (!existing || now > existing.expiresAt) {
    if (limit > 0 && 1 > limit) {
      return { reserved: false, count: 0, persistentRedis: false };
    }
    const fresh = { data: 1, expiresAt: now + ttlSec * 1000 };
    memoryStore.set(fullKey, fresh);
    return { reserved: true, count: 1, persistentRedis: false };
  }

  if (limit > 0 && existing.data >= limit) {
    return { reserved: false, count: existing.data, persistentRedis: false };
  }

  existing.data += 1;
  memoryStore.set(fullKey, existing);
  return { reserved: true, count: existing.data, persistentRedis: false };
}

/**
 * Release 1 previously reserved daily email slot when an outbound provider request fails
 * without the provider accepting or queuing the message.
 */
async function releaseDailyEmailSlot(provider = 'brevo') {
  const fullKey = getUtcDateKey(provider);
  if (redisAvailable && redisClient) {
    try {
      const updated = await redisClient.decr(fullKey);
      if (updated < 0) {
        await redisClient.set(fullKey, '0');
        return 0;
      }
      return updated;
    } catch (err) {
      console.warn('[Redis] releaseDailyEmailSlot failed:', err.message);
    }
  }

  const existing = memoryStore.get(fullKey);
  if (!existing || Date.now() > existing.expiresAt) {
    return 0;
  }
  existing.data = Math.max(0, existing.data - 1);
  memoryStore.set(fullKey, existing);
  return existing.data;
}

/**
 * Reset or seed today's email count (used in deterministic tests or header/API quota sync).
 */
async function setDailyEmailCount(provider = 'brevo', count = 0, ttlSec = 86400) {
  const fullKey = getUtcDateKey(provider);
  if (redisAvailable && redisClient) {
    try {
      if (count <= 0) {
        await redisClient.del(fullKey);
      } else {
        await redisClient.setEx(fullKey, ttlSec, String(count));
      }
    } catch (err) {
      console.warn('[Redis] setDailyEmailCount failed:', err.message);
    }
  }
  if (count <= 0) {
    memoryStore.delete(fullKey);
  } else {
    memoryStore.set(fullKey, { data: Number(count), expiresAt: Date.now() + ttlSec * 1000 });
  }
}

function isUsingPersistentRedis() {
  return Boolean(redisAvailable && redisClient);
}

module.exports = {
  initRedis,
  setOtp,
  getOtp,
  deleteOtp,
  clearAttempts,
  incrementAttempts,
  getAttempts,
  checkOtpRequestThrottle,
  recordOtpRequestSent,
  getDailyEmailCount,
  incrementDailyEmailCount,
  reserveDailyEmailSlot,
  releaseDailyEmailSlot,
  setDailyEmailCount,
  isUsingPersistentRedis,
  setCache,
  getCache,
};
