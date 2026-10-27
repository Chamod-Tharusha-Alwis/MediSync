'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {loadReferenceCatalogs}=require('../src/utils/referenceCatalogs');
const {symptomCatalog}=require('../scripts/prepareReferenceBundle.cjs');
const root=path.resolve(__dirname,'../..');
function fixture(change){
 const dir=fs.mkdtempSync(path.join(root,'scratch/reference-negative-')),entries=[];
 for(const [catalog,file,data]of [['drugs','drugs_clean.json',[{name:'reference',genericName:'reference'}]],['interactions','interactions_clean.json',[{drug1:'a',drug2:'b',description:'reference',severity:'moderate'}]],['icd10','icd10_clean.json',[{code:'A90',description:'reference'}]],['symptoms','symptoms.json',['itching']]]){
  const bytes=Buffer.from(JSON.stringify(data));fs.writeFileSync(path.join(dir,file),bytes);entries.push({catalog,file,bytes:bytes.length,rows:1,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
 }
 const manifest={schemaVersion:1,entries};if(change)change({dir,manifest});fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest));return dir;
}
test('packaged catalog files exactly match canonical source bytes and row counts',()=>{
 const result=loadReferenceCatalogs();expect([result.drugs.length,result.interactions.length,result.icd10.length,result.symptoms.length]).toEqual([3000,191541,71704,131]);
 for(const file of ['drugs_clean.json','interactions_clean.json','icd10_clean.json'])expect(fs.readFileSync(path.join(root,'server/reference-data',file)).equals(fs.readFileSync(path.join(root,'ml-engine/data',file)))).toBe(true);
});
test('a server-only copied Docker layout loads real catalogs without a sibling ML checkout',()=>{
 const base=fs.mkdtempSync(path.join(root,'scratch/reference-layout-')),utils=path.join(base,'server/src/utils'),ref=path.join(base,'server/reference-data');fs.mkdirSync(utils,{recursive:true});fs.mkdirSync(ref,{recursive:true});
 for(const file of ['loadDatasets.js','referenceCatalogs.js'])fs.copyFileSync(path.join(root,'server/src/utils',file),path.join(utils,file));
 for(const file of fs.readdirSync(path.join(root,'server/reference-data')))fs.copyFileSync(path.join(root,'server/reference-data',file),path.join(ref,file));
 expect(fs.existsSync(path.join(base,'ml-engine'))).toBe(false);expect(require(path.join(utils,'loadDatasets.js')).icd10).toHaveLength(71704);
});
test('missing reference directory fails instead of returning an empty successful catalog',()=>expect(()=>loadReferenceCatalogs(path.join(root,'scratch/absent-reference-directory'))).toThrow('REFERENCE_CATALOG_INTEGRITY_REQUIRED'));
test.each([
 ['tampered file',({dir})=>fs.appendFileSync(path.join(dir,'interactions_clean.json'),' ')],
 ['missing catalog',({manifest})=>manifest.entries.pop()],
 ['path traversal',({manifest})=>manifest.entries[0].file='../outside.json'],
 ['row count mismatch',({manifest})=>manifest.entries[0].rows=2],
 ['duplicate catalog',({manifest})=>manifest.entries[1]={...manifest.entries[0]}],
 ['invalid digest',({manifest})=>manifest.entries[0].sha256='invalid'],
 ['unsupported manifest',({manifest})=>manifest.schemaVersion=2]
])('%s is rejected before clinical use',(_,change)=>expect(()=>loadReferenceCatalogs(fixture(change))).toThrow('REFERENCE_CATALOG_INTEGRITY_REQUIRED'));
test('symptom suggestions use the exact Flask CSV normalization and no fabricated vocabulary',()=>{
 const data=fs.readFileSync(path.join(root,'ml-engine/data/dataset.csv'));expect(JSON.parse(symptomCatalog(data))).toEqual(loadReferenceCatalogs().symptoms);expect(loadReferenceCatalogs().symptoms).toContain('dischromic  patches');
});
test('unsupported CSV format cannot silently change the delivered symptom catalog',()=>expect(()=>symptomCatalog(Buffer.from('Disease,"quoted"\n'))).toThrow('UNSUPPORTED_SYMPTOM_CSV_FORMAT'));
test('server Docker context explicitly copies and validates references without copying sibling raw CSVs',()=>{
 const docker=fs.readFileSync(path.join(root,'server/Dockerfile'),'utf8'),ignore=fs.readFileSync(path.join(root,'server/.dockerignore'),'utf8');expect(docker).toContain('COPY reference-data/ ./reference-data/');expect(docker).toContain("require('./src/utils/loadDatasets')");expect(ignore).toContain('reference-data/**');expect(ignore).toContain('!reference-data/manifest.json');expect(docker).not.toContain('../ml-engine');
});
test('runtime projection admits only the five exact reference files and retains all private-context denials',()=>{
 const {reviewClinicalRuntime,contextAllows}=require('../scripts/reviewClinicalRuntime.cjs'),ignore=fs.readFileSync(path.join(root,'server/.dockerignore'),'utf8');
 const result=reviewClinicalRuntime(),references=result.files.filter(row=>row.file.startsWith('reference-data/'));
 expect(references.map(row=>row.file).sort()).toEqual(['drugs_clean.json','icd10_clean.json','interactions_clean.json','manifest.json','symptoms.json'].map(file=>'reference-data/'+file).sort());
 for(const file of ['reference-data/extra.json','reference-data/secret.env','reference-data/key.pem','reference-data/patient.sqlite','src/nested/.env.production'])expect(contextAllows(file,ignore)).toBe(false);
 expect(()=>reviewClinicalRuntime({dockerfile:fs.readFileSync(path.join(root,'server/Dockerfile'),'utf8').replace('COPY reference-data/ ./reference-data/','COPY . .')})).toThrow('RUNTIME_COPY_SCOPE_FORBIDDEN');
});
