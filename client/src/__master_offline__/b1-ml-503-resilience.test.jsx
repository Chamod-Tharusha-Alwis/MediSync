import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../api/axiosInstance';
import NewConsultation from '../pages/doctor/NewConsultation';

jest.mock('../api/axiosInstance', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock('../components/ui/AppShell', () => ({ children }) => <main>{children}</main>);
jest.mock('../components/common/PageTransition', () => ({ children }) => <>{children}</>);
jest.mock('../components/SymptomTagInput', () => ({ onChange }) => (
  <button onClick={() => onChange(['fever', 'joint pain'])}>Add symptoms</button>
));
jest.mock('../components/DrugSearchInput', () => () => <div data-testid="drug-search-mock" />);
jest.mock('../components/PatientAccessModal', () => ({ onSuccess }) => (
  <button onClick={() => onSuccess(`inert.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600 }))}.inert`)}>
    Grant synthetic consent
  </button>
));

const validInference = () => ({
  availability: 'available',
  predictions: [
    {
      disease: 'Dengue Fever',
      confidence: 72,
      icd_code: 'A90',
      recommendedSpecialist: 'Infectious Disease Specialist',
      urgent: true,
    },
  ],
});

beforeEach(() => {
  localStorage.clear();
  api.get.mockReset();
  api.post.mockReset();
  api.get
    .mockResolvedValueOnce({ data: { data: { fullName: 'Synthetic Patient' } } })
    .mockResolvedValueOnce({ data: { data: [] } });
});

async function completeWizardToStep4() {
  render(<NewConsultation />);
  fireEvent.change(screen.getByLabelText('Patient NIC'), { target: { value: 'QA-SYNTHETIC' } });
  fireEvent.click(screen.getByLabelText('Request patient verification'));
  fireEvent.click(screen.getByText('Grant synthetic consent'));
  await screen.findByText('Synthetic Patient');
  fireEvent.click(screen.getByText('Proceed to Symptoms'));
  fireEvent.click(screen.getByText('Add symptoms'));
  fireEvent.click(screen.getByText('Continue to Reference Matches'));
}

describe('Feature B1: ML Service 503 Cold-Start Resilience and Manual Diagnosis Fallback', () => {
  test('1. ML 503 response triggers waking state, displays retry button on persistent unavailable, and allows retry to succeed', async () => {
    await completeWizardToStep4();

    const error503 = Object.assign(new Error('ML Cold Start'), {
      response: {
        status: 503,
        data: {
          availability: 'waking_up',
          error: 'Analysis service is waking up. Please retry shortly or use manual diagnosis.',
        },
      },
    });

    api.post.mockRejectedValueOnce(error503).mockRejectedValueOnce(error503);

    fireEvent.click(screen.getByText('Analyze Symptoms'));

    await screen.findByText(/AI suggestions unavailable/);
    const retryButton = screen.getByRole('button', { name: /Retry Analysis/i });
    expect(retryButton).toBeInTheDocument();
    expect(retryButton).not.toBeDisabled();

    api.post.mockResolvedValueOnce({ data: validInference() });
    fireEvent.click(retryButton);

    await screen.findByText('Dengue Fever');
    expect(screen.getByText(/Similarity score: 72%/)).toBeInTheDocument();
    expect(screen.getByText('URGENT')).toBeInTheDocument();
  });

  test('2. Persistent ML 503 does NOT block manual clinician entry or advancing to prescription step', async () => {
    await completeWizardToStep4();

    const persistentError = Object.assign(new Error('Gateway Timeout'), {
      response: {
        status: 504,
        data: {
          availability: 'unavailable',
          error: 'AI suggestions unavailable. Please use the existing manual diagnosis option.',
        },
      },
    });

    api.post.mockRejectedValue(persistentError);
    fireEvent.click(screen.getByText('Analyze Symptoms'));

    await screen.findByText(/AI suggestions unavailable/);
    await waitFor(() => expect(screen.getByText('Analyze Symptoms')).not.toBeDisabled());

    const manualInput = screen.getByPlaceholderText('Enter clinician-entered condition description...');
    fireEvent.change(manualInput, { target: { value: 'Suspected Viral Infection' } });

    const buildRxButton = screen.getByRole('button', { name: /Build Prescription/i });
    expect(buildRxButton).toBeEnabled();

    fireEvent.click(buildRxButton);
    await screen.findByText('Add Medication');
    expect(screen.getByText('Suspected Viral Infection')).toBeInTheDocument();
  });
});
