async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Common Android model codes lookup table
const modelLookup = {
  // Samsung Galaxy S24 series
  'SM-S921B': 'Samsung Galaxy S24',
  'SM-S921U': 'Samsung Galaxy S24',
  'SM-S926B': 'Samsung Galaxy S24+',
  'SM-S928B': 'Samsung Galaxy S24 Ultra',
  'SM-S928U': 'Samsung Galaxy S24 Ultra',
  // Samsung Galaxy S23 series
  'SM-S911B': 'Samsung Galaxy S23',
  'SM-S916B': 'Samsung Galaxy S23+',
  'SM-S918B': 'Samsung Galaxy S23 Ultra',
  // Google Pixel
  'Pixel 8 Pro': 'Google Pixel 8 Pro',
  'Pixel 8': 'Google Pixel 8',
  'Pixel 7a': 'Google Pixel 7a',
  'Pixel 7 Pro': 'Google Pixel 7 Pro',
  'Pixel 7': 'Google Pixel 7'
};

// Extract real hardware model if on modern Chromium (primarily Android)
export async function getHardwareModel() {
  if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
    try {
      const values = await navigator.userAgentData.getHighEntropyValues(['model']);
      if (values.model) {
        const rawModel = values.model;
        const mappedModel = modelLookup[rawModel] || rawModel;
        console.log(`[DeviceTracker] Hardware model detected: ${rawModel} -> ${mappedModel}`);
        return mappedModel;
      }
    } catch (e) {
      console.warn('[DeviceTracker] Failed to get high entropy hardware model', e);
    }
  }
  return null;
}

let cachedFingerprint = null;

export async function getDeviceFingerprint() {
  if (cachedFingerprint) return cachedFingerprint;
  
  const stored = localStorage.getItem('medisync_device_fp');
  if (stored) {
    cachedFingerprint = stored;
    return stored;
  }

  const hardwareModel = await getHardwareModel();

  const components = [
    navigator.userAgent,
    hardwareModel || 'unknown',
    `${window.screen.width}x${window.screen.height}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language,
    navigator.platform
  ].join('|');

  const fp = await hashString(components);
  cachedFingerprint = fp;
  localStorage.setItem('medisync_device_fp', fp);
  return fp;
}

