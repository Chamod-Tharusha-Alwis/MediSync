import axios from 'axios';
import api from '../api/axiosInstance';
import {clearLocalSession} from '../utils/sessionCleanup';
import {getDeviceFingerprint} from '../utils/deviceFingerprint';
jest.mock('../utils/deviceFingerprint',()=>({getDeviceFingerprint:jest.fn(async()=> 'inert-fingerprint'),getHardwareModel:jest.fn(async()=> 'inert-model')}));
jest.mock('axios',()=>{const client=jest.fn();client.defaults={headers:{common:{}}};client.interceptors={request:{use:jest.fn()},response:{use:jest.fn()}};return {create:()=>client,post:jest.fn(),interceptors:{request:{use:jest.fn()}}};});
const defer=()=>{let resolve;return {promise:new Promise(r=>{resolve=r;}),resolve:value=>resolve(value)};};
// Registration occurs at module initialization; clearMocks intentionally clears call history per test.
const requestHandler=api.interceptors.request.use.mock.calls[0][0];
const responseHandler=api.interceptors.response.use.mock.calls[0][1];
const originalLocation=window.location;
beforeAll(()=>{delete window.location;window.location={href:'http://localhost/'};});
afterAll(()=>{window.location=originalLocation;});
beforeEach(()=>{localStorage.clear();localStorage.setItem('token','inert-old');localStorage.setItem('refreshToken','inert-refresh');getDeviceFingerprint.mockResolvedValue('inert-fingerprint');axios.post.mockReset();api.mockReset();});
test('Logout deletes default Authorization header and stored identity',()=>{api.defaults.headers.common.Authorization='Bearer inert';localStorage.setItem('nic','QA');localStorage.setItem('userRole','patient');clearLocalSession();expect(api.defaults.headers.common.Authorization).toBeUndefined();expect(localStorage.getItem('nic')).toBeNull();expect(localStorage.getItem('userRole')).toBeNull();});
test('Async request cannot dispatch credentials after logout',async()=>{const d=defer();getDeviceFingerprint.mockReturnValueOnce(d.promise);const p=requestHandler({headers:{}});clearLocalSession();d.resolve('inert');await expect(p).rejects.toThrow('Session changed before request');});
test('Late refresh response cannot recreate a logged-out session',async()=>{const d=defer();axios.post.mockReturnValueOnce(d.promise);const p=responseHandler({config:{url:'/synthetic',headers:{}},response:{status:401}});await Promise.resolve();await Promise.resolve();clearLocalSession();d.resolve({data:{accessToken:'inert-new',refreshToken:'inert-new-refresh'}});await expect(p).rejects.toThrow('Session changed');expect(localStorage.getItem('token')).toBeNull();expect(localStorage.getItem('refreshToken')).toBeNull();expect(api).not.toHaveBeenCalled();});
