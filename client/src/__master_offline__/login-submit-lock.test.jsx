import React from 'react';
import {render, screen, fireEvent, act, cleanup} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import api from '../api/axiosInstance';
import Admin from '../pages/admin/Login';
import Patient from '../pages/patient/Login';
import Doctor from '../pages/doctor/Login';
import Hospital from '../pages/hospital/Login';
import Pharmacy from '../pages/pharmacy/Login';

jest.mock('../api/axiosInstance', () => ({__esModule:true, default:{post:jest.fn()}}));
jest.mock('react-toastify', () => ({toast:{success:jest.fn(),error:jest.fn(),info:jest.fn()}}));
// This inert OTP boundary exposes callbacks; the real page owns the lock.
jest.mock('../components/common/LoginOtpStep', () => ({onVerify,onResend}) => <>
  <button type="button" onClick={() => onVerify('000000')}>Inert verify</button>
  <button type="button" onClick={onResend}>Inert resend</button>
</>);
const roles=[['admin',Admin],['patient',Patient],['doctor',Doctor],['hospital',Hospital],['pharmacy',Pharmacy]];
const pending=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
beforeEach(()=>{api.post.mockReset();localStorage.clear();});
afterEach(()=>{cleanup();localStorage.clear();});
function open(Component){const view=render(<MemoryRouter><Component/></MemoryRouter>);return view.container.querySelector('form');}

test.each(roles)('%s login permits one in-flight request, and an explicit later submission after failure',async(role,Component)=>{
  const first=pending(),second=pending();api.post.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const form=open(Component);
  act(()=>{fireEvent.submit(form);fireEvent.submit(form);});
  expect(api.post).toHaveBeenCalledTimes(1);expect(api.post.mock.calls[0][0]).toBe(role==='pharmacy'?'/pharmacy/login':'/auth/login');
  await act(async()=>first.reject(new Error('Inert request rejected')));
  fireEvent.submit(screen.getByLabelText(/email/i).closest('form'));expect(api.post).toHaveBeenCalledTimes(2);
  await act(async()=>second.reject(new Error('Inert request rejected')));
  expect(localStorage.getItem('accessToken')).toBeNull();
});

test.each(roles)('%s successful response preserves the existing session completion path',async(role,Component)=>{
  api.post.mockResolvedValueOnce({data:{data:{accessToken:'inert-not-a-jwt',role:role==='hospital'?'hospital_admin':role}}});
  const form=open(Component);await act(async()=>fireEvent.submit(form));
  expect(api.post).toHaveBeenCalledTimes(1);expect(localStorage.getItem('accessToken')).toBe('inert-not-a-jwt');
});

test.each(roles)('%s pending OTP shares one lock across verify, resend and repeated callbacks',async(role,Component)=>{
  const request=pending();api.post.mockResolvedValueOnce({data:{data:{requiresOTP:true,userId:'inert-owned-user'}}}).mockReturnValueOnce(request.promise);
  fireEvent.submit(open(Component));
  const verify=await screen.findByRole('button',{name:'Inert verify'}),resend=screen.getByRole('button',{name:'Inert resend'});
  act(()=>{fireEvent.click(verify);fireEvent.click(resend);fireEvent.click(verify);});
  expect(api.post).toHaveBeenCalledTimes(2);expect(api.post.mock.calls[1][0]).toBe('/auth/verify-otp');
  await act(async()=>request.reject(new Error('Inert OTP rejection')));
  api.post.mockResolvedValueOnce({data:{}});await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Inert resend'})));
  expect(api.post).toHaveBeenCalledTimes(3);expect(api.post.mock.calls[2][0]).toBe('/auth/send-otp');
  expect(localStorage.getItem('accessToken')).toBeNull();
});
