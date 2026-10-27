'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const {assertClinicalEntry}=require('../src/security/clinicalEntryPolicy');
const {assertProductionRuntime}=require('../src/security/productionRuntimePolicy');
test.each(['true','university-static-demo',''])('clinical entry rejects nonclinical mode %s before application imports',mode=>{
  const loaded=[];
  expect(()=>vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8'),{
    process:{env:{MEDISYNC_DEPLOYMENT_MODE:mode}},
    require(name){
      loaded.push(name);
      if(name==='./security/clinicalEntryPolicy') return {assertClinicalEntry};
      throw Error('UNEXPECTED_IMPORT');
    }
  })).toThrow('CLINICAL_ENTRY_MODE_REQUIRED');
  expect(loaded).toEqual(['./security/clinicalEntryPolicy']);
});
test('dotenv cannot switch a clinical process into another deployment mode',()=>{
  const env={},loaded=[];
  expect(()=>vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8'),{
    process:{env},
    require(name){
      loaded.push(name);
      if(name==='./security/clinicalEntryPolicy') return {assertClinicalEntry};
      if(name==='dotenv') return {config(){env.MEDISYNC_PUBLIC_DEMO='true';}};
      throw Error('UNEXPECTED_IMPORT');
    }
  })).toThrow('CLINICAL_ENTRY_MODE_REQUIRED');
  expect(loaded).toEqual(['./security/clinicalEntryPolicy','dotenv','./security/clinicalEntryPolicy']);
});
test('production entry rejects QA material before loading app',()=>{
  expect(()=>assertProductionRuntime({NODE_ENV:'production',MONGO_URI_TEST:'synthetic-unread'})).toThrow('PRODUCTION_RUNTIME_QA_MATERIAL_FORBIDDEN');
  expect(assertProductionRuntime({NODE_ENV:'production'}).profile).toBe('production-clinical');
});

