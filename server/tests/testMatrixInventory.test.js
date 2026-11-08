'use strict';
const path=require('path');
const {inventory,clientRows,serverRows,classify,safeTarget,markdown}=require('../../scripts/buildTestMatrix.cjs');
test('JSX nested doctor routes and wildcard dashboard routes retain their real prefixes',()=>{
  const app=clientRows('<Route path="/doctor"><Route path="consultation/new" element={<Form/>}/></Route>','client/src/App.js');
  expect(app.map(r=>r.route)).toEqual(['/doctor','/doctor/consultation/new']);
  expect(clientRows('<Route path="/dashboard/history" element={<History/>}/>','client/src/pages/patient/Dashboard.jsx')[0]).toMatchObject({route:'/patient/dashboard/history',role:'patient'});
});
test('actual handler graph follows a save callback and preserves exact HTTP semantics',()=>{
  const source="const save=async()=>api.post('/doctor/consultation',{});const handleSubmit=()=>save();const C=()=> <form onSubmit={handleSubmit}/>;";
  const rows=clientRows(source,'client/src/pages/doctor/Form.jsx');
  expect(rows.find(r=>r.kind==='UI_ACTION')).toMatchObject({classification:'W-clin',endpoints:[{method:'POST',route:'/doctor/consultation'}]});
  expect(rows.find(r=>r.kind==='CLIENT_REQUEST')).toMatchObject({method:'POST',classification:'W-clin'});
});
test('unresolved delegated callbacks are flagged instead of becoming live authorization',()=>{
  const rows=clientRows('const C=({handleAction})=><button onClick={handleAction}/>;','client/src/components/Control.jsx');
  expect(rows[0].review).toBe('CALLBACK_REVIEW_REQUIRED');
});
test('templates retain only a parameter pattern, never runtime values',()=>{
  const rows=clientRows('api.get(`/patient/${patient.nic}/timeline`);','client/src/pages/doctor/Page.jsx');
  expect(rows[0].route).toBe('/patient/:param/timeline');
  expect(safeTarget('https://api.example.invalid/health?token=not-retained')).toBe('/health');
});
test.each([
  [{method:'DELETE',route:'/users/:id'},'X'],
  [{method:'POST',route:'/admin/outbreak/trigger'},'X'],
  [{method:'POST',name:'handleDelete'},'X'],
  [{method:'POST',route:'/patient/request-access'},'W-sec'],
  [{method:'POST',route:'/auth/change-password'},'W-sec'],
  [{method:'PATCH',route:'/auth/preferences/language'},'W-low'],
  [{method:'POST',route:'/pharmacy/dispense'},'W-clin'],
  [{method:'GET',route:'/doctor/consultation-command/:key'},'W-clin'],
  [{method:'PUT',route:'/admin/users/toggle',role:'admin'},'W-adm'],
  [{method:'GET',route:'/public/consultation-activity'},'R']
])('classification keeps restricted action %# outside anonymous read permission', (input,expected)=>expect(classify(input)).toBe(expected));
test('router mount aliases and middleware-bound role arrays are all enumerated',()=>{
  const source="const protect=require('../middleware/verifiedAuth');const auth=protect(['hospital_admin']);router.get('/stats',auth,controller.stats);";
  const rows=serverRows(source,'server/src/routes/hospitalRoutes.js',['/api/hospital','/api/alias']);
  expect(rows.map(r=>r.route)).toEqual(['/api/hospital/stats','/api/alias/stats']);expect(rows.every(r=>r.role==='hospital')).toBe(true);
});
test('dynamic route registration fails instead of silently omitting a function',()=>{
  expect(()=>serverRows('router.get(runtimePath, handler);','server/src/routes/publicRoutes.js',['/api/public'])).toThrow('DYNAMIC_SERVER_ROUTE_REQUIRES_REVIEW');
});
test('real current import graph excludes the historical university application; all matrix IDs and classes are complete',()=>{
  const result=inventory(path.resolve(__dirname,'../..'));
  expect(result.rows.length).toBeGreaterThan(500);expect(result.kinds.API).toBe(215);
  expect(result.rows.some(r=>r.file==='client/src/UniversityApp.jsx')).toBe(false);
  expect(result.notReachableClientFiles).toContain('client/src/UniversityApp.jsx');
  expect(new Set(result.rows.map(r=>r.id)).size).toBe(result.rows.length);
  expect(Object.values(result.counts).reduce((a,b)=>a+b,0)).toBe(result.rows.length);
  expect(result.rows.every(r=>r.live==='NOT VERIFIED'&&r.evidence&&r.languages.length&&r.widths.length)).toBe(true);
  expect(result.rows.filter(r=>r.file.endsWith('qaRoutes.js')).every(r=>r.review==='QA_ONLY_NOT_A_LIVE_TARGET')).toBe(true);
  const md=markdown(result,'docs/temp/CODEX_synthetic_inventory.json');
  expect(md).toContain('not authorization');expect(md).toContain('NOT VERIFIED');
});
