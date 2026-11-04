'use strict';
const {createRuntimeHealth,deploymentCommit}=require('../src/security/runtimeHealth');
const response=()=>({status:jest.fn().mockReturnThis(),json:jest.fn()});
test('only a complete Render source revision is exposed, normalized as a public commit',()=>{
  const revision='A'.repeat(40),res=response();
  createRuntimeHealth({mongoReady:()=>true,redisReady:()=>true,env:{RENDER_GIT_COMMIT:revision}})({},res);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith({status:'ready',service:'medisync-express',commit:revision.toLowerCase()});
});
test.each([undefined,'','a'.repeat(39),'a'.repeat(41),'not-a-revision','a'.repeat(40)+'\n',{}])('malformed or absent revision is omitted, never reflected (%p)',value=>{
  const res=response();createRuntimeHealth({mongoReady:()=>true,redisReady:()=>true,env:{RENDER_GIT_COMMIT:value}})({},res);
  expect(deploymentCommit({RENDER_GIT_COMMIT:value})).toBeNull();
  expect(res.json).toHaveBeenCalledWith({status:'ready',service:'medisync-express'});
});
test('unrelated environment fields are never returned',()=>{
  const res=response();createRuntimeHealth({mongoReady:()=>true,redisReady:()=>true,env:{OTHER_PRIVATE_SETTING:'owned-inert-sentinel'}})({},res);
  expect(JSON.stringify(res.json.mock.calls)).not.toContain('owned-inert-sentinel');
});
test.each(['mongo','redis','admission','stopping','exception'])('revision metadata cannot override a failed %s readiness check',failure=>{
  const res=response(),revision='b'.repeat(40);
  createRuntimeHealth({env:{RENDER_GIT_COMMIT:revision},mongoReady:()=>{if(failure==='exception')throw Error('owned-inert-error');return failure!=='mongo'},redisReady:()=>failure!=='redis',requireAdmission:true,admissionReady:()=>failure!=='admission',stopping:()=>failure==='stopping'})({},res);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.json).toHaveBeenCalledWith({status:'unavailable',service:'medisync-express',commit:revision});
  expect(JSON.stringify(res.json.mock.calls)).not.toContain('owned-inert-error');
});
