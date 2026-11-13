import { en } from '../i18n/translations/en';
import { si } from '../i18n/translations/si';
import { ta } from '../i18n/translations/ta';

describe('Phase D4 — Trilingual Coverage Badge and Non-Profiled Notice Parity', () => {
  function extractKeys(obj, prefix = '') {
    let keys = [];
    for (const k in obj) {
      if (typeof obj[k] === 'object' && obj[k] !== null) {
        keys = keys.concat(extractKeys(obj[k], prefix + k + '.'));
      } else {
        keys.push(prefix + k);
      }
    }
    return keys;
  }

  test('trilingual translations define coverageBadge and nonProfiledNotice with exact key parity', () => {
    const enKeys = extractKeys(en);
    const siKeys = extractKeys(si);
    const taKeys = extractKeys(ta);

    // Exact parity: every language defines precisely the same leaf keys (no magic total to bump).
    expect(enKeys.length).toBeGreaterThan(800);
    expect([...siKeys].sort()).toEqual([...enKeys].sort());
    expect([...taKeys].sort()).toEqual([...enKeys].sort());

    expect(en.doctor.coverageBadge).toContain('41 reference symptom profiles curated');
    expect(en.doctor.coverageBadge).toContain('71,704 ICD-10 conditions');
    expect(en.doctor.nonProfiledNotice).toContain('No symptom reference profile for this condition');

    expect(si.doctor.coverageBadge).toBeDefined();
    expect(si.doctor.coverageBadge.length).toBeGreaterThan(10);
    expect(si.doctor.nonProfiledNotice).toBeDefined();
    expect(si.doctor.nonProfiledNotice.length).toBeGreaterThan(10);

    expect(ta.doctor.coverageBadge).toBeDefined();
    expect(ta.doctor.coverageBadge.length).toBeGreaterThan(10);
    expect(ta.doctor.nonProfiledNotice).toBeDefined();
    expect(ta.doctor.nonProfiledNotice.length).toBeGreaterThan(10);

    const diffSi = enKeys.filter(k => !siKeys.includes(k));
    const diffTa = enKeys.filter(k => !taKeys.includes(k));
    expect(diffSi).toEqual([]);
    expect(diffTa).toEqual([]);
  });
});
