'use strict';
const {ClinicalCommandError}=require('./clinicalErrors');
const MODEL={admin:'Admin',super_admin:'Admin',doctor:'Doctor',patient:'Patient',hospital_admin:'Hospital',pharmacy_admin:'PharmacyStaff',pharmacist:'PharmacyStaff',assistant:'PharmacyStaff'};
function createAccountStatusService({models,transact,now=()=>new Date()}) {
 return async({actor,body})=>{
  const id=body?.userId,role=body?.role,model=MODEL[role];
  if(!actor||!['admin','super_admin'].includes(actor.role))throw new ClinicalCommandError('STATUS_CHANGE_DENIED',403);
  if(typeof id!=='string'||!/^[a-f0-9]{24}$/i.test(id)||!model||Object.keys(body).some(k=>!['userId','role'].includes(k)))throw new ClinicalCommandError('INVALID_STATUS_TARGET',400);
  if(String(actor.id)===id)throw new ClinicalCommandError('Cannot deactivate your own account',400);
  return transact(async session=>{
   const owner=await models.Admin.findOne({_id:actor.id,isActive:true}).session(session);
   if(!owner||!['admin','super_admin'].includes(owner.role))throw new ClinicalCommandError('STATUS_CHANGE_DENIED',403);
   if(model==='Admin'&&owner.isSuperAdmin!==true)throw new ClinicalCommandError('SUPER_ADMIN_REQUIRED',403);
   const User=models[model];
   const target=await User.findOne({_id:id}).session(session);
   if(!target)throw new ClinicalCommandError('User not found',404);
   if(['Admin','Doctor','PharmacyStaff'].includes(model)&&target.role!==role)throw new ClinicalCommandError('STATUS_TARGET_ROLE_MISMATCH',403);
   if(typeof target.isActive!=='boolean')throw new ClinicalCommandError('ACCOUNT_STATE_REVIEW_REQUIRED',409);
   const value=!target.isActive,timestamp=now();
   const result=await User.findOneAndUpdate({_id:id,isActive:target.isActive},{$set:{isActive:value}}, {session,new:true,runValidators:true});
   if(!result)throw new ClinicalCommandError('STATUS_CHANGE_CONFLICT',409);
   // Both disable and re-enable consume legacy sessions/trust; reactivation
   // must never resurrect a previously issued access/refresh token.
   await models.SessionToken.updateMany({userId:id,userModel:model,isValid:true},{$set:{isValid:false,logoutAt:timestamp,expiredAt:timestamp}},{session});
   await models.TrustedDevice.updateMany({userId:id,userModel:model},{$set:{isTrusted:false,isRevoked:true}},{session});
   await models.AccountSecurityEvent.create([{userId:id,userModel:model,actorId:String(actor.id),actorModel:'Admin',action:value?'ACCOUNT_ENABLED':'ACCOUNT_DISABLED',timestamp}],{session});
   return{isActive:value};
  });
 };
}
function toggleAccountStatus(input){const models=Object.fromEntries([...new Set([...Object.values(MODEL),'SessionToken','TrustedDevice','AccountSecurityEvent'])].map(name=>[name,require('../models/'+name)]));return createAccountStatusService({models,transact:require('./dispensingService').runTransaction})(input);}
module.exports={createAccountStatusService,toggleAccountStatus};
