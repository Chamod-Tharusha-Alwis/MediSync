'use strict';
const crypto=require('crypto');
const {ClinicalCommandError}=require('./clinicalErrors');
const validId=id=>typeof id==='string'&&/^[a-f0-9]{24}$/i.test(id);
function publicReviewDto(row) {
 const value=row.toObject?row.toObject():row;
 return {_id:value._id,rating:value.rating,comment:value.comment,createdAt:value.createdAt,reviewerName:'Verified Patient'};
}
function createReviewService({models,transact,preflight}) {
 return async({user,body})=>{
  if(user?.role!=='patient'||!validId(user.id))throw new ClinicalCommandError('REVIEW_DENIED',403);
  const {targetId,targetModel,consultationId,rating,comment=''}=body||{};
  if(body?.publishConsent!==true||!validId(targetId)||!validId(consultationId)||!['Doctor','Hospital','Pharmacy'].includes(targetModel)||!Number.isInteger(rating)||rating<1||rating>5||typeof comment!=='string'||comment.length>2000)throw new ClinicalCommandError('REVIEW_REQUIRES_VALID_OWNED_VISIT_AND_PUBLICATION_CONSENT',400);
  const cleaned=comment.trim(),id=crypto.createHash('sha256').update(JSON.stringify([user.id,consultationId,targetModel,targetId])).digest('hex').slice(0,24);
  await preflight();
  return transact(async session=>{
   const visit=await models.Consultation.findOne({_id:consultationId,patientId:user.id}).session(session);
   if(!visit)throw new ClinicalCommandError('REVIEW_DENIED',403);
   let linked=targetModel==='Doctor'?String(visit.doctorId)===targetId:targetModel==='Hospital'?String(visit.sessionHospitalId||visit.hospitalId)===targetId:false;
   if(targetModel==='Pharmacy')linked=!!await models.Prescription.findOne({patientId:user.id,consultationId,status:'dispensed',dispensedBy:targetId}).session(session);
   if(!linked)throw new ClinicalCommandError('REVIEW_DENIED',403);
   const previous=await models.Review.findById(id).session(session);
   if(previous){if(previous.publishConsent!==true||String(previous.reviewerId)!==user.id||String(previous.consultationId)!==consultationId||String(previous.targetId)!==targetId||previous.targetModel!==targetModel||previous.rating!==rating||previous.comment!==cleaned)throw new ClinicalCommandError('REVIEW_ALREADY_SUBMITTED',409);return{review:publicReviewDto(previous),replayed:true};}
   const targetFilter={_id:targetId,isActive:true,...(targetModel==='Pharmacy'?{}:{isVerified:true})};
   const target=await models[targetModel].findOne(targetFilter).session(session);
   if(!target)throw new ClinicalCommandError('REVIEW_TARGET_UNAVAILABLE',403);
   const rows=await models.Review.create([{_id:id,reviewerId:user.id,reviewerName:'Verified Patient',targetId,targetModel,consultationId,rating,comment:cleaned,publishConsent:true}],{session});
   const aggregate=models.Review.aggregate([{$match:{targetId:target._id,targetModel,publishConsent:true}},{$group:{_id:null,averageRating:{$avg:'$rating'},ratingCount:{$sum:1}}}]);
   const stats=(await aggregate.session(session))[0];
   if(!stats||!Number.isFinite(stats.averageRating)||!Number.isInteger(stats.ratingCount))throw Error('REVIEW_STATS_UNAVAILABLE');
   const updated=await models[targetModel].updateOne(targetFilter,{$set:{averageRating:Number(stats.averageRating.toFixed(1)),ratingCount:stats.ratingCount}},{session});
   if(updated.matchedCount!==1)throw new ClinicalCommandError('REVIEW_TARGET_UNAVAILABLE',403);
   await models.Event.create([{userId:user.id,userModel:'Patient',actorId:user.id,actorModel:'Patient',action:'VISIT_REVIEW_SUBMITTED',timestamp:new Date()}],{session});
   return{review:publicReviewDto(rows[0]),stats,replayed:false};
  });
 };
}
function submitReview(parameters) {
 const models=Object.fromEntries(['Review','Consultation','Prescription','Doctor','Hospital','Pharmacy'].map(name=>[name,require('../models/'+name)]));models.Event=require('../models/AccountSecurityEvent');
 return createReviewService({models,transact:require('./dispensingService').runTransaction,preflight:()=>require('./existingCollections').assertExistingCollections(require('mongoose').connection.db,['reviews','accountsecurityevents'])})(parameters);
}
module.exports={createReviewService,submitReview,publicReviewDto,validId};
