import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import api from '../api/axiosInstance';
import NewConsultation from '../pages/doctor/NewConsultation';
import HistoryErrorBoundary from '../components/common/HistoryErrorBoundary';
import {
  formatLabTestName,
  getLabTestName,
  formatLabTestStatus,
  formatLabTestDate,
  formatLabTestId,
  formatLabTestSummary,
  formatLabTest,
  formatStatusHistory,
  getPrescriptionDrugName,
} from '../utils/labTestFormatter';

// Mock API transport
jest.mock('../api/axiosInstance', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

// Mock Toast notifications
jest.mock('react-hot-toast', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock Shell & Layout wrappers
jest.mock('../components/ui/AppShell', () => ({ children }) => <main>{children}</main>);
jest.mock('../components/common/PageTransition', () => ({ children }) => <>{children}</>);
jest.mock('../components/SymptomTagInput', () => ({ onChange }) => (
  <button onClick={() => onChange(['fever', 'cough'])}>Add symptoms</button>
));
jest.mock('../components/DrugSearchInput', () => () => <div data-testid="mock-drug-search" />);
jest.mock('../components/PatientAccessModal', () => ({ onSuccess }) => (
  <button
    onClick={() =>
      onSuccess(`inert.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600 }))}.inert`)
    }
  >
    Grant consent
  </button>
));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/doctor/consultation' }),
  Link: ({ children, to, ...props }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

/**
 * Full 22-key lab test document matching schema keys from:
 * server/src/controllers/patientController.js (getTimeline) & LabTest schema.
 */
const FULL_22_KEY_LAB_TEST = {
  _id: '6722d4f1a2b3c4d5e6f7a8b9',
  consultationId: '6722d4f1a2b3c4d5e6f7a8b0',
  consultationRef: 'CON-2026-9999',
  patientNic: 'QA-SYNTHETIC-NIC',
  patientId: '6722d4f1a2b3c4d5e6f7a8b1',
  patientName: 'Synthetic Demo Patient',
  patientEmail: 'patient.synth@medisync.synthetic',
  hospitalId: '6722d4f1a2b3c4d5e6f7a8b2',
  acceptedBy: '6722d4f1a2b3c4d5e6f7a8b3',
  referredBy: '6722d4f1a2b3c4d5e6f7a8b4',
  testName: 'Full Blood Count (FBC)',
  testCategory: 'Hematology',
  urgency: 'routine',
  notes: 'Check hemoglobin and platelets',
  status: 'sample_collected',
  reportUploadedAt: '2026-10-31T09:30:00.000Z',
  reportOriginalName: 'fbc_report_scan.pdf',
  reportEnvelopeVersion: 'v1.0',
  labTestId: 'LAB-2026-8888',
  statusHistory: [
    { status: 'pending', changedAt: '2026-10-31T08:00:00.000Z', note: 'Order created' },
    { status: 'sample_collected', changedAt: '2026-10-31T09:00:00.000Z', note: 'Sample drawn' },
  ],
  createdAt: '2026-10-31T08:00:00.000Z',
  updatedAt: '2026-10-31T09:00:00.000Z',
};

const REQUIRED_22_KEYS = [
  '_id',
  'consultationId',
  'consultationRef',
  'patientNic',
  'patientId',
  'patientName',
  'patientEmail',
  'hospitalId',
  'acceptedBy',
  'referredBy',
  'testName',
  'testCategory',
  'urgency',
  'notes',
  'status',
  'reportUploadedAt',
  'reportOriginalName',
  'reportEnvelopeVersion',
  'labTestId',
  'statusHistory',
  'createdAt',
  'updatedAt',
];

async function navigateToStep2WithTimeline(timelineItems = []) {
  api.get.mockImplementation((url) => {
    if (typeof url === 'string' && url.includes('/patient/QA-SYNTHETIC-NIC/timeline')) {
      return Promise.resolve({ data: { data: timelineItems } });
    }
    if (typeof url === 'string' && url.includes('/patient/QA-SYNTHETIC-NIC')) {
      return Promise.resolve({
        data: {
          data: {
            fullName: 'Synthetic Demo Patient',
            allergies: ['Penicillin'],
            chronicConditions: ['Hypertension'],
            age: 42,
            bloodGroup: 'O+',
          },
        },
      });
    }
    return Promise.resolve({ data: { data: [] } });
  });

  render(<NewConsultation />);
  fireEvent.change(screen.getByLabelText('Patient NIC'), { target: { value: 'QA-SYNTHETIC-NIC' } });
  fireEvent.click(screen.getByLabelText('Request patient verification'));
  fireEvent.click(screen.getByText('Grant consent'));
  await screen.findByText('Synthetic Demo Patient');
}

describe('R2 Milestone 3: Lab Test Rendering Regression & History Error Boundary Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    api.get.mockReset();
    api.post.mockReset();
    mockNavigate.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  describe('1. Full 22-Key Lab Test Document Mounting (No React Error #31)', () => {
    test('verifies full lab-test-shaped document contains all 22 required keys', () => {
      const keys = Object.keys(FULL_22_KEY_LAB_TEST).sort();
      expect(keys).toEqual([...REQUIRED_22_KEYS].sort());
      expect(keys).toHaveLength(22);
    });

    test('mounts NewConsultation with full 22-key lab test document without throwing React Error #31 and renders formatted fields', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const timelineWithFullLabTest = [
        {
          type: 'consultation',
          date: '2026-10-31T08:00:00.000Z',
          data: {
            diagnosis: 'Acute Bronchitis',
            icdCode: 'J20.9',
            symptoms: ['Cough', 'Fever'],
            clinicalNotes: 'Mild chest discomfort.',
            prescriptions: [
              { drugName: 'Amoxicillin 500mg', dosage: '1 tab', frequency: 'TDS' },
            ],
            labTests: [FULL_22_KEY_LAB_TEST],
          },
        },
      ];

      await navigateToStep2WithTimeline(timelineWithFullLabTest);

      // Verify Step 2 overview rendered
      expect(screen.getByText('Patient Clinical Overview')).toBeInTheDocument();
      expect(screen.getByText('Synthetic Demo Patient')).toBeInTheDocument();
      expect(screen.getByText('Past Consultations & Labs')).toBeInTheDocument();

      // Open details if needed
      const consultationHeader = screen.getByText('Consultation');
      expect(consultationHeader).toBeInTheDocument();
      fireEvent.click(consultationHeader);

      // Verify formatted test name and status are rendered as primitive text children
      expect(screen.getByText('Full Blood Count (FBC)')).toBeInTheDocument();
      expect(screen.getByText('Sample Collected')).toBeInTheDocument();

      // Verify recent medications extracted safely
      const medElements = screen.getAllByText(/Amoxicillin 500mg/i);
      expect(medElements.length).toBeGreaterThanOrEqual(1);

      // Assert that React error #31 ("Objects are not valid as a React child") was never triggered
      const errorCalls = consoleErrorSpy.mock.calls
        .flat()
        .map((arg) => (typeof arg === 'string' ? arg : arg?.message || ''))
        .join(' ');

      expect(errorCalls).not.toMatch(/Objects are not valid as a React child/i);
      expect(errorCalls).not.toMatch(/React error #31/i);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('2. Graceful Fallback When Missing testName', () => {
    test('mounts NewConsultation with document missing testName and testCategory, falling back to "Lab Test"', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Document completely devoid of testName, name, testCategory, and reportOriginalName
      const docMissingTestName = {
        ...FULL_22_KEY_LAB_TEST,
        testName: undefined,
        name: undefined,
        testCategory: '',
        reportOriginalName: '',
      };
      delete docMissingTestName.testName;

      const timeline = [
        {
          type: 'consultation',
          date: '2026-10-31T08:00:00.000Z',
          data: {
            diagnosis: 'Routine Medical Checkup',
            labTests: [docMissingTestName],
          },
        },
      ];

      await navigateToStep2WithTimeline(timeline);

      // Assert graceful fallback to 'Lab Test' without throwing
      expect(screen.getByText('Lab Test')).toBeInTheDocument();
      expect(screen.getByText('Sample Collected')).toBeInTheDocument();

      const errorCalls = consoleErrorSpy.mock.calls
        .flat()
        .map((arg) => (typeof arg === 'string' ? arg : arg?.message || ''))
        .join(' ');

      expect(errorCalls).not.toMatch(/Objects are not valid as a React child/i);
      expect(errorCalls).not.toMatch(/React error #31/i);

      consoleErrorSpy.mockRestore();
    });

    test('mounts NewConsultation with document missing testName but possessing testCategory, displaying category as fallback', async () => {
      const docWithCategoryFallback = {
        ...FULL_22_KEY_LAB_TEST,
        testName: null,
        name: null,
        testCategory: 'Microbiology Culture',
      };

      const timeline = [
        {
          type: 'consultation',
          date: '2026-10-31T08:00:00.000Z',
          data: {
            labTests: [docWithCategoryFallback],
          },
        },
      ];

      await navigateToStep2WithTimeline(timeline);
      expect(screen.getByText('Microbiology Culture')).toBeInTheDocument();
      expect(screen.getByText('Sample Collected')).toBeInTheDocument();
    });
  });

  describe('3. HistoryErrorBoundary Fault Isolation & Wizard Interactivity', () => {
    test('catches intentional render crash in medical history, renders warning banner, and parent wizard stays interactive', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      // Create a corrupted timeline item with a raw object in diagnosis that triggers React Error #31 inside HistoryErrorBoundary
      const corruptedItem = {
        type: 'consultation',
        date: '2026-10-31T08:00:00.000Z',
        data: {
          diagnosis: { unformatted_error_trigger: 'true' },
        },
      };

      await navigateToStep2WithTimeline([corruptedItem]);

      // 1. Assert HistoryErrorBoundary caught the fatal render throw
      const alertBanner = screen.getByRole('alert');
      expect(alertBanner).toBeInTheDocument();
      expect(screen.getByText(/Notice: Unable to render complete historical record/i)).toBeInTheDocument();
      expect(
        screen.getByText(/A record in the patient's medical history could not be formatted/i)
      ).toBeInTheDocument();

      // 2. Assert parent wizard controls remain active and interactive
      expect(screen.getByText('Synthetic Demo Patient')).toBeInTheDocument();
      expect(screen.getByText('Patient Clinical Overview')).toBeInTheDocument();

      // 3. Both the error boundary banner button AND the parent wizard bottom bar button are present and enabled
      const allProceedButtons = screen.getAllByRole('button', { name: /Proceed to Symptoms/i });
      expect(allProceedButtons.length).toBeGreaterThanOrEqual(2);

      const bannerProceedButton = within(alertBanner).getByRole('button', { name: /Proceed to Symptoms/i });
      expect(bannerProceedButton).toBeEnabled();
      fireEvent.click(bannerProceedButton);

      // 4. Wizard smoothly navigates to Step 3 (Symptoms & Diagnosis) without unmounting
      await waitFor(() => {
        expect(screen.getByText('Add symptoms')).toBeInTheDocument();
      });

      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    test('standalone HistoryErrorBoundary catches errors, renders fallback, calls callbacks, and can reset', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const mockOnError = jest.fn();
      const mockOnProceed = jest.fn();

      function CrashingComponent({ shouldThrow }) {
        if (shouldThrow) {
          throw new Error('Explosion in history card');
        }
        return <div>Normal History View</div>;
      }

      const { rerender } = render(
        <HistoryErrorBoundary onError={mockOnError} onProceed={mockOnProceed}>
          <CrashingComponent shouldThrow={false} />
        </HistoryErrorBoundary>
      );

      expect(screen.getByText('Normal History View')).toBeInTheDocument();
      expect(mockOnError).not.toHaveBeenCalled();

      // Trigger error
      rerender(
        <HistoryErrorBoundary onError={mockOnError} onProceed={mockOnProceed}>
          <CrashingComponent shouldThrow={true} />
        </HistoryErrorBoundary>
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(mockOnError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Explosion in history card' }),
        expect.any(Object)
      );

      // Click onProceed in banner
      fireEvent.click(screen.getByRole('button', { name: /Proceed to Symptoms/i }));
      expect(mockOnProceed).toHaveBeenCalledTimes(1);

      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    test('standalone HistoryErrorBoundary supports custom function fallback with resetErrorBoundary', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      let throwError = true;

      function Buggy() {
        if (throwError) throw new Error('Dynamic failure');
        return <div>Recovered!</div>;
      }

      render(
        <HistoryErrorBoundary
          fallback={({ error, resetErrorBoundary }) => (
            <div>
              <span>Custom: {error.message}</span>
              <button
                onClick={() => {
                  throwError = false;
                  resetErrorBoundary();
                }}
              >
                Try Again
              </button>
            </div>
          )}
        >
          <Buggy />
        </HistoryErrorBoundary>
      );

      expect(screen.getByText('Custom: Dynamic failure')).toBeInTheDocument();
      fireEvent.click(screen.getByText('Try Again'));
      expect(screen.getByText('Recovered!')).toBeInTheDocument();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('4. Unit Testing: client/src/utils/labTestFormatter.js', () => {
    describe('formatLabTestName & getLabTestName', () => {
      test('handles null and undefined with default fallback', () => {
        expect(formatLabTestName(null)).toBe('Lab Test');
        expect(formatLabTestName(undefined)).toBe('Lab Test');
        expect(getLabTestName(null)).toBe('Lab Test');
      });

      test('handles custom fallback string', () => {
        expect(formatLabTestName(null, 'Custom Fallback')).toBe('Custom Fallback');
        expect(formatLabTestName(undefined, 'N/A')).toBe('N/A');
        expect(getLabTestName(undefined, 'General Test')).toBe('General Test');
      });

      test('handles primitive string input and trims whitespace', () => {
        expect(formatLabTestName('  Lipid Profile  ')).toBe('Lipid Profile');
        expect(formatLabTestName('Full Blood Count')).toBe('Full Blood Count');
        expect(getLabTestName('HbA1c')).toBe('HbA1c');
      });

      test('falls back on empty or whitespace-only strings', () => {
        expect(formatLabTestName('')).toBe('Lab Test');
        expect(formatLabTestName('   ')).toBe('Lab Test');
        expect(formatLabTestName('   ', 'Default Test')).toBe('Default Test');
      });

      test('extracts name from various document property shapes with correct priority', () => {
        // Direct testName
        expect(formatLabTestName({ testName: 'Renal Function Test' })).toBe('Renal Function Test');
        // Direct name
        expect(formatLabTestName({ name: 'Thyroid Function Test' })).toBe('Thyroid Function Test');
        // Nested data.testName
        expect(formatLabTestName({ data: { testName: 'Liver Function Test' } })).toBe('Liver Function Test');
        // Nested data.name
        expect(formatLabTestName({ data: { name: 'Serum Creatinine' } })).toBe('Serum Creatinine');
        // testCategory fallback
        expect(formatLabTestName({ testCategory: 'Microbiology' })).toBe('Microbiology');
        // data.testCategory fallback
        expect(formatLabTestName({ data: { testCategory: 'Biochemistry' } })).toBe('Biochemistry');
        // reportOriginalName fallback
        expect(formatLabTestName({ reportOriginalName: 'ecg_report.pdf' })).toBe('ecg_report.pdf');
        // data.reportOriginalName fallback
        expect(formatLabTestName({ data: { reportOriginalName: 'cxr.pdf' } })).toBe('cxr.pdf');

        // Priority: testName > name > testCategory > reportOriginalName
        expect(
          formatLabTestName({
            testName: 'High Priority Test',
            name: 'Low Priority Name',
            testCategory: 'Category',
          })
        ).toBe('High Priority Test');

        expect(
          formatLabTestName({
            name: 'Priority Name',
            testCategory: 'Category',
          })
        ).toBe('Priority Name');
      });

      test('handles empty object or objects with non-string/empty values', () => {
        expect(formatLabTestName({})).toBe('Lab Test');
        expect(formatLabTestName({ testName: '' })).toBe('Lab Test');
        expect(formatLabTestName({ testName: '   ' })).toBe('Lab Test');
        expect(formatLabTestName({ testName: null, name: undefined })).toBe('Lab Test');
        expect(formatLabTestName({ testName: 12345 })).toBe('Lab Test');
      });

      test('handles non-object corrupted types gracefully', () => {
        expect(formatLabTestName(12345)).toBe('Lab Test');
        expect(formatLabTestName(true)).toBe('Lab Test');
        expect(formatLabTestName(false)).toBe('Lab Test');
        expect(formatLabTestName(() => {})).toBe('Lab Test');
      });
    });

    describe('formatLabTestStatus', () => {
      test('handles null and undefined with default fallback', () => {
        expect(formatLabTestStatus(null)).toBe('Pending');
        expect(formatLabTestStatus(undefined)).toBe('Pending');
        expect(formatLabTestStatus(null, 'Unknown')).toBe('Unknown');
      });

      test('handles empty and whitespace strings', () => {
        expect(formatLabTestStatus('')).toBe('Pending');
        expect(formatLabTestStatus('   ')).toBe('Pending');
      });

      test('maps standard lowercase and snake_case statuses to Title Case', () => {
        expect(formatLabTestStatus('pending')).toBe('Pending');
        expect(formatLabTestStatus('approved')).toBe('Approved');
        expect(formatLabTestStatus('sample_collected')).toBe('Sample Collected');
        expect(formatLabTestStatus('processing')).toBe('Processing');
        expect(formatLabTestStatus('report_ready')).toBe('Report Ready');
        expect(formatLabTestStatus('delivered')).toBe('Delivered');
        expect(formatLabTestStatus('completed')).toBe('Completed');
        expect(formatLabTestStatus('cancelled')).toBe('Cancelled');
        expect(formatLabTestStatus('rejected')).toBe('Rejected');
      });

      test('handles uppercase and mixed-case status inputs', () => {
        expect(formatLabTestStatus('SAMPLE_COLLECTED')).toBe('Sample Collected');
        expect(formatLabTestStatus('RePoRt_ReAdY')).toBe('Report Ready');
        expect(formatLabTestStatus('COMPLETED')).toBe('Completed');
      });

      test('extracts status from document object and nested data object', () => {
        expect(formatLabTestStatus({ status: 'completed' })).toBe('Completed');
        expect(formatLabTestStatus({ data: { status: 'approved' } })).toBe('Approved');
        expect(formatLabTestStatus({ status: 'sample_collected' })).toBe('Sample Collected');
      });

      test('formats arbitrary unmapped snake_case strings into title case gracefully', () => {
        expect(formatLabTestStatus('awaiting_clinician_verification')).toBe(
          'Awaiting Clinician Verification'
        );
        expect(formatLabTestStatus('sent_to_external_lab')).toBe('Sent To External Lab');
      });

      test('handles corrupted types gracefully', () => {
        expect(formatLabTestStatus(123)).toBe('Pending');
        expect(formatLabTestStatus({})).toBe('Pending');
        expect(formatLabTestStatus({ status: null })).toBe('Pending');
      });
    });

    describe('formatLabTestDate', () => {
      test('handles null, undefined, and non-objects with fallback', () => {
        expect(formatLabTestDate(null)).toBe('—');
        expect(formatLabTestDate(undefined)).toBe('—');
        expect(formatLabTestDate('2026-10-31')).toBe('—');
        expect(formatLabTestDate(null, 'No Date')).toBe('No Date');
      });

      test('extracts and formats valid dates from createdAt, date, reportUploadedAt, orderedAt', () => {
        const iso = '2026-10-31T08:00:00.000Z';
        const expected = new Date(iso).toLocaleDateString();

        expect(formatLabTestDate({ createdAt: iso })).toBe(expected);
        expect(formatLabTestDate({ date: iso })).toBe(expected);
        expect(formatLabTestDate({ data: { createdAt: iso } })).toBe(expected);
        expect(formatLabTestDate({ data: { date: iso } })).toBe(expected);
        expect(formatLabTestDate({ reportUploadedAt: iso })).toBe(expected);
        expect(formatLabTestDate({ orderedAt: iso })).toBe(expected);
      });

      test('returns fallback when date string is invalid', () => {
        expect(formatLabTestDate({ createdAt: 'invalid-date' })).toBe('—');
        expect(formatLabTestDate({ date: 'not_a_date' }, 'N/A')).toBe('N/A');
      });
    });

    describe('formatLabTestId', () => {
      test('handles null and undefined with fallback', () => {
        expect(formatLabTestId(null)).toBe('—');
        expect(formatLabTestId(undefined)).toBe('—');
        expect(formatLabTestId(null, 'ID-NONE')).toBe('ID-NONE');
      });

      test('handles primitive string input', () => {
        expect(formatLabTestId('LAB-100')).toBe('LAB-100');
        expect(formatLabTestId('  LAB-200  ')).toBe('LAB-200');
        expect(formatLabTestId('')).toBe('—');
        expect(formatLabTestId('   ')).toBe('—');
      });

      test('extracts ID from labTestId, reportId, _id, or data variants', () => {
        expect(formatLabTestId({ labTestId: 'LT-1001' })).toBe('LT-1001');
        expect(formatLabTestId({ reportId: 'REP-2002' })).toBe('REP-2002');
        expect(formatLabTestId({ _id: '6722d4f1a2b3c4d5e6f7a8b9' })).toBe(
          '6722d4f1a2b3c4d5e6f7a8b9'
        );
        expect(formatLabTestId({ data: { labTestId: 'LT-3003' } })).toBe('LT-3003');
        expect(formatLabTestId({ data: { reportId: 'REP-4004' } })).toBe('REP-4004');
        expect(formatLabTestId({ data: { _id: '507f1f77bcf86cd799439011' } })).toBe(
          '507f1f77bcf86cd799439011'
        );
      });

      test('handles numeric ID values', () => {
        expect(formatLabTestId({ _id: 987654 })).toBe('987654');
      });

      test('returns fallback for empty object', () => {
        expect(formatLabTestId({})).toBe('—');
      });
    });

    describe('formatLabTestSummary', () => {
      test('returns safe primitive defaults on null or undefined', () => {
        const summary = formatLabTestSummary(null);
        expect(summary).toEqual({
          testName: 'Lab Test',
          status: 'Pending',
          reportId: '—',
          date: '—',
          category: 'General Diagnostics',
          urgency: 'routine',
          notes: '',
          doctorName: 'Attending Physician',
          hospitalName: 'MediSync Central Laboratory',
          isCompleted: false,
          raw: null,
        });
      });

      test('correctly maps full 22-key lab test document', () => {
        const summary = formatLabTestSummary(FULL_22_KEY_LAB_TEST);
        expect(summary.testName).toBe('Full Blood Count (FBC)');
        expect(summary.status).toBe('Sample Collected');
        expect(summary.reportId).toBe('LAB-2026-8888');
        expect(summary.date).toBe(new Date('2026-10-31T08:00:00.000Z').toLocaleDateString());
        expect(summary.category).toBe('Hematology');
        expect(summary.urgency).toBe('routine');
        expect(summary.notes).toBe('Check hemoglobin and platelets');
        expect(summary.isCompleted).toBe(false);
        expect(summary.raw).toBe(FULL_22_KEY_LAB_TEST);
      });

      test('evaluates isCompleted correctly across completed statuses', () => {
        expect(formatLabTestSummary({ status: 'approved' }).isCompleted).toBe(true);
        expect(formatLabTestSummary({ status: 'report_ready' }).isCompleted).toBe(true);
        expect(formatLabTestSummary({ status: 'delivered' }).isCompleted).toBe(true);
        expect(formatLabTestSummary({ status: 'completed' }).isCompleted).toBe(true);
        expect(formatLabTestSummary({ status: 'sample_collected' }).isCompleted).toBe(false);
        expect(formatLabTestSummary({ status: 'pending' }).isCompleted).toBe(false);
      });

      test('resolves nested doctor and hospital object references safely', () => {
        const doc = {
          testName: 'Lipid Panel',
          doctorId: { fullName: 'Dr. John Watson' },
          hospitalId: { name: 'St. Jude General Hospital' },
        };
        const summary = formatLabTestSummary(doc);
        expect(summary.doctorName).toBe('Dr. John Watson');
        expect(summary.hospitalName).toBe('St. Jude General Hospital');
      });
    });

    describe('formatLabTest (legacy wrapper)', () => {
      test('formats lab test into structured legacy shape', () => {
        const result = formatLabTest(FULL_22_KEY_LAB_TEST);
        expect(result).toEqual({
          testName: 'Full Blood Count (FBC)',
          status: 'Sample Collected',
          displayStatus: 'Sample Collected',
          date: new Date('2026-10-31T08:00:00.000Z').toLocaleDateString(),
          id: 'LAB-2026-8888',
          urgency: 'routine',
        });
      });
    });

    describe('formatStatusHistory', () => {
      test('handles null, undefined, and non-arrays with empty array', () => {
        expect(formatStatusHistory(null)).toEqual([]);
        expect(formatStatusHistory(undefined)).toEqual([]);
        expect(formatStatusHistory('not-an-array')).toEqual([]);
      });

      test('formats valid status history array', () => {
        const history = [
          { status: 'pending', changedAt: '2026-10-31T08:00:00.000Z', note: 'Created' },
          { status: 'sample_collected', changedAt: '2026-10-31T09:00:00.000Z', note: 'Sample drawn' },
        ];
        const formatted = formatStatusHistory(history);
        expect(formatted).toHaveLength(2);
        expect(formatted[0]).toEqual({
          status: 'Pending',
          date: new Date('2026-10-31T08:00:00.000Z').toLocaleDateString(),
          note: 'Created',
        });
        expect(formatted[1]).toEqual({
          status: 'Sample Collected',
          date: new Date('2026-10-31T09:00:00.000Z').toLocaleDateString(),
          note: 'Sample drawn',
        });
      });

      test('handles string-only or malformed entries in status history gracefully', () => {
        const history = ['sample_collected', null, { status: 'approved' }];
        const formatted = formatStatusHistory(history);
        expect(formatted).toHaveLength(3);
        expect(formatted[0].status).toBe('sample_collected');
        expect(formatted[1].status).toBe('Status Update');
        expect(formatted[2].status).toBe('Approved');
      });
    });

    describe('getPrescriptionDrugName', () => {
      test('handles null and undefined with default fallback', () => {
        expect(getPrescriptionDrugName(null)).toBe('Medication');
        expect(getPrescriptionDrugName(undefined)).toBe('Medication');
        expect(getPrescriptionDrugName(null, 'Prescription')).toBe('Prescription');
      });

      test('handles string primitive and trims whitespace', () => {
        expect(getPrescriptionDrugName('  Paracetamol 500mg  ')).toBe('Paracetamol 500mg');
        expect(getPrescriptionDrugName('')).toBe('Medication');
      });

      test('extracts drug name from object property variants with correct priority', () => {
        expect(getPrescriptionDrugName({ drugName: 'Amoxicillin 250mg' })).toBe('Amoxicillin 250mg');
        expect(getPrescriptionDrugName({ name: 'Ibuprofen 400mg' })).toBe('Ibuprofen 400mg');
        expect(
          getPrescriptionDrugName({ medications: [{ name: 'Atorvastatin 20mg' }] })
        ).toBe('Atorvastatin 20mg');
        expect(
          getPrescriptionDrugName({ medications: [{ drugName: 'Metformin 500mg' }] })
        ).toBe('Metformin 500mg');
        expect(getPrescriptionDrugName({ data: { drugName: 'Omeprazole 20mg' } })).toBe(
          'Omeprazole 20mg'
        );
        expect(getPrescriptionDrugName({ data: { name: 'Losartan 50mg' } })).toBe('Losartan 50mg');

        // Priority: drugName > name
        expect(
          getPrescriptionDrugName({ drugName: 'Primary Drug', name: 'Secondary Drug' })
        ).toBe('Primary Drug');
      });

      test('handles empty object or objects with empty string properties', () => {
        expect(getPrescriptionDrugName({})).toBe('Medication');
        expect(getPrescriptionDrugName({ drugName: '' })).toBe('Medication');
        expect(getPrescriptionDrugName({ drugName: '   ' })).toBe('Medication');
      });
    });
  });
});
