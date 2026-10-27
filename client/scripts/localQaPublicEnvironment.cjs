'use strict';
module.exports=function getClientEnvironment(publicUrl){
  const raw={NODE_ENV:'development',PUBLIC_URL:publicUrl,FAST_REFRESH:true,REACT_APP_MEDISYNC_QA:'true',REACT_APP_API_URL:'/api',REACT_APP_SERVER_URL:'http://127.0.0.1:3100',REACT_APP_PROXY_TARGET:'http://127.0.0.1:5100',REACT_APP_GA_MEASUREMENT_ID:''};
  return {raw,stringified:{'process.env':Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,JSON.stringify(v)]))}};
};
