function parseDeviceModel(ua) {
  if (!ua) return 'Unknown Device';

  // Mobile devices
  const iphoneMatch = ua.match(/iPhone(?:\s?OS)?\s?([\d_]+)?/);
  if (iphoneMatch) {
    const ver = (iphoneMatch[1] || '').replace(/_/g, '.');
    return ver ? `iPhone (iOS ${ver})` : 'iPhone';
  }

  const ipadMatch = ua.match(/iPad/);
  if (ipadMatch) return 'iPad';

  const samsungMatch = ua.match(/SM-([A-Z]\d{3,4}[A-Z]?)/);
  if (samsungMatch) return `Samsung ${samsungMatch[1]}`;

  const pixelMatch = ua.match(/Pixel\s?(\d[a-zA-Z]?)/);
  if (pixelMatch) return `Google Pixel ${pixelMatch[1]}`;

  const androidMatch = ua.match(/Android\s([\d.]+)/);
  if (androidMatch) {
    const modelMatch = ua.match(/;\s*([^;)]+)\s*Build/);
    if (modelMatch) return modelMatch[1].trim();
    return `Android ${androidMatch[1]}`;
  }

  // Desktop browsers
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
