import React from 'react';
import {render,screen,waitFor} from '@testing-library/react';
import OutbreakMonitor from '../pages/admin/OutbreakMonitor';
import api from '../api/axiosInstance';
import {LanguageProvider} from '../i18n/LanguageContext';
jest.mock('../api/axiosInstance',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn()}}));
jest.mock('../components/common/PageTransition',()=>({children})=><main>{children}</main>);
beforeEach(()=>{localStorage.clear();api.get.mockReset();api.post.mockReset();});
function mount(status,{reject=false,alertsFail=false}={}){
  api.get.mockImplementation(path=>path==='/admin/ml-status'?
    reject?Promise.reject({response:{status:503}}):Promise.resolve({data:status}):
    alertsFail?Promise.reject(Error('inert')):Promise.resolve({data:{data:[]}}));
  render(<LanguageProvider><OutbreakMonitor/></LanguageProvider>);
}
test.each(['en','si','ta'])('actual page has honest unavailable copy in %s; GET only, no fake fallback',async language=>{
  localStorage.setItem('medisync_language',language);mount({available:false,status:'unavailable'});
  await screen.findByRole('status');
  expect(screen.getAllByText({en:'Not available',si:'ලබා ගත නොහැක',ta:'கிடைக்கவில்லை'}[language]).length).toBeGreaterThan(0);
  expect(screen.queryByText('15,420')).not.toBeInTheDocument();expect(screen.queryByText('SURVEILLANCE')).not.toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();expect(api.get.mock.calls.map(x=>x[0])).toEqual(['/admin/ml-status','/admin/outbreak/alerts','/admin/outbreak/growth?window=72h']);
});
test('valid top-level envelope displays zero reference profiles, not fabricated clinical telemetry',async()=>{
  mount({available:true,status:'available',dataPoints:0,dataPointUnit:'reference disease profiles'});
  await screen.findByText('Available');expect(screen.getByText('Symptom reference profiles')).toBeInTheDocument();
  expect(screen.getAllByText('0').length).toBeGreaterThan(0);
  expect(screen.getByRole('status')).toHaveTextContent('not a patient or outbreak count');
  expect(screen.getByText(/Symptom reference profiles: 41 of 71,704 conditions; any ICD code can be selected manually/)).toBeInTheDocument();
});
test.each([{}, {data:{dataPoints:10}},{available:true,dataPoints:10,dataPointUnit:'patients'}])('invalid envelope remains unavailable %#',async dto=>{
  mount(dto);await screen.findByRole('status');expect(screen.getAllByText('Not available').length).toBeGreaterThan(1);
  expect(screen.queryByText('Available')).not.toBeInTheDocument();
});
test('legacy HTTP failure and alert-read failure render unavailable without unhandled rejection or invented empty success',async()=>{
  const log=jest.spyOn(console,'error').mockImplementation(()=>{});
  try{mount(null,{reject:true,alertsFail:true});await screen.findByRole('status');
    expect(screen.queryByText('No alerts returned.')).not.toBeInTheDocument();
    await waitFor(()=>expect(log).not.toHaveBeenCalled());expect(api.post).not.toHaveBeenCalled();
  }finally{log.mockRestore();}
});
