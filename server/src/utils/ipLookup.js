const axios = require('axios');

// Simple in-memory cache: { '192.168.1.1': { networkInfo: {...}, expiresAt: 123456789 } }
const ipCache = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Resolves an IP address to structured network info using ip-api.com.
 * Implements a 10-minute in-memory cache to prevent rate-limiting.
 * 
 * @param {string} ip - The IP address to lookup
 * @returns {Promise<Object>} The resolved network info object
 */
async function resolveLocation(ip) {
  const defaultInfo = { isp: 'Unknown ISP', country: 'Unknown Country', city: 'Unknown', region: 'Unknown' };
  
  if (!ip || ip === '127.0.0.1' || ip === '::1') return defaultInfo;

  const now = Date.now();
  
  // Clean up expired cache entries randomly to prevent memory leak
  if (Math.random() < 0.05) {
    for (const [key, val] of ipCache.entries()) {
      if (val.expiresAt < now) ipCache.delete(key);
    }
  }

  // Check Cache
  const cached = ipCache.get(ip);
  if (cached && cached.expiresAt > now) {
    return cached.networkInfo;
  }

  try {
    const { data } = await axios.get(`http://ip-api.com/json/${ip}?fields=status,message,country,regionName,city,isp`, {
      timeout: 3000 // fail fast if API is unreachable
    });

    let networkInfo = { ...defaultInfo };
    if (data && data.status === 'success') {
      networkInfo = {
        isp: data.isp || 'Unknown ISP',
        country: data.country || 'Unknown Country',
        city: data.city || 'Unknown',
        region: data.regionName || 'Unknown'
      };
    }

    // Cache the result
    ipCache.set(ip, {
      networkInfo,
      expiresAt: now + CACHE_TTL_MS
    });

    return networkInfo;
  } catch (error) {
    console.error(`IP lookup failed for ${ip}:`, error.message);
    return defaultInfo;
  }
}

module.exports = { resolveLocation };
