'use strict';
// Owns only the supplied HTTP server and sockets; never manages foreign PIDs.
function createBrowserOwnedListener(server,{port=5100,timeoutMs=5000,fail=()=>{}}={}){
  if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid owned listener port');
  const sockets=new Set(),startupAbort=new AbortController(),receipt={requestedHost:'127.0.0.1',requestedPort:port,started:false,startupFailed:false,closed:false,shutdownTimedOut:false,address:null};
  server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
  const status=()=>({...receipt,listening:server.listening,socketsRemaining:sockets.size});
  let starting,closing;
  function start(){
    if(starting)throw Error('Owned listener already started');
    starting=new Promise((resolve,reject)=>{
      const cleanup=()=>{clearTimeout(timer);server.off('error',onError);server.off('listening',onListen);};
      const onError=()=>{cleanup();receipt.startupFailed=true;startupAbort.abort();fail('listener-start-failed');reject(Error('Owned listener startup failed'));};
      const onListen=()=>{cleanup();const address=server.address();if(!address||address.address!=='127.0.0.1'||!Number.isInteger(address.port)||(port&&address.port!==port))return onError();receipt.started=true;receipt.address={address:address.address,port:address.port};resolve(status());};
      const timer=setTimeout(onError,timeoutMs);server.once('error',onError);server.once('listening',onListen);
      try{server.listen({host:'127.0.0.1',port,signal:startupAbort.signal});}catch(_){onError();}
    });return starting;
  }
  function close(){
    if(closing)return closing;
    closing=new Promise((resolve,reject)=>{
      let ended=false;const finish=error=>{if(ended)return;ended=true;clearTimeout(timer);receipt.closed=!server.listening&&server.address()===null;if(error||!receipt.closed||sockets.size){fail('listener-close-failed');reject(Error('Owned listener did not close'));}else resolve(status());};
      const timer=setTimeout(()=>{receipt.shutdownTimedOut=true;for(const socket of sockets)socket.destroy();server.closeAllConnections?.();finish(Error('Owned socket drain timeout'));},timeoutMs);
      if(!server.listening&&!sockets.size){finish();return;}
      const all=[...sockets].map(socket=>new Promise(done=>socket.once('close',done)));
      try{server.close(error=>{if(error&&error.code!=='ERR_SERVER_NOT_RUNNING')finish(error);else Promise.all(all).then(()=>finish());});server.closeIdleConnections?.();}catch(error){finish(error);}
    });return closing;
  }
  return{start,close,status,server};
}
module.exports={createBrowserOwnedListener};
