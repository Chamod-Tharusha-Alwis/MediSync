'use strict';

// Names-only metadata linter. Never reads process.env, credential files or a URL.
const { assertProductionRuntime } = require('../server/src/security/productionRuntimePolicy');
const unusedBackend = new Set(['CORS_ORIGIN', 'EMAIL_PROVIDER', 'EMAIL_USER', 'EMAIL_PASS', 'RESEND_SMTP_HOST', 'RESEND_SMTP_PORT', 'RESEND_SMTP_USER']);
const legacyBackend = new Set(['ENCRYPTION_KEY', 'VAULT_TOKEN', 'VAULT_URL']);
const coreBackend = ['NODE_ENV', 'MEDISYNC_LIVE_START_APPROVED', 'MEDISYNC_ATLAS_ROTATION_CONFIRMED', 'MEDISYNC_PROTOTYPE_MODE', 'MEDISYNC_ALLOW_OPERATOR_KEYS', 'ENCRYPTION_KEYS', 'ACTIVE_KEY_VERSION', 'CLIENT_URL', 'MONGO_URI', 'REDIS_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'INTERNAL_API_KEY'];
const knownBackend = new Set([...coreBackend, 'PORT', 'SESSION_SECRET', 'MEDISYNC_DEPLOYMENT_MODE', 'MEDISYNC_ML_ALLOWED_ORIGIN', 'ML_ENGINE_URL',
  'BREVO_API_KEY', 'BREVO_DAILY_FREE_LIMIT', 'BREVO_FROM_ADDRESS', 'EMAIL_BACKUP_PROVIDER',
  'RESEND_API_KEY', 'RESEND_FROM_ADDRESS', 'RESEND_SMTP_PASS', 'RESEND_KEY', 'RESEND_APIKEY',
  'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET', 'CLOUDINARY_CLOUD_NAME',
  'MEDISYNC_BACKGROUND_JOBS_APPROVED', 'MEDISYNC_REMINDER_DISPATCH_APPROVED', 'MEDISYNC_CLINICAL_OUTBOX_APPROVED', 'MEDISYNC_CRON_TIMEZONE',
  'WHO_ICD11_CLIENT_ID', 'WHO_ICD11_CLIENT_SECRET', 'APP_URL', 'FRONTEND_URL', ...unusedBackend, ...legacyBackend]);
const knownMl = new Set(['INTERNAL_API_KEY', 'CLIENT_URL', 'PORT', 'PYTHONPATH', 'MEDISYNC_ML_DB_PATH']);
const unusedMl = new Set(['NODE_API_URL', 'FLASK_ENV']);

function validateNames(names) {
  if (!Array.isArray(names) || names.length > 256 || names.some(name => typeof name !== 'string' || name.length > 128 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))) throw Error('NAME_LIST_INVALID');
  return [...new Set(names)].sort();
}
function parseNames(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 65536) throw Error('NAME_LIST_INVALID');
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    let names; try { names = JSON.parse(trimmed); } catch (_) { throw Error('NAME_LIST_INVALID'); }
    return validateNames(names);
  }
  return validateNames(trimmed.split(/[\s,]+/));
}
function forbiddenBackend(name) {
  const environment = Object.create(null);
  environment.NODE_ENV = 'production';
  environment[name] = name === 'MEDISYNC_DEPLOYMENT_MODE' ? 'clinical' : undefined;
  if (name === 'NODE_ENV') environment.NODE_ENV = 'production';
  try { assertProductionRuntime(environment); return false; }
  catch (error) { return error.message === 'PRODUCTION_RUNTIME_QA_MATERIAL_FORBIDDEN'; }
}
function inspectNames(service, input) {
  if (!['backend', 'ml'].includes(service)) throw Error('SERVICE_INVALID');
  const names = validateNames(input), present = new Set(names), rows = [];
  for (const name of names) {
    const forbidden = service === 'backend' ? forbiddenBackend(name) : /^(?:MEDISYNC_ML_QA|MEDISYNC_QA_|MEDISYNC_TEST_)/i.test(name) || ['MONGO_URI', 'MONGO_URI_TEST', 'SEED_TEST_PASSWORD'].includes(name);
    if (forbidden) rows.push({ status: 'FORBIDDEN', name, requirement: service === 'backend' ? 'real production runtime policy' : 'production ML separation recommendation; not an existing ML admission gate' });
    else if ((service === 'backend' ? unusedBackend : unusedMl).has(name)) rows.push({ status: 'UNUSED', name, requirement: ['EMAIL_USER', 'EMAIL_PROVIDER'].includes(name) ? 'diagnostic script only (recipient/log label), not production transport configuration' : 'no consumer in selected deployed application' });
    else if (service === 'backend' && legacyBackend.has(name)) rows.push({ status: 'LEGACY', name, requirement: 'not needed by operator-key profile; alternative Vault/test paths exist; never discard existing encryption material' });
    else if ((service === 'backend' ? knownBackend : knownMl).has(name)) rows.push({ status: 'KEEP', name, requirement: name === 'SESSION_SECRET' ? 'preflight-only compatibility check, not server sessions' : name === 'RESEND_SMTP_PASS' ? 'legacy HTTPS API-key alias, not SMTP transport' : 'consumed or platform configuration; values NOT VERIFIED' });
    else rows.push({ status: 'UNKNOWN', name: '[unrecognized-name]', requirement: 'not echoed; review spelling/case and system/framework scope, not automatically unused' });
  }
  const required = service === 'backend' ? coreBackend.map(name => [name, 'operator-profile/preflight/core capability']) : [['INTERNAL_API_KEY', 'internal request authentication']];
  if (service === 'backend') required.push(['SESSION_SECRET', 'preflight only'], ['ML_ENGINE_URL', 'ML integration'], ['MEDISYNC_ML_ALLOWED_ORIGIN', 'public ML proxy capability'], ['MEDISYNC_DEPLOYMENT_MODE', 'recommended explicit mode; omission is permitted by runtime']);
  else required.push(['CLIENT_URL', 'recommended explicit CORS origin']);
  for (const [name, requirement] of required) if (!present.has(name)) rows.push({ status: 'MISSING', name, requirement });
  const findings = rows.filter(row => ['FORBIDDEN', 'MISSING'].includes(row.status));
  return { service, scope: 'NAMES ONLY; values, credential rotation, permissions, connectivity and readiness NOT VERIFIED', rows, findings: findings.length };
}
async function main(args, input, output, errors) {
  if (args.length !== 1 || !['backend', 'ml'].includes(args[0])) { errors.write('Usage: paste NAMES ONLY on stdin | node scripts/checkRenderEnvironmentNames.cjs backend|ml\n'); return 2; }
  try {
    let text = '';
    for await (const chunk of input) { text += chunk; if (Buffer.byteLength(text) > 65536) throw Error('NAME_LIST_INVALID'); }
    const report = inspectNames(args[0], parseNames(text));
    output.write(report.scope + '\n');
    for (const row of report.rows) output.write(`${row.status} ${row.name} — ${row.requirement}\n`);
    return report.findings ? 1 : 0;
  } catch (_) { errors.write('NAME_LIST_INVALID: provide identifiers only, never assignments, values, URIs or an environment export. Input not echoed.\n'); return 2; }
}
if (require.main === module) main(process.argv.slice(2), process.stdin, process.stdout, process.stderr).then(code => { process.exitCode = code; });
module.exports = { validateNames, parseNames, forbiddenBackend, inspectNames, main };
