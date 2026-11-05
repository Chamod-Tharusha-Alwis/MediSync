'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
const {chromium}=require('../client/node_modules/playwright');
const {readDictionary}=require('../scripts/audit_ui_translations.js');
const root=path.resolve(__dirname,'..');
const build=path.resolve(process.argv[2]);
assert.ok(build.startsWith(path.join(root,'scratch')+path.sep));
const profile=JSON.parse(fs.readFileSync(path.join(build,'../profile.json')));assert.equal(profile.profile,'clinical-production');
const source=require('./run_offline_tests.js').snapshot();
const built=JSON.parse(fs.readFileSync(path.join(build,'../source.json')));
assert.equal(JSON.parse(fs.readFileSync(path.join(build,'../build-result.json'))).exit,0);
const appFiles=rows=>rows.filter(r=>r.file.startsWith('client/src/'));
assert.deepEqual(appFiles(built.files),appFiles(source.files),'Compiled application source must match the current client');
const output=path.resolve(process.argv[3]);assert.ok(output.startsWith(path.join(root,'docs/temp/CODEX_')));assert.equal(fs.existsSync(output),false);
const result={sourceFingerprint:require('crypto').createHash('sha256').update(JSON.stringify(source.files)).digest('hex'),source:source.files,scope:'Owned loopback compiled clinical client, no accounts/API/real network',profile,normal:[],faults:[],denied:[],consoleErrors:0,pageErrors:0};
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
let server,browser;
(async()=>{
 try {
  server=http.createServer((req,res)=>{
   const parsed=new URL(req.url,'http://127.0.0.1');
   if(!['GET','HEAD'].includes(req.method)||parsed.pathname.startsWith('/api/')){res.writeHead(405).end();return;}
   let file=path.resolve(build,'.'+decodeURIComponent(parsed.pathname));
   if(!file.startsWith(build+path.sep)&&file!==build){res.writeHead(403).end();return;}
   if(!fs.existsSync(file)||!fs.statSync(file).isFile())file=path.join(build,'index.html');
   if(!fs.realpathSync(file).startsWith(fs.realpathSync(build)+path.sep)){res.writeHead(403).end();return;}
   res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:fs.readFileSync(file));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({headless:true});
  for(const width of [320,375,1440])for(const locale of ['en','si','ta']){
   const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
   await context.route('**/*',route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.origin!==origin||!['GET','HEAD'].includes(req.method())||url.pathname.startsWith('/api/')){
     result.denied.push({method:req.method(),path:url.origin===origin?url.pathname:'EXTERNAL_RESOURCE'});return route.abort();
    }
    return route.continue();
   });
   const page=await context.newPage();page.on('console',m=>{if(m.type()==='error')result.consoleErrors++;});page.on('pageerror',()=>result.pageErrors++);
   await page.goto(origin+'/offline-owned-404');await page.getByRole('heading',{level:1}).waitFor();
   const label={en:'English',si:'සිංහල',ta:'தமிழ்'}[locale];await page.getByRole('button',{name:label,exact:true}).click();
   const dictionary=readDictionary(fs.readFileSync(path.join(root,'client/src/i18n/translations/'+locale+'.js'),'utf8')).values;
   await page.getByRole('heading',{name:dictionary['notFound.title'],exact:true}).waitFor();
   const geometry=await page.getByRole('group').getByRole('button').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {width:b.width,height:b.height,visible:b.width>0&&b.height>0};}));
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
   const focus=[];
   for(let i=0;i<6;i++){await page.keyboard.press('Tab');focus.push(await page.evaluate(()=>['BUTTON','A'].includes(document.activeElement.tagName)));}
   result.normal.push({width,locale,language:await page.locator('html').getAttribute('lang'),overflow,targets:geometry,keyboardReachedControls:focus.some(Boolean),targetMinimum44:geometry.every(b=>b.width>=44&&b.height>=44)});
   await context.close();
  }
  result.pass=result.normal.every(r=>r.language===r.locale&&!r.overflow&&r.targetMinimum44&&r.keyboardReachedControls)&&result.denied.length===0&&result.consoleErrors===0&&result.pageErrors===0;
 }finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
 const file=output;fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({receipt:path.relative(root,file),pass:result.pass,views:result.normal.length,targetFailures:result.normal.filter(r=>!r.targetMinimum44).map(r=>({width:r.width,locale:r.locale,targets:r.targets})),denied:result.denied.length,consoleErrors:result.consoleErrors,pageErrors:result.pageErrors}));process.exitCode=result.pass?0:1;
})().catch(()=>{console.log('OFFLINE_GEOMETRY_FAILED');process.exitCode=1;});
