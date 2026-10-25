'use strict';
// Synthetic observation interface only. No driver/prototype, callbacks, DNS or I/O.
const assert=require('assert');
const contract=require('./qaIsolatedParentContract');
function createInertConnectionBoundary(policy,uri,resolution){
  const pinned=JSON.parse(JSON.stringify(policy));
  contract.validateQaUri(uri,pinned,resolution);
  let poisoned=false,observations=0;
  const allowedReads=new Set(['connectionStatus','listCollections','find','count','getMore','killCursors','ping']);
  function observe(actual){
    assert(!poisoned,'Frozen after observation failure');
    try{
      contract.validateQaUri(actual.uri,pinned,actual.resolution);
      assert(actual.database===contract.DB);
      assert.deepEqual(actual.options,pinned.driverOptions);
      assert(Array.isArray(actual.users)&&actual.users.length===1&&actual.users[0].db==='admin'&&contract.sha(actual.users[0].user)===pinned.expectedQaPrincipalSha256);
      assert.deepEqual(actual.roles,[{role:'readWrite',db:contract.DB}]);
      assert(actual.complete===true&&actual.lostEvents===0&&actual.reconnected===false&&actual.reauthenticated===false);
      observations++;
    }catch(error){poisoned=true;throw error;}
    return {simulationOnly:true,executionAuthorized:false,observations};
  }
  function readDescriptor(command){assert(!poisoned&&observations>0&&allowedReads.has(command),'Unobserved/write/raw command refused');return {simulationOnly:true,command,actualDispatch:0};}
  return Object.freeze({observe,readDescriptor,status:()=>({simulationOnly:true,executionAuthorized:false,poisoned,observations,actualDispatch:0})});
}
module.exports={createInertConnectionBoundary};
