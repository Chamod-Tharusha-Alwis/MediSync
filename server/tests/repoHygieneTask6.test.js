'use strict';

/**
 * Task 6 — repository hygiene.
 * (.env* files are off-limits to the offline boundary, so the .env.example additions are
 *  verified by the hardening-run report rather than here.)
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|cjs)$/.test(name)) out.push(full);
  }
  return out;
}

test('retired TEST_OTP live runners are gone', () => {
  for (const f of ['scripts/verify_b6_flow_live.cjs', 'scripts/verify_c1_flow_live.cjs']) {
    expect(fs.existsSync(path.join(root, f))).toBe(false);
  }
});

test('server/src has no TEST_OTP references at all (warning branch dropped)', () => {
  const offenders = walk(path.join(root, 'server/src')).filter(f => fs.readFileSync(f, 'utf8').includes('TEST_OTP'));
  expect(offenders.map(f => path.relative(root, f))).toEqual([]);
});

test('owner Gmail addresses were replaced with role labels in the files that held them', () => {
  const files = ['docs/TEMP_TEST_HARNESS.md', 'docs/final/SEED_REPORT.md', 'docs/new/MASTER_PROMPT_V3.md',
    'server/tests/testOtpRemovalOffline.test.js', 'server/tests/vivaSeedData.test.js'];
  for (const f of files) {
    // Masked examples such as "p***@gmail.com" are allowed; real local parts are not.
    expect(read(f)).not.toMatch(/[A-Za-z0-9._%+-]{2,}@gmail\.com/);
  }
  expect(read('docs/TEMP_TEST_HARNESS.md')).toMatch(/admin\.owner@example\.org/);
});

test('docs/temp is ignored, with only the test-required guard candidate re-included', () => {
  const ignore = read('.gitignore');
  expect(ignore).toMatch(/^docs\/temp\/$/m);
  expect(ignore).toMatch(/^!docs\/temp\/CODEX_PRODUCTION_DB_GUARD_FOR_APPROVAL\.candidate\.js$/m);
  expect(fs.existsSync(path.join(root, 'docs/temp/CODEX_PRODUCTION_DB_GUARD_FOR_APPROVAL.candidate.js'))).toBe(true);
});

test('fixed ESLint findings stay fixed (unused imports and dead values removed)', () => {
  expect(read('client/src/pages/admin/OutbreakMonitor.jsx')).not.toMatch(/\bRadio\b|calculateIncidencePer100k|const activeCount|const growthEvidence/);
  for (const f of ['client/src/pages/hospital/Register.jsx', 'client/src/pages/patient/Register.jsx', 'client/src/pages/pharmacy/Register.jsx']) {
    expect(read(f)).not.toMatch(/\bCheckCircle\b/);
  }
  expect(read('client/src/pages/Home.jsx').split('\n').slice(0, 10).join('\n')).not.toMatch(/\bActivity\b/);
  expect(read('client/src/pages/patient/Profile.jsx')).not.toMatch(/setUploadingPic|setUploadProgress/);
});
