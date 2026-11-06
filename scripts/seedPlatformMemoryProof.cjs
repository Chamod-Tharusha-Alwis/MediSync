'use strict';
const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),out=process.argv[2];
if(!out||!path.resolve(out).startsWith(path.join(root,'scratch')+path.sep)||process.env.MEDISYNC_OFFLINE_ONLY!=='true')throw Error('MEMORY_PROOF_ADMISSION_DENIED');
require('../server/tests/helpers/seedPlatformMemoryCases.cjs').runMemoryCases(out).then(result=>{
  fs.writeFileSync(path.join(out,'seed-memory-results.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  process.stdout.write(JSON.stringify(result)+'\n');process.exitCode=result.success?0:1;
}).catch(()=>{process.stdout.write(JSON.stringify({success:false,category:'MEMORY_PROOF_ADMISSION_OR_CLEANUP_FAILED'})+'\n');process.exitCode=1;});
