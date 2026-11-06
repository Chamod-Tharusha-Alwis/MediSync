import React from 'react';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import api from '../api/axiosInstance';
import PatientLogin from '../pages/patient/Login';

jest.mock('../api/axiosInstance', () => ({ __esModule: true, default: { post: jest.fn() } }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
// The real page owns session completion; only the OTP transport control is inert.
jest.mock('../components/common/LoginOtpStep', () => ({ onVerify }) => (
  <button type="button" onClick={() => onVerify('000000')}>Complete inert verification</button>
));

const ACCOUNT_ID = '507f1f77bcf86cd799439011';
const NIC = 'SYNTHETIC-NIC-ONLY';
const EMAIL = 'patient-fixture@example.invalid';
const PASSWORD = 'Synthetic-password-only-14!';
let consoleSpies;

beforeEach(() => {
  localStorage.clear();
  api.post.mockReset();
  consoleSpies = ['log', 'info', 'warn', 'error'].map(method => jest.spyOn(console, method).mockImplementation(() => {}));
});

afterEach(() => {
  const leaked = consoleSpies.some(spy => spy.mock.calls.some(args =>
    args.some(value => typeof value === 'string' && [EMAIL, PASSWORD, NIC, ACCOUNT_ID].some(secret => value.includes(secret)))
  ));
  consoleSpies.forEach(spy => spy.mockRestore());
  cleanup();
  localStorage.clear();
  expect(leaked).toBe(false);
});

async function complete(phase, identity) {
  const data = { accessToken: 'inert-access-token', refreshToken: 'inert-refresh-token', role: 'patient', subId: ACCOUNT_ID, ...identity };
  if (phase === 'otp') {
    api.post.mockResolvedValueOnce({ data: { data: { requiresOTP: true, userId: ACCOUNT_ID } } });
  }
  api.post.mockResolvedValueOnce({ data: { data } });
  const view = render(<MemoryRouter><PatientLogin /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: EMAIL } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: PASSWORD } });
  await act(async () => fireEvent.submit(view.container.querySelector('form')));
  if (phase === 'otp') {
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Complete inert verification' })));
  }
  expect(api.post).toHaveBeenCalledTimes(phase === 'otp' ? 2 : 1);
  expect(api.post.mock.calls.map(([path]) => path)).toEqual(phase === 'otp' ? ['/auth/login', '/auth/verify-otp'] : ['/auth/login']);
  expect(localStorage.getItem('accessToken')).toBe('inert-access-token');
  expect(localStorage.getItem('token')).toBe('inert-access-token');
  expect(localStorage.getItem('refreshToken')).toBe('inert-refresh-token');
  expect(localStorage.getItem('role')).toBe('patient');
}

test.each(['login', 'otp'])('%s completion preserves the response NIC for legacy patient-addressed reads', async phase => {
  await complete(phase, { nic: NIC });
  expect(localStorage.getItem('nic')).toBe(NIC);
  expect(localStorage.getItem('nic') === ACCOUNT_ID).toBe(false);
});

test.each(['login', 'otp'])('%s completion falls back to the stable account ID when the response omits NIC', async phase => {
  await complete(phase, {});
  expect(localStorage.getItem('nic')).toBe(ACCOUNT_ID);
});

test.each(['login', 'otp'])('%s completion uses the stable account ID for an empty response NIC', async phase => {
  await complete(phase, { nic: '' });
  expect(localStorage.getItem('nic')).toBe(ACCOUNT_ID);
});
