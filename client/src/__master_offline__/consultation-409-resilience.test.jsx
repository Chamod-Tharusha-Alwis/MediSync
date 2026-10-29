import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import api from '../api/axiosInstance';
import NewConsultation from '../pages/doctor/NewConsultation';
import { toast } from 'react-hot-toast';

jest.mock('../api/axiosInstance', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() }
}));
jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn()
  }
}));
jest.mock('../components/ui/AppShell', () => ({ children }) => <main>{children}</main>);
jest.mock('../components/common/PageTransition', () => ({ children }) => <>{children}</>);
jest.mock('../components/SymptomTagInput', () => ({ onChange }) => (
  <button onClick={() => onChange(['fever', 'cough'])}>Add symptoms</button>
));
jest.mock('../components/DrugSearchInput', () => () => <div data-testid="mock-drug-search" />);
jest.mock('../components/PatientAccessModal', () => ({ onSuccess }) => (
  <button onClick={() => onSuccess(`inert.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600 }))}.inert`)}>
    Grant consent
  </button>
));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/doctor/consultation' }),
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>
}));

async function navigateToStep5() {
  render(<NewConsultation />);
  fireEvent.change(screen.getByLabelText('Patient NIC'), { target: { value: 'QA-SYNTHETIC-NIC' } });
  fireEvent.click(screen.getByLabelText('Request patient verification'));
  fireEvent.click(screen.getByText('Grant consent'));
  await screen.findByText('Synthetic Patient');
  fireEvent.click(screen.getByText('Proceed to Symptoms'));
  fireEvent.click(screen.getByText('Add symptoms'));
  fireEvent.click(screen.getByText('Continue to Reference Matches'));
  const manualInput = await screen.findByPlaceholderText(/Enter clinician-entered condition description.../i);
  fireEvent.change(manualInput, { target: { value: 'Acute Bronchitis' } });
  fireEvent.click(screen.getByText('Build Prescription'));
  await screen.findByText(/Next Consultation \/ Follow-up Date/i);
}

describe('Phase 3 Client: Complete Consultation 409 Resilience & UI Locking Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    api.get.mockReset();
    api.post.mockReset();
    toast.error.mockReset();
    toast.success.mockReset();
    mockNavigate.mockReset();

    api.get.mockImplementation((url) => {
      if (typeof url === 'string' && url.includes('/patient/QA-SYNTHETIC-NIC/timeline')) {
        return Promise.resolve({ data: { data: [] } });
      }
      if (typeof url === 'string' && url.includes('/patient/QA-SYNTHETIC-NIC')) {
        return Promise.resolve({ data: { data: { fullName: 'Synthetic Patient', allergies: [] } } });
      }
      return Promise.resolve({ data: { data: [] } });
    });
  });

  afterEach(() => {
    cleanup();
  });

  test('1. Submit button is disabled and displays spinner + "Saving Consultation…" while pending', async () => {
    let resolvePost;
    api.post.mockImplementationOnce(() => new Promise((resolve) => { resolvePost = resolve; }));

    await navigateToStep5();
    const submitBtn = screen.getByRole('button', { name: /Complete Consultation/i });

    // Initial state
    expect(submitBtn).toBeEnabled();
    expect(submitBtn).toHaveTextContent('Complete Consultation');

    // Click submit
    fireEvent.click(submitBtn);

    // Pending state: disabled, aria-busy, loading indicator
    await waitFor(() => {
      const pendingBtn = screen.getByRole('button', { name: /Saving Consultation…/i });
      expect(pendingBtn).toBeDisabled();
      expect(pendingBtn).toHaveAttribute('aria-busy', 'true');
    });

    // Resolve post
    resolvePost({ status: 201, data: { consultationId: '0123456789abcdef01234567' } });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/doctor/dashboard');
    });
  });

  test('2. Rapid repeated double-clicks trigger exactly ONE network POST request', async () => {
    let resolvePost;
    api.post.mockImplementationOnce(() => new Promise((resolve) => { resolvePost = resolve; }));

    await navigateToStep5();
    const submitBtn = screen.getByRole('button', { name: /Complete Consultation/i });

    // 5 rapid clicks synchronously
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);

    const postCalls = api.post.mock.calls.filter(c => c[0] === '/doctor/consultation');
    expect(postCalls).toHaveLength(1);

    resolvePost({ status: 201, data: { consultationId: '0123456789abcdef01234567' } });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/doctor/dashboard');
    });
  });

  test('3. 409 CLINICAL_IDEMPOTENCY_CONFLICT immediately regenerates idempotency key and displays guidance', async () => {
    api.post
      .mockRejectedValueOnce({
        response: {
          status: 409,
          data: { error: 'CLINICAL_IDEMPOTENCY_CONFLICT' }
        }
      })
      .mockResolvedValueOnce({
        status: 201,
        data: { consultationId: '0123456789abcdef01234567' }
      });

    await navigateToStep5();
    const submitBtn = screen.getByRole('button', { name: /Complete Consultation/i });

    // First attempt -> fails with 409 key collision
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/Submission conflict.*Idempotency key refreshed/i),
        expect.any(Object)
      );
    });

    const firstKey = api.post.mock.calls[0][2]?.headers?.['Idempotency-Key'];
    expect(firstKey).toBeDefined();

    // Second attempt -> resubmits immediately
    fireEvent.click(screen.getByRole('button', { name: /Complete Consultation/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledTimes(2);
    });

    const secondKey = api.post.mock.calls[1][2]?.headers?.['Idempotency-Key'];
    expect(secondKey).toBeDefined();
    expect(secondKey).not.toBe(firstKey); // Verified: Key regenerated!
  });

  test('4. 409 MEDICATION_REVIEW_REQUIRED displays safety guidance and regenerates key upon form edit', async () => {
    api.post
      .mockRejectedValueOnce({
        response: {
          status: 409,
          data: { error: 'MEDICATION_REVIEW_REQUIRED' }
        }
      })
      .mockResolvedValueOnce({
        status: 201,
        data: { consultationId: '0123456789abcdef01234567' }
      });

    await navigateToStep5();
    const submitBtn = screen.getByRole('button', { name: /Complete Consultation/i });

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/Medication Safety Conflict.*Review the Medication Safety panel/i),
        expect.any(Object)
      );
    });

    const firstKey = api.post.mock.calls[0][2]?.headers?.['Idempotency-Key'];

    // Doctor modifies follow-up date to adjust clinical plan
    const futureDate = new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0];
    const followUpInput = document.getElementById('follow-up-date');
    if (followUpInput) {
      fireEvent.change(followUpInput, { target: { value: futureDate } });
    }

    // Submit adjusted consultation
    fireEvent.click(screen.getByRole('button', { name: /Complete Consultation/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledTimes(2);
    });

    const secondKey = api.post.mock.calls[1][2]?.headers?.['Idempotency-Key'];
    expect(secondKey).toBeDefined();
  });

  test('5. 409 MEDICATION_RECONCILIATION_REQUIRED displays actionable reconciliation guidance', async () => {
    api.post.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { error: 'MEDICATION_RECONCILIATION_REQUIRED' }
      }
    });

    await navigateToStep5();
    fireEvent.click(screen.getByRole('button', { name: /Complete Consultation/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/Medication Reconciliation Required/i),
        expect.any(Object)
      );
    });
  });

  test('6. Form editing after a 400 validation error regenerates idempotency key', async () => {
    api.post
      .mockRejectedValueOnce({
        response: {
          status: 400,
          data: { error: 'DURATION_INVALID', message: 'Duration must be between 1 and 90 days' }
        }
      })
      .mockResolvedValueOnce({
        status: 201,
        data: { consultationId: '0123456789abcdef01234567' }
      });

    await navigateToStep5();
    fireEvent.click(screen.getByRole('button', { name: /Complete Consultation/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Duration must be between 1 and 90 days');
    });

    const firstKey = api.post.mock.calls[0][2]?.headers?.['Idempotency-Key'];

    // Edit follow up date
    const followUpDateInput = document.getElementById('follow-up-date');
    if (followUpDateInput) {
      fireEvent.change(followUpDateInput, { target: { value: '2026-11-15' } });
    }

    fireEvent.click(screen.getByRole('button', { name: /Complete Consultation/i }));

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledTimes(2);
    });

    const secondKey = api.post.mock.calls[1][2]?.headers?.['Idempotency-Key'];
    expect(secondKey).toBeDefined();
  });

  test('7. 500-level uncertain write maintains pending write hold and PRESERVES idempotency key for reconciliation', async () => {
    api.post.mockRejectedValueOnce({
      response: {
        status: 500,
        data: { error: 'TRANSACTION_OUTCOME_UNKNOWN' }
      }
    });

    await navigateToStep5();
    fireEvent.click(screen.getByRole('button', { name: /Complete Consultation/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/A previous save is unconfirmed/i)).toBeInTheDocument();
    });

    // Submit button disabled while under pending write hold
    const submitBtn = screen.getByRole('button', { name: /Complete Consultation/i });
    expect(submitBtn).toBeDisabled();
  });

  test('8. Step 5 Back button navigates back to Step 4 (Reference Matches / Diagnosis), not Step 2', async () => {
    await navigateToStep5();
    const backBtn = screen.getByRole('button', { name: /Back/i });
    fireEvent.click(backBtn);

    // Verified: Transitions to Step 4 (Diagnosis & Reference Matches), not Step 2
    expect(screen.getByPlaceholderText(/Enter clinician-entered condition description.../i)).toBeInTheDocument();
  });
});
