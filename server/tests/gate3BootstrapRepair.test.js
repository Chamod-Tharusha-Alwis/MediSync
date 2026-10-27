'use strict';
jest.mock('dotenv', () => ({ config: jest.fn(() => ({ parsed: {} })) }));
const { production, qa, identity } = require('./helpers/gate3OperatorEnvironment');
let mongoose, bootstrap, models, compilationFlags, priorEnv, priorDb;
let records, pending, session, active, failSave, failCommit;
const passwords = Object.fromEntries(['admin','doctor','hospital','pharmacy','patient'].map(role => [role,'Synthetic-Only-Password-2026!']));
const priorKey=global.ENCRYPTION_KEY, priorKeys=global.ENCRYPTION_KEYS, priorVersion=global.ACTIVE_KEY_VERSION;

beforeAll(() => {
  global.ENCRYPTION_KEY='Synthetic-Only-Key-For-Offline-Tests';
  global.ENCRYPTION_KEYS={'1':global.ENCRYPTION_KEY}; global.ACTIVE_KEY_VERSION=1;
  jest.isolateModules(() => {
    mongoose=require('mongoose'); mongoose.set('autoCreate',true); mongoose.set('autoIndex',true);
    compilationFlags=[];
    const original=mongoose.model.bind(mongoose);
    jest.spyOn(mongoose,'model').mockImplementation((...args) => {
      compilationFlags.push({autoCreate:mongoose.get('autoCreate'),autoIndex:mongoose.get('autoIndex')});
      return original(...args);
    });
    bootstrap=require('../scripts/bootstrapSyntheticAccounts');
    models=Object.values(mongoose.models);
  });
});
afterAll(() => {global.ENCRYPTION_KEY=priorKey;global.ENCRYPTION_KEYS=priorKeys;global.ACTIVE_KEY_VERSION=priorVersion;});
beforeEach(() => {
  priorEnv=process.env; process.env=production(); priorDb=mongoose.connection.db;
  records=new Map(); pending=[]; active=false; failSave=null; failCommit=false;
  session={
    startTransaction:jest.fn(() => {active=true;}),
    inTransaction:() => active,
    commitTransaction:jest.fn(async () => {
      for(const {name,document} of pending) records.set(name,document);
      pending=[]; active=false;
      if(failCommit) throw Error('INERT_COMMIT_RESPONSE_LOST');
    }),
    abortTransaction:jest.fn(async () => {pending=[];active=false;}),
    endSession:jest.fn(async () => {})
  };
  mongoose.connection.db={databaseName:'medisync_prod',command:jest.fn(async () => identity('medisync_prod'))};
  jest.spyOn(mongoose,'connect').mockResolvedValue(mongoose);
  jest.spyOn(mongoose,'disconnect').mockResolvedValue();
  jest.spyOn(mongoose,'startSession').mockResolvedValue(session);
  jest.spyOn(console,'log').mockImplementation(() => {});
  for(const Model of models){
    jest.spyOn(Model,'findOne').mockImplementation(async (_filter,_projection,options) => {
      if(active) expect(options.session).toBe(session);
      return records.get(Model.modelName)||null;
    });
    jest.spyOn(Model.prototype,'save').mockImplementation(async function(options){
      expect(options.session).toBe(session); expect(active).toBe(true);
      if(records.has(Model.modelName)) throw Error('INERT_EXISTING_RECORD_WRITE_FORBIDDEN');
      if(failSave===Model.modelName) throw Error('INERT_LATE_SAVE_FAILURE');
      await this.validate();
      pending.push({name:Model.modelName,document:this}); return this;
    });
  }
});
afterEach(() => {process.env=priorEnv;mongoose.connection.db=priorDb;mongoose.connection.readyState=0;jest.restoreAllMocks();});

function existingBaseline(){
  for(const Model of models) records.set(Model.modelName,new Model({_id:new mongoose.Types.ObjectId(),email:Model.modelName.toLowerCase()+'@medisync.synthetic',password:'inert',isActive:true,isSuperAdmin:true}));
  const rx=new (mongoose.model('Prescription'))({
    prescriptionId:'RX-SYNTH-001',consultationId:records.get('Consultation')._id,consultationRef:'CON-SYNTH-001',
    patientId:records.get('Patient')._id,doctorId:records.get('Doctor')._id,patientNic:'199512345678',
    drugName:'Amoxicillin 500mg',dosage:'1 capsule',frequency:'8 hourly',durationDays:5,
    medications:[{name:'Amoxicillin 500mg',dosage:'1 capsule',frequency:'8 hourly'}],
    expiresAt:new Date(Date.now()+86400000),status:'dispensed'
  });
  records.set('Prescription',rx);return rx;
}
function noSaves(){for(const Model of models) expect(Model.prototype.save).not.toHaveBeenCalled();}

test('cold import disables DDL before actual model compilation',() => {
  expect(compilationFlags.length).toBeGreaterThanOrEqual(10);
  expect(compilationFlags.every(row=>row.autoCreate===false&&row.autoIndex===false)).toBe(true);
  for(const Model of models) expect(Model.schema.options).toMatchObject({autoCreate:false,autoIndex:false});
});

test('dry-run uses only inert reads and real Model.init performs zero implicit DDL',async () => {
  const ddl=[];
  for(const Model of models){
    ddl.push(jest.spyOn(Model,'createCollection').mockRejectedValue(Error('IMPLICIT_DDL_FORBIDDEN')));
    ddl.push(jest.spyOn(Model,'ensureIndexes').mockRejectedValue(Error('IMPLICIT_DDL_FORBIDDEN')));
    Model.$init=undefined;await Model.init();
  }
  const report=await bootstrap.bootstrapSyntheticData({passwords});
  expect(report.created).toEqual([]);expect(report.updated).toEqual([]);noSaves();
  expect(mongoose.connect).toHaveBeenCalledWith(process.env.MONGO_URI,expect.objectContaining({dbName:'medisync_prod',tls:true,autoCreate:false,autoIndex:false}));
  expect(mongoose.startSession).not.toHaveBeenCalled();expect(mongoose.disconnect).toHaveBeenCalledTimes(1);
  for(const spy of ddl)expect(spy).not.toHaveBeenCalled();
});

test('new actual Admin satisfies unchanged startup query; all baseline creates commit once in one session',async () => {
  const report=await bootstrap.bootstrapSyntheticData({isApply:true,passwords});
  const Admin=mongoose.model('Admin'),created=records.get('Admin');
  expect(created).toBeInstanceOf(Admin);
  expect(created).toMatchObject({isSuperAdmin:true,isActive:true,twoFactorEnabled:false});
  expect(created.password).not.toBe(passwords.admin);
  await expect(require('bcryptjs').compare(passwords.admin,created.password)).resolves.toBe(true);
  Admin.findOne.mockRestore();
  const read=jest.spyOn(Admin.collection,'findOne').mockImplementation(async filter=>{
    expect(filter).toEqual({isActive:true,isSuperAdmin:true});
    return Object.entries(filter).every(([key,value])=>created[key]===value)?{_id:created._id}:null;
  });
  await expect(Admin.exists({isActive:true,isSuperAdmin:true})).resolves.toMatchObject({_id:created._id});
  expect(read).toHaveBeenCalledTimes(1);
  expect(report.created).toHaveLength(10);expect(report.updated).toEqual([]);
  expect(session.commitTransaction).toHaveBeenCalledTimes(1);expect(session.abortTransaction).not.toHaveBeenCalled();
  expect(session.endSession).toHaveBeenCalledTimes(1);expect(mongoose.disconnect).toHaveBeenCalledTimes(1);
});

test.each([{isSuperAdmin:false,isActive:true},{isSuperAdmin:true,isActive:false}])('existing incompatible Admin %j is never modified',async state=>{
  existingBaseline();Object.assign(records.get('Admin'),state);
  const before=JSON.stringify([...records]);
  await expect(bootstrap.bootstrapSyntheticData({isApply:true,passwords})).rejects.toThrow('EXISTING_ADMIN_NOT_STARTUP_READY');
  expect(JSON.stringify([...records])).toBe(before);noSaves();expect(session.abortTransaction).toHaveBeenCalledTimes(1);
});

test('compatible existing prescription including legitimate dispensing status is preserved exactly on retry',async()=>{
  existingBaseline();const before=JSON.stringify([...records]);
  const report=await bootstrap.bootstrapSyntheticData({isApply:true,passwords});
  expect(report.created).toEqual([]);expect(report.updated).toEqual([]);noSaves();
  expect(JSON.stringify([...records])).toBe(before);expect(records.get('Prescription').status).toBe('dispensed');
});

const corruptions=[
 ['expired',rx=>{rx.expiresAt=new Date(0);}],['missing expiry',rx=>{rx.expiresAt=undefined;}],
 ['invalid expiry',rx=>{rx.expiresAt=new Date('invalid');}],['changed drug',rx=>{rx.drugName='Paracetamol 500mg';}],
 ['changed medication',rx=>{rx.medications[0].name='Paracetamol 500mg';}],['missing medication',rx=>{rx.medications=[];}],
 ['changed dosage',rx=>{rx.dosage='different';}],['changed frequency',rx=>{rx.frequency='different';}],
 ['changed duration',rx=>{rx.durationDays=1;}],['foreign patient',rx=>{rx.patientId=new mongoose.Types.ObjectId();}],
 ['foreign doctor',rx=>{rx.doctorId=new mongoose.Types.ObjectId();}],['foreign consultation',rx=>{rx.consultationId=new mongoose.Types.ObjectId();}],
 ['wrong consultation reference',rx=>{rx.consultationRef='other';}]
];
test.each(corruptions)('incompatible existing prescription: %s blocks all earlier account creation and changes no record',async(_name,corrupt)=>{
 const rx=existingBaseline();corrupt(rx);
 records.delete('Admin');records.delete('Hospital');records.delete('Pharmacy');records.delete('PharmacyStaff');
 const before=JSON.stringify([...records]);
 await expect(bootstrap.bootstrapSyntheticData({isApply:true,passwords})).rejects.toThrow('EXISTING_PRESCRIPTION_INCOMPATIBLE');
 expect(JSON.stringify([...records])).toBe(before);noSaves();expect(pending).toEqual([]);
 expect(session.commitTransaction).not.toHaveBeenCalled();expect(session.abortTransaction).toHaveBeenCalledTimes(1);
});

test('dry-run also detects an incompatible prescription without transaction or writes',async()=>{
 const rx=existingBaseline();rx.drugName='Paracetamol 500mg';const before=JSON.stringify([...records]);
 await expect(bootstrap.bootstrapSyntheticData({passwords})).rejects.toThrow('EXISTING_PRESCRIPTION_INCOMPATIBLE');
 noSaves();expect(JSON.stringify([...records])).toBe(before);expect(mongoose.startSession).not.toHaveBeenCalled();
});

test('later save failure aborts earlier pending creates and never changes an existing record',async()=>{
 existingBaseline();records.delete('Admin');records.delete('Hospital');const before=JSON.stringify([...records]);failSave='Hospital';
 await expect(bootstrap.bootstrapSyntheticData({isApply:true,passwords})).rejects.toThrow('INERT_LATE_SAVE_FAILURE');
 expect(records.has('Admin')).toBe(false);expect(JSON.stringify([...records])).toBe(before);expect(pending).toEqual([]);
 expect(session.abortTransaction).toHaveBeenCalledTimes(1);expect(session.commitTransaction).not.toHaveBeenCalled();
});

test('uncertain commit stops with explicit warning and never retries or repairs',async()=>{
 failCommit=true;
 await expect(bootstrap.bootstrapSyntheticData({isApply:true,passwords})).rejects.toThrow('BOOTSTRAP_COMMIT_UNCERTAIN');
 expect(mongoose.startSession).toHaveBeenCalledTimes(1);expect(session.commitTransaction).toHaveBeenCalledTimes(1);
 expect(session.abortTransaction).not.toHaveBeenCalled();expect(session.endSession).toHaveBeenCalledTimes(1);
});

test('shutdown failure preserves an uncertain-commit warning and still attempts disconnect',async()=>{
 failCommit=true;session.endSession.mockRejectedValue(Error('INERT_END_FAILURE'));
 await expect(bootstrap.bootstrapSyntheticData({isApply:true,passwords})).rejects.toThrow(/BOOTSTRAP_COMMIT_UNCERTAIN.*BOOTSTRAP_SHUTDOWN_UNVERIFIED/);
 expect(mongoose.disconnect).toHaveBeenCalledTimes(1);expect(session.commitTransaction).toHaveBeenCalledTimes(1);
 expect(session.abortTransaction).not.toHaveBeenCalled();
});

test('abort failure is explicit and is never converted into successful bootstrap',async()=>{
 existingBaseline();records.get('Prescription').drugName='Paracetamol 500mg';
 session.abortTransaction.mockRejectedValue(Error('INERT_ABORT_FAILURE'));
 await expect(bootstrap.bootstrapSyntheticData({isApply:true,passwords})).rejects.toThrow('BOOTSTRAP_ABORT_UNVERIFIED');
 noSaves();expect(session.endSession).toHaveBeenCalledTimes(1);expect(mongoose.disconnect).toHaveBeenCalledTimes(1);
});

test.each(['production','qa'])('%s wrong role is rejected before baseline reads or writes',async mode=>{
 if(mode==='qa'){process.env=qa();mongoose.connection.db.databaseName='medisync_automated_test';}
 mongoose.connection.db.command.mockResolvedValue({authInfo:{authenticatedUsers:[{}],authenticatedUserRoles:[{role:'read',db:mongoose.connection.db.databaseName}]}});
 await expect(bootstrap.bootstrapSyntheticData({isQa:mode==='qa',isApply:true,passwords})).rejects.toThrow(/ROLE/);
 for(const Model of models)expect(Model.findOne).not.toHaveBeenCalled();noSaves();expect(mongoose.startSession).not.toHaveBeenCalled();
 expect(mongoose.disconnect).toHaveBeenCalledTimes(1);
});

test.each([{uri:'inert'},{skipConnection:true}])('connection override %j cannot bypass mode or role checks',async option=>{
 await expect(bootstrap.bootstrapSyntheticData({...option,passwords})).rejects.toThrow('CONNECTION_OVERRIDE_FORBIDDEN');
 expect(mongoose.connect).not.toHaveBeenCalled();noSaves();
});
