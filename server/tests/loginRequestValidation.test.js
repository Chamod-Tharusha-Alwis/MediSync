'use strict';
const {harness,roles}=require('./helpers/loginRequestHarness');
const valid={email:'owned-login-fixture',password:'inert-wrong-password',role:'patient'};
const invalid=[undefined,null,[],{}, {...valid,password:{}},{...valid,password:[]},{...valid,password:true},{...valid,password:42},{...valid,password:'x'.repeat(1025)},{...valid,email:{$ne:null}},{...valid,role:{$ne:null}},{...valid,role:'unrecognized-role'},{...valid,loginType:'unrecognized-mode'}];
describe.each([false,true])('request admission pharmacy=%s',pharmacy=>{
  test.each(invalid.map((body,index)=>({body,index})))('rejects malformed case $index before repository access',async({body})=>{
    const h=harness(pharmacy),r=await h.invoke(body);expect(r.status).toBe(400);expect(h.calls).toEqual({reads:0,writes:0,providers:0,securityStore:0});expect(JSON.stringify(r.result)).not.toContain('owned-login-fixture');
  });
});
test.each(Object.values(roles))('well-shaped %s credentials reach the unchanged password check without a write',async role=>{
  const h=harness(),r=await h.invoke({...valid,role});expect(r.status).toBe(401);expect(h.calls.reads).toBeGreaterThan(0);expect(h.calls.writes).toBe(0);
});
test('well-shaped pharmacy credentials retain their existing invalid-password response',async()=>{
  const h=harness(true),r=await h.invoke({email:valid.email,password:valid.password});expect(r.status).toBe(401);expect(h.calls.reads).toBe(1);
});
test('legacy role-less and short-password attempts remain eligible for password comparison',async()=>{
  const h=harness(),r=await h.invoke({identifier:valid.email,password:'short'});expect(r.status).toBe(401);expect(h.calls.reads).toBeGreaterThan(0);
});
