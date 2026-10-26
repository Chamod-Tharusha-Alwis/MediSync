'use strict';
// Local, deterministic file delivery only. No database, HTTP or provider imports.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const files=Object.freeze({drugs:'drugs_clean.json',interactions:'interactions_clean.json',icd10:'icd10_clean.json'});
function symptomCatalog(bytes){
 const text=bytes.toString('utf8');if(text.includes('"'))throw Error('UNSUPPORTED_SYMPTOM_CSV_FORMAT');
 const rows=text.trim().split(/\r?\n/).map(line=>line.split(',')),header=rows.shift();
 if(header[0]!=='Disease'||header.length!==18||rows.some(row=>row.length!==18))throw Error('INVALID_SYMPTOM_CSV');
 const values=[...new Set(rows.flatMap(row=>row.slice(1).map(s=>s.trim().replace(/_/g,' ').toLowerCase()).filter(Boolean)))].sort();
 if(values.length===0)throw Error('EMPTY_SYMPTOM_CATALOG');return Buffer.from(JSON.stringify(values,null,2)+'\n');
}
function prepare(){
 const root=path.resolve(__dirname,'../..'),destination=path.join(root,'server/reference-data');
 fs.mkdirSync(destination,{recursive:true});const entries=[];
 for(const [catalog,file]of Object.entries(files)){
  const source=path.join(root,'ml-engine/data',file),bytes=fs.readFileSync(source),rows=JSON.parse(bytes.toString('utf8'));
  if(!Array.isArray(rows)||rows.length===0||fs.lstatSync(source).isSymbolicLink())throw Error('CANONICAL_REFERENCE_REQUIRED');
  const target=path.join(destination,file);if(fs.existsSync(target)){if(!fs.readFileSync(target).equals(bytes))throw Error('EXISTING_REFERENCE_COPY_DIFFERS');}else fs.writeFileSync(target,bytes,{flag:'wx'});
  entries.push({catalog,file,source:'ml-engine/data/'+file,bytes:bytes.length,rows:rows.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 }
 const csv=fs.readFileSync(path.join(root,'ml-engine/data/dataset.csv')),symptoms=symptomCatalog(csv),targetSymptoms=path.join(destination,'symptoms.json');
 if(fs.existsSync(targetSymptoms)){if(!fs.readFileSync(targetSymptoms).equals(symptoms))throw Error('EXISTING_SYMPTOM_CATALOG_DIFFERS');}else fs.writeFileSync(targetSymptoms,symptoms,{flag:'wx'});
 entries.push({catalog:'symptoms',file:'symptoms.json',source:'ml-engine/data/dataset.csv',sourceSha256:crypto.createHash('sha256').update(csv).digest('hex'),bytes:symptoms.length,rows:JSON.parse(symptoms).length,sha256:crypto.createHash('sha256').update(symptoms).digest('hex')});
 const manifest=Buffer.from(JSON.stringify({schemaVersion:1,clinicalValidation:'not_established',licenseReview:'not_verified',entries},null,2)+'\n'),target=path.join(destination,'manifest.json');
 if(fs.existsSync(target)){if(!fs.readFileSync(target).equals(manifest))throw Error('EXISTING_REFERENCE_MANIFEST_DIFFERS');}else fs.writeFileSync(target,manifest,{flag:'wx'});
 return{files:entries.length,totalBytes:entries.reduce((n,e)=>n+e.bytes,0),clinicalValidation:false};
}
if(require.main===module){if(process.argv.length!==3||process.argv[2]!=='--prepare')throw Error('EXPLICIT_REFERENCE_PREPARATION_REQUIRED');console.log(JSON.stringify(prepare()));}
module.exports={prepare,symptomCatalog};
