import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { setMockRoute } from 'react-router-dom';
import { toast } from 'react-toastify';
import PharmacyDashboard, { describeSafetyFlags } from '../pages/pharmacy/Dashboard';
import api from '../api/axiosInstance';

// Fix pack 2, PR B. New test file; existing tests unchanged. Synthetic fixture values only.
jest.mock('../api/axiosInstance', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('react-toastify', () => ({ toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() } }));
jest.mock('../components/ui/AppShell', () => ({ children }) => <main>{children}</main>);
jest.mock('../components/common/PageTransition', () => ({ children }) => <>{children}</>);
jest.mock('../components/common/ActiveOutbreakBanner', () => () => null);
jest.mock('../components/PatientAccessModal', () => ({ onSuccess }) => (
  <div role="dialog"><button onClick={() => onSuccess('fixture-consent-token')}>Grant fixture consent</button></div>
));

const rx = (id, name, extra = {}) => ({ _id: id, prescriptionId: `RX-${id}`, patientNic: 'FIX-NIC', consultationRef: 'CON-FIX-0001', drugName: name, dosage: '5 mg', frequency: 'Once daily', durationDays: 5, ...extra });
const listing = { data: { data: { patient: { fullName: 'Fixture Patient' }, prescriptions: [
  rx('a1', 'Warfarin', { safetyOverride: { acknowledged: true, findingTypes: ['DRUG_INTERACTION', 'DUPLICATE_THERAPY_ACTIVE_RX', 'UNCONFIGURED_LIMIT'] } }),
  rx('a2', 'Omeprazole'),
], progress: { 'CON-FIX-0001': { total: 3, dispensed: 1, complete: false } } } } };

async function open() {
  render(<PharmacyDashboard />);
  fireEvent.change(screen.getByPlaceholderText(/Enter Patient NIC/), { target: { value: 'FIX-NIC' } });
  fireEvent.click(screen.getByRole('button', { name: 'Retrieve' }));
  fireEvent.click(await screen.findByText('Grant fixture consent'));
  await screen.findByText('Fixture Patient');
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('role', 'pharmacist'); setMockRoute('/dashboard/dispense'); api.get.mockReset(); api.post.mockReset(); jest.clearAllMocks(); });
afterEach(cleanup);

test('no bulk "Dispense Consultation Order" button; per-medicine buttons and progress are shown', async () => {
  api.get.mockResolvedValue(listing);
  await open();
  expect(screen.queryByText(/Dispense Consultation Order/)).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Dispense Medication' })).toHaveLength(2);
  expect(screen.getAllByRole('button', { name: 'Mark not available' })).toHaveLength(2);
  expect(screen.getByTestId('consultation-progress')).toHaveTextContent('1 of 3 dispensed');
});

test('safety flags read as a plain sentence', async () => {
  api.get.mockResolvedValue(listing);
  await open();
  expect(screen.getByText('Prescriber acknowledged: drug interaction; duplicate active therapy; no dose limit on file')).toBeInTheDocument();
  expect(describeSafetyFlags([])).toBe('Prescriber acknowledged: safety advisory');
});

test('mark not available sends the reason with the consent grant and keeps the item listed', async () => {
  api.get.mockResolvedValue(listing);
  api.post.mockResolvedValue({ data: { status: 'pending', data: { pharmacyName: 'City Fixture Pharmacy' } } });
  await open();
  fireEvent.click(screen.getAllByRole('button', { name: 'Mark not available' })[1]);
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'not_stocked' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  const [url, body, config] = api.post.mock.calls[0];
  expect(url).toBe('/pharmacy/prescriptions/a2/not-available');
  expect(body).toEqual({ patientNic: 'FIX-NIC', reason: 'not_stocked', note: '' });
  expect(config.headers['x-patient-access']).toBe('fixture-consent-token');
  expect(await screen.findByTestId('not-available-marks')).toHaveTextContent('Not available at: City Fixture Pharmacy');
  expect(screen.getByText('Omeprazole')).toBeInTheDocument();
});

test('a repeat-course refusal shows the server sentence, not "already dispensed"', async () => {
  api.get.mockResolvedValue(listing);
  const message = 'Warfarin was dispensed on 17 Nov at Ayu Arana Care Pharmacy for 5 days. Available again on 22 Nov.';
  api.post.mockRejectedValue({ response: { status: 409, data: { code: 'REPEAT_COURSE_ACTIVE', error: message } } });
  await open();
  fireEvent.click(screen.getAllByRole('button', { name: 'Dispense Medication' })[0]);
  fireEvent.change(await screen.findByLabelText('Quantity dispensed'), { target: { value: '5' } });
  const confirm = screen.getByRole('button', { name: /Confirm Dispense|Dispense Now/i });
  fireEvent.click(screen.getByTestId('pharmacist-safety-checkbox'));
  fireEvent.click(confirm);
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
  expect(toast.error).not.toHaveBeenCalledWith('This prescription has already been dispensed.');
});
