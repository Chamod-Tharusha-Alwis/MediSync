'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
function verifier() {
  const module = { exports: {} }, loader = name => {
    if (name === './liveVerificationReadOnly.cjs') return { install: () => ({ violations: () => 0 }) };
    if (['fs','path','crypto'].includes(name)) return require(name);
    throw Error('OFFLINE_IMPORT_REJECTED');
  };
  loader.main = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../scripts/verify_public_activity_live.cjs'),'utf8'),{module,require:loader,__dirname:path.join(__dirname,'../../scripts'),process:{env:{}},URL,console},{filename:'actual-public-activity-verifier.cjs'});
  return module.exports;
}
const goodApi = () => ({ metric: 'recorded_consultation_visits', source: 'mongodb', mode: 'real', unit: 'visits', totalVisits: 6, byDistrict: [{ district: 'Colombo', visitCount: 6 }], trend: [{ visitCount: 6 }], surveillance: { availability: 'not_available', confirmedCases: null, outbreakClusters: null, forecast: null } });
test('actual verifier accepts only saved visits with explicitly unavailable clinical figures', () => { const api = verifier(); expect(api.assertApi(goodApi())).toBe(true); });
test.each([{ unit:'cases' }, { mode:'simulation' }, { totalCases:6 }, { forecast:[] }, { surveillance:{availability:'available',confirmedCases:0,outbreakClusters:0,forecast:[]} }, { trend:[{visitCount:0}] }, { byDistrict:[{visitCount:4}] }])('actual verifier rejects misleading API contract %#',change => { expect(() => verifier().assertApi({...goodApi(),...change})).toThrow(); });
test.each(['en','si','ta'])('actual browser-observation predicate qualifies the requested language (%s)', language => {
  const api=verifier(),row={requestedLanguage:language,language,availability:'available',caption:api.captions[language],captionVisible:true,figureVisible:true,scrolledToSurveillance:true,overflow:false,hasTemporaryNotice:false,surveillanceValues:Array(3).fill(api.unavailableLabels[language]),oldHealthRequests:0,consoleErrors:0,pageErrors:0,failedRequests:0,writeRequests:0,guardViolations:0};
  expect(api.assertObservation(row)).toBe(true);
  for(const change of [{oldHealthRequests:1},{consoleErrors:1},{pageErrors:1},{failedRequests:1},{writeRequests:1},{guardViolations:1},{overflow:true},{captionVisible:false},{scrolledToSurveillance:false},{surveillanceValues:['0','0','0']},{language:'unrecognized'},{availability:'unavailable'}])expect(()=>api.assertObservation({...row,...change})).toThrow();
});
