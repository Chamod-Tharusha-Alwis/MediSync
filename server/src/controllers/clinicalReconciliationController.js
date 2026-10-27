'use strict';
const {digest}=require('../services/clinicalCommandService');
function createReconciliation({lookup,preflight}) {
 return async(req,res)=>{
  const key=req.params.key;
  if(req.user?.role!=='doctor'||!/^[a-f0-9]{24}$/i.test(String(req.user.id)))return res.status(403).json({error:'CLINICAL_RECONCILIATION_DENIED'});
  if(typeof key!=='string'||!/^[A-Za-z0-9:_-]{16,128}$/.test(key))return res.status(400).json({error:'INVALID_COMMAND_REFERENCE'});
  try {
   await preflight();
   const id=digest({domain:'clinical-command-v1',actorId:String(req.user.id),role:'doctor',kind:'consultation',idempotencyKey:key}).slice(0,24);
   const row=await lookup({_id:id,actorId:req.user.id,actorRole:'doctor',kind:'consultation'});
   if(!row)return res.status(409).json({error:'CLINICAL_OUTCOME_NOT_CONFIRMED'});
   if(String(row._id)!==id||String(row.actorId)!==req.user.id||row.actorRole!=='doctor'||row.kind!=='consultation'||!/^[a-f0-9]{24}$/i.test(String(row.result?.consultationId)))throw Error();
   return res.json({state:'committed',operationKey:key,consultationId:String(row.result.consultationId)});
  }catch(_){return res.status(503).json({error:'CLINICAL_RECONCILIATION_UNAVAILABLE'});}
 };
}
exports.createReconciliation=createReconciliation;
exports.reconcile=async(req,res)=>createReconciliation({lookup:filter=>require('../models/ClinicalCommand').findOne(filter).select('_id actorId actorRole kind result').lean(),preflight:()=>require('../services/clinicalCommandStorage').assertClinicalCommandStorage(require('mongoose').connection.db)})(req,res);
