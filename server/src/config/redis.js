/**
 * Redis OTP Store — Enterprise-grade OTP persistence
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
        }
      }
    });

    redisClient.on('error', (err) => {
      if (redisAvailable) {
        console.warn('[Redis] Connection lost — falling back to in-memory store:', err.message);
        redisAvailable = false;
      }
    });

    redisClient.on('connect', () => {
      console.log('[Redis] Connected successfully.');
      redisAvailable = true;
    });

    await redisClient.connect();
    redisAvailable = true;
  } catch (err) {
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

/**
 * Store an OTP with a TTL (time-to-live) in seconds.
 * @param {string} key    — unique key (e.g., NIC hash, doctorId)
 * @param {object} data   — OTP payload (e.g., { otp, expiresAt } or { otp, labTestId, expiresAt })
 * @param {number} ttlSec — TTL in seconds (default: 600 = 10 minutes)
 */
async function setOtp(key, data, ttlSec = 600) {
  const fullKey = OTP_PREFIX + key;

  if (redisAvailable && redisClient) {
    try {
      await redisClient.setEx(fullKey, ttlSec, JSON.stringify(data));
      return;
    } catch (err) {
      console.warn('[Redis] setOtp failed, falling back to memory:', err.message);
    }
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
      console.warn('[Redis] getOtp failed, falling back to memory:', err.message);
    }
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
 */
async function deleteOtp(key) {
  const fullKey = OTP_PREFIX + key;

  if (redisAvailable && redisClient) {
    try {
      await redisClient.del(fullKey);
      return;
    } catch (err) {
      console.warn('[Redis] deleteOtp failed, falling back to memory:', err.message);
    }
  }

  // In-memory fallback
  memoryStore.delete(fullKey);
}

module.exports = {
  initRedis,
  setOtp,
  getOtp,
  deleteOtp,
  // Exposed for testing
  _memoryStore: memoryStore,
  isRedisAvailable: () => redisAvailable,
};
