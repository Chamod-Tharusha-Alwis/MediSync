'use strict';
// Source inventory only. Never imports application modules or opens a browser.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const parser = require('../client/node_modules/@babel/parser');
const traverse = require('../client/node_modules/@babel/traverse').default;
const ROLES = ['admin','patient','doctor','hospital','pharmacy','public'];
const VERBS = new Set(['get','head','options','post','put','patch','delete']);
const rank = ['R','W-low','W-clin','W-sec','W-adm','X'];
const parse = source => parser.parse(source, { sourceType:'unambiguous', plugins:['jsx','classProperties','optionalChaining'] });
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
function target(node) {
  if (!node) return ':dynamic';
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'TemplateLiteral') return node.quasis.map((q,i)=>q.value.cooked+(i<node.expressions.length?':param':'')).join('');
  if (node.type === 'BinaryExpression' && node.operator === '+') return target(node.left)+target(node.right);
  return ':dynamic';
}
function safeTarget(raw) {
  const value = raw.replace(/^[^/]*:dynamic(?=\/)/,'');
  if (/^https?:\/\//.test(value)) { try { return new URL(value).pathname; } catch (_) { return ':dynamic'; } }
  return value.startsWith('/') ? value.split(/[?#]/)[0] : ':dynamic';
}
function classify({method='GET',route='',name='',role=''}) {
  const text = `${route} ${name}`.replace(/([a-z])([A-Z])/g,'$1 $2');
  if (method.toUpperCase()==='DELETE' || /(?:^|[\s/_-])(?:delete|ban|reset|ingest|seed|trigger|clear[-_]?cache|flush)(?:[A-Z\s/_-]|$)/i.test(text)) return 'X';
  if (/otp|consent|password|login|logout|refresh|recovery|session|device|request.?access|verify.?access|2fa/i.test(text)) return 'W-sec';
  if (/consultation-command|reconcil/i.test(text)) return 'W-clin';
  if (['GET','HEAD','OPTIONS'].includes(method.toUpperCase())) return 'R';
  if (/preferences|mark.*read|read-all|notification.*read|profile|settings/i.test(text)) return 'W-low';
  if (/dispens|consultation|prescription|lab|test.*(?:order|status|result)|followup|medical|report.*upload/i.test(text)) return 'W-clin';
  if (role==='admin' || /approve|verify|broadcast|staff|doctor.*link|review/i.test(text)) return 'W-adm';
  return 'W-low';
}
function roleOf(file) {
  const role = file.match(/(?:pages|routes)\/(admin|patient|doctor|hospital|pharmacy|public)(?:\/|Routes)/)?.[1];
  return role || 'shared';
}
function join(prefix, suffix) { return ('/'+[prefix,suffix].join('/')).replace(/\/+/g,'/').replace(/\/$/,'') || '/'; }
function jsxValue(attr) { return attr?.value?.type==='StringLiteral' ? attr.value.value : undefined; }
function exprName(node) {
  if (!node) return 'inline';
  if (node.type==='Identifier'||node.type==='JSXIdentifier') return node.name;
  if (node.type==='MemberExpression') return exprName(node.object)+'.'+exprName(node.property);
  return 'inline';
}
function symbolCalls(p,seen=new Set()) {
  const methods=[];
  function scan(q) {
    q.traverse({CallExpression(call){
      const c=call.node.callee;
      if(c.type==='MemberExpression' && c.property.type==='Identifier' && VERBS.has(c.property.name) && ['api','axios','client','http'].includes(exprName(c.object))) {
        methods.push({method:c.property.name.toUpperCase(),route:safeTarget(target(call.node.arguments[0]))});
      }
      if(c.type==='Identifier') {
        const binding=call.scope.getBinding(c.name);
        const f=binding?.path?.isVariableDeclarator()?binding.path.get('init'):binding?.path;
        if(f?.isFunction()&&!seen.has(f.node)){seen.add(f.node);scan(f);}
      }
    }});
  }
  scan(p);return methods;
}
function clientRows(source,file) {
  const rows=[],ast=parse(source),role=roleOf(file);
  const row=(node,values)=>rows.push({file,line:node.loc.start.line,column:node.loc.start.column,role,...values});
  traverse(ast,{
    JSXOpeningElement(p){
      const node=p.node,tag=exprName(node.name);
      if(tag==='Route') {
        const attr=node.attributes.find(a=>a.name?.name==='path'),index=node.attributes.some(a=>a.name?.name==='index');
        if(!attr&&!index)return;
        let route=jsxValue(attr),unresolved=attr&&route===undefined;
        if(unresolved)route=':dynamic';
        const ancestors=p.getAncestry().filter(a=>a.isJSXElement()&&a.node.openingElement!==node&&exprName(a.node.openingElement.name)==='Route').reverse();
        let prefix=file==='client/src/App.js'?'':role!=='shared'&&role!=='public'?'/'+role:'';
        for(const a of ancestors){const value=jsxValue(a.node.openingElement.attributes.find(x=>x.name?.name==='path'));if(value)prefix=join(prefix,value);}
        const full=join(prefix,route||'');
        row(node,{kind:'PAGE',role:full.match(/^\/(admin|patient|doctor|hospital|pharmacy)(?:\/|$)/)?.[1]||'public',route:full,name:index?'index redirect':'page/redirect',classification:'R',review:unresolved?'DYNAMIC_ROUTE_REVIEW':'Route access only; form actions are separate rows'});
      }
      for(const attr of node.attributes){
        if(!attr.name||!/^on(?:Click|Submit|Change|Select|KeyDown|Blur|Focus|Input)$/.test(attr.name.name))continue;
        const expression=attr.value?.expression;
        const ep=p.get('attributes').find(a=>a.node===attr)?.get('value.expression');
        let resolved=ep;
        if(expression?.type==='Identifier'){
          const binding=ep.scope.getBinding(expression.name);
          resolved=binding?.path?.isVariableDeclarator()?binding.path.get('init'):binding?.path;
        }
        const calls=resolved?.isFunction()?symbolCalls(resolved):[];
        const name=tag+'.'+attr.name.name+' → '+exprName(expression);
        const semantic=classify({method:attr.name.name==='onSubmit'?'POST':'GET',name,role});
        const classes=[semantic,...calls.map(c=>classify({...c,name,role}))];
        // Unresolved callbacks and modal opening require review before live use;
        // a row classified R never overrides the separately approved fence.
        row(attr,{kind:'UI_ACTION',route:':component',name,classification:classes.sort((a,b)=>rank.indexOf(b)-rank.indexOf(a))[0],endpoints:calls,review:!resolved?.isFunction()?'CALLBACK_REVIEW_REQUIRED':'Static handler graph; server effects and dynamic props require review'});
      }
    },
    CallExpression(p){
      const node=p.node,c=node.callee;
      let method,route;
      if(c.type==='MemberExpression'&&VERBS.has(c.property.name)&&['api','axios','client','http'].includes(exprName(c.object))){method=c.property.name.toUpperCase();route=safeTarget(target(node.arguments[0]));}
      if(c.type==='Identifier'&&c.name==='fetch'){
        method='GET';route=safeTarget(target(node.arguments[0]));
        const options=node.arguments[1];if(options?.type==='ObjectExpression'){const m=options.properties.find(x=>x.key?.name==='method');if(m){method=m.value.type==='StringLiteral'?m.value.value.toUpperCase():'UNKNOWN';}}
      }
      if(!method)return;
      const fn=p.getFunctionParent(),name=fn?.node.id?.name||fn?.parentPath?.node.id?.name||'request';
      row(node,{kind:'CLIENT_REQUEST',method,route,name,classification:classify({method,route,name,role}),review:route===':dynamic'?'DYNAMIC_TARGET_REVIEW':method==='GET'?'Server side effects still require review':'Explicit method/endpoint approval required; no fence expansion'});
    }
  });return rows;
}
function storageRole(value) {
  return ({super_admin:'admin',superadmin:'admin',hospital_admin:'hospital',labTechnician:'hospital',pharmacist:'pharmacy',pharmacy_admin:'pharmacy',assistant:'pharmacy'})[value] || value;
}
function serverRows(source,file,prefixes) {
  const ast=parse(source),rows=[],bindings=new Map();
  for(const stmt of ast.program.body)if(stmt.type==='VariableDeclaration')for(const d of stmt.declarations)if(d.id.type==='Identifier')bindings.set(d.id.name,d.init);
  function roles(node,seen=new Set()) {
    if(!node)return [];
    if(node.type==='Identifier'&&!seen.has(node.name)){seen.add(node.name);return roles(bindings.get(node.name),seen);}
    if(node.type==='ArrayExpression')return node.elements.filter(n=>n?.type==='StringLiteral').map(n=>storageRole(n.value)).filter(r=>ROLES.includes(r));
    if(node.type==='CallExpression')return node.arguments.flatMap(n=>roles(n,seen));
    return [];
  }
  traverse(ast,{CallExpression(p){
    const n=p.node,c=n.callee;if(c.type!=='MemberExpression'||c.object.name!=='router'||!VERBS.has(c.property.name))return;
    if(n.arguments[0]?.type!=='StringLiteral')throw Error('DYNAMIC_SERVER_ROUTE_REQUIRES_REVIEW');
    const route=n.arguments[0].value,roleList=[...new Set(n.arguments.slice(1).flatMap(n=>roles(n)))];
    const name=exprName(n.arguments[n.arguments.length-1]);
    for(const prefix of prefixes){const full=join(prefix,route);rows.push({kind:'API',file,line:n.loc.start.line,role:roleList.length?roleList.join(','):roleOf(file),method:c.property.name.toUpperCase(),route:full,name,classification:classify({method:c.property.name,route:full,name,role:roleOf(file)}),review:file.endsWith('qaRoutes.js')?'QA_ONLY_NOT_A_LIVE_TARGET':roleList.length?'Declared role restriction; controller effects require review':'Authentication/role scope must be reviewed in controller/middleware'});}
  }});return rows;
}
function sourceFiles(root,relative) {
  const list=[];
  function scan(dir){for(const name of fs.readdirSync(dir)){const file=path.join(dir,name),st=fs.statSync(file);if(st.isDirectory()){if(!/^(?:node_modules|__.*__|tests?|build|university)$/.test(name))scan(file);}else if(/\.(?:js|jsx)$/.test(name)&&!/(?:\.test|\.spec|setupTests)/.test(name))list.push(path.relative(root,file).replaceAll('\\','/'));}}
  scan(path.join(root,relative));return list.sort();
}
function reachableClientFiles(root) {
  const available=new Set(sourceFiles(root,'client/src')),seen=new Set(),pending=['client/src/index.js'];
  function resolve(from,name){
    if(!name.startsWith('.'))return;
    const base=path.posix.normalize(path.posix.join(path.posix.dirname(from),name));
    return [base,base+'.js',base+'.jsx',base+'/index.js',base+'/index.jsx'].find(f=>available.has(f));
  }
  while(pending.length){const file=pending.pop();if(seen.has(file))continue;if(!available.has(file))throw Error('CLIENT_ENTRY_NOT_FOUND');seen.add(file);
    const ast=parse(fs.readFileSync(path.join(root,file),'utf8'));
    const add=name=>{if(typeof name!=='string')return;const next=resolve(file,name);if(next&&!seen.has(next))pending.push(next);};
    traverse(ast,{
      ImportDeclaration:p=>add(p.node.source.value),
      ExportNamedDeclaration:p=>add(p.node.source?.value),
      ExportAllDeclaration:p=>add(p.node.source.value),
      CallExpression:p=>{if(p.node.callee.type==='Import'||p.node.callee.name==='require')add(p.node.arguments[0]?.value);}
    });
  }
  return {active:[...seen].sort(),notReachable:[...available].filter(f=>!seen.has(f)).sort()};
}
function inventory(root) {
  const sources={},rows=[],mounts=new Map(),app=fs.readFileSync(path.join(root,'server/src/app.js'),'utf8');
  traverse(parse(app),{CallExpression(p){const n=p.node;if(n.callee.type!=='MemberExpression'||n.callee.object.name!=='app'||n.callee.property.name!=='use'||n.arguments[0]?.type!=='StringLiteral')return;
    for(const a of n.arguments.slice(1)){if(a.type==='CallExpression'&&a.callee.name==='require'&&a.arguments[0]?.value?.startsWith('./routes/')){const file='server/src/'+a.arguments[0].value.replace(/^\.\//,'')+'.js';const values=mounts.get(file)||[];values.push(n.arguments[0].value);mounts.set(file,[...new Set(values)]);}}}});
  sources['server/src/app.js']=sha(app);
  const client=reachableClientFiles(root);
  for(const file of client.active){const source=fs.readFileSync(path.join(root,file),'utf8');sources[file]=sha(source);rows.push(...clientRows(source,file));}
  for(const file of sourceFiles(root,'server/src/routes')){const source=fs.readFileSync(path.join(root,file),'utf8');sources[file]=sha(source);rows.push(...serverRows(source,file,mounts.get(file)||[':UNMOUNTED']));}
  const unique=rows.map(r=>({...r,id:r.kind+'-'+sha([r.file,r.line,r.column,r.kind,r.route,r.name].join('|')).slice(0,12),live:'NOT VERIFIED',evidence:'No current per-function/locale/viewport acceptance receipt',languages:['en','si','ta'],widths:[320,375,1440]}));
  if(new Set(unique.map(r=>r.id)).size!==unique.length)throw Error('MATRIX_ID_COLLISION');
  return {schemaVersion:1,source: sources,notReachableClientFiles:client.notReachable,sourceFingerprint:sha(JSON.stringify(sources)),rows:unique,counts:Object.fromEntries(rank.map(c=>[c,unique.filter(r=>r.classification===c).length])),kinds:Object.fromEntries(['PAGE','UI_ACTION','CLIENT_REQUEST','API'].map(k=>[k,unique.filter(r=>r.kind===k).length]))};
}
function markdown(data,jsonPath) {
  const clean=s=>String(s??'—').replaceAll('|','/').replace(/[\r\n]/g,' ');
  return '# MediSync page and function test matrix\n\nSource inventory, not runtime acceptance. Every row starts NOT VERIFIED for the requested EN/SI/TA × 320/375/1440 matrix. Historical dashboard/public receipts remain separately recorded and are not projected across every action.\n\n'+
    'R = read-only intent; W-low = self-contained change; W-clin = clinical; W-sec = security/consent; W-adm = admin management; X = destructive/maintenance, never live. Classification is conservative static triage, not authorization. Dynamic targets, unresolved callbacks and controller side effects require review before Phase 3. A semantic read using POST remains blocked by the existing fence. Opening a modal may request OTP; never do so from an R row without reviewing its effect. QA-only routes and unmounted code are not production test targets. No endpoint is invoked by this generator.\n\n'+
    'Machine snapshot: `'+jsonPath+'`; fingerprint `'+data.sourceFingerprint+'`.\n\n'+
    '| Class | Rows |\n| --- | ---: |\n'+Object.entries(data.counts).map(([c,n])=>'| '+c+' | '+n+' |').join('\n')+'\n\n'+
    '| ID | Kind | Role/scope | Method/path or component | Function | Class | Source | Live | Review limit |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n'+
    data.rows.map(r=>[r.id,r.kind,r.role,(r.method?r.method+' ':'')+r.route,r.name,r.classification,r.file+':'+r.line,r.live,r.review].map(clean).join(' | ')).map(r=>'| '+r+' |').join('\n')+'\n';
}
if(require.main===module){const args=process.argv.slice(2);if(args.some(x=>x!=='--write')||args.length>1)throw Error('ARGUMENT_REJECTED');const root=path.resolve(__dirname,'..'),data=inventory(root);if(args[0]==='--write'){
  const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z'),file='docs/temp/CODEX_TEST_MATRIX_'+stamp+'.json';
  if(fs.existsSync(path.join(root,'docs/agent-work/TEST_MATRIX.md')))throw Error('EXISTING_MATRIX_REQUIRES_REVIEWED_UPDATE');
  fs.writeFileSync(path.join(root,file),JSON.stringify(data,null,2)+'\n',{flag:'wx'});fs.writeFileSync(path.join(root,'docs/agent-work/TEST_MATRIX.md'),markdown(data,file),{flag:'wx'});
  console.log(JSON.stringify({snapshot:file,...data.kinds,counts:data.counts,total:data.rows.length}));
}else console.log(JSON.stringify({counts:data.counts,kinds:data.kinds,total:data.rows.length}));}
module.exports={inventory,clientRows,serverRows,classify,markdown,safeTarget};
