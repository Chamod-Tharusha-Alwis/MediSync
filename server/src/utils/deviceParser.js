// Model codes dictionary for accurate hardware translation
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

function formatModelCode(raw) {
  if (!raw) return null;
  const clean = raw.replace(/["']/g, '').trim();
  if (!clean || clean === 'K' || clean === 'wv' || clean === 'null' || clean === 'undefined') return null;

  if (modelLookup[clean]) return modelLookup[clean];
  if (clean.startsWith('SM-')) return `Samsung ${clean.slice(3)}`;
  return clean;
}

function parseDeviceModel(ua, clientHintModel) {
  // If Client Hint / Hardware Model was passed directly (from sec-ch-ua-model or X-Hardware-Model), prioritize it
  if (clientHintModel) {
    const formatted = formatModelCode(clientHintModel);
    if (formatted) return formatted;
  }

  if (!ua) return 'Unknown Device';

  // ── Apple devices ──────────────────────────────────────────────────────
  const iphoneMatch = ua.match(/iPhone(?:\s?OS)?\s?([\d_]+)?/);
  if (iphoneMatch) {
    const ver = (iphoneMatch[1] || '').replace(/_/g, '.');
    return ver ? `iPhone (iOS ${ver})` : 'iPhone';
  }

  const ipadMatch = ua.match(/iPad/);
  if (ipadMatch) return 'iPad';

  // ── Android devices — extract hardware model FIRST ─────────────────────
  // Samsung model codes (e.g. SM-S938B, SM-A536E, SM-A546E)
  const samsungMatch = ua.match(/SM-([A-Z0-9]{3,6}[A-Z]?)/i);
  if (samsungMatch) {
    const fullCode = `SM-${samsungMatch[1].toUpperCase()}`;
    return modelLookup[fullCode] || `Samsung ${samsungMatch[1]}`;
  }

  // Google Pixel (e.g. "Pixel 9 Pro", "Pixel 7")
  const pixelMatch = ua.match(/Pixel\s?([\d]+[a-zA-Z\s]*(?:Pro|XL|a)?)/i);
  if (pixelMatch) return `Google Pixel ${pixelMatch[1].trim()}`;

  // OnePlus
  const oneplusMatch = ua.match(/(?:OnePlus|ONEPLUS)\s?([A-Z0-9\s]+?)(?:\s*Build|\s*\))/i);
  if (oneplusMatch) return `OnePlus ${oneplusMatch[1].trim()}`;

  // Xiaomi / Redmi / POCO
  const xiaomiMatch = ua.match(/((?:Redmi|POCO|Mi|Xiaomi)\s?[A-Z0-9\s]+?)(?:\s*Build|\s*\))/i);
  if (xiaomiMatch) return xiaomiMatch[1].trim();

  // Huawei / Honor
  const huaweiMatch = ua.match(/(?:HUAWEI|HONOR)\s?([A-Z0-9\s]+?)(?:\s*Build|\s*\))/i);
  if (huaweiMatch) return `Huawei ${huaweiMatch[1].trim()}`;

  // Generic Android: try to extract model from "Build/" pattern or parenthesis end
  const androidMatch = ua.match(/Android\s([\d.]+)/);
  if (androidMatch) {
    // 1. Try to find "Build/" token
    const buildMatch = ua.match(/;\s*([^;)]+?)\s*Build\//i);
    if (buildMatch) {
      const model = formatModelCode(buildMatch[1]);
      if (model && model.toLowerCase() !== 'linux') return model;
    }
    
    // 2. Try the token right after "Android XX;"
    const parenMatch = ua.match(/Android\s[\d.]+(?:;\s*\w{2}-\w{2})?;\s*([^;)]+?)\)/i);
    if (parenMatch) {
      const model = formatModelCode(parenMatch[1]);
      if (model && model.toLowerCase() !== 'linux') return model;
    }

    return 'Android device';
  }

  // ── Desktop browsers ──────────────────────────────────────────────────
  const isWindows = ua.includes('Windows');
  const isMac = ua.includes('Macintosh') || ua.includes('Mac OS');
  const isLinux = ua.includes('Linux') && !ua.includes('Android');

  let os = 'Desktop';
  if (isWindows) os = 'Windows';
  else if (isMac) os = 'Mac';
  else if (isLinux) os = 'Linux';

  let browser = '';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/') && !ua.includes('Chromium')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('OPR/') || ua.includes('Opera')) browser = 'Opera';

  return browser ? `${os} — ${browser}` : `${os} Desktop`;
}

module.exports = { parseDeviceModel, modelLookup };
