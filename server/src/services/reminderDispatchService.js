'use strict';
const crypto=require('crypto');
function followUpWindow(now,timezone='UTC'){
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const parts=date=>Object.fromEntries(formatter.formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));
  const current=parts(now),target=new Date(Date.UTC(current.year,current.month-1,current.day+2));
  function midnight(day){
    const local=Date.UTC(day.getUTCFullYear(),day.getUTCMonth(),day.getUTCDate());let instant=local;
    for(let i=0;i<4;i++){
      const p=parts(new Date(instant)),offset=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)-local;
      if(offset===0)return new Date(instant);instant-=offset;
    }
    throw Error('REMINDER_TIME_WINDOW_UNAVAILABLE');
  }
  const start=midnight(target);target.setUTCDate(target.getUTCDate()+1);return{start,end:midnight(target)};
}
function identity(input){
  if(!input||!['appointmentId','patientId'].every(key=>typeof input[key]==='string'&&/^[a-f0-9]{24}$/i.test(input[key])))throw Error('REMINDER_IDENTITY_INVALID');
  if(!(input.scheduledFor instanceof Date)&&(typeof input.scheduledFor!=='string'||input.scheduledFor.length>40||!input.scheduledFor.length))throw Error('REMINDER_DATE_INVALID');
  const date=new Date(input.scheduledFor);if(!Number.isFinite(+date))throw Error('REMINDER_DATE_INVALID');
  const scheduledFor=date.toISOString(),appointmentId=input.appointmentId.toLowerCase(),patientId=input.patientId.toLowerCase();
  // One logical reminder for this appointment version, independent of recipient
  // contact changes, worker identity, timezone presentation or provider choice.
  const key=crypto.createHash('sha256').update(JSON.stringify(['followup-v1',appointmentId,scheduledFor])).digest('hex');
  return{key,appointmentId,patientId,scheduledFor};
}
function createReminderDispatcher({store,now=()=>new Date(),newOwner=crypto.randomUUID}={}){
  if(!store||typeof store.insertOne!=='function'||typeof store.updateOne!=='function')throw Error('REMINDER_DURABLE_STORE_REQUIRED');
  return async(input,deliver)=>{
    const value=identity(input);if(typeof deliver!=='function')throw Error('REMINDER_DELIVERY_REQUIRED');
    const ownerToken=newOwner(),writeConcern={w:'majority'},held={status:'held',providerAccepted:false,recoveryRequired:true};
    let claim;
    try{claim=await store.insertOne({_id:value.key,appointmentId:value.appointmentId,patientId:value.patientId,scheduledFor:new Date(value.scheduledFor),templateVersion:'followup-v1',ownerToken,state:'reserved',createdAt:now()},{writeConcern});}
    catch(error){if(error?.code===11000)return{status:'duplicate',providerAccepted:false,recoveryRequired:true};throw Error('REMINDER_CLAIM_UNVERIFIED');}
    if(claim?.acknowledged!==true)throw Error('REMINDER_CLAIM_UNVERIFIED');
    let started;try{started=await store.updateOne({_id:value.key,ownerToken,state:'reserved'},{$set:{state:'dispatching',attemptStartedAt:now()}},{writeConcern});}catch(_){return held;}
    if(started?.acknowledged!==true||started.modifiedCount!==1)return held;
    let response,state;
    try{response=await deliver(Object.freeze({allowFallback:false}));state=response?.providerAccepted===true?'accepted':'unconfirmed';}
    catch(_){state='uncertain';}
    const accepted=response?.providerAccepted===true;
    try{
      const result=await store.updateOne({_id:value.key,ownerToken,state:'dispatching'},{$set:{state,providerAccepted:accepted,completedAt:now()}},{writeConcern});
      if(result?.acknowledged!==true||result.modifiedCount!==1)return{...held,status:'uncertain',providerAccepted:accepted};
    }catch(_){return{...held,status:'uncertain',providerAccepted:accepted};}
    return{status:state,providerAccepted:accepted,deliveryConfirmed:false,recoveryRequired:state!=='accepted'};
  };
}
async function existingReminderStore(db){
  // No createCollection/index/TTL/lease expiry. Provisioning is a separate
  // operator approval; an absent or capped collection holds all reminders.
  if(db?.databaseName!=='test')throw Error('REMINDER_PRODUCTION_STORE_REQUIRED');
  const rows=await db.listCollections({name:'reminderdispatches'},{nameOnly:false}).toArray();
  if(rows.length!==1||rows[0].type!=='collection'||rows[0].options?.capped===true||rows[0].options?.timeseries||rows[0].options?.expireAfterSeconds!==undefined)throw Error('REMINDER_STORE_PROVISIONING_REQUIRED');
  const store=db.collection('reminderdispatches'),indexes=await store.listIndexes().toArray();
  if(indexes.some(index=>index.expireAfterSeconds!==undefined)||!indexes.some(index=>index.key?._id===1&&Object.keys(index.key).length===1))throw Error('REMINDER_STORE_RETENTION_REQUIRED');
  return store;
}
module.exports={identity,createReminderDispatcher,existingReminderStore,followUpWindow};
