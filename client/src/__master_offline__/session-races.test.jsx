import axios from 'axios';
import { clearLocalSession } from '../utils/sessionCleanup';
import { getDeviceFingerprint } from '../utils/deviceFingerprint';

jest.mock('../utils/deviceFingerprint', () => ({
  getDeviceFingerprint: jest.fn(async () => 'inert-fingerprint'),
  getHardwareModel: jest.fn(async () => 'inert-model')
}));

jest.mock('axios', () => {
  const client = jest.fn();
  client.defaults = { headers: { common: {} } };
  client.interceptors = { request: { use: jest.fn() }, response: { use: jest.fn() } };
  return {
    create: () => client,
    post: jest.fn(),
    interceptors: { request: { use: jest.fn() } }
  };
});

// Configure QA origin environment before initializing axiosInstance
delete window.location;
window.location = {
  href: 'http://127.0.0.1:3100/',
  hostname: '127.0.0.1',
  port: '3100',
  origin: 'http://127.0.0.1:3100'
};
process.env.REACT_APP_MEDISYNC_QA = 'true';

const api = require('../api/axiosInstance').default;

const defer = () => {
  let resolve;
  return {
    promise: new Promise(r => { resolve = r; }),
    resolve: value => resolve(value)
  };
};

// Robust semantic selection of registered interceptors
const requestCalls = api.interceptors.request.use.mock.calls;
const qaOriginGuard = requestCalls.find(
  call => call[0].name === 'assertQaRequest' || call[0].toString().includes('External QA API request blocked')
)?.[0];
const asyncAuthHandler = requestCalls.find(
  call => call[0].constructor.name === 'AsyncFunction' || call[0].toString().includes('sessionGeneration')
)?.[0] || requestCalls[requestCalls.length - 1][0];

const responseHandler = api.interceptors.response.use.mock.calls[0][1];

const originalLocation = window.location;
beforeAll(() => {
  delete window.location;
  window.location = {
    href: 'http://127.0.0.1:3100/',
    hostname: '127.0.0.1',
    port: '3100',
    origin: 'http://127.0.0.1:3100'
  };
});
afterAll(() => {
  window.location = originalLocation;
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('token', 'inert-old');
  localStorage.setItem('refreshToken', 'inert-refresh');
  getDeviceFingerprint.mockResolvedValue('inert-fingerprint');
  axios.post.mockReset();
  api.mockReset();
});

test('QA-origin guard blocks external API requests when active', () => {
  expect(qaOriginGuard).toBeDefined();
  expect(typeof qaOriginGuard).toBe('function');
  expect(() => qaOriginGuard({ url: 'http://malicious.evil.com/api' })).toThrow(/External QA API request blocked/);
  expect(qaOriginGuard({ url: '/api/v1/test' })).toEqual({ url: '/api/v1/test' });
});

test('Logout deletes default Authorization header and stored identity', () => {
  api.defaults.headers.common.Authorization = 'Bearer inert';
  localStorage.setItem('nic', 'QA');
  localStorage.setItem('userRole', 'patient');
  clearLocalSession();
  expect(api.defaults.headers.common.Authorization).toBeUndefined();
  expect(localStorage.getItem('nic')).toBeNull();
  expect(localStorage.getItem('userRole')).toBeNull();
});

test('Async request cannot dispatch credentials after logout', async () => {
  const d = defer();
  getDeviceFingerprint.mockReturnValueOnce(d.promise);
  const p = asyncAuthHandler({ headers: {} });
  clearLocalSession();
  d.resolve('inert');
  await expect(p).rejects.toThrow('Session changed before request');
});

test('concurrent rejected refreshes clear credentials and navigate only once',async()=>{
  let navigations=0;Object.defineProperty(window.location,'href',{configurable:true,get:()=>'/select-role',set:()=>{navigations++;}});
  axios.post.mockRejectedValue({response:{status:401}});
  const generationEvents=jest.fn();window.addEventListener('medisync:session-cleared',generationEvents);
  try { await Promise.allSettled([responseHandler({config:{url:'/patient/me',headers:{}},response:{status:401}}),responseHandler({config:{url:'/notifications',headers:{}},response:{status:401}})]);
  expect(axios.post).toHaveBeenCalledTimes(1);expect(navigations).toBe(1);expect(generationEvents).toHaveBeenCalledTimes(1);expect(localStorage.getItem('token')).toBeNull(); }
  finally {window.removeEventListener('medisync:session-cleared',generationEvents);Object.defineProperty(window.location,'href',{configurable:true,writable:true,value:'http://127.0.0.1:3100/'});}
});

test('Late refresh response cannot recreate a logged-out session', async () => {
  const d = defer();
  axios.post.mockReturnValueOnce(d.promise);
  const p = responseHandler({ config: { url: '/synthetic', headers: {} }, response: { status: 401 } });
  await Promise.resolve();
  await Promise.resolve();
  clearLocalSession();
  d.resolve({ data: { accessToken: 'inert-new', refreshToken: 'inert-new-refresh' } });
  await expect(p).rejects.toThrow('Session changed');
  expect(localStorage.getItem('token')).toBeNull();
  expect(localStorage.getItem('refreshToken')).toBeNull();
  expect(api).not.toHaveBeenCalled();
});
