function parseDeviceModel(ua) {
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
  // Samsung model codes (e.g. SM-S938B = S25 Ultra, SM-A546E = A54)
  const samsungMatch = ua.match(/SM-([A-Z0-9]{3,6}[A-Z]?)/i);
  if (samsungMatch) return `Samsung ${samsungMatch[1]}`;

  // Google Pixel (e.g. "Pixel 9 Pro")
  const pixelMatch = ua.match(/Pixel\s?([\d]+[a-zA-Z\s]*(?:Pro|XL)?)/i);
  if (pixelMatch) return `Google Pixel ${pixelMatch[1].trim()}`;

  // OnePlus (e.g. "OnePlus 12", "ONEPLUS A6013")
  const oneplusMatch = ua.match(/(?:OnePlus|ONEPLUS)\s?([A-Z0-9\s]+?)(?:\s*Build|\s*\))/i);
  if (oneplusMatch) return `OnePlus ${oneplusMatch[1].trim()}`;

  // Xiaomi / Redmi / POCO
  const xiaomiMatch = ua.match(/((?:Redmi|POCO|Mi|Xiaomi)\s?[A-Z0-9\s]+?)(?:\s*Build|\s*\))/i);
  if (xiaomiMatch) return xiaomiMatch[1].trim();

  // Huawei (e.g. "HUAWEI P60 Pro")
  const huaweiMatch = ua.match(/(?:HUAWEI|HONOR)\s?([A-Z0-9\s]+?)(?:\s*Build|\s*\))/i);
  if (huaweiMatch) return `Huawei ${huaweiMatch[1].trim()}`;

  // Generic Android: try to extract model from "Build/" pattern
  const androidMatch = ua.match(/Android\s([\d.]+)/);
  if (androidMatch) {
    // Standard format: "... ; MODEL_NAME Build/..."
    const modelMatch = ua.match(/;\s*([^;)]+?)\s*Build\//);
    if (modelMatch) {
      const model = modelMatch[1].trim();
      // Skip generic/empty model strings
      if (model && model !== 'wv' && model.length > 1) {
        return model;
      }
    }
    // No model info available — return generic label, not the OS version
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

module.exports = { parseDeviceModel };
