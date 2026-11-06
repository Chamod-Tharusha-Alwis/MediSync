import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { setMockRoute } from 'react-router-dom';
import PharmacyDashboard from '../pages/pharmacy/Dashboard';
import api from '../api/axiosInstance';

jest.mock('../api/axiosInstance', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() }
}));
jest.mock('react-toastify', () => ({
  toast: { error: jest.fn(), success: jest.fn(), info: jest.fn() }
}));
jest.mock('../components/ui/AppShell', () => ({ children }) => <main>{children}</main>);
jest.mock('../components/common/PageTransition', () => ({ children }) => <>{children}</>);
jest.mock('../components/common/ActiveOutbreakBanner', () => () => null);
jest.mock('../components/PatientAccessModal', () => ({ patientNic, onSuccess, onClose }) => (
  <div role="dialog" aria-label={`Consent for ${patientNic}`}>
    <button onClick={() => onSuccess('valid-consent-token')}>Grant consent</button>
    <button onClick={onClose}>Cancel consent</button>
  </div>
));

const result = (nic = 'QA-U7') => ({
  data: {
    data: {
      patient: { fullName: `Patient ${nic}` },
      prescriptions: [{
        _id: `rx-${nic}`,
        prescriptionId: `RX-${nic}`,
        patientNic: nic,
        medications: [{ name: 'Amoxicillin 500mg', dosage: '500mg', frequency: 'TDS', durationDays: 5 }]
      }]
    }
  }
});

const consentError = () => ({
  response: {
    status: 403,
    data: { error: 'Patient consent required' }
  }
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('role', 'pharmacist');
  setMockRoute('/dashboard/dispense');
  api.get.mockReset();
  api.post.mockReset();
  jest.clearAllMocks();
});

afterEach(cleanup);

describe('U7 — Pharmacy consent before prescription lookup', () => {
  test('no api.get is dispatched before consent and the modal opens immediately', async () => {
    render(<PharmacyDashboard />);
    fireEvent.change(screen.getByPlaceholderText(/Enter Patient NIC/), { target: { value: 'QA-U7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retrieve' }));

    // Consent modal opens upfront
    expect(await screen.findByRole('dialog', { name: 'Consent for QA-U7' })).toBeInTheDocument();
    // Zero GET calls to pending prescriptions
    expect(api.get).not.toHaveBeenCalled();
  });

  test('with a token, exactly one request carries x-patient-access', async () => {
    api.get.mockResolvedValue(result('QA-U7'));
    render(<PharmacyDashboard />);
    fireEvent.change(screen.getByPlaceholderText(/Enter Patient NIC/), { target: { value: 'QA-U7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retrieve' }));

    // Grant consent via modal
    fireEvent.click(await screen.findByText('Grant consent'));
    await screen.findByText('Patient QA-U7');

    // Exactly one GET call was made, carrying the token
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get.mock.calls[0][0]).toBe('/pharmacy/prescriptions/pending/QA-U7');
    expect(api.get.mock.calls[0][1].headers['x-patient-access']).toBe('valid-consent-token');
  });

  test('an expired-token 403 still opens the modal for re-authentication', async () => {
    // First lookup with valid token succeeds
    api.get.mockResolvedValueOnce(result('QA-U7'));
    render(<PharmacyDashboard />);
    fireEvent.change(screen.getByPlaceholderText(/Enter Patient NIC/), { target: { value: 'QA-U7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Retrieve' }));
    fireEvent.click(await screen.findByText('Grant consent'));
    await screen.findByText('Patient QA-U7');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // Subsequent retrieve encounters an expired token (403 Patient consent required)
    api.get.mockRejectedValueOnce(consentError());
    fireEvent.click(screen.getByRole('button', { name: 'Retrieve' }));

    // The catch block catches 403 and re-opens the consent modal
    expect(await screen.findByRole('dialog', { name: 'Consent for QA-U7' })).toBeInTheDocument();
  });
});
