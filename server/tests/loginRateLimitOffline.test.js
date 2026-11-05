'use strict';
const fs=require('fs'),path=require('path'),vm=require('vm');
const express=require('express'),rateLimit=require('express-rate-limit');
function load(file){
  const module={exports:{}},limits=[];
  const inert=new Proxy(()=>((_req,_res,next)=>next()),{get:()=>((_req,_res,next)=>next())});
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/routes/'+file),'utf8'),{
    module,exports:module.exports,process:{env:{NODE_ENV:'production'}},require(name){
      if(name==='express')return express;
      if(name==='express-rate-limit')return options=>{const limiter=rateLimit(options);limits.push({options,limiter});return limiter;};
      return inert;
    }
  });
  return limits[0];
}
async function invoke(limiter){
  const req={ip:'192.0.2.1',method:'POST',originalUrl:'/owned-inert-login',headers:{},socket:{remoteAddress:'192.0.2.1'},app:{get:()=>false}};
  return new Promise((resolve,reject)=>{
    const headers=new Map(),res={statusCode:200,headersSent:false,setHeader(k,v){headers.set(k.toLowerCase(),v);},getHeader(k){return headers.get(k.toLowerCase());},status(n){this.statusCode=n;return this;},send(){resolve(this.statusCode);return this;}};
    limiter(req,res,error=>error?reject(error):resolve(res.statusCode));
  });
}
test.each([['authRoutes.js',15],['pharmacyRoutes.js',10]])('actual production %s per-IP middleware enforces its configured %s-request quota',async(file,maximum)=>{
  const {options,limiter}=load(file);expect(options.max).toBe(maximum);
  for(let i=0;i<maximum;i++)expect(await invoke(limiter)).toBe(200);
  expect(await invoke(limiter)).toBe(429);
  expect((await limiter.getKey('192.0.2.1')).totalHits).toBe(maximum+1);
});
