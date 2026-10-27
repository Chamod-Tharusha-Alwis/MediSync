import React, { useEffect, useState } from 'react';
import api from '../../api/axiosInstance';
import UniversityDemoNotice from './UniversityDemoNotice';
export function qualifiedCapabilities(value) {
  return value?.version === 'university-readonly-v1' && value.mode === 'university-demo' && ['clinicalWrites','uploads','exports','registration','providers'].every(key => value[key] === false);
}
export default function UniversityRuntimeBoundary({children}) {
  const enabled = process.env.REACT_APP_UNIVERSITY_RUNTIME === 'true';
  const [status,setStatus] = useState('loading');
  useEffect(()=>{
    if(!enabled)return undefined;
    const controller=new AbortController();let active=true;
    api.get('/university/capabilities',{signal:controller.signal,timeout:5000}).then(response=>{if(active)setStatus(qualifiedCapabilities(response.data)?'ready':'blocked');}).catch(()=>{if(active)setStatus('blocked');});
    return()=>{active=false;controller.abort();};
  },[enabled]);
  if(!enabled||status==='ready')return children;
  return <main className="min-h-screen p-10 text-slate-100"><UniversityDemoNotice/><h1>{status==='loading'?'Checking synthetic demonstration…':'Demonstration unavailable'}</h1><p>{status==='loading'?'Verifying the backend capability contract.':'A compatible isolated backend could not be verified. No clinical features or directories have been loaded.'}</p></main>;
}
