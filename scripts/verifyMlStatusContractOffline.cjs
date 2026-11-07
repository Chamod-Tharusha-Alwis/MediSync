'use strict';
// Consumes the actual Flask reply produced by the owned, network-fenced profile.
const fs=require('fs'),path=require('path');
const {isAllowedTempChild}=require('./run_offline_tests.js');
const {readAdminMlStatus}=require('../server/src/services/adminMlStatusService');
async function checkFixture(fixture){
  if(fixture?.httpStatus!==200||fixture.sqliteCallsDuringRoute!==0||
    fixture.emptySQLiteCounts?.outbreak_tracking!==0||fixture.emptySQLiteCounts?.outbreak_feedback!==0)throw Error('EMPTY_SQLITE_PROOF_REJECTED');
  const rows=[];
  const mutations=[['response',()=>null],['status',d=>({...d,status:'inactive'})],
    ['dataPoints',d=>({...d,dataPoints:-1})],['dataPointUnit',d=>({...d,dataPointUnit:'inert-invalid-unit'})],
    ['clinicalValidation',d=>({...d,clinicalValidation:'inert-invalid-claim'})],
    ['models.diseasePrediction',d=>({...d,models:{...d.models,diseasePrediction:'inert-invalid-model'}})],
    ['models.outbreakForecasting',d=>({...d,models:{...d.models,outbreakForecasting:'active'}})]];
  async function evaluate(data){let calls=0;const result=await readAdminMlStatus({baseUrl:'https://contract.example.invalid',token:()=> 'inert-offline-contract',get:async()=>{calls++;return {status:fixture.httpStatus,data};},log:()=>{}});if(calls!==1)throw Error('CONTRACT_REQUEST_COUNT_REJECTED');return result;}
  for(const [field,mutate] of mutations){
    const positive=await evaluate(structuredClone(fixture.data)),negative=await evaluate(mutate(structuredClone(fixture.data)));
    const passed=positive.available===true&&negative.available===false&&negative.category==='bad_response'&&negative.dataPoints===null;
    rows.push({field,positive:positive.available===true?'PASS':'FAIL',negative:negative.available===false&&negative.category==='bad_response'?'PASS':'FAIL',passed});
  }
  return {method:'Actual authenticated Flask test_client reply from fresh empty SQLite fed unchanged to actual Node status validator; inert Node transport',checks:rows,passed:rows.filter(r=>r.passed).length,failed:rows.filter(r=>!r.passed).length,skipped:0,total:rows.length,success:rows.every(r=>r.passed),liveInfrastructureVerified:false};
}
async function main(args){
  if(args.length!==2||args[0]!=='--evidence')throw Error('CONTRACT_ARGUMENT_REJECTED');
  const dir=fs.realpathSync(args[1]);
  if(!isAllowedTempChild(dir)||!/^clinical-offline-/.test(path.basename(dir)))throw Error('CONTRACT_EVIDENCE_PATH_REJECTED');
  const file=path.join(dir,'model-status-empty-input.json');if(fs.statSync(file).size>65536||fs.realpathSync(file)!==file)throw Error('CONTRACT_FIXTURE_REJECTED');
  const result=await checkFixture(JSON.parse(fs.readFileSync(file,'utf8')));
  fs.writeFileSync(path.join(dir,'ml-status-contract-results.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(result));process.exitCode=result.success?0:1;
}
if(require.main===module)main(process.argv.slice(2)).catch(()=>{console.log(JSON.stringify({category:'OFFLINE_ML_STATUS_CONTRACT_REJECTED'}));process.exitCode=1;});
module.exports={checkFixture};
