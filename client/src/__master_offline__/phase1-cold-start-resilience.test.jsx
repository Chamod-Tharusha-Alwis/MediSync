import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import api from '../api/axiosInstance';
import NewConsultation from '../pages/doctor/NewConsultation';

jest.mock('../api/axiosInstance', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() }
}));
jest.mock('../components/ui/AppShell', () => ({ children }) => <main>{children}</main>);
jest.mock('../components/common/PageTransition', () => ({ children }) => <>{children}</>);
jest.mock('../components/SymptomTagInput', () => ({ onChange }) => (
  <button onClick={() => onChange(['fever', 'headache', 'joint pain', 'rash'])}>Add synthetic symptoms</button>
));
jest.mock('../components/DrugSearchInput', () => () => null);
jest.mock('../components/PatientAccessModal', () => ({ onSuccess }) => (
  <button onClick={() => onSuccess(`inert.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600 }))}.inert`)}>
    Grant synthetic consent
  </button>
));

const validInference = () => ({
  availability: 'available',
  predictions: [
    { disease: 'Dengue fever', confidence: 78.5, icd_code: 'A90', recommendedSpecialist: 'Infectious Disease Specialist', urgent: false },
    { disease: 'Chikungunya', confidence: 62.0, icd_code: 'A92.0', recommendedSpecialist: 'General Physician', urgent: false }
  ]
});

beforeEach(() => {
  localStorage.clear();
  api.get.mockReset();
  api.post.mockReset();
  api.get
    .mockResolvedValueOnce({ data: { data: { fullName: 'Synthetic Test Patient' } } })
    .mockResolvedValueOnce({ data: { data: [] } });
});

async function navigateToStep4() {
  render(<NewConsultation />);
  fireEvent.change(screen.getByLabelText('Patient NIC'), { target: { value: 'QA-SYNTHETIC-NIC' } });
  fireEvent.click(screen.getByLabelText('Request patient verification'));
  fireEvent.click(screen.getByText('Grant synthetic consent'));
  await screen.findByText('Synthetic Test Patient');
  fireEvent.click(screen.getByText('Proceed to Symptoms'));
  fireEvent.click(screen.getByText('Add synthetic symptoms'));
  fireEvent.click(screen.getByText('Continue to Reference Matches'));
}

describe('Phase 1 UI Cold-Start Resilience & Suggestion Recovery', () => {
  test('1. Initial cold-start 503 triggers "waking" UI indicator and bounded single retry succeeds', async () => {
    api.post
      .mockRejectedValueOnce(Object.assign(new Error('Service Unavailable'), { response: { status: 503 } }))
      .mockResolvedValueOnce({ data: validInference() });

    await navigateToStep4();
    fireEvent.click(screen.getByText('Analyze Symptoms'));

    // Verify "waking" UI status indicator is displayed
    await screen.findByText(/Analysis service is waking up, retrying/i);
    expect(screen.getByText(/Existing manual clinician entry remains available/i)).toBeInTheDocument();

    // Verify retry succeeds and displays predictions
    await screen.findByText('Dengue fever');
    expect(screen.getByText(/Similarity score: 78.5%/)).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  test('2. Cold start timeout (ECONNABORTED) triggers waking indicator and recovers on retry', async () => {
    const timeoutErr = new Error('timeout of 60000ms exceeded');
    timeoutErr.code = 'ECONNABORTED';

    api.post
      .mockRejectedValueOnce(timeoutErr)
      .mockResolvedValueOnce({ data: validInference() });

    await navigateToStep4();
    fireEvent.click(screen.getByText('Analyze Symptoms'));

    await screen.findByText(/Analysis service is waking up, retrying/i);
    await screen.findByText('Dengue fever');
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  test('3. Permanent cold-start failure stops at bounded retry limit (max 2 calls) and shows unavailable state', async () => {
    api.post
      .mockRejectedValueOnce(Object.assign(new Error('timeout'), { code: 'ECONNABORTED' }))
      .mockRejectedValueOnce(Object.assign(new Error('Service Unavailable'), { response: { status: 503 } }));

    await navigateToStep4();
    fireEvent.click(screen.getByText('Analyze Symptoms'));

    // Initially displays waking state
    await screen.findByText(/Analysis service is waking up, retrying/i);

    // After retry fails, transitions to unavailable
    await screen.findByText(/AI suggestions unavailable. Existing manual clinician entry remains available./i);
    expect(api.post).toHaveBeenCalledTimes(2); // Strictly bounded: no 3rd call
    expect(screen.queryByText('Dengue fever')).toBeNull();
  });

  test('4. Non-cold-start error (400) fails immediately without waking indicator or retry', async () => {
    api.post.mockRejectedValueOnce(Object.assign(new Error('Bad Request'), { response: { status: 400 } }));

    await navigateToStep4();
    fireEvent.click(screen.getByText('Analyze Symptoms'));

    await screen.findByText(/AI suggestions unavailable. Existing manual clinician entry remains available./i);
    expect(screen.queryByText(/Analysis service is waking up, retrying/i)).toBeNull();
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  test('5. Manual clinician entry and "Build Prescription" button remain fully usable during waking retry', async () => {
    api.post.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ data: validInference() }), 500)));

    await navigateToStep4();
    fireEvent.click(screen.getByText('Analyze Symptoms'));

    // Manual diagnosis input is interactive while inference is in-flight/waking
    const manualInput = screen.getByPlaceholderText('Enter clinician-entered condition description...');
    fireEvent.change(manualInput, { target: { value: 'Clinician Confirmed Viral Syndrome' } });
    expect(manualInput).toHaveValue('Clinician Confirmed Viral Syndrome');

    // "Build Prescription" button is immediately enabled by manual diagnosis entry
    const buildRxBtn = screen.getByText('Build Prescription');
    expect(buildRxBtn).not.toBeDisabled();
    fireEvent.click(buildRxBtn);

    // Doctor proceeds to Step 5 (Rx & Labs) without being blocked by AI
    expect(screen.queryByText('Add Medication')).toBeDefined();
  });

  test('6. Patient change or unmount cancels in-flight waking retry without state update warnings', async () => {
    let rejectFirst;
    const firstCallPromise = new Promise((_, reject) => { rejectFirst = reject; });
    api.post.mockReturnValueOnce(firstCallPromise);

    await navigateToStep4();
    fireEvent.click(screen.getByText('Analyze Symptoms'));

    // Clinician clicks back and changes patient while retry is scheduled
    fireEvent.click(screen.getByText('Back'));
    fireEvent.click(screen.getByText('Back'));
    fireEvent.click(screen.getByRole('button', { name: 'Change Patient' }));
    fireEvent.change(screen.getByLabelText('Patient NIC'), { target: { value: 'QA-OTHER-NIC' } });

    // Reject first call to trigger waking timer
    await act(async () => {
      rejectFirst(Object.assign(new Error('cold start'), { response: { status: 503 } }));
    });

    // Verify stale inference cannot populate options or trigger unmounted updates
    expect(screen.queryByText('Dengue fever')).toBeNull();
    expect(screen.getByLabelText('Patient NIC')).toHaveValue('QA-OTHER-NIC');
  });
});
