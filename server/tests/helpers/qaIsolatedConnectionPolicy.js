'use strict';
// Inert-only entry adapter. No MongoDB/Mongoose imports or actual native installation.
const assert=require('assert');
const c=require('./qaIsolatedParentContract');
const drivers=new WeakMap(),proofs=new WeakMap();
const ENTRY_POINTS=Object.freeze(['mongoose.connect','mongoose.createConnection','Connection.openUri','NativeConnection.createClient','NativeConnection.setClient','NativeConnection.useDb','MongoClient.constructor','MongoClient.connect','MongoClient.prototype.connect','MongoClient._connect','MongoClient.db','raw-driver','reconnect']);
function createInertDriver({database,connectionStatus,guards,failConnect=false,failDisconnect=false}){
  const driver=Object.freeze({simulationOnly:true});drivers.set(driver,{database,connectionStatus:JSON.parse(JSON.stringify(connectionStatus)),guards:{...guards},failConnect,failDisconnect,connects:0,statusCalls:0,disconnects:0,released:false});return driver;
}
function validateRuntime(state,r,role){
  assert(c.ROLES.includes(role),'Fixed child role required');
  const a=r.connectionStatus?.authInfo,users=a?.authenticatedUsers,roles=a?.authenticatedUserRoles;
  assert(r.database===c.DB&&Array.isArray(users)&&users.length===1&&typeof users[0]?.user==='string'&&c.sha(users[0].user)===state.policy.expectedQaPrincipalSha256&&users[0].db==='admin','Actual QA principal/database proof required');
  assert(Array.isArray(roles)&&roles.length===1&&roles[0]?.role==='readWrite'&&roles[0]?.db===c.DB,'Sole restricted role required');
  for(const key of ['dbGuard','nativeGuard','schemaGuard','readOnly','ownedReferences','providersMocked','zeroOwnedIds'])assert(r.guards[key]===true,'Required read-only guard missing');
}
async function connectInert({context,driver,role,uri,resolution,options,entry='mongoose.connect'}){
  const state=c.contextState(context,{consumed:true});assert(c.ROLES.includes(role),'Fixed child role required');
  assert(entry==='mongoose.connect','Alternate raw/native connection entry refused');
  if(role==='backend')assert(state.preflight,'No backend before successful positive preflight');
  const r=drivers.get(driver);assert(r,'Actual/unbranded driver cannot be installed in ENV5');
  const target=c.validateQaUri(uri,state.policy,resolution);assert.deepEqual(options,target.driverOptions,'Driver override refused');
  assert(!r.connects,'No reconnect or retry in one inert connection role');r.connects++;
  try{
    if(r.failConnect)throw Error('Inert acquisition failed');
    r.statusCalls++;validateRuntime(state,r,role);
    const proof=Object.freeze({simulationOnly:true,executionAuthorized:false,role,approvalSha256:state.approvalSha256,contractSha256:state.contractSha256,hostId:state.policy.hostId,hostEpoch:state.policy.hostEpoch,ledgerEpoch:state.policy.ledgerEpoch,readOnly:true,database:c.DB});
    proofs.set(proof,{context,role,driver});return proof;
  }catch(error){await disconnectInert(driver);throw error;}
}
async function disconnectInert(driver){const r=drivers.get(driver);assert(r,'Inert driver required');r.disconnects++;await Promise.resolve();if(r.failDisconnect)throw Object.assign(Error('Inert release failed; recovery required'),{code:'ENV5_RELEASE_FAILED'});r.released=true;}
function assertConnectionProof(context,proof,role){const state=c.contextState(context,{consumed:true}),r=proofs.get(proof);assert(r&&r.context===context&&r.role===role&&proof.approvalSha256===state.approvalSha256&&proof.contractSha256===state.contractSha256,'Own positive role/connection proof required');return true;}
function assertReleasedProof(proof){const record=proofs.get(proof);assert(record&&drivers.get(record.driver)?.released===true,'Observer release must be awaited before preflight acceptance');return true;}
function driverStatus(driver){const r=drivers.get(driver);assert(r);return{connects:r.connects,connectionStatusCalls:r.statusCalls,disconnects:r.disconnects,released:r.released,actualDatabaseDispatch:0};}
function refuseWrite(){throw Error('Read-only E1 policy refuses every mutation');}
function installLiveConnectionPolicy(){return c.assertLiveExecutionClosed();}
module.exports={ENTRY_POINTS,createInertDriver,connectInert,disconnectInert,assertConnectionProof,assertReleasedProof,driverStatus,refuseWrite,installLiveConnectionPolicy};
