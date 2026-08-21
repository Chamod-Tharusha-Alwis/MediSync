async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Common Android model codes lookup table
const modelLookup = {
  // Samsung Galaxy A Series
  'SM-A536B': 'Samsung Galaxy A53 5G',
  'SM-A536E': 'Samsung Galaxy A53 5G',
  'SM-A536U': 'Samsung Galaxy A53 5G',
  'SM-A546B': 'Samsung Galaxy A54 5G',
  'SM-A546E': 'Samsung Galaxy A54 5G',
  'SM-A546U': 'Samsung Galaxy A54 5G',
  'SM-A556B': 'Samsung Galaxy A55 5G',
  'SM-A556E': 'Samsung Galaxy A55 5G',
  'SM-A346E': 'Samsung Galaxy A34 5G',
  'SM-A356E': 'Samsung Galaxy A35 5G',
  'SM-A145F': 'Samsung Galaxy A14',
  'SM-A146P': 'Samsung Galaxy A14 5G',
  'SM-A155F': 'Samsung Galaxy A15',
  'SM-A156B': 'Samsung Galaxy A15 5G',
  'SM-A235F': 'Samsung Galaxy A23',
  'SM-A245F': 'Samsung Galaxy A24',
  'SM-A336B': 'Samsung Galaxy A33 5G',
  'SM-A528B': 'Samsung Galaxy A52s 5G',
  'SM-A525F': 'Samsung Galaxy A52',
  'SM-A736B': 'Samsung Galaxy A73 5G',
  
  // Samsung Galaxy S Series
  'SM-S921B': 'Samsung Galaxy S24',
  'SM-S921U': 'Samsung Galaxy S24',
  'SM-S926B': 'Samsung Galaxy S24+',
  'SM-S926U': 'Samsung Galaxy S24+',
  'SM-S928B': 'Samsung Galaxy S24 Ultra',
  'SM-S928U': 'Samsung Galaxy S24 Ultra',
  'SM-S911B': 'Samsung Galaxy S23',
  'SM-S911U': 'Samsung Galaxy S23',
  'SM-S916B': 'Samsung Galaxy S23+',
  'SM-S918B': 'Samsung Galaxy S23 Ultra',
  'SM-S918U': 'Samsung Galaxy S23 Ultra',
  'SM-S901B': 'Samsung Galaxy S22',
  'SM-S906B': 'Samsung Galaxy S22+',
  'SM-S908B': 'Samsung Galaxy S22 Ultra',
  'SM-G991B': 'Samsung Galaxy S21',
  'SM-G996B': 'Samsung Galaxy S21+',
  'SM-G998B': 'Samsung Galaxy S21 Ultra',
  
  // Samsung Galaxy Z Series
  'SM-F946B': 'Samsung Galaxy Z Fold5',
  'SM-F731B': 'Samsung Galaxy Z Flip5',
  'SM-F956B': 'Samsung Galaxy Z Fold6',
  'SM-F741B': 'Samsung Galaxy Z Flip6',
  
  // Google Pixel
  'Pixel 9 Pro': 'Google Pixel 9 Pro',
  'Pixel 9': 'Google Pixel 9',
  'Pixel 8 Pro': 'Google Pixel 8 Pro',
  'Pixel 8': 'Google Pixel 8',
  'Pixel 8a': 'Google Pixel 8a',
  'Pixel 7 Pro': 'Google Pixel 7 Pro',
  'Pixel 7': 'Google Pixel 7',
  'Pixel 7a': 'Google Pixel 7a',
  'Pixel 6 Pro': 'Google Pixel 6 Pro',
  'Pixel 6': 'Google Pixel 6',
  'Pixel 6a': 'Google Pixel 6a'
};

// Extract real hardware model if on modern Chromium (primarily Android)
export async function getHardwareModel() {
  if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
    try {
      const values = await navigator.userAgentData.getHighEntropyValues(['model', 'platform', 'platformVersion']);
      if (values.model) {
        const rawModel = values.model.replace(/["']/g, '').trim();
        if (rawModel && rawModel !== 'K' && rawModel !== 'wv') {
          const mappedModel = modelLookup[rawModel] || (rawModel.startsWith('SM-') ? `Samsung ${rawModel.slice(3)}` : rawModel);
          return mappedModel;
        }
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
