'use strict';
const path=require('path');
const {readDictionary,compareLocales,inspectSource,audit,summary}=require('../../scripts/audit_ui_translations.js');
const dict=(name,body)=>readDictionary('export const '+name+' = '+body+';');
test('equal counts with different keys fail actual locale parity',()=>{
  const result=compareLocales({en:dict('en',"{a:'Alpha',b:'Beta'}"),si:dict('si',"{a:'අ',c:'ආ'}"),ta:dict('ta',"{a:'அ',b:'ஆ'}")});
  expect(result.keyParityPassed).toBe(false);expect(result.languages.si.keyCount).toBe(2);
  expect(result.languages.si.missing).toEqual(['b']);expect(result.languages.si.extra).toEqual(['c']);
});
test('duplicate nested declarations and empty labels cannot masquerade as parity',()=>{
  const en=dict('en',"{g:{a:'Alpha'}}"),si=dict('si',"{g:{a:'අ'},g:{a:'  '}}"),ta=dict('ta',"{g:{a:'அ'}}");
  const result=compareLocales({en,si,ta});expect(result.keyParityPassed).toBe(false);expect(result.languages.si.empty).toEqual(['g.a']);expect(result.languages.si.duplicates.map(r=>r.key)).toEqual(['g']);
});
test('locale parsing never executes initializer code',()=>{
  global.inertLocaleSideEffect=false;
  expect(()=>readDictionary("export const en={a:(()=>{global.inertLocaleSideEffect=true;return 'private-sentinel';})()};")).toThrow('DICTIONARY_VALUE_REVIEW_REQUIRED');
  expect(global.inertLocaleSideEffect).toBe(false);delete global.inertLocaleSideEffect;
});
test('JSX inventory sees Unicode, attributes and messages but emits positions only',()=>{
  const source="const C=()=> <input aria-label='private-sentinel' placeholder='අ ඇ'/>;toast.error('private-sentinel');const D=()=> <p>தமிழ்</p>;";
  const result=inspectSource(source,'client/src/components/Inert.jsx',new Set());
  expect(result.candidates.filter(r=>r.kind==='DISPLAY_ATTRIBUTE')).toHaveLength(2);expect(result.candidates.some(r=>r.kind==='MESSAGE_LITERAL')).toBe(true);expect(result.candidates.some(r=>r.kind==='JSX_TEXT')).toBe(true);
  expect(JSON.stringify(result)).not.toContain('private-sentinel');expect(JSON.stringify(result)).not.toContain('தமிழ்');
});
test('nested JSX does not turn CSS, comparison enums or translated fallbacks into display findings',()=>{
  const source="const C=()=> <div className='private-css'>{mode==='private-enum'?<span className='private-css'>Wait</span>:t('known','Private translated fallback')}</div>;";
  const result=inspectSource(source,'client/src/Page.jsx',new Set(['known']));
  expect(result.candidates).toHaveLength(1);expect(result.candidates[0].kind).toBe('JSX_TEXT');expect(result.uses).toHaveLength(1);
});
test('conditional result text is audited without counting its branch predicate',()=>{
  const r=inspectSource("const C=()=> <p>{mode==='internal'?'Wait':t('known','Ready')}</p>;",'client/src/Page.jsx',new Set(['known']));
  expect(r.candidates).toHaveLength(1);expect(r.candidates[0].kind).toBe('CONDITIONAL_DISPLAY_TEXT');
});
test('fallbacks do not hide a missing translation registration; dynamic keys are explicit',()=>{
  const r=inspectSource("t('missing','English fallback');t('known');t(key);",'client/src/Page.jsx',new Set(['known']));
  expect(r.uses.filter(x=>x.missing).map(x=>x.key)).toEqual(['missing']);expect(r.dynamicKeys).toHaveLength(1);expect(r.candidates).toHaveLength(0);
});
test('dynamic server messages are flagged without serializing the source message',()=>{
  const r=inspectSource("toast.error(error.message || 'private-sentinel');const C=()=> <p>{error.message}</p>;",'client/src/Page.jsx',new Set());
  expect(r.candidates.map(x=>x.kind)).toEqual(expect.arrayContaining(['DYNAMIC_MESSAGE_ARGUMENT','DYNAMIC_ERROR_MESSAGE','MESSAGE_LITERAL']));expect(JSON.stringify(r)).not.toContain('private-sentinel');
});
test('fixed locale formatting is a review finding, not proof of a timezone defect',()=>{
  const result=inspectSource("new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Colombo'});value.toLocaleString('en-US');",'client/src/format.js',new Set());
  expect(result.candidates).toHaveLength(2);expect(result.candidates.every(r=>r.kind==='FIXED_LOCALE_FORMAT'&&r.review==='SOURCE_REVIEW_REQUIRED')).toBe(true);
});
test('parity output contains key metadata and no dictionary values',()=>{
  const locales={en:dict('en',"{a:'private-sentinel'}"),si:dict('si',"{a:'private-sentinel'}"),ta:dict('ta',"{a:'அ'}")};
  const result=compareLocales(locales);expect(result.keyParityPassed).toBe(true);expect(result.languages.si.equalToEnglishCount).toBe(1);expect(JSON.stringify(result)).not.toContain('private-sentinel');
});
test('actual current dictionaries have parity and every static used key is registered',()=>{
  const result=audit(path.resolve(__dirname,'../..'));expect(result.keyParityPassed).toBe(true);
  expect(result.missingUsageKeys).toEqual([]);
  expect(Object.hasOwn(result.source,'client/src/UniversityApp.jsx')).toBe(false);
  expect(Object.hasOwn(result.source,'client/src/App.js')).toBe(true);
  expect(summary(result).translationReadiness).toBe('NOT_VERIFIED');
});
