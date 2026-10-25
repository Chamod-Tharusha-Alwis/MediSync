import React from 'react';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import { setMockRoute } from 'react-router-dom';
import { toast } from 'react-toastify';
import PharmacyDashboard from '../pages/pharmacy/Dashboard';
import api from '../api/axiosInstance';

jest.mock('../api/axiosInstance', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('react-toastify', () => ({ toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() } }));
jest.mock('../components/ui/AppShell', () => ({ children }) => <main>{children}</main>);
jest.mock('../components/common/PageTransition', () => ({ children }) => <>{children}</>);
jest.mock('../components/common/ActiveOutbreakBanner', () => () => null);
jest.mock('../components/PatientAccessModal', () => ({ patientNic, onSuccess, onClose }) => (
  <div role="dialog" aria-label={`Consent for ${patientNic}`}>
    <button onClick={() => onSuccess('synthetic-consent-token')}>Grant synthetic consent</button>
    <button onClick={onClose}>Cancel consent</button>
  </div>
));

const pending = () => { let resolve, reject; const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; }); return { promise, resolve, reject }; };
const prescription = (nic = 'QA-ONE') => ({ _id: `owned-${nic}`, prescriptionId: `RX-${nic}`, patientNic: nic, medications: [{ name: 'Synthetic Medicine', dosage: 'demo', frequency: 'demo', durationDays: 2 }] });
const result = (nic = 'QA-ONE') => ({ data: { data: { patient: { fullName: `Patient ${nic}` }, prescriptions: [prescription(nic)] } } });
const consentError = () => ({ response: { status: 403, data: { error: 'Patient consent required' } } });
const query = value => { fireEvent.change(screen.getByPlaceholderText(/Enter Patient NIC/), { target: { value } }); fireEvent.click(screen.getByRole('button', { name: 'Retrieve' })); };

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); localStorage.setItem('role', 'pharmacist'); setMockRoute('/dashboard/dispense');
  api.get.mockReset(); api.post.mockReset(); jest.clearAllMocks();
});
afterEach(cleanup);

test('successful pharmacy consent is held in the real portal provider and reused only for its patient', async () => {
  api.get.mockRejectedValueOnce(consentError()).mockResolvedValue(result());
  render(<PharmacyDashboard />); query('QA-ONE');
  fireEvent.click(await screen.findByText('Grant synthetic consent'));
  await screen.findByText('Patient QA-ONE');
  expect(api.get.mock.calls[1][1].headers['x-patient-access']).toBe('synthetic-consent-token');
  fireEvent.click(screen.getByRole('button', { name: 'Retrieve' }));
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(3));
  expect(api.get.mock.calls[2][1].headers['x-patient-access']).toBe('synthetic-consent-token');
  query('QA-TWO'); await waitFor(() => expect(api.get).toHaveBeenCalledTimes(4));
  expect(api.get.mock.calls[3][1].headers['x-patient-access']).toBeUndefined();
});

test('changing NIC immediately removes the previous patient and prescriptions', async () => {
  api.get.mockResolvedValue(result()); render(<PharmacyDashboard />); query('QA-ONE'); await screen.findByText('Patient QA-ONE');
  fireEvent.change(screen.getByPlaceholderText(/Enter Patient NIC/), { target: { value: 'QA-TWO' } });
  expect(screen.queryByText('Patient QA-ONE')).not.toBeInTheDocument();
  expect(screen.queryByText('Synthetic Medicine')).not.toBeInTheDocument();
});

test('an old result cannot be displayed under an edited patient identity', async () => {
  const old = pending(); api.get.mockReturnValue(old.promise); render(<PharmacyDashboard />); query('QA-ONE');
  fireEvent.change(screen.getByPlaceholderText(/Enter Patient NIC/), { target: { value: 'QA-TWO' } });
  await act(async () => old.resolve(result('QA-ONE')));
  expect(screen.queryByText('Patient QA-ONE')).not.toBeInTheDocument();
  expect(screen.queryByText('Synthetic Medicine')).not.toBeInTheDocument();
});

test('an obsolete consent error cannot request an OTP for the replacement identity', async () => {
  const old = pending(); api.get.mockReturnValue(old.promise); render(<PharmacyDashboard />); query('QA-ONE');
  fireEvent.change(screen.getByPlaceholderText(/Enter Patient NIC/), { target: { value: 'QA-TWO' } });
  await act(async () => old.reject(consentError()));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test.each(['Account verification required', 'Access denied: insufficient permissions'])('an account or role denial does not masquerade as patient consent: %s', async error => {
  api.get.mockRejectedValue({ response: { status: 403, data: { error } } }); render(<PharmacyDashboard />); query('QA-ONE');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Retrieve' })).not.toBeDisabled());
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(toast.error).toHaveBeenCalledWith(error);
});

test('a failed repeat search removes stale clinical content rather than leaving a successful old view', async () => {
  api.get.mockResolvedValueOnce(result()).mockRejectedValueOnce({ response: { status: 500 } });
  render(<PharmacyDashboard />); query('QA-ONE'); await screen.findByText('Patient QA-ONE');
  fireEvent.click(screen.getByRole('button', { name: 'Retrieve' }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to fetch prescriptions'));
  expect(screen.queryByText('Patient QA-ONE')).not.toBeInTheDocument();
});

test('invalid response data cannot preserve a previous successful patient view', async () => {
  api.get.mockResolvedValueOnce(result()).mockResolvedValueOnce({ data: { data: { prescriptions: 'invalid' } } });
  render(<PharmacyDashboard />); query('QA-ONE'); await screen.findByText('Patient QA-ONE');
  fireEvent.click(screen.getByRole('button', { name: 'Retrieve' }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Invalid prescription response. Please retry.'));
  expect(screen.queryByText('Patient QA-ONE')).not.toBeInTheDocument();
});

test('lookup uses a normalized and URI-encoded identity snapshot', async () => {
  api.get.mockResolvedValue({ data: { data: [] } }); render(<PharmacyDashboard />); query(' qa/one ');
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/pharmacy/prescriptions/pending/QA%2FONE', expect.any(Object)));
});

test('the patient lookup has an accessible label', () => {
  render(<PharmacyDashboard />); expect(screen.getByRole('textbox', { name: 'Patient NIC' })).toBeInTheDocument();
});

test('session loss immediately removes the displayed patient and retires a pending request', async () => {
  const old = pending(); api.get.mockResolvedValueOnce(result()).mockReturnValueOnce(old.promise);
  render(<PharmacyDashboard />); query('QA-ONE'); await screen.findByText('Patient QA-ONE');
  fireEvent.click(screen.getByRole('button', { name: 'Retrieve' }));
  act(() => window.dispatchEvent(new Event('medisync:session-cleared')));
  await act(async () => old.resolve(result()));
  expect(screen.queryByText('Patient QA-ONE')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Patient NIC' })).toHaveValue('');
});

test('late inventory loading cannot reopen dispensing for the previous patient', async () => {
  const old = pending(); api.get.mockResolvedValueOnce(result()).mockReturnValueOnce(old.promise);
  render(<PharmacyDashboard />); query('QA-ONE'); await screen.findByText('Patient QA-ONE');
  fireEvent.click(screen.getByRole('button', { name: 'Dispense Medication' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Patient NIC' }), { target: { value: 'QA-TWO' } });
  await act(async () => old.resolve({ data: { data: [] } }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(api.post).not.toHaveBeenCalled();
});

test('prescription dispensing carries the patient-bound provider grant into its authenticated request', async () => {
  api.get.mockRejectedValueOnce(consentError()).mockResolvedValueOnce(result()).mockResolvedValueOnce({ data: { data: [{ _id: 'owned-stock', drugName: 'Synthetic Medicine', stock: 3, unit: 'tablet' }] } });
  api.post.mockResolvedValue({ data: { data: { receiptNumber: 'OWNED-RECEIPT' } } });
  render(<PharmacyDashboard />); query('QA-ONE'); fireEvent.click(await screen.findByText('Grant synthetic consent'));
  await screen.findByText('Patient QA-ONE'); fireEvent.click(screen.getByRole('button', { name: 'Dispense Medication' }));
  fireEvent.change(await screen.findByLabelText('Quantity in inventory units'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Dispense Now' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  expect(api.post.mock.calls[0][0]).toBe('/pharmacy/dispense');
  expect(api.post.mock.calls[0][1].patientNic).toBe('QA-ONE');
  expect(api.post.mock.calls[0][2].headers['x-patient-access']).toBe('synthetic-consent-token');
});

test('OTC consent is remembered by the provider and a role denial is displayed without a new OTP loop', async () => {
  setMockRoute('/dashboard/otc'); api.get.mockResolvedValue({ data: { data: [{ _id: 'owned-stock', drugName: 'Synthetic Medicine', stock: 3, unit: 'tablet' }] } });
  api.post.mockRejectedValue({ response: { status: 403, data: { error: 'Access denied: insufficient permissions' } } });
  render(<PharmacyDashboard />); await screen.findByText('Synthetic Medicine (Stock: 3 tablet)');
  fireEvent.change(screen.getByLabelText('Patient NIC *'), { target: { value: 'QA-ONE' } });
  fireEvent.change(screen.getByPlaceholderText('Medication name* (select stock or type)'), { target: { value: 'Synthetic Medicine' } });
  fireEvent.click(screen.getByRole('button', { name: 'Fulfill Dispensation' }));
  fireEvent.click(await screen.findByText('Grant synthetic consent'));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Access denied: insufficient permissions'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Fulfill Dispensation' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
  expect(api.post.mock.calls[1][2].headers['x-patient-access']).toBe('synthetic-consent-token');
});
