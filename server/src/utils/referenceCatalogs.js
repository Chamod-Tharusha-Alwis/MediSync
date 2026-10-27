'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const expected={drugs:'drugs_clean.json',interactions:'interactions_clean.json',icd10:'icd10_clean.json',symptoms:'symptoms.json'};
function loadReferenceCatalogs(directory=path.resolve(__dirname,'../../reference-data')){
 try{
  if(fs.lstatSync(directory).isSymbolicLink())throw Error();
  const root=fs.realpathSync(directory),manifestFile=path.join(root,'manifest.json');
  if(fs.lstatSync(manifestFile).isSymbolicLink())throw Error();
  const manifest=JSON.parse(fs.readFileSync(manifestFile,'utf8'));
  if(manifest.schemaVersion!==1||!Array.isArray(manifest.entries)||manifest.entries.length!==4)throw Error();
  const result={};
  for(const [catalog,file]of Object.entries(expected)){
   const rows=manifest.entries.filter(entry=>entry.catalog===catalog);if(rows.length!==1)throw Error();const entry=rows[0];
   if(entry.file!==file||!Number.isSafeInteger(entry.bytes)||entry.bytes<=0||entry.bytes>50*1024*1024||!Number.isSafeInteger(entry.rows)||entry.rows<=0||!/^[a-f0-9]{64}$/.test(entry.sha256))throw Error();
   const target=path.join(root,file),stat=fs.lstatSync(target);if(!stat.isFile()||stat.isSymbolicLink()||fs.realpathSync(target)!==target)throw Error();
   const bytes=fs.readFileSync(target);if(bytes.length!==entry.bytes||crypto.createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error();
   const data=JSON.parse(bytes.toString('utf8'));if(!Array.isArray(data)||data.length!==entry.rows)throw Error();
   if(catalog==='symptoms'){if(data.some(s=>typeof s!=='string'||!s.trim())||new Set(data).size!==data.length)throw Error();result[catalog]=data;continue;}
   const required=catalog==='icd10'?['code','description']:catalog==='interactions'?['drug1','drug2','description','severity']:['name','genericName'];
   if(data.some(row=>!row||required.some(key=>typeof row[key]!=='string')))throw Error();
   result[catalog]=data;
  }
  return result;
 }catch(_){throw Error('REFERENCE_CATALOG_INTEGRITY_REQUIRED');}
}
module.exports={loadReferenceCatalogs};
