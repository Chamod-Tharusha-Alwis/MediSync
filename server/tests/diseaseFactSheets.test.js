'use strict';
// Disease fact sheets (server/src/content/diseaseFactSheets.json): every statement needs a public source with a
// URL and accessed date, and no forbidden phrase may appear. New test file.
const FACTS = require('../src/content/diseaseFactSheets.json');
const SECTIONS = ['whatItIs', 'howItSpreads', 'symptoms', 'dangerSigns', 'prevention', 'clinicianNote'];
const FORBIDDEN = /diagnos|clinically\s+validated|clinically\s+proven|accurate\s+for\s+patients/i;
const PUBLIC_HOSTS = /^https:\/\/(www\.)?(who\.int|cdc\.gov|health\.gov\.lk|epid\.gov\.lk)(\/|$)/;

describe('disease fact sheets', () => {
  test('covers the required codes and a generic template', () => {
    for (const code of ['A90', 'A27', 'A01', 'A09', 'J11', 'generic']) expect(FACTS.sheets[code]).toBeDefined();
  });

  test('every source has a public-health URL and an accessed date', () => {
    for (const [id, s] of Object.entries(FACTS.sources)) {
      expect(`${id}:${s.url}`).toMatch(new RegExp(`^${id}:https://`));
      expect(s.url).toMatch(PUBLIC_HOSTS);
      expect(s.accessed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.publisher).toBeTruthy();
    }
    expect(FACTS.authorityContact.url).toMatch(PUBLIC_HOSTS);
    expect(FACTS.authorityContact.accessed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('every statement cites at least one known source; a statement without a source fails', () => {
    const check = sheets => {
      for (const [code, sheet] of Object.entries(sheets)) for (const key of SECTIONS) for (const item of sheet[key] || []) {
        if (!Array.isArray(item.sources) || !item.sources.length) throw new Error(`${code}.${key}: statement without a source`);
        for (const id of item.sources) if (!FACTS.sources[id]) throw new Error(`${code}.${key}: unknown source ${id}`);
        if (!item.text || !item.text.trim()) throw new Error(`${code}.${key}: empty statement`);
      }
      return true;
    };
    expect(check(FACTS.sheets)).toBe(true);
    expect(() => check({ X: { whatItIs: [{ text: 'An unsourced claim.', sources: [] }] } })).toThrow(/without a source/);
    for (const code of ['A90', 'A27', 'A01', 'A09', 'J11']) for (const key of SECTIONS) expect(FACTS.sheets[code][key].length).toBeGreaterThan(0);
  });

  test('no forbidden phrase anywhere in the fact file', () => {
    expect(JSON.stringify(FACTS.sheets)).not.toMatch(FORBIDDEN);
    expect(FORBIDDEN.test('This is clinically validated.')).toBe(true);
  });

  test('facts that could not be verified are listed, not written', () => {
    expect(FACTS.notVerifiedLeftOut.length).toBeGreaterThan(0);
    expect(JSON.stringify(FACTS.sheets)).not.toMatch(/H544|notifiable/i);
  });
});
