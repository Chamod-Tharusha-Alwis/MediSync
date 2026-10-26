'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const policy=require('../src/security/productionAtlasPolicy');
const valid=()=>({NODE_ENV:'production',MEDISYNC_LIVE_START_APPROVED:'true',MEDISYNC_ATLAS_ROTATION_CONFIRMED:'true',MONGO_URI:'mongodb+srv://offline:fictional@medisync.p7hjket.mongodb.net/medisync_prod?retryWrites=true&w=majority&authSource=admin'});
test('production URI remains the dedicated medisync_prod database, distinct from test and QA',()=>expect(policy.assertProductionAtlasConfiguration(valid())).toMatchObject({database:'medisync_prod',cluster:'medisync.p7hjket.mongodb.net',tlsRequired:true}));
test.each([
 ['rotation absent',e=>delete e.MEDISYNC_ATLAS_ROTATION_CONFIRMED],['live access absent',e=>delete e.MEDISYNC_LIVE_START_APPROVED],['test mode',e=>e.NODE_ENV='test'],
 ['bare host without prefix',e=>e.MONGO_URI=e.MONGO_URI.replace('medisync.p7hjket.mongodb.net','p7hjket.mongodb.net')],
 ['wrong cluster prefix',e=>e.MONGO_URI=e.MONGO_URI.replace('medisync.p7hjket','wrong.p7hjket')],
 ['qa cluster prefix',e=>e.MONGO_URI=e.MONGO_URI.replace('medisync.p7hjket','qa.p7hjket')],
 ['cluster0 prefix',e=>e.MONGO_URI=e.MONGO_URI.replace('medisync.p7hjket','cluster0.p7hjket')],
 ['QA host',e=>e.MONGO_URI=e.MONGO_URI.replace('medisync.p7hjket.mongodb.net','qa-project-medisync.gwprp27.mongodb.net')],
 ['suffix collision',e=>e.MONGO_URI=e.MONGO_URI.replace('p7hjket.mongodb.net','p7hjket.mongodb.net.attacker.invalid')],
 ['legacy test database',e=>e.MONGO_URI=e.MONGO_URI.replace('/medisync_prod?','/test?')],
 ['QA database',e=>e.MONGO_URI=e.MONGO_URI.replace('/medisync_prod?','/medisync_automated_test?')],['implicit database',e=>e.MONGO_URI=e.MONGO_URI.replace('/medisync_prod?','/?')],
 ['no password',e=>e.MONGO_URI=e.MONGO_URI.replace(':fictional','')],['plaintext TLS',e=>e.MONGO_URI+='&tls=false'],['insecure TLS',e=>e.MONGO_URI+='&tlsInsecure=true'],
 ['bad cert allowed',e=>e.MONGO_URI+='&tlsAllowInvalidCertificates=true'],['duplicate option aliases',e=>e.MONGO_URI+='&TLS=true&tls=true'],['db override',e=>e.MONGO_URI+='&dbName=medisync_prod'],
 ['stale clinical reads',e=>e.MONGO_URI+='&readPreference=secondary'],['weak durability',e=>e.MONGO_URI=e.MONGO_URI.replace('majority','1')],
 ['authsource test forbidden',e=>e.MONGO_URI=e.MONGO_URI.replace('authSource=admin','authSource=test')],
 ['authsource medisync_prod forbidden',e=>e.MONGO_URI=e.MONGO_URI.replace('authSource=admin','authSource=medisync_prod')],
 ['authsource other forbidden',e=>e.MONGO_URI=e.MONGO_URI.replace('authSource=admin','authSource=other')],
 ['loaded QA material',e=>e.MONGO_URI_TEST='unread'],['same username as MONGO_URI_TEST',e=>e.MONGO_URI_TEST='mongodb+srv://offline:pass@qa-project-medisync.gwprp27.mongodb.net/medisync_automated_test'],
 ['invalid hostname option',e=>e.MONGO_URI+='&tlsAllowInvalidHostnames=true'],['file key option',e=>e.MONGO_URI+='&tlsCAFile=local.pem']
])('production configuration rejects %s before any driver use',(_,change)=>{const env=valid();change(env);expect(()=>policy.assertProductionAtlasConfiguration(env)).toThrow();});
test.each([
 {authenticatedUsers:[],authenticatedUserRoles:[{role:'readWrite',db:'medisync_prod'}]},
 {authenticatedUsers:[{}],authenticatedUserRoles:[{role:'readWrite',db:'test'}]},
 {authenticatedUsers:[{}],authenticatedUserRoles:[{role:'readWrite',db:'medisync_automated_test'}]},
 {authenticatedUsers:[{}],authenticatedUserRoles:[{role:'read',db:'medisync_prod'}]},
 {authenticatedUsers:[{}],authenticatedUserRoles:[{role:'dbAdmin',db:'medisync_prod'}]},
 {authenticatedUsers:[{}],authenticatedUserRoles:[{role:'readWriteAnyDatabase',db:'admin'}]},
 {authenticatedUsers:[{}],authenticatedUserRoles:[{role:'root',db:'admin'}]},
 {authenticatedUsers:[{}],authenticatedUserRoles:[{role:'readWrite',db:'medisync_prod'},{role:'readAnyDatabase',db:'admin'}]},
 {authenticatedUsers:[{},{}],authenticatedUserRoles:[{role:'readWrite',db:'medisync_prod'}]}
])('production role proof denies extra/wrong/absent users or roles %#',async authInfo=>await expect(policy.verifyProductionIdentity({databaseName:'medisync_prod',command:async()=>({authInfo})})).rejects.toThrow('PRODUCTION_AUTHENTICATED_ROLE_DENIED'));
test('wrong database refuses even a connectionStatus command',async()=>{const command=jest.fn();await expect(policy.verifyProductionIdentity({databaseName:'test',command})).rejects.toThrow();expect(command).not.toHaveBeenCalled();});
test('QA database refuses even a connectionStatus command',async()=>{const command=jest.fn();await expect(policy.verifyProductionIdentity({databaseName:'medisync_automated_test',command})).rejects.toThrow();expect(command).not.toHaveBeenCalled();});
test('production role receipt excludes usernames and secret/privilege objects',async()=>{
 const command=jest.fn(async()=>({authInfo:{authenticatedUsers:[{user:'not-for-output'}],authenticatedUserRoles:[{role:'readWrite',db:'medisync_prod'}]}}));
 const result=await policy.verifyProductionIdentity({databaseName:'medisync_prod',command});expect(command).toHaveBeenCalledWith({connectionStatus:1});expect(JSON.stringify(result)).not.toContain('not-for-output');expect(result.authenticatedUserCount).toBe(1);
});
test('DDL suppression covers existing schemas and explicit new schema overrides without connecting',()=>{
 const mongoose=require('mongoose'),m=new mongoose.Mongoose(),existing=m.model('OldDdl',new mongoose.Schema({name:String},{autoIndex:true,autoCreate:true}));
 policy.disableAutomaticModelDdl(m);const next=m.model('NewDdl',new mongoose.Schema({name:String},{autoIndex:true,autoCreate:true}));
 for(const schema of [existing.schema,next.schema]){expect(schema.options.autoCreate).toBe(false);expect(schema.options.autoIndex).toBe(false);}expect(m.connection.readyState).toBe(0);
});
test('actual production entry disables DDL before loading application code',()=>{
 const mongoose=require('mongoose');const load=jest.fn(()=>{expect(mongoose.get('autoCreate')).toBe(false);expect(mongoose.get('autoIndex')).toBe(false);return{startServer:()=>true};});
 expect(require('../src/production').startProduction({NODE_ENV:'production',MEDISYNC_ATLAS_ROTATION_CONFIRMED:'true'},load)).toBe(true);
});
test('production entry holds before application imports when both compromised identity rotations are not attested',()=>{const load=jest.fn();expect(()=>require('../src/production').startProduction({NODE_ENV:'production'},load)).toThrow('ROTATED');expect(load).not.toHaveBeenCalled();});
function candidate({env=valid(),roles=[{role:'readWrite',db:'medisync_prod'}]}={}){
 const calls=[];class Connection{};class Db{};class Collection{};
 const mongoose={models:{},plugin:jest.fn(),set:jest.fn(),Connection,Model:{deleteMany(){}},mongo:{Db,Collection},connection:{db:{databaseName:'medisync_prod',command:jest.fn(async()=>({authInfo:{authenticatedUsers:[{}],authenticatedUserRoles:roles}}))}},connect:jest.fn(async(_uri,options)=>calls.push(options)),disconnect:jest.fn(async()=>{})};
 const mod={exports:{}};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../docs/temp/CODEX_PRODUCTION_DB_GUARD_FOR_APPROVAL.candidate.js'),'utf8'),{module:mod,process:{env},require(name){if(name==='mongoose')return mongoose;if(name==='crypto')return crypto;if(name==='mongodb-connection-string-url')return require(name);if(name==='../security/productionAtlasPolicy')return policy;throw Error('CANDIDATE_IMPORT_FORBIDDEN');}});
 return{guard:mod.exports,mongoose,calls};
}
test('unapplied protected candidate performs TLS/DDL policy before mock connect and verifies sole role',async()=>{
 const {guard,mongoose,calls}=candidate();const result=await guard.connectProductionDB();expect(result.authenticatedRoles).toEqual([{role:'readWrite',db:'medisync_prod'}]);
 expect(calls[0]).toMatchObject({dbName:'medisync_prod',tls:true,autoIndex:false,autoCreate:false,readPreference:'primary',writeConcern:{w:'majority'}});expect(mongoose.set).toHaveBeenCalledWith('autoIndex',false);expect(mongoose.connection.db.command).toHaveBeenCalledTimes(1);
});
test('unapplied protected candidate disconnects and stops on a bad authenticated role',async()=>{const {guard,mongoose}=candidate({roles:[{role:'root',db:'admin'}]});await expect(guard.connectProductionDB()).rejects.toThrow('verification failed');expect(mongoose.disconnect).toHaveBeenCalledTimes(1);});
test('unapplied candidate cannot dispatch a connection before rotation attestation',async()=>{const env=valid();delete env.MEDISYNC_ATLAS_ROTATION_CONFIRMED;const {guard,calls}=candidate({env});await expect(guard.connectProductionDB()).rejects.toThrow('ROTATED');expect(calls).toHaveLength(0);});
