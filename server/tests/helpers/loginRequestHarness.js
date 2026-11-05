'use strict';
// Executes the real controller with only inert repository/provider boundaries.
const fs=require('fs'),path=require('path'),vm=require('vm'),bcrypt=require('bcryptjs');
const models=['Doctor','Patient','PharmacyStaff','Hospital','Admin'];
const roles={Doctor:'doctor',Patient:'patient',PharmacyStaff:'pharmacist',Hospital:'hospital_admin',Admin:'admin'};
const hash=bcrypt.hashSync('inert-only-not-live',4);
function harness(pharmacy=false){
  const calls={reads:0,writes:0,providers:0,securityStore:0},module={exports:{}};
  const repos=Object.fromEntries(models.map(model=>[model,{findOne(){calls.reads++;const row={_id:'111111111111111111111111',role:roles[model],isActive:true,isVerified:true,password:hash};const promise=Promise.resolve(row);promise.populate=()=>promise;return promise;}}]));
  const unexpected=()=>{throw Error('UNEXPECTED_OFFLINE_DEPENDENCY');};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../src/controllers/'+(pharmacy?'pharmacyController':'authController')+'.js'),'utf8'),{
    module,exports:module.exports,Buffer,Date,process:{env:{NODE_ENV:'production'}},console:{log(){},warn(){},error(){}},
    require(name){
      if(name==='bcryptjs')return bcrypt;
      if(name.startsWith('../models/')&&repos[name.slice('../models/'.length)])return repos[name.slice('../models/'.length)];
      if(name==='../config/redis')return new Proxy({}, {get(){return ()=>{calls.securityStore++;return unexpected();};}});
      if(['../security/loginIdentifier','../security/accountState','../security/loginRequest'].includes(name))return require('../../src/security/'+name.split('/').pop());
      return new Proxy({}, {get(_target,key){if(key==='then')return undefined;return unexpected;}});
    }
  });
  return {calls,async invoke(body,ip='192.0.2.1'){let status=200,result;const res={status(code){status=code;return this;},json(value){result=value;return this;}};await module.exports[pharmacy?'loginPharmacy':'login']({body,headers:{},ip},res);return {status,result};}};
}
module.exports={harness,roles};
