'use strict';
// Pure proposed initialization/observation models. Never invokes an OS API or native compiler.
const assert=require('assert');
const inventory=require('./e1WindowsInventory');
function planInitialization(evidence, options) {
  // The accepted ENV3 classifier remains the only positive absence decision.
  const result=inventory.classifyWindowsInventory(evidence,options);
  if(result.allowed && result.recognizedServices.length===0) return {simulationOnly:true,executionAuthorized:false,decision:'NATIVE_NOT_REQUIRED_FOR_THIS_SNAPSHOT',continuousAbsence:false};
  // A verified positive result still requires the original independent native verification.
  if(result.allowed) return {simulationOnly:true,executionAuthorized:false,decision:'NATIVE_REQUIRED_AND_REVALIDATION_REQUIRED',continuousAbsence:false};
  return {simulationOnly:true,executionAuthorized:false,decision:'BLOCKED',reasons:result.blockers.map(x=>x.reason),continuousAbsence:false};
}
function verifySyntheticSequence(samples, expected, maxGap=1000) {
  assert(Array.isArray(samples)&&samples.length>=2 && Number.isFinite(maxGap)&&maxGap>0);
  let previous;
  for(const sample of samples){
    assert(sample.complete===true && sample.lostEvents===0 && Number.isFinite(sample.time),'Observation loss');
    assert(!previous || (sample.time>previous.time && sample.time-previous.time<=maxGap),'Observation gap');
    assert(JSON.stringify(sample.processes)===JSON.stringify(expected.processes),'Process birth/restart/PID/image/parent drift');
    assert(JSON.stringify(sample.services)===JSON.stringify(expected.services),'Service transition');
    assert(JSON.stringify(sample.listeners)===JSON.stringify(expected.listeners),'Listener ownership drift');
    previous=sample;
  }
  return {simulationOnly:true,executionAuthorized:false,observations:samples.length,continuousMonitoringProven:false};
}
module.exports={planInitialization,verifySyntheticSequence};
