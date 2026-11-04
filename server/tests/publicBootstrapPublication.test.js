'use strict';
const {isSyntheticRecord,directoryDto}=require('../src/security/publicDto');
const {assertAccountState}=require('../src/security/accountState');
const fs=require('fs'),path=require('path'),vm=require('vm');
function actualController(hospitalRows=[]){
  const module={exports:{}};
  const deps={
    '../security/publicDto':require('../src/security/publicDto'),
    '../utils/outbreakForecasting':{},'../services/publicHealthStats':{},
    '../config/redis':{},'../utils/internalAuth':{},axios:{},
    mongoose:{connection:{readyState:0}},
    '../config/dbGuard':{isAutomatedTestEnvironment:()=>false,TEST_DB_NAME:'medisync_automated_test',PROD_DB_NAME:'medisync_prod'},
    '../models/Hospital':{find:()=>({select:()=>({lean:async()=>hospitalRows})})}
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/controllers/publicController.js'),'utf8'),{
    module,exports:module.exports,process:{env:{NODE_ENV:'production'}},console,
    require:name=>{if(Object.hasOwn(deps,name))return deps[name];if(name.startsWith('../models/'))return{};throw Error('UNEXPECTED_DEPENDENCY')}
  });
  return module.exports;
}
test.each(['Synthetic Demo Doctor','Dr. Synthetic Demo Doctor','Dr. Dr. Synthetic Demo Doctor'])('unmarked bootstrap doctor placeholder is identified without modifying the account (%s)',fullName=>{
  const account={_id:'owned-doctor',fullName,role:'doctor',isVerified:true,isActive:true};
  const before=JSON.stringify(account);
  expect(isSyntheticRecord(account)).toBe(true);
  expect(assertAccountState({id:account._id,role:'doctor'},account,{NODE_ENV:'production'})).toBe('Doctor');
  expect(JSON.stringify(account)).toBe(before);
  expect(directoryDto('doctor',account)).toMatchObject({isSynthetic:true});
});
test.each(['Synthetic Demo Hospital','Synthetic Demo Pharmacy'])('unmarked bootstrap facility is excluded by existing public eligibility filtering (%s)',name=>{
  const rows=[{name,isActive:true,isVerified:true},{name:'Ordinary Verified Facility',isActive:true,isVerified:true}];
  expect(rows.filter(row=>!isSyntheticRecord(row))).toEqual([rows[1]]);
  expect(directoryDto(name.endsWith('Hospital')?'hospital':'pharmacy',rows[0])).toMatchObject({isSynthetic:true});
});
test.each(['Ordinary Verified Doctor','Demo Healthcare Centre','Synthetic Materials Clinic'])('normal publication names are not rejected by a broad substring rule (%s)',name=>{
  expect(isSyntheticRecord({name,fullName:name})).toBe(false);
});
test('actual production doctor publication predicate rejects an unmarked bootstrap name',()=>{
  const account={_id:'owned-doctor',fullName:'Synthetic Demo Doctor',email:['owned','local.synthetic'].join('@'),role:'doctor',isVerified:true,isActive:true};
  expect(actualController().isPublicVerifiedDoctor(account)).toBe(false);
  expect(actualController().isPublicVerifiedDoctor({...account,fullName:'Ordinary Verified Doctor'})).toBe(true);
});
test('actual hospital endpoint excludes placeholder returned by the inert database without changing records',async()=>{
  const rows=[{_id:'owned-hospital',name:'Synthetic Demo Hospital',isActive:true,isVerified:true},{_id:'ordinary-hospital',name:'Ordinary Verified Facility',isActive:true,isVerified:true}];
  const before=JSON.stringify(rows),res={status:jest.fn().mockReturnThis(),json:jest.fn()};
  await actualController(rows).getHospitals({},res);
  expect(res.status).not.toHaveBeenCalled();
  expect(res.json.mock.calls[0][0].data).toHaveLength(1);
  expect(res.json.mock.calls[0][0].data[0].name).toBe('Ordinary Verified Facility');
  expect(JSON.stringify(rows)).toBe(before);
});
