'use strict';
const {ClinicalCommandError}=require('../services/clinicalErrors');
function createChangeOrganizationPassword({Doctor,Hospital,Session,Device,Event,transact,compare,hash,validate,preflight}) {
 return async(req,res)=>{
  try {
   const {orgLoginId,currentPassword,newPassword}=req.body||{};
   if(req.user?.role!=='doctor')throw new ClinicalCommandError('ORGANIZATION_ACCESS_DENIED',403);
   if(!/^[a-f0-9]{24}$/i.test(String(orgLoginId))||typeof currentPassword!=='string'||Buffer.byteLength(currentPassword)>72||!validate(newPassword).valid)throw new ClinicalCommandError('PASSWORD_POLICY_REJECTED',400);
   await preflight();
   const nextHash=await hash(newPassword);
   await transact(async session=>{
    const doctor=await Doctor.findOne({_id:req.user.id,isActive:true,isVerified:true}).session(session);
    const org=doctor?.orgLogins?.find(row=>String(row._id)===orgLoginId&&row.isActive===true&&row.mustChangePassword===true);
    if(!org||typeof org.tempPassword!=='string'||!await compare(currentPassword,org.tempPassword))throw new ClinicalCommandError('ORGANIZATION_ACCESS_DENIED',403);
    if(await compare(newPassword,org.tempPassword))throw new ClinicalCommandError('PASSWORD_REUSE_DENIED',400);
    const hospital=await Hospital.findOne({_id:org.hospitalId,isActive:true,isVerified:true}).session(session);if(!hospital)throw new ClinicalCommandError('ORGANIZATION_ACCESS_DENIED',403);
    const changed=await Doctor.updateOne({_id:req.user.id,isActive:true,isVerified:true,orgLogins:{$elemMatch:{_id:orgLoginId,isActive:true,mustChangePassword:true,tempPassword:org.tempPassword}}},{$set:{'orgLogins.$.tempPassword':nextHash,'orgLogins.$.mustChangePassword':false,passwordChangedAt:new Date()}},{session});
    if(changed.modifiedCount!==1)throw new ClinicalCommandError('PASSWORD_CHANGE_CONFLICT',409);
    await Session.updateMany({userId:req.user.id,userModel:'Doctor',isValid:true},{$set:{isValid:false,logoutAt:new Date()}},{session});
    await Device.updateMany({userId:req.user.id,userModel:'Doctor'},{$set:{isTrusted:false}},{session});
    await Event.create([{userId:req.user.id,userModel:'Doctor',actorId:req.user.id,actorModel:'Doctor',action:'ORGANIZATION_PASSWORD_SETUP',timestamp:new Date()}],{session});
   });
   return res.json({message:'Organization password updated. Sign in again.',requiresLogin:true});
  }catch(error){return res.status(error instanceof ClinicalCommandError?error.status:error.code==='TRANSACTION_OUTCOME_UNKNOWN'?503:503).json({error:error instanceof ClinicalCommandError?error.code:error.code==='TRANSACTION_OUTCOME_UNKNOWN'?'TRANSACTION_OUTCOME_UNKNOWN':'ORGANIZATION_PASSWORD_UNAVAILABLE'});}
 };
}
exports.createChangeOrganizationPassword=createChangeOrganizationPassword;
exports.change=async(req,res)=>createChangeOrganizationPassword({Doctor:require('../models/Doctor'),Hospital:require('../models/Hospital'),Session:require('../models/SessionToken'),Device:require('../models/TrustedDevice'),Event:require('../models/AccountSecurityEvent'),transact:require('../services/dispensingService').runTransaction,compare:require('bcryptjs').compare,hash:require('../utils/passwordUtils').hashPassword,validate:require('../utils/passwordUtils').validatePasswordStrength,preflight:()=>require('../services/existingCollections').assertExistingCollections(require('mongoose').connection.db,['accountsecurityevents'])})(req,res);
