'use strict';
// Registered before final graph sealing; every control handler is instrumented.
function registerBrowserQaControls(app,{guard,lifecycle,dbInfo,shutdown,readOwnedRecipient,capturedEmails,config}){
  const attempt={protocolPhase:config.phase,attemptId:config.attemptId,approvalSha256:config.approvalSha256};
  app.use((req,res,next)=>{
    if(req.headers['x-medisync-qa-owner']!==guard.owner)return res.status(403).json({error:'QA owner header required'});
    if(config.purpose==='E1-lifecycle-only'&&!['/api/qa/status','/api/qa/freeze','/api/qa/mock-email'].includes(req.path))return res.status(423).json({error:'E1 permits lifecycle controls only'});
    return next();
  });
  app.get('/api/qa/status',(_req,res)=>res.json({...guard.status(),...lifecycle.status(),...attempt,database:dbInfo.dbName,roles:dbInfo.authenticatedRoles,
    frontend:config.frontend,backend:config.backend,ml:config.ml,externalProviders:'mocked',auditCollection:'phase5x_audit_qa'}));
  app.post('/api/qa/freeze',(_req,res)=>{
    // Register the shutdown request outside owned producer context; the finish
    // callback only schedules orchestration, which must await this handler too.
    const after=lifecycle.callback(()=>lifecycle.orchestrate(()=>{setImmediate(()=>shutdown());}));res.once('finish',after);
    lifecycle.stop();
    res.json({...guard.status(),...lifecycle.status(),...attempt,shutdownInitiated:true});
  });
  app.get('/api/qa/mock-email',async(req,res)=>{
    if(config.purpose==='E1-lifecycle-only')return res.status(403).json({error:'No E1 actors or OTP access permitted'});
    lifecycle.assertWrite();const email=String(req.query.email||'');
    const patient=await readOwnedRecipient(email);lifecycle.assertWrite();
    if(!patient)return res.status(403).json({error:'Owned recipient required'});
    const captured=[...capturedEmails()].reverse().find(mail=>mail.to.includes(email)&&mail.otp);
    if(!captured)return res.status(404).json({error:'No captured mock OTP email'});return res.json({otp:captured.otp});
  });
}
module.exports={registerBrowserQaControls};
