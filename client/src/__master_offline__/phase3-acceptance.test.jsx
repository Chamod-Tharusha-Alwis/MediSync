import React from 'react';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '../api/axiosInstance';
import { PatientAccessProvider } from '../context/PatientAccessContext';
import { Overview } from '../pages/patient/Dashboard';
import PatientHistory from '../pages/patient/History';
import DoctorDashboard from '../pages/doctor/Dashboard';

let mockNav = jest.fn();
let mockLoc = { pathname: '/dashboard', state: null };

jest.mock('react-router-dom', () => {
  const React = require('react');
  return {
    useNavigate: () => mockNav,
    useLocation: () => mockLoc,
    useParams: () => ({}),
    useSearchParams: () => [new URLSearchParams(), jest.fn()],
    Link: ({ to, children, ...props }) => <a href={typeof to === 'string' ? to : '#'} {...props}>{children}</a>,
    NavLink: ({ to, children, ...props }) => <a href={typeof to === 'string' ? to : '#'} {...props}>{children}</a>,
    Navigate: ({ to }) => <div data-testid="redirect">{typeof to === 'string' ? to : JSON.stringify(to)}</div>,
    Outlet: () => <div data-testid="protected-content" />,
    MemoryRouter: ({ children }) => <>{children}</>,
    BrowserRouter: ({ children }) => <>{children}</>,
    Routes: ({ children }) => {
      const childArray = React.Children.toArray(children);
      const matched = childArray.find(c => {
        const p = c.props?.path;
        return p === mockLoc.pathname || (p && mockLoc.pathname.startsWith(p) && p !== '*');
      }) || childArray[0];
      return matched?.props?.element || matched || null;
    },
    Route: ({ element }) => element || null,
  };
});

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
const renderWithProviders = (ui) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <PatientAccessProvider>
        {ui}
      </PatientAccessProvider>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('nic', 'QA-SYNTHETIC-NIC');
  localStorage.setItem('role', 'patient');
  mockNav = jest.fn();
  mockLoc = { pathname: '/dashboard', state: null };
  api.get.mockReset();
  api.post.mockReset();
});

afterEach(() => {
  cleanup();
  clients.forEach(c => c.clear());
  clients = [];
});

const sampleTimeline = [
  {
    type: 'consultation',
    date: '2026-10-15T10:00:00Z',
    data: {
      doctorName: 'Dr. Alwis',
      diagnosis: 'Acute Bronchitis',
      prescriptions: [{ medicineName: 'Amoxicillin 500mg', dosage: '1 TDS', durationDays: 5 }]
    }
  },
  {
    type: 'consultation',
    date: '2026-10-10T10:00:00Z',
    data: {
      doctorName: 'Dr. Perera',
      diagnosis: 'Routine Checkup',
      labTests: ['Lipid Profile'],
      prescriptions: []
    }
  }
];

describe('MediSync Phase 3 Acceptance: Navigation, History Filtering & Clinical Resilience', () => {

  test('1. Patient "Prescriptions" action navigates to History with filter state "prescription"', () => {
    const mockData = {
      patient: { fullName: 'Sunil Silva', nic: 'QA-SYNTHETIC-NIC' },
      prescriptions: [],
      consultations: []
    };
    renderWithProviders(<Overview data={mockData} />);
    const rxBtn = screen.getByRole('button', { name: /My Prescriptions/i });
    expect(rxBtn).toBeInTheDocument();
    fireEvent.click(rxBtn);
    expect(mockNav).toHaveBeenCalledWith('/patient/dashboard/history', { state: { filter: 'prescription' } });
  });

  test('2. History displays prescription records only when "prescription" filter is active', async () => {
    mockLoc = { pathname: '/patient/dashboard/history', state: { filter: 'prescription' } };
    api.get.mockResolvedValueOnce({ data: { data: sampleTimeline } });
    renderWithProviders(<PatientHistory />);

    expect(await screen.findByText('Acute Bronchitis')).toBeInTheDocument();
    expect(screen.queryByText('Routine Checkup')).not.toBeInTheDocument();
    expect(screen.queryByText('Lipid Profile')).not.toBeInTheDocument();
  });

  test('3. Patient "History" action navigates to History with filter state "all"', () => {
    const mockData = {
      patient: { fullName: 'Sunil Silva', nic: 'QA-SYNTHETIC-NIC' },
      prescriptions: [],
      consultations: []
    };
    renderWithProviders(<Overview data={mockData} />);
    const histBtn = screen.getByRole('button', { name: /Medical History/i });
    expect(histBtn).toBeInTheDocument();
    fireEvent.click(histBtn);
    expect(mockNav).toHaveBeenCalledWith('/patient/dashboard/history', { state: { filter: 'all' } });
  });

  test('4. Direct navigation to History without router state defaults safely to "all"', async () => {
    mockLoc = { pathname: '/patient/dashboard/history', state: null };
    api.get.mockResolvedValueOnce({ data: { data: sampleTimeline } });
    renderWithProviders(<PatientHistory />);

    expect(await screen.findByText('Acute Bronchitis')).toBeInTheDocument();
    expect(screen.getByText('Routine Checkup')).toBeInTheDocument();
    expect(screen.getByText('Lipid Profile')).toBeInTheDocument();
  });

  test('5. Tab switching in History dynamically re-filters events', async () => {
    mockLoc = { pathname: '/patient/dashboard/history', state: null };
    api.get.mockResolvedValueOnce({ data: { data: sampleTimeline } });
    renderWithProviders(<PatientHistory />);

    expect(await screen.findByText('Acute Bronchitis')).toBeInTheDocument();

    const rxTab = screen.getByRole('button', { name: /^prescription$/i });
    fireEvent.click(rxTab);

    expect(screen.getByText('Acute Bronchitis')).toBeInTheDocument();
    expect(screen.queryByText('Routine Checkup')).not.toBeInTheDocument();
    expect(screen.queryByText('Lipid Profile')).not.toBeInTheDocument();

    const allTab = screen.getByRole('button', { name: /All Events/i });
    fireEvent.click(allTab);
    expect(screen.getByText('Routine Checkup')).toBeInTheDocument();
  });

  test('6. Empty filtered results display appropriate empty state notice', async () => {
    mockLoc = { pathname: '/patient/dashboard/history', state: { filter: 'otc' } };
    api.get.mockResolvedValueOnce({ data: { data: sampleTimeline } });
    renderWithProviders(<PatientHistory />);

    expect(await screen.findByText('No otc records found.')).toBeInTheDocument();
  });

  test('7. Doctor statistics display actual 0 as "0", not blank or fallback dash', async () => {
    localStorage.setItem('role', 'doctor');
    localStorage.setItem('userName', 'TestDoctor');
    api.get.mockResolvedValueOnce({
      data: {
        data: {
          todayConsultations: 0,
          activeRx: 0,
          totalPatients: 0,
          pendingFollowUps: 0
        }
      }
    });

    renderWithProviders(<DoctorDashboard />);
    const zeroes = await screen.findAllByText('0');
    expect(zeroes.length).toBe(4);
  });

  test('8. Failed doctor statistics requests display "—" and do not collapse the dashboard', async () => {
    localStorage.setItem('role', 'doctor');
    localStorage.setItem('userName', 'TestDoctor');
    api.get.mockRejectedValueOnce(new Error('Network error loading stats'));

    renderWithProviders(<DoctorDashboard />);
    expect(await screen.findByText('Start New Consultation')).toBeInTheDocument();
    const dashes = await screen.findAllByText('—');
    expect(dashes.length).toBe(4);
  });

  test('9. Disabled Upload Lab Results security barrier remains intact and disabled', () => {
    const mockData = {
      patient: { fullName: 'Sunil Silva', nic: 'QA-SYNTHETIC-NIC' },
      prescriptions: [],
      consultations: []
    };
    renderWithProviders(<Overview data={mockData} />);
    const uploadBtn = screen.getByRole('button', { name: /Upload Lab Results/i });
    expect(uploadBtn).toBeInTheDocument();
    expect(uploadBtn).toBeDisabled();
  });

});