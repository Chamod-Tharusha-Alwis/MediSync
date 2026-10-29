import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import LoginShell from '../components/common/LoginShell';
import ActiveOutbreakBanner from '../components/common/ActiveOutbreakBanner';
import api from '../api/axiosInstance';

jest.mock('../api/axiosInstance', () => ({ get: jest.fn() }));
jest.mock('../i18n/LanguageContext', () => ({ useTranslation: () => ({ t: (_key, fallback) => fallback }) }));

afterEach(() => { cleanup(); localStorage.clear(); jest.clearAllMocks(); });

test.each([null, 'synthetic-stale-token'])('login shell never requests protected broadcasts with token=%s', async token => {
  if (token) localStorage.setItem('token', token);
  render(<LoginShell title="Sign in" subtitle="Existing account"><input aria-label="Account" /></LoginShell>);
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  expect(screen.getByLabelText('Account')).toBeInTheDocument();
  await Promise.resolve();
  expect(api.get).not.toHaveBeenCalled();
});

test('dashboard banner retains authenticated broadcast lookup', async () => {
  localStorage.setItem('token', 'synthetic-session');
  api.get.mockResolvedValue({ data: { data: null } });
  render(<ActiveOutbreakBanner />);
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/alerts/broadcasts/latest'));
  expect(api.get).toHaveBeenCalledTimes(1);
});

test('banner without an authenticated token does not contact protected API', async () => {
  render(<ActiveOutbreakBanner />);
  await Promise.resolve();
  expect(api.get).not.toHaveBeenCalled();
});
