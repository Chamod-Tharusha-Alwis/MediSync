'use strict';
const {ClinicalCommandError}=require('../services/clinicalErrors');
const {submitReview,publicReviewDto,validId}=require('../services/reviewService');
exports.submitReview=async(req,res)=>{
 try {const result=await submitReview({user:req.user,body:req.body});return res.status(result.replayed?200:201).json({data:result.review,stats:result.stats,replayed:result.replayed});}
 catch(error){return res.status(error instanceof ClinicalCommandError?error.status:503).json({error:error instanceof ClinicalCommandError?error.code:'REVIEW_UNAVAILABLE'});}
};
exports.getTargetReviews=async(req,res)=>{
 if(!validId(req.params.targetId))return res.status(400).json({error:'INVALID_REVIEW_TARGET'});
 try {const reviews=await require('../models/Review').find({targetId:req.params.targetId,publishConsent:true}).select('_id rating comment createdAt').sort({createdAt:-1}).limit(50);return res.json({data:reviews.map(publicReviewDto)});}
 catch(_){return res.status(503).json({error:'REVIEWS_UNAVAILABLE'});}
};
