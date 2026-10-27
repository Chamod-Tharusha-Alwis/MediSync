'use strict';
// Incoming Express HTTP and MongoDB driver TLS are separate from outbound HTTP.
function installBrowserOutboundGuard({environment,lifecycle,http=require('http'),https=require('https')}){
  for(const[protocol,module]of [['http',http],['https',https]])for(const method of ['request','get'])module[method]=function(){
    environment.networkAttempts.push({protocol,method,blocked:true});lifecycle.fail('unexpected-raw-http');throw Error('Browser QA raw outbound HTTP prohibited');
  };
}
module.exports={installBrowserOutboundGuard};
