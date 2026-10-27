import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { setMockRoute } from 'react-router-dom';
import { toast } from 'react-toastify';
import PharmacyDashboard from '../pages/pharmacy/Dashboard';
import api from '../api/axiosInstance';

jest.mock('../api/axiosInstance', () => ({ __esModule: true, default: { get: jest.fn(), put: jest.fn(), post: jest.fn() } }));
jest.mock('react-toastify', () => ({ toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() } }));
jest.mock('../components/ui/AppShell', () => ({ children }) => <main>{children}</main>);
jest.mock('../components/common/PageTransition', () => ({ children }) => <>{children}</>);
jest.mock('../components/common/ActiveOutbreakBanner', () => () => null);
jest.mock('../components/common/LanguagePreferenceCard', () => () => <p>Independent language preference control</p>);

beforeEach(() => {
  localStorage.clear(); localStorage.setItem('role', 'pharmacy_admin'); setMockRoute('/dashboard/settings');
  jest.clearAllMocks(); api.get.mockResolvedValue({ data: { data: { fullName: 'Synthetic Staff', email: 'synthetic@example.invalid', description: 'Synthetic facility', pharmacyId: 'owned-pharmacy' } } });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: jest.fn() } });
});
afterEach(cleanup);

test('unsupported external inventory integration is explicitly unavailable without fake credentials, endpoint or copy action', async () => {
  const { container } = render(<PharmacyDashboard />);
  await screen.findByRole('heading', { name: 'Pharmacy Settings' });
  expect(screen.getByRole('status')).toHaveTextContent('External inventory integration is unavailable');
  expect(screen.getByRole('status')).toHaveTextContent('No integration client, token or webhook has been provisioned');
  expect(container).not.toHaveTextContent('sk_sandbox_mock_credential_67890');
  expect(container).not.toHaveTextContent('api.medisync.io');
  expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument();
  expect(navigator.clipboard.writeText).not.toHaveBeenCalled(); expect(api.post).not.toHaveBeenCalled();
});

test('real facility description save remains available after removing the pretend integration', async () => {
  api.put.mockResolvedValue({ data: { success: true } }); render(<PharmacyDashboard />);
  const description = await screen.findByPlaceholderText('Describe facility, operating details...');
  fireEvent.change(description, { target: { value: 'Updated synthetic description' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/users/profile', { description: 'Updated synthetic description' }));
  expect(toast.success).toHaveBeenCalledWith('Profile settings updated successfully');
});

test('a failed real settings save reports failure without a success notification', async () => {
  api.put.mockRejectedValue({ response: { status: 503 } }); render(<PharmacyDashboard />);
  await screen.findByPlaceholderText('Describe facility, operating details...');
  fireEvent.click(screen.getByRole('button', { name: 'Save Settings' }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to update settings'));
  expect(toast.success).not.toHaveBeenCalled(); expect(api.post).not.toHaveBeenCalled();
});
