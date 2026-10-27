'use strict';
// Offline source-copy review only. Never runs Docker, npm, application or provider code.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const parser = require('@babel/parser');
const minimatchModule = require('minimatch');
const matches = minimatchModule.minimatch || minimatchModule;
const serverRoot = path.resolve(__dirname, '..');
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function contextAllows(file, text) {
  let included = true;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || line.startsWith('#')) continue;
    const allow = line.startsWith('!'), pattern = (allow ? line.slice(1) : line).replace(/\/$/, '');
    if (!pattern || /[\\\[\]{}]/.test(pattern)) throw new Error('RUNTIME_CONTEXT_PATTERN_UNREVIEWED');
    if (matches(file, pattern, { dot: true }) || (!pattern.includes('*') && file.startsWith(pattern + '/'))) included = allow;
  }
  return included;
}
function reviewClinicalRuntime({ dockerfile = fs.readFileSync(path.join(serverRoot, 'Dockerfile'), 'utf8'), ignoreText = fs.readFileSync(path.join(serverRoot, '.dockerignore'), 'utf8'), overrides = {} } = {}) {
  const lines = dockerfile.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  const copies = [], prefixes = new Set(), externalImports = new Set(), dynamicImports = [], guardedUnavailableImports = [];
  let runtimeUser = null, production = false, command = null;
  for (const line of lines) {
    if (/^USER\s/i.test(line)) { runtimeUser = line.slice(5).trim(); continue; }
    if (/^ENV\s+NODE_ENV=/i.test(line)) production = line === 'ENV NODE_ENV=production';
    if (/^CMD\s/i.test(line)) { try { command = JSON.parse(line.slice(4)); } catch (_) { throw new Error('RUNTIME_COMMAND_INVALID'); } }
    if (/^(?:ADD|ENTRYPOINT)\s/i.test(line)) throw new Error('RUNTIME_UNREVIEWED_COPY_OR_ENTRY');
    if (!/^COPY\s/i.test(line)) continue;
    if (runtimeUser && runtimeUser !== 'root' && runtimeUser !== '0') throw new Error('RUNTIME_COPY_AFTER_USER');
    const pieces = line.split(/\s+/).slice(1);
    if (pieces.some(piece => piece.startsWith('--'))) throw new Error('RUNTIME_COPY_OWNERSHIP_OR_FLAG_UNREVIEWED');
    if (pieces.length !== 2) throw new Error('RUNTIME_COPY_INVALID');
    const [source, destination] = pieces;
    if (source === 'package*.json' && destination === './') prefixes.add('packages');
    else if (source === 'src/' && destination === './src/') prefixes.add('src');
    else if (source === 'reference-data/' && destination === './reference-data/') prefixes.add('references');
    else if (source === 'scripts/previewSyntheticOutbreakScenarios.js' && destination === './scripts/previewSyntheticOutbreakScenarios.js') prefixes.add('preview');
    else throw new Error('RUNTIME_COPY_SCOPE_FORBIDDEN');
    copies.push({ source, destination, owner: 'root' });
  }
  if (!production || runtimeUser !== 'node' || JSON.stringify(command) !== JSON.stringify(['node', 'src/production.js']) || prefixes.size !== 4) throw new Error('RUNTIME_PROFILE_INCOMPLETE');
  if (ignoreText.split(/\r?\n/).map(line => line.trim()).find(line => line && !line.startsWith('#')) !== '**') throw new Error('RUNTIME_CONTEXT_NOT_DEFAULT_DENY');
  const paths = ['package.json', 'package-lock.json', 'scripts/previewSyntheticOutbreakScenarios.js'];
  function walk(directory, prefix) {
    if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('RUNTIME_SOURCE_LINK_FORBIDDEN');
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = prefix + item.name;
      if (item.isSymbolicLink()) { if (contextAllows(file, ignoreText)) throw new Error('RUNTIME_SOURCE_LINK_FORBIDDEN'); continue; }
      if (item.isDirectory()) walk(path.join(directory, item.name), file + '/');
      else if (contextAllows(file, ignoreText)) paths.push(file);
    }
  }
  walk(path.join(serverRoot, 'src'), 'src/');
  const referenceFiles = ['manifest.json', 'drugs_clean.json', 'interactions_clean.json', 'icd10_clean.json', 'symptoms.json'].map(file => 'reference-data/' + file);
  walk(path.join(serverRoot, 'reference-data'), 'reference-data/');
  if (paths.some(file => file.startsWith('reference-data/') && !referenceFiles.includes(file))) throw new Error('RUNTIME_REFERENCE_FILE_UNREVIEWED');
  if (referenceFiles.some(file => !paths.includes(file))) throw new Error('RUNTIME_REFERENCE_FILE_MISSING');
  if (paths.some(file => !contextAllows(file, ignoreText))) throw new Error('RUNTIME_REQUIRED_ADAPTER_EXCLUDED');
  const included = new Set(paths), files = paths.sort().map(file => {
    if (/(?:^|\/)(?:tests|uploads|scratch|node_modules)\/|legacyPdfProof|(?:^|\/)\.env(?:\.|$)/i.test(file)) throw new Error('RUNTIME_PRIVATE_OR_TEST_SOURCE_INCLUDED');
    const bytes = Object.hasOwn(overrides, file) ? Buffer.from(overrides[file]) : fs.readFileSync(path.join(serverRoot, file));
    if (/\.js$/.test(file)) {
      const ast = parser.parse(bytes.toString('utf8'), { sourceType: 'unambiguous' });
      const visit = node => {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'CallExpression' && node.callee?.name === 'require') {
          const spec = node.arguments[0]?.type === 'StringLiteral' ? node.arguments[0].value : null;
          if (spec === null) dynamicImports.push({ file, line: node.loc.start.line });
          else if (/legacyPdfProof|@pdfsmaller\/pdf-encrypt-lite/.test(spec)) throw new Error('RUNTIME_LEGACY_PROOF_IMPORT_FORBIDDEN');
          else if (spec.startsWith('.')) {
            const stem = path.resolve(serverRoot, path.dirname(file), spec);
            const target = [stem, stem + '.js', stem + '.json', path.join(stem, 'index.js')].map(name => path.relative(serverRoot, name).split(path.sep).join('/')).find(name => included.has(name));
            if (!target) {
              // This one existing branch is unreachable through the production
              // entry because every MEDISYNC_QA_* key is denied before app load.
              if (file === 'src/app.js' && spec === '../tests/helpers/browserQaControls') guardedUnavailableImports.push({ file, spec });
              else throw new Error('RUNTIME_LOCAL_IMPORT_NOT_INCLUDED');
            }
          } else externalImports.add(spec);
        }
        for (const [key, value] of Object.entries(node)) if (!['loc', 'comments', 'extra', 'tokens'].includes(key)) {
          if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
        }
      };
      visit(ast);
    }
    return { file, bytes: bytes.length, sha256: sha(bytes) };
  });
  return { schema: 1, status: 'SOURCE_COPY_POLICY_PASS_RUNTIME_IMAGE_NOT_BUILT', copies, files, manifestSha256: sha(Buffer.from(JSON.stringify(files))),
    dockerfileSha256: sha(Buffer.from(dockerfile)), dockerignoreSha256: sha(Buffer.from(ignoreText)), externalImports: [...externalImports].sort(), dynamicImports, guardedUnavailableImports,
    contextMatcherScope: 'Reviewed glob subset evaluated offline; not Docker engine conformance proof', imageBuilt: false, dependenciesInstalled: false, imageDigest: null,
    clinicalActivationApproved: false, liveQAImage: false, operationalHolds: ['Actual approved image build/content/ownership proof not run', 'Dynamic local imports need review', 'Reference delivery is hash-verified; licensing and clinical validation remain unverified'] };
}
if (require.main === module) {
  try {
    const [output] = process.argv.slice(2);
    if (!output || !path.isAbsolute(output)) throw new Error('ABSOLUTE_EVIDENCE_PATH_REQUIRED');
    const result = reviewClinicalRuntime();
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ status: result.status, files: result.files.length, manifestSha256: result.manifestSha256, imageBuilt: false }));
  } catch (_) { console.error('CLINICAL_RUNTIME_SOURCE_REVIEW_FAILED'); process.exitCode = 1; }
}
module.exports = { reviewClinicalRuntime, contextAllows };
