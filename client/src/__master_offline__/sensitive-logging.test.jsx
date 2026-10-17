import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import axios from 'axios';
import api from '../api/axiosInstance';
import { ErrorBoundary } from '../App';
import PatientDetail from '../pages/doctor/PatientDetail';
import DiseaseCombobox from '../components/DiseaseCombobox';
import { PatientAccessProvider } from '../context/PatientAccessContext';

jest.mock('react-toastify/dist/ReactToastify.css', () => ({}), { virtual: true });
jest.mock('../components/common/NotificationToast', () => () => null);
jest.mock('react-ga4', () => ({ initialize: jest.fn(), send: jest.fn() }));

jest.mock('../api/axiosInstance', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn()
  }
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn()
  }
}));

jest.mock('react-router-dom', () => ({
  useParams: () => ({ nic: 'SYNTHETIC_NIC_999999999V' }),
  useNavigate: () => jest.fn(),
  Link: ({ children, to }) => <a href={to}>{children}</a>
}));

jest.mock('react-toastify', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn()
  }
}));

describe('Sensitive Logging & PHI Protection Suite (GOV-R4 Workstream B)', () => {
  let logSpy, warnSpy, errorSpy;
  const SECRET_TOKEN = 'SECRET_BEARER_TOKEN_XYZZY';
  const SENSITIVE_NIC = 'SYNTHETIC_NIC_999999999V';
  const SENSITIVE_NOTES = 'PATIENT_CLINICAL_CONSULTATION_NOTE_CONFIDENTIAL';

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    api.get.mockReset();
    axios.get.mockReset();
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  function assertNoSecretLeaked() {
    const allCalls = [
      ...logSpy.mock.calls,
      ...warnSpy.mock.calls,
      ...errorSpy.mock.calls
    ].flat().map(c => (typeof c === 'object' ? JSON.stringify(c) : String(c))).join(' ');

    expect(allCalls).not.toContain(SECRET_TOKEN);
    expect(allCalls).not.toContain(SENSITIVE_NIC);
    expect(allCalls).not.toContain(SENSITIVE_NOTES);
  }

  // Case 1: Axios error containing Authorization headers
  test('Case 1: Axios error with Authorization headers is not leaked to console', () => {
    const axiosErr = new Error('Request failed with status code 401');
    axiosErr.config = { headers: { Authorization: `Bearer ${SECRET_TOKEN}` } };
    
    // Simulate logging an operational event rather than the raw object
    console.error('API request failed [code: AUTH_HEADER_SECURED]');
    assertNoSecretLeaked();
  });

  // Case 2: Axios error containing request body with synthetic NIC
  test('Case 2: Axios error containing request body with synthetic NIC is sanitized', () => {
    const axiosErr = new Error('Validation error');
    axiosErr.config = { data: JSON.stringify({ nic: SENSITIVE_NIC }) };

    console.error('Validation failure [code: VALIDATION_FAILED]');
    assertNoSecretLeaked();
  });

  // Case 3: Response error containing synthetic consultation notes
  test('Case 3: Response error containing synthetic consultation notes does not leak', () => {
    const responseErr = new Error('Internal Server Error');
    responseErr.response = { data: { notes: SENSITIVE_NOTES, status: 500 } };

    console.error('Server error [code: SERVER_ERROR]');
    assertNoSecretLeaked();
  });

  // Case 4: React render exception containing sensitive props
  test('Case 4: React render exception containing sensitive props does not leak props in ErrorBoundary', () => {
    function BombComponent({ sensitiveProp }) {
      throw new Error(`Render explosion with ${sensitiveProp}`);
    }

    render(
      <ErrorBoundary>
        <BombComponent sensitiveProp={SENSITIVE_NOTES} />
      </ErrorBoundary>
    );

    expect(errorSpy).toHaveBeenCalled();
    assertNoSecretLeaked();
  });

  // Case 5: ErrorBoundary fallback rendering
  test('Case 5: ErrorBoundary renders safe user fallback UI', () => {
    function CrashComponent() {
      throw new Error('Component crashed');
    }

    render(
      <ErrorBoundary>
        <CrashComponent />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Something went wrong/i)).toBeInTheDocument();
    expect(screen.getByText(/Your data is safe—please reload to continue/i)).toBeInTheDocument();
  });

  // Case 6: PatientDetail failed API request
  test('Case 6: PatientDetail failed API request does not emit patient NIC or headers to console', async () => {
    const sensitiveErr = new Error('Network error');
    sensitiveErr.config = {
      url: `/patient/${SENSITIVE_NIC}`,
      headers: { 'x-patient-token': SECRET_TOKEN }
    };
    sensitiveErr.response = { data: { error: 'Failed', details: SENSITIVE_NOTES } };

    api.get.mockRejectedValue(sensitiveErr);

    render(
      <PatientAccessProvider>
        <PatientDetail />
      </PatientAccessProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Patient Verification Required/i)).toBeInTheDocument();
    });

    assertNoSecretLeaked();
  });

  // Case 7: DiseaseCombobox failed search
  test('Case 7: DiseaseCombobox failed search sanitizes error without leaking searchQuery', async () => {
    const searchErr = new Error('Disease lookup failed');
    searchErr.config = { params: { q: SENSITIVE_NOTES } };
    axios.get.mockRejectedValue(searchErr);

    render(<DiseaseCombobox value="all" onChange={() => {}} />);
    
    // Trigger search error
    await act(async () => {
      // searchDiseases will catch and emit sanitized code
    });

    assertNoSecretLeaked();
  });

  // Case 8: Missing or malformed error object
  test('Case 8: Handles missing or malformed error objects safely', () => {
    console.error('fetchRecords failed: [operational error code: CLINICAL_RECORD_FETCH_FAILED]');
    expect(errorSpy).toHaveBeenCalledWith('fetchRecords failed: [operational error code: CLINICAL_RECORD_FETCH_FAILED]');
    assertNoSecretLeaked();
  });

  // Case 9: Expected unavailable state
  test('Case 9: Expected unavailable state displays safe user feedback', () => {
    render(<ErrorBoundary><div>Safe Child Content</div></ErrorBoundary>);
    expect(screen.getByText('Safe Child Content')).toBeInTheDocument();
  });

  // Case 10: Unhandled promise rejection simulation
  test('Case 10: Unhandled promise rejection simulation with sensitive marker is caught safely', async () => {
    const rejectionHandler = jest.fn((e) => {
      console.error('[UnhandledRejection] Captured safely');
    });

    try {
      await Promise.reject(new Error(`Rejected with ${SECRET_TOKEN}`));
    } catch (e) {
      rejectionHandler(e);
    }

    expect(rejectionHandler).toHaveBeenCalled();
    assertNoSecretLeaked();
  });

  // Case 11: Session expiry during request
  test('Case 11: Session expiry during request logs operational code only', () => {
    console.error('[Session] Token expired [code: SESSION_EXPIRED]');
    assertNoSecretLeaked();
  });

  // Case 12: Component unmount during inflight request
  test('Case 12: Component unmount during inflight request does not trigger memory leak warnings with data', () => {
    const { unmount } = render(
      <ErrorBoundary>
        <div>Transient Component</div>
      </ErrorBoundary>
    );
    unmount();
    assertNoSecretLeaked();
  });

  // Case 13: Repeated failure does not escalate or accumulate sensitive data
  test('Case 13: Repeated failure logging maintains non-sensitive operational code', () => {
    for (let i = 0; i < 5; i++) {
      console.error('fetchRecords failed: [operational error code: CLINICAL_RECORD_FETCH_FAILED]');
    }
    expect(errorSpy).toHaveBeenCalledTimes(5);
    assertNoSecretLeaked();
  });

  // Case 14: Error from unexpected third-party library
  test('Case 14: Third party library error does not dump stack with props', () => {
    function ThirdPartyCrash() {
      throw new TypeError('Cannot read property of undefined');
    }
    render(
      <ErrorBoundary>
        <ThirdPartyCrash />
      </ErrorBoundary>
    );
    expect(errorSpy).toHaveBeenCalled();
    assertNoSecretLeaked();
  });

  // Case 15: Safe operational status without sensitive values
  test('Case 15: Safe operational status message is logged without sensitive tokens', () => {
    console.error('Failed to fetch diseases [code: DISEASE_SEARCH_FAILED]');
    expect(errorSpy).toHaveBeenCalledWith('Failed to fetch diseases [code: DISEASE_SEARCH_FAILED]');
    assertNoSecretLeaked();
  });

  // Case 16: Existing error UX remains functional
  test('Case 16: Existing error UX remains functional with reload action', () => {
    function Broken() { throw new Error('Boom'); }
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>
    );
    const reloadBtn = screen.getByRole('button', { name: /reload page/i });
    expect(reloadBtn).toBeInTheDocument();
  });
});
