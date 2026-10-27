'use strict';
// Artifact review only. No application, environment-file or provider imports.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { DISCLAIMER, MODE } = require('./publicDemoIsolation');
const MAX_FILE = 25 * 1024 * 1024, MAX_TOTAL = 100 * 1024 * 1024, MAX_FILES = 2048;
const ROOT_FILES = new Set(['index.html', 'favicon.ico', 'manifest.json', 'asset-manifest.json', 'robots.txt', 'logo192.png', 'logo512.png']);
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function validateName(file) {
  if (typeof file !== 'string' || file.length > 240 || !/^[a-zA-Z0-9_./-]+$/.test(file) ||
      file.split('/').some(part => !part || part === '.' || part === '..' || part.startsWith('.')) ||
      (!ROOT_FILES.has(file) && !/^static\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+(?:\.(?:js|css|png|jpe?g|gif|webp|ico|woff2?|ttf)|\.(?:js|css)\.LICENSE\.txt)$/.test(file))) {
    throw new Error('PUBLIC_DEMO_ASSET_NAME_REJECTED');
  }
}

function inspectText(file, bytes) {
  if (!/\.(?:js|css|json|html|txt)$/.test(file)) return;
  const text = bytes.toString('utf8');
  // Bundled CSS must not delegate loading to another stylesheet. In particular,
  // a clean HTML head does not prove that Google Fonts imports were removed.
  if (/\.css$/.test(file)) {
    if (/@import\b/i.test(text)) throw new Error('PUBLIC_DEMO_CSS_IMPORT_REJECTED');
    for (const match of text.matchAll(/\burl\s*\(\s*(["']?)([^)]*?)\1\s*\)/gi)) {
      const resource = match[2].trim();
      if (!/^(?:\/(?!\/)|#|data:image\/(?:png|jpeg|gif|webp);base64,)/i.test(resource) || /[\\\u0000-\u0020\u007f]/.test(resource)) throw new Error('PUBLIC_DEMO_CSS_RESOURCE_REJECTED');
    }
  }
  if (/medisync\.chamodtharusha\.com\.lk|\.onrender\.com|\.vercel\.app|p7hjket\.mongodb\.net|mongodb(?:\+srv)?:|(?:localhost|127\.0\.0\.1):510[01]|sourceMappingURL/i.test(text) ||
      /\b(?:AKIA[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{30,}|re_[A-Za-z0-9]{24,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/.test(text) ||
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) {
    throw new Error('PUBLIC_DEMO_RESTRICTED_ASSET_CONTENT');
  }
  if (file === 'index.html') {
    const body = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(text.replace(/<!--[\s\S]*?-->/g, ''))?.[1] || '';
    const bodyText = body.replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)\s*>/gi, '').replace(/<[^>]*>/g, '');
    if (!bodyText.includes(DISCLAIMER) || !/<meta\s+name=["']medisync-mode["']\s+content=["']university-static-demo["']\s*\/?>/i.test(text)) {
      throw new Error('PUBLIC_DEMO_VISIBLE_MARKER_REQUIRED');
    }
    if (/<(?:base|iframe|object|embed)\b|\son[a-z]+\s*=|javascript:|<meta[^>]+http-equiv/i.test(text)) throw new Error('PUBLIC_DEMO_HTML_REJECTED');
    for (const match of text.matchAll(/\b(?:src|href|action)\s*=\s*["']([^"']*)["']/gi)) {
      if (!/^(?:\/(?!\/)|#)/.test(match[1])) throw new Error('PUBLIC_DEMO_EXTERNAL_HTML_RESOURCE');
    }
    for (const match of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
      if (match[2].trim() || !/\bsrc\s*=\s*["']\/static\//i.test(match[1])) throw new Error('PUBLIC_DEMO_INLINE_SCRIPT_REJECTED');
    }
  }
}

function readArtifact(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('PUBLIC_DEMO_ABSOLUTE_ROOT_REQUIRED');
  const directory = path.resolve(root);
  if (fs.lstatSync(directory).isSymbolicLink() || fs.realpathSync(directory) !== directory || !fs.statSync(directory).isDirectory()) throw new Error('PUBLIC_DEMO_ROOT_REJECTED');
  const files = [], assets = new Map(); let total = 0;
  function walk(folder, prefix = '') {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = prefix + entry.name, absolute = path.join(folder, entry.name), stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error('PUBLIC_DEMO_LINK_REJECTED');
      if (stat.isDirectory()) {
        if (!(file === 'static' || /^static\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+$/.test(file))) throw new Error('PUBLIC_DEMO_DIRECTORY_REJECTED');
        walk(absolute, file + '/'); continue;
      }
      validateName(file);
      if (!stat.isFile() || stat.nlink !== 1 || stat.size > MAX_FILE || files.length >= MAX_FILES || (total += stat.size) > MAX_TOTAL) throw new Error('PUBLIC_DEMO_ARTIFACT_LIMIT');
      const bytes = fs.readFileSync(absolute);
      if (bytes.length !== stat.size) throw new Error('PUBLIC_DEMO_ARTIFACT_CHANGED');
      inspectText(file, bytes);
      assets.set('/' + file, bytes); files.push({ file, bytes: bytes.length, sha256: sha(bytes) });
    }
  }
  walk(directory);
  if (!assets.has('/index.html')) throw new Error('PUBLIC_DEMO_INDEX_REQUIRED');
  files.sort((a, b) => a.file.localeCompare(b.file, 'en'));
  return { files, assets };
}

function reviewArtifact(root) {
  const { files } = readArtifact(root);
  // This is an integrity/content filter, not a PII or rendered-UX certificate.
  return { schema: 1, mode: MODE, disclaimer: DISCLAIMER, files, clinicalAccess: false, renderedReview: 'NOT_RUN', syntheticContentReview: 'REQUIRES_INDEPENDENT_REVIEW' };
}

function verifiedAssets(root, manifest) {
  if (!manifest || manifest.schema !== 1 || manifest.mode !== MODE || manifest.disclaimer !== DISCLAIMER || manifest.clinicalAccess !== false || !Array.isArray(manifest.files)) throw new Error('PUBLIC_DEMO_MANIFEST_INVALID');
  const { files, assets } = readArtifact(root);
  if (manifest.files.length !== files.length || manifest.files.some((row, index) =>
    !row || row.file !== files[index].file || row.bytes !== files[index].bytes || row.sha256 !== files[index].sha256)) throw new Error('PUBLIC_DEMO_MANIFEST_MISMATCH');
  return assets;
}

module.exports = { reviewArtifact, verifiedAssets };
