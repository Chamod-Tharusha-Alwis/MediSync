'use strict';
const crypto = require('crypto');
const unavailable = '[KEYRING] metadata unavailable';

// Logging only: this neither selects keys nor alters admission/encryption mode.
function formatKeyringDiagnostic(keys, activeVersion) {
  try {
    if (!keys || typeof keys !== 'object' || Array.isArray(keys) ||
        !['string', 'number'].includes(typeof activeVersion)) return unavailable;
    const versions = Object.keys(keys);
    const active = String(activeVersion).trim();
    if (!versions.length || versions.length > 32 ||
        versions.some(version => !/^[1-9][0-9]{0,5}$/.test(version)) ||
        !versions.includes(active)) return unavailable;
    versions.sort((a, b) => Number(a) - Number(b));
    const fingerprints = [];
    for (const version of versions) {
      const descriptor = Object.getOwnPropertyDescriptor(keys, version);
      if (!descriptor || !Object.hasOwn(descriptor, 'value') ||
          typeof descriptor.value !== 'string' || !descriptor.value.length ||
          descriptor.value.length > 4096) return unavailable;
      // Hash the raw UTF-8 key string exactly; no trimming or hex/base64 decoding.
      const fingerprint = crypto.createHash('sha256').update(descriptor.value).digest('hex').slice(0, 8);
      fingerprints.push(`${version}:${fingerprint}`);
    }
    return `[KEYRING] versions=[${versions.join(',')}] active=${active} fp={${fingerprints.join(',')}}`;
  } catch (_) { return unavailable; }
}

function reportKeyring(keys, activeVersion, logger = console.log) {
  const line = formatKeyringDiagnostic(keys, activeVersion);
  try { logger(line); } catch (_) { /* Diagnostic failure must not break boot. */ }
  return line;
}

module.exports = { formatKeyringDiagnostic, reportKeyring };
