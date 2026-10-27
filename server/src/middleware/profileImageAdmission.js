'use strict';
module.exports=(req,res,next)=>{
 if(req.user?.role==='patient')return res.status(503).json({error:'PRIVATE_PROFILE_IMAGE_STORAGE_REQUIRED',message:'Profile image uploads are unavailable until private delivery is verified.'});
 if(!['doctor','hospital_admin','pharmacy_admin'].includes(req.user?.role))return res.status(403).json({error:'PROFILE_IMAGE_ACCESS_DENIED'});
 return next();
};
