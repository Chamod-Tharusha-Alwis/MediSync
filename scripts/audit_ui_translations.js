'use strict';
// Static, privacy-safe inventory. Never execute locale modules or emit literal values.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const parser=require('../client/node_modules/@babel/parser');
const traverse=require('../client/node_modules/@babel/traverse').default;
const {inventory}=require('./buildTestMatrix.cjs');
const parse=source=>parser.parse(source,{sourceType:'unambiguous',plugins:['jsx','classProperties','optionalChaining']});
const keyPattern=/^[A-Za-z][A-Za-z0-9_.-]{0,120}$/;
const uiProperties=new Set(['label','title','description','placeholder','alt','aria-label','helperText','emptyMessage','emptyText','headerName','buttonText','caption','tooltip','text']);
const hasLetters=text=>typeof text==='string'&&/\p{L}/u.test(text);
const isTranslation=n=>n?.type==='CallExpression'&&(n.callee.name==='t'||n.callee.type==='MemberExpression'&&n.callee.property.name==='t');
const propertyName=n=>n?.name||n?.value;
function readDictionary(source){
  const ast=parse(source),exports=ast.program.body.filter(n=>n.type==='ExportNamedDeclaration'&&n.declaration?.type==='VariableDeclaration');
  const declaration=exports.flatMap(n=>n.declaration.declarations).find(n=>['en','si','ta'].includes(n.id?.name));
  if(declaration?.init?.type!=='ObjectExpression')throw Error('DICTIONARY_SHAPE_REVIEW_REQUIRED');
  const values=Object.create(null),duplicates=[];
  function visit(node,prefix=''){
    const seen=new Set();
    for(const p of node.properties){
      if(p.type!=='ObjectProperty'||p.computed||!keyPattern.test(String(propertyName(p.key))))throw Error('DICTIONARY_SYNTAX_REVIEW_REQUIRED');
      const key=propertyName(p.key),full=prefix+key;
      if(seen.has(key))duplicates.push({key:full,line:p.loc.start.line});seen.add(key);
      if(p.value.type==='ObjectExpression')visit(p.value,full+'.');
      else if(p.value.type==='StringLiteral')values[full]=p.value.value;
      else throw Error('DICTIONARY_VALUE_REVIEW_REQUIRED');
    }
  }
  visit(declaration.init);return {values,duplicates};
}
function compareLocales(locales){
  const en=locales.en.values,baseline=Object.keys(en).sort(),languages={};
  for(const lang of ['en','si','ta']){
    const {values,duplicates}=locales[lang],keys=Object.keys(values).sort();
    languages[lang]={keyCount:keys.length,missing:baseline.filter(k=>!Object.hasOwn(values,k)),extra:keys.filter(k=>!Object.hasOwn(en,k)),empty:keys.filter(k=>!values[k].trim()),duplicates,
      equalToEnglishCount:lang==='en'?null:keys.filter(k=>hasLetters(values[k])&&values[k]===en[k]).length,
      equalToEnglishKeys: lang === 'en' ? [] : keys.filter(key => hasLetters(values[key]) && values[key] === en[key] && !/^(?:MediSync|ICD(?:-?[0-9]+)?|OTP|PDF|API|UTC)$/i.test(values[key].trim())),
    };
  }
  return {languages,keyParityPassed:Object.values(languages).every(l=>!l.missing.length&&!l.extra.length&&!l.empty.length&&!l.duplicates.length)};
}
function inspectSource(source,file,enKeys){
  const candidates=[],uses=[],dynamicKeys=[],seen=new Set();
  const add=(node,kind)=>{const id=[node.loc.start.line,node.loc.start.column,kind].join(':');if(seen.has(id))return;seen.add(id);candidates.push({file,line:node.loc.start.line,column:node.loc.start.column,kind,review:'SOURCE_REVIEW_REQUIRED'});};
  const translatedAncestor=p=>p.findParent(a=>isTranslation(a.node));
  const addLiteral=(p,kind)=>{if(!translatedAncestor(p)&&hasLetters(p.node.value))add(p.node,kind);};
  const intlFormat=n=>n.callee?.type==='MemberExpression'&&n.callee.object.name==='Intl'&&['DateTimeFormat','NumberFormat','RelativeTimeFormat','ListFormat','PluralRules'].includes(n.callee.property.name)&&n.arguments[0]?.type==='StringLiteral';
  function displayExpression(node){
    if(!node||isTranslation(node))return;
    if(node.type==='StringLiteral'&&hasLetters(node.value))add(node,'CONDITIONAL_DISPLAY_TEXT');
    else if(node.type==='TemplateLiteral'&&node.quasis.some(q=>hasLetters(q.value.cooked)))add(node,'CONDITIONAL_DISPLAY_TEXT');
    else if(node.type==='ConditionalExpression'){displayExpression(node.consequent);displayExpression(node.alternate);}
    else if(node.type==='LogicalExpression')displayExpression(node.right);
    else if(node.type==='BinaryExpression'&&node.operator==='+'){displayExpression(node.left);displayExpression(node.right);}
    // Nested JSX has its own visitors. Do not count CSS, routes, enum tests,
    // translation fallbacks or component implementation literals as UI text.
  }
  traverse(parse(source),{
    NewExpression:p=>{if(intlFormat(p.node))add(p.node,'FIXED_LOCALE_FORMAT');},
    JSXText:p=>{if(hasLetters(p.node.value.trim()))add(p.node,'JSX_TEXT');},
    JSXAttribute:p=>{
      if(!uiProperties.has(p.node.name?.name))return;
      const value=p.node.value?.type==='JSXExpressionContainer'?p.node.value.expression:p.node.value;
      if(value?.type==='StringLiteral'&&hasLetters(value.value))add(value,'DISPLAY_ATTRIBUTE');
    },
    JSXExpressionContainer:p=>{
      if(p.parentPath.isJSXAttribute())return;
      if(p.node.expression.type==='StringLiteral'&&hasLetters(p.node.expression.value))add(p.node.expression,'JSX_EXPRESSION_TEXT');
      if(['ConditionalExpression','LogicalExpression','BinaryExpression','TemplateLiteral'].includes(p.node.expression.type))displayExpression(p.node.expression);
      const value=p.node.expression;
      if(['MemberExpression','OptionalMemberExpression'].includes(value.type)&&['error','message'].includes(value.property?.name))add(value,'DYNAMIC_ERROR_MESSAGE');
    },
    ObjectProperty:p=>{
      if(uiProperties.has(propertyName(p.node.key))&&p.node.value.type==='StringLiteral'&&hasLetters(p.node.value.value))add(p.node.value,'DISPLAY_OBJECT_PROPERTY');
    },
    CallExpression:p=>{
      const n=p.node;
      if(isTranslation(n)){
        const key=n.arguments[0];
        if(key?.type==='StringLiteral'&&keyPattern.test(key.value))uses.push({file,line:n.loc.start.line,key:key.value,missing:!enKeys.has(key.value),hasFallback:n.arguments.length>1});
        else dynamicKeys.push({file,line:n.loc.start.line,kind:'DYNAMIC_TRANSLATION_KEY'});
        return;
      }
      const c=n.callee;
      if(intlFormat(n))add(n,'FIXED_LOCALE_FORMAT');
      if(c.type==='MemberExpression'&&['toLocaleString','toLocaleDateString','toLocaleTimeString'].includes(c.property.name)&&n.arguments[0]?.type==='StringLiteral')add(n,'FIXED_LOCALE_FORMAT');
      const display=c.type==='MemberExpression'&&c.object.name==='toast'&&['error','success','info','warn','warning'].includes(c.property.name)||c.type==='Identifier'&&/^(?:alert|confirm|setError|setMessage|setSuccessMessage)$/.test(c.name);
      if(display)for(const arg of p.get('arguments')){
        if(isTranslation(arg.node))continue;
        if(arg.isStringLiteral())addLiteral(arg,'MESSAGE_LITERAL');
        else {add(arg.node,'DYNAMIC_MESSAGE_ARGUMENT');arg.traverse({StringLiteral:q=>addLiteral(q,'MESSAGE_LITERAL')});}
      }
    }
  });return {candidates,uses,dynamicKeys};
}
function audit(root){
  const source=inventory(root).source,locales={};
  for(const lang of ['en','si','ta'])locales[lang]=readDictionary(fs.readFileSync(path.join(root,'client/src/i18n/translations/'+lang+'.js'),'utf8'));
  const comparison=compareLocales(locales),enKeys=new Set(Object.keys(locales.en.values)),candidates=[],uses=[],dynamicKeys=[];
  const files=Object.keys(source).filter(f=>f.startsWith('client/src/')&&!f.includes('/i18n/translations/'));
  for(const file of files){const result=inspectSource(fs.readFileSync(path.join(root,file),'utf8'),file,enKeys);candidates.push(...result.candidates);uses.push(...result.uses);dynamicKeys.push(...result.dynamicKeys);}
  const byFile=files.map(file=>({file,candidates:candidates.filter(r=>r.file===file).length,translationCalls:uses.filter(r=>r.file===file).length})).filter(r=>r.candidates||r.translationCalls).sort((a,b)=>b.candidates-a.candidates||a.file.localeCompare(b.file));
  return {schemaVersion:2,at:new Date().toISOString(),...comparison,source,sourceFingerprint:crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex'),filesInspected:files.length,
    candidateCounts:Object.fromEntries([...new Set(candidates.map(c=>c.kind))].sort().map(kind=>[kind,candidates.filter(c=>c.kind===kind).length])),candidateCount:candidates.length,candidates,translationCallCount:uses.length,
    missingUsageKeys:uses.filter(u=>u.missing),dynamicKeys,byFile,translationReadiness:'NOT_VERIFIED',limitations:['Source positions, not unique visible phrases or measured runtime coverage','Shared labels, catalogues and acronyms may be intentionally unchanged; review each finding','Native-language quality, fonts, clipping and server-returned text require separate qualification','No literal values or text, credentials or private identifiers are emitted','No application module, locale module or network request is executed']};
}
function summary(result){return {auditCompleted:true,keyParityPassed:result.keyParityPassed,languages:result.languages,filesInspected:result.filesInspected,candidateCounts:result.candidateCounts,candidateCount:result.candidateCount,translationCallCount:result.translationCallCount,missingUsageCount:result.missingUsageKeys.length,dynamicKeyCount:result.dynamicKeys.length,translationReadiness:result.translationReadiness};}
function markdown(result){
  return '# Trilingual parity and hard-coded display audit\n\n'+result.at+'\n\nStatic source audit, not a translation percentage or runtime PASS. Key parity: '+(result.keyParityPassed?'PASS':'FAIL')+'. Native language quality and full-site trilingual acceptance remain NOT VERIFIED.\n\n'+
    '| Locale | Keys | Missing | Extra | Empty | Duplicate declarations | Equal-to-English values requiring review |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: |\n'+Object.entries(result.languages).map(([l,v])=>`| ${l} | ${v.keyCount} | ${v.missing.length} | ${v.extra.length} | ${v.empty.length} | ${v.duplicates.length} | ${v.equalToEnglishCount??'NA'} |`).join('\n')+
    '\n\n'+result.filesInspected+' reachable source files; '+result.candidateCount+' display/message candidate positions; '+result.missingUsageKeys.length+' static references missing from English; '+result.dynamicKeys.length+' dynamic references. Review findings are not proven untranslated runtime instances. Text/values are omitted; inspect referenced source locally.\n\n| Source | Candidates | Translation calls |\n| --- | ---: | ---: |\n'+result.byFile.map(r=>`| ${r.file} | ${r.candidates} | ${r.translationCalls} |`).join('\n')+
    '\n\n| Source | Kind | Review |\n| --- | --- | --- |\n'+result.candidates.map(r=>`| ${r.file}:${r.line} | ${r.kind} | ${r.review} |`).join('\n')+'\n\n'+result.limitations.map(l=>'- '+l).join('\n')+'\n';
}
function main(args=[]){
  if(args.length>1||args.some(a=>a!=='--write'))throw Error('I18N_AUDIT_ARGUMENT_REJECTED');
  const root=path.resolve(__dirname,'..'),result=audit(root);
  if(args[0]==='--write'){
    const stamp=result.at.replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z'),base=path.join(root,'docs/temp/CODEX_I18N_SOURCE_AUDIT_'+stamp);
    fs.writeFileSync(base+'.json',JSON.stringify(result,null,2)+'\n',{flag:'wx'});fs.writeFileSync(base+'.md',markdown(result),{flag:'wx'});
    console.log(JSON.stringify({report:path.relative(root,base+'.md'),...summary(result)}));
  }else console.log(JSON.stringify(summary(result)));
  if(!result.keyParityPassed)process.exitCode=1;
  return result;
}
if(require.main===module)main(process.argv.slice(2));
module.exports={readDictionary,compareLocales,inspectSource,audit,summary,markdown,main};
