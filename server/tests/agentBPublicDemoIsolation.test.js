'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm');
const { DISCLAIMER, MODE, SPA_ROUTES, assertClinicalEntry, assertDemoEnvironment } = require('../src/security/publicDemoIsolation');
const { reviewArtifact, verifiedAssets } = require('../src/security/publicDemoArtifact');
const { createPublicDemoHandler, CSP } = require('../src/demo/publicDemoServer');

describe('packaging output path admission', () => {
  const { assertNewSeparateOutput } = require('../scripts/publicDemoPackagingPaths.cjs');
  let owned, source, target, link;
  beforeEach(() => {
    owned = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'medisync-package-path-'));
    source = path.join(owned, 'source'); target = path.join(owned, 'target'); link = path.join(owned, 'alias');
    fs.mkdirSync(source); fs.mkdirSync(target);
  });
  afterEach(() => {
    expect(path.dirname(owned)).toBe(fs.realpathSync(os.tmpdir()));
    expect(path.basename(owned)).toMatch(/^medisync-package-path-/);
    // Only this fixture's exact entries; never follow or recursively delete links.
    if (fs.existsSync(link)) { if (process.platform === 'win32') fs.rmdirSync(link); else fs.unlinkSync(link); }
    fs.rmdirSync(source); fs.rmdirSync(target); fs.rmdirSync(owned);
  });
  test('accepts a new sibling without creating it', () => {
    const output = path.join(owned, 'new-output');
    expect(assertNewSeparateOutput(source, output)).toBe(output); expect(fs.existsSync(output)).toBe(false);
  });
  test.each(['source', 'target', 'source/child', 'missing/child'])('rejects existing, nested or missing-parent path %s', relative => {
    expect(() => assertNewSeparateOutput(source, path.join(owned, relative))).toThrow('PUBLIC_DEMO_OUTPUT_PATH_REJECTED');
  });
  test.each(['portable', 'vercel', 'evidence'])('denies %s output through a real ancestor junction before artifact access or writes', kind => {
    fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
    const output = path.join(link, 'never-created');
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    const run = kind === 'portable' ? () => require('../scripts/packagePublicDemo.cjs').packagePublicDemo({ root: source, output, manifest: null })
      : kind === 'vercel' ? () => require('../scripts/packageVercelPublicDemo.cjs').packageVercelPublicDemo({ root: source, output })
        : () => assertNewSeparateOutput(source, output);
    expect(run).toThrow('PUBLIC_DEMO_OUTPUT_PATH_REJECTED');
    expect(fs.readdirSync(target)).toEqual([]); expect(fs.readdirSync(source)).toEqual([]);
  });
  test.each(['portable', 'vercel'])('rejects remote %s paths before even a filesystem existence probe', kind => {
    const remoteSource = process.platform === 'win32' ? '\\\\server.invalid\\share\\source' : '//server.invalid/share/source';
    const remoteOutput = process.platform === 'win32' ? '\\\\server.invalid\\share\\output' : '//server.invalid/share/output';
    const run = kind === 'portable' ? require('../scripts/packagePublicDemo.cjs').packagePublicDemo : require('../scripts/packageVercelPublicDemo.cjs').packageVercelPublicDemo;
    const exists = jest.spyOn(fs, 'existsSync').mockImplementation(() => { throw new Error('FILESYSTEM_PROBE_FORBIDDEN'); });
    try {
      expect(() => run({ root: remoteSource, output: remoteOutput, manifest: null })).toThrow('PUBLIC_DEMO_OUTPUT_PATH_REJECTED');
      expect(exists).not.toHaveBeenCalled();
    } finally { exists.mockRestore(); }
  });
  test('denies a linked source and a dangling output link', () => {
    fs.symlinkSync(source, link, process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => assertNewSeparateOutput(link, path.join(owned, 'new-output'))).toThrow('PUBLIC_DEMO_OUTPUT_PATH_REJECTED');
    if (process.platform === 'win32') fs.rmdirSync(link); else fs.unlinkSync(link);
    fs.symlinkSync(path.join(owned, 'absent'), link, process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => assertNewSeparateOutput(source, link)).toThrow('PUBLIC_DEMO_OUTPUT_PATH_REJECTED');
    // existsSync follows links, so remove this known dangling link explicitly.
    if (process.platform === 'win32') fs.rmdirSync(link); else fs.unlinkSync(link);
  });
});

const validEnv = () => ({ MEDISYNC_PUBLIC_DEMO: 'true', NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '3200' });
const html = () => `<html><head><meta name="medisync-mode" content="${MODE}"><script defer src="/static/js/main.js"></script></head><body><p>${DISCLAIMER}</p><div id="root"></div></body></html>`;
let roots = [], packages = [], vercelPackages = [];
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'medisync-static-demo-'));
  roots.push(root); fs.mkdirSync(path.join(root, 'static')); fs.mkdirSync(path.join(root, 'static/js'));
  fs.writeFileSync(path.join(root, 'index.html'), html()); fs.writeFileSync(path.join(root, 'static/js/main.js'), '"use strict"; document.title="Synthetic university tour";');
  return root;
}
afterEach(() => {
  for (const output of vercelPackages) {
    expect(path.dirname(output)).toBe(fs.realpathSync(os.tmpdir()));
    expect(path.basename(output)).toMatch(/^medisync-static-demo-.+-vercel$/);
    if (!fs.existsSync(output)) continue;
    for (const file of ['vercel-release-receipt.json', 'VERCEL_PACKAGE_INCOMPLETE.json', '.vercel/output/config.json', '.vercel/output/static/__medisync_health.json', '.vercel/output/static/index.html', '.vercel/output/static/static/js/main.js']) {
      const target = path.join(output, file); if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    for (const dir of ['.vercel/output/static/static/js', '.vercel/output/static/static', '.vercel/output/static', '.vercel/output', '.vercel']) {
      const target = path.join(output, dir); if (fs.existsSync(target)) fs.rmdirSync(target);
    }
    fs.rmdirSync(output);
  }
  vercelPackages = [];
  for (const output of packages) {
    expect(path.dirname(output)).toBe(fs.realpathSync(os.tmpdir()));
    expect(path.basename(output)).toMatch(/^medisync-static-demo-.+-package$/);
    if (!fs.existsSync(output)) continue;
    // Only the exact package targets created by this test; no recursive delete.
    const files = ['package-receipt.json', 'PACKAGE_INCOMPLETE.json', 'artifact-manifest.json', 'public/index.html', 'public/static/js/main.js', ...require('../scripts/packagePublicDemo.cjs').SOURCE_FILES];
    for (const file of files) { const target = path.join(output, file); if (fs.existsSync(target)) fs.unlinkSync(target); }
    for (const dir of ['public/static/js', 'public/static', 'public', 'server/src/security', 'server/src/demo', 'server/src', 'server/scripts', 'server']) {
      const target = path.join(output, dir); if (fs.existsSync(target)) fs.rmdirSync(target);
    }
    fs.rmdirSync(output);
  }
  packages = [];
  // Exact synthetic fixture membership; never recursive deletion or a DB cleanup.
  for (const root of roots) {
    expect(path.dirname(root)).toBe(fs.realpathSync(os.tmpdir()));
    for (const file of ['index.html', 'static/js/main.js', 'static/js/main.js.LICENSE.txt', 'static/js/main.js.map', 'static/js/extra.js', 'static/js/main.css', 'private.env', 'static/js/main.pdf']) {
      const target = path.join(root, file); if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    fs.rmdirSync(path.join(root, 'static/js')); fs.rmdirSync(path.join(root, 'static')); fs.rmdirSync(root);
  }
  roots = [];
});
function request(handler, url, method = 'GET', headers = {}) {
  const res = { headers: {}, setHeader(name, value) { this.headers[name.toLowerCase()] = value; }, end(bytes) { this.body = bytes ? Buffer.from(bytes) : Buffer.alloc(0); } };
  handler({ url, method, headers }, res); return res;
}
function handlerFor(root) { return createPublicDemoHandler({ root, manifest: reviewArtifact(root), env: validEnv() }); }

test.each(['true', 'TRUE', '1', '', 'synthetic'])('clinical entry refuses public-demo value %j before dotenv/provider import', value => {
  const loaded = [], actualRequire = require;
  expect(() => vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/app.js'), 'utf8'), {
    process: { env: { MEDISYNC_PUBLIC_DEMO: value } }, module: { exports: {} }, require(name) {
      loaded.push(name); if (name === './security/publicDemoIsolation') return actualRequire('../src/security/publicDemoIsolation');
      throw new Error('UNEXPECTED_CLINICAL_IMPORT');
    }
  })).toThrow('PUBLIC_DEMO_REQUIRES_SEPARATE_STATIC_ENTRY');
  expect(loaded).toEqual(['./security/publicDemoIsolation']);
});
test('clinical guard rechecks dotenv-loaded demo intent before any third-party clinical import', () => {
  const env = {}, loaded = [];
  expect(() => vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../src/app.js'), 'utf8'), {
    process: { env }, module: { exports: {} }, require(name) {
      loaded.push(name);
      if (name === './security/publicDemoIsolation') return { assertClinicalEntry };
      if (name === 'dotenv') return { config() { env.MEDISYNC_PUBLIC_DEMO = 'true'; } };
      throw new Error('UNEXPECTED_CLINICAL_IMPORT');
    }
  })).toThrow('PUBLIC_DEMO_REQUIRES_SEPARATE_STATIC_ENTRY');
  expect(loaded).toEqual(['./security/publicDemoIsolation', 'dotenv', './security/publicDemoIsolation']);
});
test('ordinary clinical entry remains separately guarded and demo environment has a loopback-only port', () => {
  expect(() => assertClinicalEntry({ MEDISYNC_PUBLIC_DEMO: 'false', MEDISYNC_DEPLOYMENT_MODE: 'clinical' })).not.toThrow();
  expect(assertDemoEnvironment(validEnv())).toEqual({ host: '127.0.0.1', port: 3200, mode: MODE });
});
test.each(['MONGO_URI', 'MONGO_URI_TEST', 'REDIS_URL', 'VAULT_TOKEN', 'JWT_SECRET', 'ENCRYPTION_KEY', 'RESEND_API_KEY', 'BREVO_API_KEY', 'SMTP_PASSWORD', 'CLOUDINARY_URL', 'TWILIO_TOKEN', 'SEED_TEST_PASSWORD', 'CLIENT_URL', 'REACT_APP_API_URL', 'ML_ENGINE_URL', 'NODE_OPTIONS', 'NODE_PATH', 'HTTPS_PROXY', 'MEDISYNC_QA_BOOTSTRAPPED', 'MEDISYNC_LIVE_START_APPROVED'])('public demo rejects inherited %s without revealing its value', name => {
  const secret = 'synthetic-never-log-this';
  expect(() => assertDemoEnvironment({ ...validEnv(), [name]: secret })).toThrow('PUBLIC_DEMO_ENVIRONMENT_REJECTED');
  try { assertDemoEnvironment({ ...validEnv(), [name]: secret }); } catch (error) { expect(error.message).not.toContain(secret); }
});
test.each([{ MEDISYNC_PUBLIC_DEMO: 'false' }, { MEDISYNC_DEPLOYMENT_MODE: 'clinical' }, { HOST: '0.0.0.0' }, { HOST: '192.168.1.5' }, { PORT: '80' }, { PORT: '3200.0' }, { PORT: '65536' }])('public demo refuses mode/binding ambiguity %j', change => expect(() => assertDemoEnvironment({ ...validEnv(), ...change })).toThrow());

test('Windows environment-key case cannot disguise a clinical or QA bootstrap flag', () => {
  expect(() => assertDemoEnvironment({ ...validEnv(), medisync_qa_bootstrapped: 'true' })).toThrow('PUBLIC_DEMO_ENVIRONMENT_REJECTED');
  expect(() => assertDemoEnvironment({ ...validEnv(), Medisync_Live_Start_Approved: 'true' })).toThrow('PUBLIC_DEMO_ENVIRONMENT_REJECTED');
});

test('exact artifact, SPA allowlist, security headers and independent health require no clinical identity', () => {
  const root = fixture(), handler = handlerFor(root);
  for (const route of SPA_ROUTES) {
    const response = request(handler, route, 'GET', { authorization: 'Bearer synthetic', cookie: 'refreshToken=synthetic' });
    expect(response.statusCode).toBe(200); expect(response.body.toString()).toContain(DISCLAIMER);
    expect(response.headers['content-security-policy']).toBe(CSP);
    expect(CSP).toContain("connect-src 'none'"); expect(CSP).toContain("worker-src 'none'"); expect(CSP).toContain("form-action 'none'");
    expect(response.headers['set-cookie']).toBeUndefined(); expect(response.headers['access-control-allow-origin']).toBeUndefined();
  }
  expect(JSON.parse(request(handler, '/health').body)).toEqual({ status: 'ok', mode: MODE, clinicalAccess: false });
  expect(request(handler, '/health', 'HEAD').body.length).toBe(0);
  expect(request(handler, '/static/js/main.js').headers['content-type']).toContain('application/javascript');
});
test.each(['/api', '/api/auth/login', '/api/patient/profile', '/api/doctor/consultation', '/api/pharmacy/dispense-otc', '/api/hospital/verify', '/api/admin/approve', '/api/alerts/broadcast', '/api/lab/report', '/socket.io/', '/uploads/private.pdf', '/auth/refresh', '/login', '/register', '/documents/clinical.pdf', '/reports/report.pdf', '/API/patient', '/%61pi/patient'])('clinical path %s is denied before SPA routing', route => {
  const root = fixture(), response = request(handlerFor(root), route);
  expect(response.statusCode).toBe(403); expect(response.body.toString()).not.toContain(DISCLAIMER);
});
test.each(['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE', 'CONNECT'])('every %s request is denied, including static assets and health', method => {
  const root = fixture(), handler = handlerFor(root);
  for (const route of ['/', '/health', '/static/js/main.js', '/api/auth/login']) expect(request(handler, route, method).statusCode).toBe(403);
});
test.each(['/../index.html', '/%2e%2e/index.html', '/static%5cjs/main.js', '//index.html', '/%00', '/%', '/index.html?nic=synthetic', '/%252e%252e', 'https://example.invalid/'])('malformed path %s cannot reach a file or echo query data', route => {
  const root = fixture(), response = request(handlerFor(root), route);
  expect(response.statusCode).toBe(400); expect(response.body.toString()).not.toContain('synthetic');
});
test('unknown SPA routes are real404s, GET bodies are rejected and verified bytes are immutable after startup', () => {
  const root = fixture(), handler = handlerFor(root);
  expect(request(handler, '/doctor').statusCode).toBe(404); expect(request(handler, '/missing.js').statusCode).toBe(404);
  expect(request(handler, '/', 'GET', { 'content-length': '12' }).statusCode).toBe(400);
  fs.writeFileSync(path.join(root, 'static/js/main.js'), 'changed-after-startup');
  expect(request(handler, '/static/js/main.js').body.toString()).not.toContain('changed-after-startup');
});
test.each(['static/js/main.js.map', 'private.env', 'static/js/main.pdf'])('artifact rejects unexpected %s rather than publishing it', file => {
  const root = fixture(); fs.writeFileSync(path.join(root, file), 'synthetic-only'); expect(() => reviewArtifact(root)).toThrow('PUBLIC_DEMO_ASSET_NAME_REJECTED');
});
test.each(['https://clinical.onrender.com/api', 'https://clinical.vercel.app/api', 'mongodb+srv://synthetic@example.invalid/test', 'http://127.0.0.1:5100/api', '//# sourceMappingURL=main.js.map'])('artifact refuses restricted backend/metadata literal', source => {
  const root = fixture(); fs.writeFileSync(path.join(root, 'static/js/main.js'), JSON.stringify(source)); expect(() => reviewArtifact(root)).toThrow('PUBLIC_DEMO_RESTRICTED_ASSET_CONTENT');
});
test.each(['missing-marker', 'comment-disclaimer', 'inline-script', 'external-script', 'inline-event'])('artifact refuses %s index content', variant => {
  const root = fixture(); let source = html();
  if (variant === 'missing-marker') source = source.replace('medisync-mode', 'unrelated-mode');
  if (variant === 'comment-disclaimer') source = source.replace(`<p>${DISCLAIMER}</p>`, `<!--${DISCLAIMER}-->`);
  if (variant === 'inline-script') source = source.replace('</body>', '<script>alert(1)</script></body>');
  if (variant === 'external-script') source = source.replace('/static/js/main.js', 'https://example.invalid/app.js');
  if (variant === 'inline-event') source = source.replace('<body>', '<body onload="alert(1)">');
  fs.writeFileSync(path.join(root, 'index.html'), source); expect(() => reviewArtifact(root)).toThrow();
});
test('manifest detects additions, missing membership and modified bytes; filter pass never claims rendered/PII certification', () => {
  const root = fixture(), manifest = reviewArtifact(root);
  expect(manifest).toMatchObject({ clinicalAccess: false, renderedReview: 'NOT_RUN', syntheticContentReview: 'REQUIRES_INDEPENDENT_REVIEW' });
  expect(() => verifiedAssets(root, { ...manifest, files: manifest.files.slice(1) })).toThrow('PUBLIC_DEMO_MANIFEST_MISMATCH');
  fs.writeFileSync(path.join(root, 'static/js/extra.js'), '"synthetic";'); expect(() => verifiedAssets(root, manifest)).toThrow('PUBLIC_DEMO_MANIFEST_MISMATCH');
  fs.unlinkSync(path.join(root, 'static/js/extra.js')); fs.writeFileSync(path.join(root, 'static/js/main.js'), '"changed";'); expect(() => verifiedAssets(root, manifest)).toThrow('PUBLIC_DEMO_MANIFEST_MISMATCH');
});

test('portable package contains only exact reviewed public bytes and Node-only serving closure', () => {
  const root = fixture(), output = root + '-package'; packages.push(output);
  const { packagePublicDemo, SOURCE_FILES } = require('../scripts/packagePublicDemo.cjs');
  const receipt = packagePublicDemo({ root, output, manifest: reviewArtifact(root) });
  expect(receipt).toMatchObject({ clinicalAccess: false, deploymentApproved: false, packageManagerRequired: false, nodeTarget: '24' });
  expect(receipt.files.map(row => row.file).sort()).toEqual(['public/index.html', 'public/static/js/main.js', ...SOURCE_FILES, 'artifact-manifest.json'].sort());
  expect(fs.existsSync(path.join(output, '.env'))).toBe(false); expect(fs.existsSync(path.join(output, 'server/src/app.js'))).toBe(false); expect(fs.existsSync(path.join(output, 'node_modules'))).toBe(false);
  const manifest = JSON.parse(fs.readFileSync(path.join(output, 'artifact-manifest.json')));
  const response = request(createPublicDemoHandler({ root: path.join(output, 'public'), manifest, env: validEnv() }), '/api/patient');
  expect(response.statusCode).toBe(403);
});
test('packaging rejects modified assets before creating output and never overwrites an existing directory', () => {
  const root = fixture(), output = root + '-package'; packages.push(output);
  const { packagePublicDemo } = require('../scripts/packagePublicDemo.cjs'), manifest = reviewArtifact(root);
  fs.writeFileSync(path.join(root, 'static/js/main.js'), '"changed";');
  expect(() => packagePublicDemo({ root, output, manifest })).toThrow('PUBLIC_DEMO_MANIFEST_MISMATCH'); expect(fs.existsSync(output)).toBe(false);
  expect(() => packagePublicDemo({ root, output: root, manifest: reviewArtifact(root) })).toThrow('PUBLIC_DEMO_NEW_SEPARATE_PACKAGE_REQUIRED');
});

test('reviewed static license notices are retained and served as plain text without allowing source maps or PDFs', () => {
  const root = fixture(); fs.writeFileSync(path.join(root, 'static/js/main.js.LICENSE.txt'), 'Synthetic fixture license notice');
  const manifest = reviewArtifact(root), response = request(createPublicDemoHandler({ root, manifest, env: validEnv() }), '/static/js/main.js.LICENSE.txt');
  expect(manifest.files.some(row => row.file === 'static/js/main.js.LICENSE.txt')).toBe(true);
  expect(response.statusCode).toBe(200); expect(response.headers['content-type']).toBe('text/plain; charset=utf-8'); expect(response.body.toString()).toBe('Synthetic fixture license notice');
});

test('offline acceptance executes the four copied runtime modules and verifies packaged routes without a listener', () => {
  const root = fixture(), output = root + '-package'; packages.push(output);
  const { packagePublicDemo, SOURCE_FILES } = require('../scripts/packagePublicDemo.cjs');
  packagePublicDemo({ root, output, manifest: reviewArtifact(root) });
  const result = require('../../scripts/verify_public_demo_package.cjs').verifyPackage(output);
  expect(result).toMatchObject({ status: 'PASS_OFFLINE_PACKAGE_INTEGRITY_AND_INERT_ROUTES', listenerStarted: false, browserRendered: false, clinicalAccess: false, deploymentApproved: false });
  expect(result.runtimeFiles).toEqual([...SOURCE_FILES].sort());
  for (const route of SPA_ROUTES) expect(result.scenarios).toEqual(expect.arrayContaining([{ method: 'GET', route, status: 200, kind: 'spa' }, { method: 'HEAD', route, status: 200, kind: 'spa' }]));
  for (const route of ['/admin', '/doctor', '/patient', '/pharmacy', '/hospital']) expect(result.scenarios).toContainEqual({ method: 'GET', route, status: 404, kind: 'unknown-denied' });
  expect(result.scenarios).toContainEqual({ method: 'POST', route: '/demo/doctor', status: 403, kind: 'method-denied' });
  expect(result.packageContentSha256).toMatch(/^[a-f0-9]{64}$/);
});

test.each(['unlisted-file', 'receipt-hash', 'runtime-and-receipt'])('offline package acceptance rejects %s changes', variant => {
  const root = fixture(), output = root + '-package'; packages.push(output);
  require('../scripts/packagePublicDemo.cjs').packagePublicDemo({ root, output, manifest: reviewArtifact(root) });
  const receiptPath = path.join(output, 'package-receipt.json'), receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
  if (variant === 'unlisted-file') fs.writeFileSync(path.join(output, 'PACKAGE_INCOMPLETE.json'), '{}');
  if (variant === 'receipt-hash') receipt.files[0].sha256 = '0'.repeat(64);
  if (variant === 'runtime-and-receipt') {
    const file = 'server/scripts/startPublicDemo.cjs', bytes = Buffer.from('throw new Error("UNREVIEWED_RUNTIME");');
    fs.writeFileSync(path.join(output, file), bytes);
    Object.assign(receipt.files.find(row => row.file === file), { bytes: bytes.length, sha256: require('crypto').createHash('sha256').update(bytes).digest('hex') });
  }
  fs.writeFileSync(receiptPath, JSON.stringify(receipt));
  expect(() => require('../../scripts/verify_public_demo_package.cjs').verifyPackage(output)).toThrow(variant === 'unlisted-file' ? 'PACKAGE_MEMBERSHIP_MISMATCH' : variant === 'receipt-hash' ? 'PACKAGE_RECEIPT_HASH_MISMATCH' : 'PACKAGE_RUNTIME_SOURCE_MISMATCH');
});

test('Vercel offline adapter binds the existing project and only reviewed static bytes with closed route rules', () => {
  const root = fixture(), portable = root + '-package', output = root + '-vercel'; packages.push(portable); vercelPackages.push(output);
  const manifest = reviewArtifact(root);
  require('../scripts/packagePublicDemo.cjs').packagePublicDemo({ root, output: portable, manifest });
  const { packageVercelPublicDemo, TARGET } = require('../scripts/packageVercelPublicDemo.cjs');
  const receipt = packageVercelPublicDemo({ root: portable, output });
  expect(TARGET).toEqual({ provider: 'Vercel', project: 'medi-sync', projectId: 'prj_FLv5iD60XwYnLIoUCsjYMo4xPdMR', teamSlug: 'chamod-tharusha-s-projects', candidateDomain: 'medisync.chamodtharusha.com.lk', previewOnly: true });
  expect(receipt).toMatchObject({ deploymentApproved: false, productionApproved: false, functionsIncluded: false, clinicalAccess: false, browserRendered: false, platformRouteBehavior: 'REQUIRES_APPROVED_PREVIEW_SMOKE' });
  expect(receipt.portablePackageContentSha256).toBe(require('../../scripts/verify_public_demo_package.cjs').verifyPackage(portable).packageContentSha256);
  expect(receipt.files.map(row => row.file).sort()).toEqual(['.vercel/output/config.json', '.vercel/output/static/__medisync_health.json', '.vercel/output/static/index.html', '.vercel/output/static/static/js/main.js'].sort());
  const verified = require('../scripts/packageVercelPublicDemo.cjs').verifyVercelPublicDemo({ root: output, portableRoot: portable });
  expect(verified.status).toBe('PASS_OFFLINE_VERCEL_OUTPUT_INTEGRITY'); expect(verified.previewUploaded).toBe(false);
  expect(verified.files.some(row => row.file === 'vercel-release-receipt.json')).toBe(true);
  for (const row of receipt.files) {
    const bytes = fs.readFileSync(path.join(output, row.file));
    expect(bytes.length).toBe(row.bytes); expect(require('crypto').createHash('sha256').update(bytes).digest('hex')).toBe(row.sha256);
  }
  expect(fs.readFileSync(path.join(output, '.vercel/output/static/static/js/main.js')).equals(fs.readFileSync(path.join(root, 'static/js/main.js')))).toBe(true);
  expect(fs.existsSync(path.join(output, '.vercel/output/functions'))).toBe(false);
  expect(fs.existsSync(path.join(output, '.vercel/project.json'))).toBe(false);
  expect(fs.existsSync(path.join(output, '.vercel/output/static/vercel-release-receipt.json'))).toBe(false);
  const config = JSON.parse(fs.readFileSync(path.join(output, '.vercel/output/config.json'), 'utf8'));
  expect(config.version).toBe(3); expect(config.routes.some(row => row.handle || row.check || (row.dest && !row.dest.startsWith('/')))).toBe(false);
  expect(config.routes[0].headers['Content-Security-Policy']).toBe(CSP);
  expect(config.routes[0].headers['Strict-Transport-Security']).toBe('max-age=31536000');
  // Local evaluation of the documented regex/method subset, not a claim of
  // actual Vercel edge execution or project-level routing inspection.
  function route(url, method) {
    for (const row of config.routes) {
      if (row.methods && !row.methods.includes(method)) continue;
      if (!new RegExp(row.src, row.caseSensitive === false ? 'i' : '').test(url) || row.continue) continue;
      return row.status || 200;
    }
    return null;
  }
  for (const method of ['GET', 'HEAD']) {
    for (const url of [...SPA_ROUTES, '/health', '/index.html', '/static/js/main.js']) expect(route(url, method)).toBe(200);
    for (const url of ['/api/auth/login', '/API/patient', '/socket.io/', '/uploads/report.pdf', '/login', '/register', '/documents/private.pdf']) expect(route(url, method)).toBe(403);
    for (const url of ['/admin', '/doctor', '/patient', '/pharmacy', '/hospital', '/demo/missing', '/static/js/mainXjs', '/DEMO', '/__medisync_health.json', '/.env']) expect(route(url, method)).toBe(404);
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE', 'CONNECT', 'UNRECOGNIZED']) for (const url of ['/', '/demo/patient', '/health', '/static/js/main.js', '/missing']) expect(route(url, method)).toBe(403);
  expect(() => packageVercelPublicDemo({ root: portable, output })).toThrow('VERCEL_DEMO_NEW_SEPARATE_OUTPUT_REQUIRED');
});

test.each(['changed-public', 'changed-runtime', 'unlisted-file'])('Vercel adapter rejects %s before creating an upload directory', variant => {
  const root = fixture(), portable = root + '-package', output = root + '-vercel'; packages.push(portable); vercelPackages.push(output);
  require('../scripts/packagePublicDemo.cjs').packagePublicDemo({ root, output: portable, manifest: reviewArtifact(root) });
  if (variant === 'changed-public') fs.writeFileSync(path.join(portable, 'public/static/js/main.js'), '"unreviewed";');
  if (variant === 'changed-runtime') fs.writeFileSync(path.join(portable, 'server/scripts/startPublicDemo.cjs'), 'throw new Error("unreviewed");');
  if (variant === 'unlisted-file') fs.writeFileSync(path.join(portable, 'PACKAGE_INCOMPLETE.json'), '{}');
  expect(() => require('../scripts/packageVercelPublicDemo.cjs').packageVercelPublicDemo({ root: portable, output })).toThrow();
  expect(fs.existsSync(output)).toBe(false);
});

test.each(['config-and-receipt', 'unlisted-file'])('pre-upload verification rejects %s even after offline packaging', variant => {
  const root = fixture(), portable = root + '-package', output = root + '-vercel'; packages.push(portable); vercelPackages.push(output);
  require('../scripts/packagePublicDemo.cjs').packagePublicDemo({ root, output: portable, manifest: reviewArtifact(root) });
  const adapter = require('../scripts/packageVercelPublicDemo.cjs'), receipt = adapter.packageVercelPublicDemo({ root: portable, output });
  if (variant === 'unlisted-file') fs.writeFileSync(path.join(output, 'VERCEL_PACKAGE_INCOMPLETE.json'), '{}');
  else {
    const file = '.vercel/output/config.json', config = JSON.parse(fs.readFileSync(path.join(output, file), 'utf8'));
    config.routes.unshift({ src: '^/api/(.*)$', dest: 'https://example.invalid/$1' });
    const bytes = Buffer.from(JSON.stringify(config)); fs.writeFileSync(path.join(output, file), bytes);
    Object.assign(receipt.files.find(row => row.file === file), { bytes: bytes.length, sha256: require('crypto').createHash('sha256').update(bytes).digest('hex') });
    receipt.outputContentSha256 = require('crypto').createHash('sha256').update(JSON.stringify(receipt.files)).digest('hex');
    fs.writeFileSync(path.join(output, 'vercel-release-receipt.json'), JSON.stringify(receipt));
  }
  expect(() => adapter.verifyVercelPublicDemo({ root: output, portableRoot: portable })).toThrow('VERCEL_DEMO_OUTPUT_MISMATCH');
});

test.each(['@import url("https://fonts.googleapis.com/css2?family=Example");', '@import "/static/theme.css";', '.example{background:url(https://example.invalid/image.png)}', '.example{background:url(//example.invalid/image.png)}'])('artifact rejects delegated or remote CSS loads: %s', source => {
  const root = fixture(); fs.writeFileSync(path.join(root, 'static/js/main.css'), source);
  expect(() => reviewArtifact(root)).toThrow(/PUBLIC_DEMO_CSS_(?:IMPORT|RESOURCE)_REJECTED/);
});
