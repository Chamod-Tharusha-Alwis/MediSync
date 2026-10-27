'use strict';
const BACKEND='https://medisync-wabc.onrender.com';
const FRONTEND='https://medisync.chamodtharusha.com.lk';
function assertUniversityRelease(env) {
  const expected={REACT_APP_API_URL:BACKEND+'/api',REACT_APP_SERVER_URL:BACKEND,REACT_APP_MEDISYNC_UNIVERSITY_DEMO:'true',REACT_APP_UNIVERSITY_RUNTIME:'true'};
  for(const [name,value] of Object.entries(expected))if(env[name]!==value)throw Error('UNIVERSITY_RELEASE_ENDPOINT_CONTRACT');
  for(const key of Object.keys(env))if(/^REACT_APP_/i.test(key)&&!Object.hasOwn(expected,key)&&key!=='REACT_APP_MEDISYNC_QA')throw Error('UNIVERSITY_RELEASE_UNREVIEWED_CLIENT_VARIABLE');
  if(env.REACT_APP_MEDISYNC_QA!==undefined&&env.REACT_APP_MEDISYNC_QA!=='false')throw Error('UNIVERSITY_RELEASE_QA_FORBIDDEN');
  return Object.freeze({mode:'university-demo',frontend:FRONTEND,backend:BACKEND,buildOnly:true,hostedRuntimeQualified:false});
}
module.exports={BACKEND,FRONTEND,assertUniversityRelease};
