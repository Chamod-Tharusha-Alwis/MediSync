'use strict';
function apiErrorHandler(error,req,res,next){
  if(res.headersSent)return next(error);
  if(error?.type==='entity.too.large'||error?.status===413||error?.statusCode===413)return res.status(413).json({error:'Payload too large',message:'Request entity too large'});
  if(error?.name==='CastError')return res.status(400).json({error:'Invalid data format'});
  if(error?.type==='entity.parse.failed')return res.status(400).json({error:'Invalid JSON body'});
  const supplied=error?.status??error?.statusCode;
  const status=Number.isInteger(supplied)&&supplied>=400&&supplied<=599?supplied:500;
  console.error('Unhandled application error.');
  return res.status(status).json({error:'Internal server error'});
}
module.exports={apiErrorHandler};
