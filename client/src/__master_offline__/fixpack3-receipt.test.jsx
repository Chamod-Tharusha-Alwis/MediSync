import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { setMockRoute } from 'react-router-dom';
import { toast } from 'react-toastify';
import PharmacyDashboard from '../pages/pharmacy/Dashboard';
import api from '../api/axiosInstance';

// Fix pack 3, item 2: select medicines and release them together on one receipt.
// New test file; existing tests unchanged. Synthetic fixture values only.
jest.mock('../api/axiosInstance', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('react-toastify', () => ({ toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() } }));
jest.mock('../components/ui/AppShell', () => ({ children }) => <main>{children}</main>);
jest.mock('../components/common/PageTransition', () => ({ children }) => <>{children}</>);
jest.mock('../components/common/ActiveOutbreakBanner', () => () => null);
jest.mock('../components/PatientAccessModal', () => ({ onSuccess }) => (
  <div role="dialog"><button onClick={() => onSuccess('fixture-consent-token')}>Grant fixture consent</button></div>
));

const rx = (id, name, extra = {}) => ({ _id: id, prescriptionId: `RX-${id}`, patientNic: 'FIX-NIC', consultationRef: 'CON-FIX-0101', drugName: name, dosage: '500 mg', frequency: 'Twice daily', durationDays: 5, status: 'pending', ...extra });
const listing = { data: { data: { patient: { fullName: 'Fixture Patient' }, prescriptions: [
  rx('b1', 'Amoxicillin'), rx('b2', 'Paracetamol', { durationDays: 3 }),
  rx('b3', 'Omeprazole', { unavailableAt: [{ pharmacyName: 'Ayu Arana Care Pharmacy', reason: 'out_of_stock' }] }),
], progress: { 'CON-FIX-0101': { total: 3, dispensed: 0, complete: false } }, unavailableHere: ['b3'] } } };

async function open() {
  render(<PharmacyDashboard />);
  fireEvent.change(screen.getByPlaceholderText(/Enter Patient NIC/), { target: { value: 'FIX-NIC' } });
  fireEvent.click(screen.getByRole('button', { name: 'Retrieve' }));
  fireEvent.click(await screen.findByText('Grant fixture consent'));
  await screen.findByText('Fixture Patient');
}

beforeEach(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('role', 'pharmacist'); setMockRoute('/dashboard/dispense'); api.get.mockReset(); api.post.mockReset(); jest.clearAllMocks(); });
afterEach(cleanup);

test('checkbox per pending medicine; not-available-here items are not selectable; per-medicine buttons stay', async () => {
  api.get.mockResolvedValue(listing);
  await open();
  expect(screen.getByLabelText('Select Amoxicillin')).toBeEnabled();
  expect(screen.getByLabelText('Select Paracetamol')).toBeEnabled();
  expect(screen.getByLabelText('Select Omeprazole')).toBeDisabled();
  expect(screen.getByTestId('dispense-selected')).toHaveTextContent('Dispense selected (0)');
  expect(screen.getByTestId('dispense-selected')).toBeDisabled();
  expect(screen.getAllByRole('button', { name: 'Dispense Medication' })).toHaveLength(3);
  expect(screen.getAllByRole('button', { name: 'Mark not available' })).toHaveLength(3);
  fireEvent.click(screen.getByLabelText('Select Amoxicillin'));
  fireEvent.click(screen.getByLabelText('Select Paracetamol'));
  expect(screen.getByTestId('dispense-selected')).toHaveTextContent('Dispense selected (2)');
});

test('"Dispense selected (2)" sends ONE request with both medicines, one idempotency key, consent and acknowledgement', async () => {
  api.get.mockResolvedValue(listing);
  api.post.mockImplementation(url => (url === '/pharmacy/dispense'
    ? Promise.resolve({ data: { data: { receiptNumber: 'REC-FIXTURE-1', prescriptionIds: ['b1', 'b2'], medicationCount: 2 } } })
    : Promise.resolve({ data: { warnings: [], findings: [], canProceed: true } })));
  await open();
  fireEvent.click(screen.getByLabelText('Select Amoxicillin'));
  fireEvent.click(screen.getByLabelText('Select Paracetamol'));
  fireEvent.click(screen.getByTestId('dispense-selected'));
  expect(await screen.findByText('2 medicines released together on one receipt')).toBeInTheDocument();
  expect(screen.getAllByLabelText('Quantity dispensed')).toHaveLength(2);
  fireEvent.click(screen.getByTestId('pharmacist-safety-checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /Confirm Dispense/i }));
  await waitFor(() => expect(api.post.mock.calls.filter(c => c[0] === '/pharmacy/dispense')).toHaveLength(1));
  const [, body, config] = api.post.mock.calls.find(c => c[0] === '/pharmacy/dispense');
  expect(body.selection).toEqual([
    { prescriptionId: 'b1', items: [expect.objectContaining({ drugName: 'Amoxicillin', quantityDispensed: 5 })] },
    { prescriptionId: 'b2', items: [expect.objectContaining({ drugName: 'Paracetamol', quantityDispensed: 3 })] },
  ]);
  expect(body.safetyAcknowledgment).toMatchObject({ acknowledged: true });
  expect(config.headers['Idempotency-Key']).toMatch(/^sel:/);
  expect(config.headers['x-patient-access']).toBe('fixture-consent-token');
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('2 medicines released on one receipt (REC-FIXTURE-1).'));
  expect(screen.queryByText('Amoxicillin')).not.toBeInTheDocument();
  expect(screen.getByText('Omeprazole')).toBeInTheDocument();
  expect(screen.getByTestId('consultation-progress')).toHaveTextContent('2 of 3 dispensed');
});

test('a refused selection (repeat course) shows the server sentence and keeps every medicine pending', async () => {
  api.get.mockResolvedValue(listing);
  const message = 'Amoxicillin was dispensed on 16 Nov at City Fixture Pharmacy for 5 days. Available again on 21 Nov. Nothing in this selection was dispensed.';
  api.post.mockImplementation(url => (url === '/pharmacy/dispense'
    ? Promise.reject({ response: { status: 409, data: { code: 'REPEAT_COURSE_ACTIVE', error: message } } })
    : Promise.resolve({ data: { warnings: [], findings: [], canProceed: true } })));
  await open();
  fireEvent.click(screen.getByLabelText('Select Amoxicillin'));
  fireEvent.click(screen.getByLabelText('Select Paracetamol'));
  fireEvent.click(screen.getByTestId('dispense-selected'));
  fireEvent.click(await screen.findByTestId('pharmacist-safety-checkbox'));
  fireEvent.click(screen.getByRole('button', { name: /Confirm Dispense/i }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(message));
  // The modal stays open; both medicines are still listed and still selected (nothing was released).
  expect(screen.getByLabelText('Select Amoxicillin')).toBeChecked();
  expect(screen.getByLabelText('Select Paracetamol')).toBeChecked();
  expect(screen.getByTestId('consultation-progress')).toHaveTextContent('0 of 3 dispensed');
});
