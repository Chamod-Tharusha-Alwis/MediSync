import React from 'react';
import { render, screen, fireEvent, waitFor, act, renderHook } from '@testing-library/react';
import api from '../api/axiosInstance';
import NewConsultation from '../pages/doctor/NewConsultation';
import usePatientConsent from '../hooks/usePatientConsent';
import { PatientAccessProvider, usePatientAccess } from '../context/PatientAccessContext';
import { clearLocalSession } from '../utils/sessionCleanup';
jest.mock('../api/axiosInstance',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn()}}));
jest.mock('../components/ui/AppShell',()=>({children})=><main>{children}</main>);
jest.mock('../components/common/PageTransition',()=>({children})=><>{children}</>);
jest.mock('../components/SymptomTagInput',()=>()=>null);
jest.mock('../components/DrugSearchInput',()=>()=>null);
jest.mock('../components/PatientAccessModal',()=>({onSuccess,onClose})=><div role="dialog"><button onClick={()=>onSuccess(mockToken())}>Grant synthetic consent</button><button onClick={onClose}>Cancel</button></div>);
const mockToken=(seconds=600)=>`inert.${btoa(JSON.stringify({exp:Math.floor(Date.now()/1000)+seconds}))}.inert`;
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
beforeEach(()=>{localStorage.clear();api.get.mockReset();api.post.mockReset();});
test.each(['committed','unconfirmed'])('remounted wizard preserves pending save until matching server confirmation: %s',async state=>{
 const key='owned-consultation-reference-0001';sessionStorage.setItem('medisync:pending-consultation',JSON.stringify({key}));
 api.get.mockResolvedValue({data:{state,operationKey:key,consultationId:'000000000000000000000001'}});
 try {
  render(<NewConsultation/>);expect(screen.getByRole('alert')).toHaveTextContent('previous save');expect(api.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Check previous save'}));
  await waitFor(()=>expect(api.get).toHaveBeenCalledWith(`/doctor/consultation-command/${key}`));
  await waitFor(()=>expect(sessionStorage.getItem('medisync:pending-consultation')===null).toBe(state==='committed'));
  expect(api.post).not.toHaveBeenCalled();
 }finally {sessionStorage.removeItem('medisync:pending-consultation');}
});
test('Doctor wizard requests no profile or timeline before consent',()=>{render(<NewConsultation/>);fireEvent.change(screen.getByLabelText('Patient NIC'),{target:{value:'QA-NIC'}});fireEvent.click(screen.getByLabelText('Request patient verification'));expect(screen.getByRole('dialog')).toBeInTheDocument();expect(api.get).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();});
test('Closing consent does not fetch patient information',()=>{render(<NewConsultation/>);fireEvent.change(screen.getByLabelText('Patient NIC'),{target:{value:'QA-NIC'}});fireEvent.click(screen.getByLabelText('Request patient verification'));fireEvent.click(screen.getByText('Cancel'));expect(api.get).not.toHaveBeenCalled();expect(screen.queryByRole('dialog')).toBeNull();});
test('Authorized doctor profile and timeline carry the grant',async()=>{api.get.mockResolvedValue({data:{data:[]}});render(<NewConsultation/>);fireEvent.change(screen.getByLabelText('Patient NIC'),{target:{value:'QA-NIC'}});fireEvent.click(screen.getByLabelText('Request patient verification'));fireEvent.click(screen.getByText('Grant synthetic consent'));await waitFor(()=>expect(api.get).toHaveBeenCalledTimes(2));for(const [,options]of api.get.mock.calls)expect(options.headers['x-patient-access']).toMatch(/^inert\./);});
test.each([401,403,404,500])('Failed authorized read clears patient state: %s',async status=>{api.get.mockRejectedValue({response:{status}});const {result}=renderHook(()=>usePatientConsent(api,'QA-NIC'));await act(async()=>{await result.current.authorize(mockToken());});expect(result.current.patient).toBeNull();expect(result.current.token).toBe('');expect(result.current.status).toBe('error');expect(api.get).toHaveBeenCalledTimes(1);});
test('Expired or malformed grant never makes a read',async()=>{const {result}=renderHook(()=>usePatientConsent(api,'QA-NIC'));await act(async()=>{await result.current.authorize(mockToken(-1));await result.current.authorize('invalid');});expect(api.get).not.toHaveBeenCalled();});
test('Identifier change ignores an old authorized response',async()=>{const d=deferred();api.get.mockReturnValue(d.promise);const {result,rerender}=renderHook(({nic})=>usePatientConsent(api,nic),{initialProps:{nic:'QA-ONE'}});let pending;act(()=>{pending=result.current.authorize(mockToken());});rerender({nic:'QA-TWO'});await act(async()=>{d.resolve({data:{data:{fullName:'Synthetic'}}});await pending;});expect(result.current.patient).toBeNull();expect(api.get).toHaveBeenCalledTimes(1);});
test('Unmount aborts pending reads and ignores the result',async()=>{const d=deferred();api.get.mockReturnValue(d.promise);const {result,unmount}=renderHook(()=>usePatientConsent(api,'QA'));let pending;act(()=>{pending=result.current.authorize(mockToken());});const signal=api.get.mock.calls[0][1].signal;unmount();await act(async()=>{d.resolve({data:{data:{}}});await pending;});expect(signal.aborted).toBe(true);expect(api.get).toHaveBeenCalledTimes(1);});
test('Concurrent grant callbacks make only one authorized request chain',async()=>{const d=deferred();api.get.mockReturnValue(d.promise);const {result}=renderHook(()=>usePatientConsent(api,'QA'));let p;act(()=>{p=result.current.authorize(mockToken());result.current.authorize(mockToken());});expect(api.get).toHaveBeenCalledTimes(1);await act(async()=>{result.current.revoke();d.resolve({data:{data:{}}});await p;});});
test('Access expiry clears an authorized profile',async()=>{jest.useFakeTimers();api.get.mockResolvedValueOnce({data:{data:{fullName:'Synthetic'}}}).mockResolvedValueOnce({data:{data:[]}});const {result}=renderHook(()=>usePatientConsent(api,'QA'));await act(async()=>{await result.current.authorize(mockToken(2));});expect(result.current.status).toBe('authorized');act(()=>jest.advanceTimersByTime(2100));expect(result.current.patient).toBeNull();expect(result.current.token).toBe('');jest.useRealTimers();});
test('Logout clears consent context and all stored tokens, preserving language',()=>{localStorage.setItem('token','inert');localStorage.setItem('accessToken','inert');localStorage.setItem('refreshToken','inert');localStorage.setItem('language','en');const {result}=renderHook(()=>usePatientAccess(),{wrapper:PatientAccessProvider});act(()=>result.current.setPatientSession({nic:' qa ',patientName:'Synthetic',token:'inert'}));expect(result.current.getPatientToken('QA')).toBe('inert');act(()=>clearLocalSession());expect(result.current.activeSession).toBeNull();for(const k of ['token','accessToken','refreshToken'])expect(localStorage.getItem(k)).toBeNull();expect(localStorage.getItem('language')).toBe('en');});
test('Patient context emits no identifiers to console',()=>{const log=jest.spyOn(console,'log').mockImplementation(()=>{});const {result}=renderHook(()=>usePatientAccess(),{wrapper:PatientAccessProvider});act(()=>result.current.setPatientSession({nic:'QA',patientName:'Synthetic',token:'inert'}));expect(log).not.toHaveBeenCalled();log.mockRestore();});
const authorizeWizard=async()=>{
  api.get.mockResolvedValueOnce({data:{data:{fullName:'Synthetic Patient'}}}).mockResolvedValueOnce({data:{data:[]}});
  render(<NewConsultation/>);fireEvent.change(screen.getByLabelText('Patient NIC'),{target:{value:'QA-NIC'}});
  fireEvent.click(screen.getByLabelText('Request patient verification'));fireEvent.click(screen.getByText('Grant synthetic consent'));
  await screen.findByText('Synthetic Patient');
};
test('Changing patient clears the authorized clinical overview',async()=>{
  await authorizeWizard();fireEvent.click(screen.getByRole('button',{name:'Change Patient'}));
  expect(screen.queryByText('Synthetic Patient')).toBeNull();expect(screen.getByLabelText('Patient NIC')).toBeInTheDocument();
});
test('Double completion dispatches only one mocked consultation submission',async()=>{
  const d=deferred();api.post.mockReturnValue(d.promise);await authorizeWizard();
  fireEvent.click(screen.getByText('Proceed to Symptoms'));fireEvent.click(screen.getByText('Continue to Reference Matches'));
  fireEvent.change(screen.getByPlaceholderText('Enter clinician-entered condition description...'),{target:{value:'Synthetic test description'}});
  fireEvent.click(screen.getByText('Build Prescription'));const button=screen.getByText('Complete Consultation');fireEvent.click(button);fireEvent.click(button);
  expect(api.post).toHaveBeenCalledTimes(1);expect(api.post.mock.calls[0][0]).toBe('/doctor/consultation');
  await act(async()=>d.resolve({data:{}}));
});
