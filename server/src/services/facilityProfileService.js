'use strict';
const {ClinicalCommandError}=require('./clinicalErrors');
function createFacilityProfileService({Staff,Pharmacy,transact}) {
  return async({id,role,update})=>{
    if(role!=='pharmacy_admin'||typeof id!=='string'||!/^[a-f0-9]{24}$/i.test(id)||!update||Object.keys(update).length===0||Object.values(update).some(v=>typeof v!=='string')||Object.keys(update).some(k=>!['description','profilePicture','googleMapsUrl','pickupLocationAddress'].includes(k)))throw new ClinicalCommandError('FACILITY_PROFILE_DENIED',403);
    return transact(async session=>{
      const staff=await Staff.findOne({_id:id,role:'pharmacy_admin',isActive:true,isVerified:true}).session(session);
      if(!staff?.pharmacyId)throw new ClinicalCommandError('FACILITY_PROFILE_DENIED',403);
      const facility=await Pharmacy.findOne({_id:staff.pharmacyId,adminId:staff._id,isActive:true}).session(session);
      if(!facility)throw new ClinicalCommandError('FACILITY_PROFILE_DENIED',403);
      const options={session,new:true,runValidators:true};
      const saved=await Staff.findOneAndUpdate({_id:staff._id,pharmacyId:staff.pharmacyId,role:'pharmacy_admin',isActive:true,isVerified:true},{$set:Object.fromEntries(Object.entries(update).filter(([k])=>['description','profilePicture'].includes(k)))},options);
      const changed=await Pharmacy.findOneAndUpdate({_id:facility._id,adminId:staff._id,isActive:true},{$set:update},options);
      if(!saved||!changed)throw new ClinicalCommandError('FACILITY_PROFILE_CONFLICT',409);
      return saved;
    });
  };
}
function updateFacilityProfile(input){return createFacilityProfileService({Staff:require('../models/PharmacyStaff'),Pharmacy:require('../models/Pharmacy'),transact:async work=>{await require('./existingCollections').assertExistingCollections(require('mongoose').connection.db,['pharmacystaffs','pharmacies']);return require('./dispensingService').runTransaction(work);}})(input);}
module.exports={createFacilityProfileService,updateFacilityProfile};
