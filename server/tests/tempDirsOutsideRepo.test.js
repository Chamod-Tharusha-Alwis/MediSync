'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  testTmpBase,
  bestEffortCleanup,
  isAllowedTempChild,
  cleanEnvironment
} = require('../../scripts/run_offline_tests');

const root = path.resolve(__dirname, '../..');

describe('Task 1.7: Test temp directories outside the repository', () => {
  test('testTmpBase resolves under os.tmpdir() (or MEDISYNC_TEST_TMP) and never inside the repo', () => {
    const tmp = testTmpBase();
    const realRoot = fs.realpathSync(root);
    expect(tmp.startsWith(realRoot + path.sep)).toBe(false);
    expect(tmp).not.toBe(realRoot);
    expect(fs.existsSync(tmp)).toBe(true);
  });

  test('cleanEnvironment propagates MEDISYNC_TEST_TMP outside the repository', () => {
    const env = cleanEnvironment();
    const realRoot = fs.realpathSync(root);
    expect(typeof env.MEDISYNC_TEST_TMP).toBe('string');
    expect(env.MEDISYNC_TEST_TMP.startsWith(realRoot + path.sep)).toBe(false);
  });

  test('no files or directories are created under <repo>/scratch during offline tests', () => {
    const scratchPath = path.join(root, 'scratch');
    expect(fs.existsSync(scratchPath)).toBe(false);
  });

  test('offline runner, memory replica test, and reference packaging test do not mkdtemp inside <repo>/scratch', () => {
    for (const rel of [
      'scripts/run_offline_tests.js',
      'scripts/realLocalStack.test.cjs',
      'server/tests/websiteReferencePackaging.test.js'
    ]) {
      const src = fs.readFileSync(path.join(root, rel), 'utf8');
      expect(src).not.toMatch(/mkdtempSync\(\s*path\.join\(\s*root\s*,\s*['"]scratch/);
      expect(src).not.toMatch(/mkdirSync\(\s*path\.join\(\s*root\s*,\s*['"]scratch['"]\)/);
    }
  });

  test('bestEffortCleanup removes owned temp directory and swallows EBUSY/EPERM errors safely', () => {
    const sample = fs.mkdtempSync(path.join(testTmpBase(), 'cleanup-check-'));
    fs.writeFileSync(path.join(sample, 'probe.txt'), 'ok');
    expect(bestEffortCleanup(sample)).toBe(true);
    expect(fs.existsSync(sample)).toBe(false);

    const spy = jest.spyOn(fs, 'rmSync').mockImplementation(() => {
      const err = new Error('Resource busy or locked');
      err.code = 'EBUSY';
      throw err;
    });
    try {
      expect(() => bestEffortCleanup(path.join(os.tmpdir(), 'locked-dir'))).not.toThrow();
      expect(bestEffortCleanup(path.join(os.tmpdir(), 'locked-dir'))).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  test('isAllowedTempChild admits temp child paths and rejects arbitrary paths', () => {
    const validChild = path.join(testTmpBase(), 'clinical-offline-abc123');
    expect(isAllowedTempChild(validChild)).toBe(true);
    expect(isAllowedTempChild(path.join(root, 'server', 'src'))).toBe(false);
  });
});
