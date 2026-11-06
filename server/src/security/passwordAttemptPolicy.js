'use strict';
const POLICY=Object.freeze({maximumFailures:5,windowSeconds:900,storeTimeoutMs:2000});
const models=new Set(['Admin','Doctor','Patient','Hospital','PharmacyStaff']);
function unavailable(){const error=new Error('PASSWORD_ATTEMPT_STORE_UNAVAILABLE');error.code='PASSWORD_ATTEMPT_STORE_UNAVAILABLE';return error;}
function createPasswordAttemptPolicy(store){
  if(!store||!['getAttempts','incrementAttempts'].every(name=>typeof store[name]==='function'))throw unavailable();
  function key(account,model){
    const id=String(account?._id||'');
    if(!models.has(model)||!/^[a-f0-9]{24}$/i.test(id))throw unavailable();
    return 'password-login:'+model+':'+id.toLowerCase();
  }
  async function call(name,...args){
    let timer;
    try{return await Promise.race([
      Promise.resolve().then(()=>store[name](...args)),
      new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(unavailable()),POLICY.storeTimeoutMs);})
    ]);}catch{throw unavailable();}finally{clearTimeout(timer);}
  }
  function count(value){if(!Number.isSafeInteger(value)||value<0)throw unavailable();return value;}
  return Object.freeze({
    async canAttempt(account,model){return count(await call('getAttempts',key(account,model)))<POLICY.maximumFailures;},
    async recordFailure(account,model){const value=count(await call('incrementAttempts',key(account,model),POLICY.windowSeconds));if(value===0)throw unavailable();return value>=POLICY.maximumFailures;}
  });
}
// Importing this module performs no Redis operation or connection. The existing
// production security-store helper still controls admission and atomic TTLs.
const runtime=createPasswordAttemptPolicy(Object.fromEntries(['getAttempts','incrementAttempts'].map(name=>[name,(...args)=>require('../config/redis')[name](...args)])));
module.exports={...runtime,createPasswordAttemptPolicy,POLICY};
