// Defense in depth for known fs APIs in a QA child, not an OS permission boundary.
const path=require('path');
function installQaSecretReadGuard(fs, attempts) {
  const forbidden=file=>{
    if(typeof file==='number')return true; // Don't accept an already opened descriptor.
    const name=file instanceof URL?file.pathname:Buffer.isBuffer(file)?file.toString():String(file);
    return /^\.env(?:\.|$)/i.test(path.basename(name));
  };
  function wrap(target,key){if(typeof target?.[key]!=='function')return;const original=target[key];target[key]=function(file,...args){
    if(forbidden(file)){attempts.push({kind:'secret-file-read',blocked:true});throw new Error('[QA] Child full-env file access prohibited');}
    return original.call(this,file,...args);
  };}
  for(const key of ['readFileSync','readFile','createReadStream','openSync','open'])wrap(fs,key);
  for(const key of ['readFile','open'])wrap(fs.promises,key);
}
module.exports={installQaSecretReadGuard};
