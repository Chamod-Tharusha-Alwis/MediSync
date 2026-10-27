'use strict';
function createMlHealthMonitor({request,url,intervalMs=300000}={}){
  let timer,pending,controller,stopped=false,status='unknown';
  async function check(){
    if(stopped||pending)return;
    controller=new AbortController();
    pending=Promise.resolve().then(()=>request(url,{timeout:10000,signal:controller.signal})).then(response=>{
      if(!stopped)status=response?.status===200&&response.data?.status==='ready'?'available':'unavailable';
    }).catch(()=>{if(!stopped)status='unavailable';}).finally(()=>{pending=null;});
    await pending;
  }
  return {start(){if(stopped||timer)return;void check();timer=setInterval(()=>{void check();},intervalMs);timer.unref?.();},
    async stop(){stopped=true;status='unavailable';clearInterval(timer);controller?.abort();if(pending)await pending;},check,get status(){return status;}};
}
module.exports={createMlHealthMonitor};
