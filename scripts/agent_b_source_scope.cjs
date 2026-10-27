'use strict';
// Shared pure snapshot classification. No filesystem/environment access.
function isSnapshotInput(file) {
  if (typeof file !== 'string' || !file || /(?:^|\/)\.env(?:\.|$)|^(?:scratch|research|medisync-qa-evidence|docs|Python)\/|\.(?:png|jpe?g|pdf|pem|key|zip)$/i.test(file)) return false;
  return /\.(?:js|jsx|cjs|mjs|json|py|ya?ml|css|html)$/.test(file) || /(?:^|\/)(?:Dockerfile(?:\.[A-Za-z0-9_-]+)?|\.dockerignore|\.node-version|\.nvmrc)$/.test(file);
}
module.exports = { isSnapshotInput };
