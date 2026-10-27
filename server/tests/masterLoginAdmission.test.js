'use strict';
const {assertAccountState,assertLoginAccount}=require('../src/security/accountState');
const {organizationLoginDto}=require('../src/security/organizationLoginDto');
const {controllerHarness}=require('./helpers/phase5xD5InertHarness');
const id='000000000000000000000001';
test.each(['isSynthetic','isDemoData','isDemoAccount','phase5xOwner','phase5xBrowserOwner','datasetVersion'])('production rejects %s marker on an otherwise verified identity',field=>{
 const row={_id:id,role:'doctor',isActive:true,isVerified:true,[field]:field==='datasetVersion'?'MEDISYNC_UNIV_DEMO_V2':true};
 expect(()=>assertAccountState({id,role:'doctor'},row,{NODE_ENV:'production'})).toThrow('ACCOUNT_DENIED');
 expect(()=>assertAccountState({id,role:'doctor'},row,{NODE_ENV:'test'})).not.toThrow();
});
test.each([{isActive:false},{isVerified:false},{mustChangePassword:true},{isDeleted:true}])('real login controller rejects ineligible doctor before password/session/provider work: %p',flags=>{
 const compare=jest.fn(),account={_id:id,role:'doctor',isActive:true,isVerified:true,...flags};
 const h=controllerHarness('authController',{dependencies:{'../models/Doctor':{findOne:async()=>account},'../security/loginIdentifier':require('../src/security/loginIdentifier'),'../security/accountState':require('../src/security/accountState'),'bcryptjs':{compare},'uuid':{v4:jest.fn()}}});
 return h.invoke('login',{body:{role:'doctor',email:'synthetic@example.invalid',password:'synthetic-only'}}).then(result=>{expect(result.status).toBe(403);expect(compare).not.toHaveBeenCalled();expect(h.calls.writes).toBe(0);});
});
test('organization login DTO never returns password hashes, OTP secrets or unknown fields',()=>{
 const hospital={_id:id,password:'private'};const result=organizationLoginDto([{_id:id,hospitalId:hospital,orgEmail:'synthetic@example.invalid',isActive:true,mustChangePassword:true,tempPassword:'private',password:'private',otpSecret:'private',other:'private'}]);
 expect(JSON.stringify(result)).not.toContain('private');expect(result[0].hospitalId).toBe(id);expect(Object.keys(result[0]).sort()).toEqual(['_id','hospitalId','isActive','mustChangePassword','orgEmail']);
});
test('model/role mismatch cannot receive a login session',()=>expect(()=>assertLoginAccount({_id:id,role:'admin',isActive:true,isVerified:true},'Doctor')).toThrow());
