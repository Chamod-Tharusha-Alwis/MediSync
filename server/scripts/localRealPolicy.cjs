'use strict';
function assertLocalRealBackend(env){
  const expected={NODE_ENV:'test',MEDISYNC_TEST_MODE:'true',MEDISYNC_QA_BOOTSTRAPPED:'true',MEDISYNC_QA_CREDENTIALS_ROTATED:'true',MEDISYNC_LOCAL_REAL_STACK:'true',MEDISYNC_LOCAL_ATLAS_APPROVED:'true',PORT:'5100',CLIENT_URL:'http://127.0.0.1:3100',ML_ENGINE_URL:'http://127.0.0.1:5101',REDIS_URL:'redis://127.0.0.1:6379/15',VAULT_TOKEN:'bypass'};
  if(Object.entries(expected).some(([key,value])=>env[key]!==value)||Object.keys(env).some(key=>/^(MONGO_URI|MONGODB_URI|RESEND_|BREVO_|SMTP_|EMAIL_|TWILIO_|SMS_|CLOUDINARY_)/i.test(key)&&key.toUpperCase()!=='MONGO_URI_TEST')||['MONGO_URI_TEST','ENCRYPTION_KEY','JWT_SECRET','JWT_REFRESH_SECRET','INTERNAL_API_KEY'].some(key=>!env[key]))throw Error('LOCAL_RESTRICTED_RUNTIME_CONTRACT_REQUIRED');
}
module.exports={assertLocalRealBackend};
