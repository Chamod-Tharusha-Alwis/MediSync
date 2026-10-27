import React from 'react';
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '../api/axiosInstance';
import { PatientAccessProvider } from '../context/PatientAccessContext';

// Use the genuine installed routing library implementation (react-router)
// which powers react-router-dom without failing on ESM/CJS export boundary
jest.mock('react-router-dom', () => {
  if (typeof global.TextEncoder === 'undefined') {
    const { TextEncoder, TextDecoder } = require('util');
    global.TextEncoder = TextEncoder;
    global.TextDecoder = TextDecoder;
  }
  const actual = jest.requireActual('react-router');
  return {
    ...actual,
    Link: ({ to, children, ...props }) => <a href={typeof to === 'string' ? to : '#'} {...props}>{children}</a>,
    NavLink: ({ to, children, ...props }) => <a href={typeof to === 'string' ? to : '#'} {...props}>{children}</a>,
  };
});

const { MemoryRouter, Routes, Route, useNavigate, useLocation } = require('react-router');

import PatientHistory from '../pages/patient/History';
import { Overview } from '../pages/patient/Dashboard';

jest.mock('../api/axiosInstance', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  SOCKET_SERVER_URL: 'inert-only'
}));
jest.mock('socket.io-client', () => ({ io: jest.fn(() => ({ on: jest.fn(), disconnect: jest.fn() })) }));
jest.mock('../components/ui/AppShell', () => ({ children, role }) => <main data-testid={`shell-${role}`}>{children}</main>);
jest.mock('../components/common/PageTransition', () => ({ children }) => <>{children}</>);
jest.mock('../components/common/ActiveOutbreakBanner', () => () => null);
jest.mock('../components/common/GeographicMap', () => () => <div>Map mock</div>);
jest.mock('../components/common/LabDetailModal', () => () => null);
jest.mock('../components/common/LabReportDownloadButton', () => () => null);
jest.mock('../pages/patient/RateConsultationModal', () => () => null);
jest.mock('../components/ui/OtpInput', () => () => null);

let clients = [];
const renderApp = (initialEntries = ['/patient/dashboard']) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const mockPatientData = {
    patient: { fullName: 'Kamal Perera', nic: 'QA-SYNTH-NIC' },
    prescriptions: [],
    consultations: []
  };

  const TestApp = () => {
    const navigate = useNavigate();
    const location = useLocation();
    return (
      <div>
        <div data-testid="current-path">{location.pathname}</div>
        <div data-testid="current-filter">{location.state?.filter || 'none'}</div>
        <nav>
          <button onClick={() => navigate('/patient/dashboard/history', { state: { filter: 'prescription' } })}>
            Nav Prescriptions
          </button>
          <button onClick={() => navigate('/patient/dashboard/history', { state: { filter: 'all' } })}>
            Nav All
          </button>
          <button onClick={() => navigate('/patient/dashboard/history', { state: null })}>
            Nav Null State
          </button>
          <button onClick={() => navigate('/patient/dashboard/history', { state: { filter: 'unsupported_exploit' } })}>
            Nav Unsupported
          </button>
          <button onClick={() => navigate(-1)}>
            Nav Back
          </button>
          <button onClick={() => navigate(1)}>
            Nav Forward
          </button>
        </nav>
        <Routes>
          <Route path="/patient/dashboard" element={<Overview data={mockPatientData} />} />
          <Route path="/patient/dashboard/history" element={<PatientHistory />} />
        </Routes>
      </div>
    );
  };

  return render(
    <QueryClientProvider client={client}>
      <PatientAccessProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <TestApp />
        </MemoryRouter>
      </PatientAccessProvider>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('nic', 'QA-SYNTH-NIC');
  localStorage.setItem('role', 'patient');
  api.get.mockReset();
  api.post.mockReset();
});

afterEach(() => {
  cleanup();
  clients.forEach(c => c.clear());
  clients = [];
});

const timelineWithStandaloneRx = [
  {
    type: 'consultation',
    date: '2026-10-18T10:00:00Z',
    data: {
      doctorName: 'Dr. Bandara',
      diagnosis: 'Type 2 Diabetes',
      prescriptions: [{ medicineName: 'Metformin 500mg', dosage: '1 BD' }]
    }
  },
  {
    type: 'prescription',
    date: '2026-10-19T14:00:00Z',
    data: {
      doctorName: 'Dr. Fernando',
      diagnosis: 'Refill Prescription',
      isOTC: false,
      medications: [{ name: 'Atorvastatin 20mg' }]
    }
  },
  {
    type: 'prescription',
    date: '2026-10-20T16:00:00Z',
    data: {
      isOTC: true,
      medications: [{ name: 'Paracetamol 500mg' }]
    }
  },
  {
    type: 'consultation',
    date: '2026-10-15T09:00:00Z',
    data: {
      doctorName: 'Dr. Silva',
      diagnosis: 'General Checkup',
      prescriptions: []
    }
  }
];

describe('Genuine React Router Integration: MemoryRouter & History State', () => {

  test('1. Dashboard Overview to prescription-filtered History', async () => {
    api.get.mockResolvedValue({ data: { data: timelineWithStandaloneRx } });
    renderApp(['/patient/dashboard']);

    const rxBtn = screen.getByRole('button', { name: /My Prescriptions/i });
    fireEvent.click(rxBtn);

    // Should transition to History and display both consultation-nested & standalone non-OTC prescriptions
    expect(await screen.findByText('Type 2 Diabetes')).toBeInTheDocument();
    expect(screen.getByText('Refill Prescription')).toBeInTheDocument();
    expect(screen.queryByText('General Checkup')).not.toBeInTheDocument();
    expect(screen.queryByText('Direct Pharmacy Dispensation')).not.toBeInTheDocument();
  });

  test('2. Re-navigation while History remains mounted dynamically updates active filter', async () => {
    api.get.mockResolvedValue({ data: { data: timelineWithStandaloneRx } });
    renderApp(['/patient/dashboard/history']);

    // Direct entry defaults to 'all'
    expect(await screen.findByText('Type 2 Diabetes')).toBeInTheDocument();
    expect(screen.getByText('General Checkup')).toBeInTheDocument();

    // Re-navigate while mounted to filter 'prescription'
    fireEvent.click(screen.getByRole('button', { name: 'Nav Prescriptions' }));
    await waitFor(() => {
      expect(screen.queryByText('General Checkup')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Type 2 Diabetes')).toBeInTheDocument();
    expect(screen.getByText('Refill Prescription')).toBeInTheDocument();

    // Re-navigate while mounted back to filter 'all'
    fireEvent.click(screen.getByRole('button', { name: 'Nav All' }));
    expect(await screen.findByText('General Checkup')).toBeInTheDocument();
  });

  test('3. Navigation to History with null/absent state safely produces default filter "all"', async () => {
    api.get.mockResolvedValue({ data: { data: timelineWithStandaloneRx } });
    renderApp(['/patient/dashboard/history']);

    expect(await screen.findByText('Type 2 Diabetes')).toBeInTheDocument();

    // First switch to prescriptions
    fireEvent.click(screen.getByRole('button', { name: 'Nav Prescriptions' }));
    await waitFor(() => {
      expect(screen.queryByText('General Checkup')).not.toBeInTheDocument();
    });

    // Re-navigate with null state -> safely resets to default 'all'
    fireEvent.click(screen.getByRole('button', { name: 'Nav Null State' }));
    expect(await screen.findByText('General Checkup')).toBeInTheDocument();
    expect(screen.getByText('Type 2 Diabetes')).toBeInTheDocument();
  });

  test('4. Genuine MemoryRouter back and forward navigation', async () => {
    api.get.mockResolvedValue({ data: { data: timelineWithStandaloneRx } });
    renderApp(['/patient/dashboard']);

    // Step 1: Click My Prescriptions -> enters history stack
    fireEvent.click(screen.getByRole('button', { name: /My Prescriptions/i }));
    expect(await screen.findByText('Type 2 Diabetes')).toBeInTheDocument();
    expect(screen.queryByText('General Checkup')).not.toBeInTheDocument();

    // Step 2: Navigate Back -> returns to dashboard overview
    fireEvent.click(screen.getByRole('button', { name: 'Nav Back' }));
    expect(await screen.findByRole('button', { name: /My Prescriptions/i })).toBeInTheDocument();

    // Step 3: Navigate Forward -> returns to prescription-filtered History
    fireEvent.click(screen.getByRole('button', { name: 'Nav Forward' }));
    expect(await screen.findByText('Type 2 Diabetes')).toBeInTheDocument();
    expect(screen.queryByText('General Checkup')).not.toBeInTheDocument();
  });

  test('5. Unsupported filter in state safely falls back to "all"', async () => {
    api.get.mockResolvedValue({ data: { data: timelineWithStandaloneRx } });
    renderApp(['/patient/dashboard/history']);

    expect(await screen.findByText('Type 2 Diabetes')).toBeInTheDocument();

    // Trigger navigation with malicious or unsupported filter
    fireEvent.click(screen.getByRole('button', { name: 'Nav Unsupported' }));

    // Falls back safely to 'all', preserving full feed without crash
    expect(screen.getByText('Type 2 Diabetes')).toBeInTheDocument();
    expect(screen.getByText('General Checkup')).toBeInTheDocument();
  });

  test('6. Distinguishes standalone versus consultation-nested prescriptions', async () => {
    api.get.mockResolvedValue({ data: { data: timelineWithStandaloneRx } });
    renderApp(['/patient/dashboard/history']);

    expect(await screen.findByText('Type 2 Diabetes')).toBeInTheDocument();

    // Prescription tab displays consultation-nested Rx AND standalone doctor Rx
    fireEvent.click(screen.getByRole('button', { name: 'prescription' }));
    expect(screen.getByText('Type 2 Diabetes')).toBeInTheDocument();
    expect(screen.getByText('Refill Prescription')).toBeInTheDocument();
    expect(screen.queryByText('General Checkup')).not.toBeInTheDocument();
    expect(screen.queryByText('Direct Pharmacy Dispensation')).not.toBeInTheDocument();
  });

  test('7. Separate OTC filtering displays only OTC records', async () => {
    api.get.mockResolvedValue({ data: { data: timelineWithStandaloneRx } });
    renderApp(['/patient/dashboard/history']);

    expect(await screen.findByText('Type 2 Diabetes')).toBeInTheDocument();

    const otcTab = screen.getByRole('button', { name: /OTC Dispensed/i });
    fireEvent.click(otcTab);

    expect(screen.getByText('Direct Pharmacy Dispensation')).toBeInTheDocument();
    expect(screen.queryByText('Type 2 Diabetes')).not.toBeInTheDocument();
    expect(screen.queryByText('Refill Prescription')).not.toBeInTheDocument();
    expect(screen.queryByText('General Checkup')).not.toBeInTheDocument();
  });

  test('8. Manual filter tab changes do not trigger unexpected resets', async () => {
    api.get.mockResolvedValue({ data: { data: timelineWithStandaloneRx } });
    renderApp(['/patient/dashboard/history']);

    expect(await screen.findByText('Type 2 Diabetes')).toBeInTheDocument();

    // User manually clicks Consultation tab
    const consultTab = screen.getByRole('button', { name: 'consultation' });
    fireEvent.click(consultTab);

    expect(screen.getByText('Type 2 Diabetes')).toBeInTheDocument();
    expect(screen.getByText('General Checkup')).toBeInTheDocument();
    expect(screen.queryByText('Refill Prescription')).not.toBeInTheDocument();
    expect(screen.queryByText('Direct Pharmacy Dispensation')).not.toBeInTheDocument();

    // User manually clicks All Events tab
    const allTab = screen.getByRole('button', { name: 'All Events' });
    fireEvent.click(allTab);

    expect(screen.getByText('Type 2 Diabetes')).toBeInTheDocument();
    expect(screen.getByText('Refill Prescription')).toBeInTheDocument();
    expect(screen.getByText('General Checkup')).toBeInTheDocument();
    expect(screen.getByText('Direct Pharmacy Dispensation')).toBeInTheDocument();
  });

});
