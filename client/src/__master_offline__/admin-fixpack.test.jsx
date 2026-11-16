import React from 'react';
import { render, screen, fireEvent, within, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setMockRoute } from 'react-router-dom';
import api from '../api/axiosInstance';
import { buildAuditFeed, describeAction, isSystemEvent, rowSentence } from '../utils/auditFeed';
import AuditFeedPanel from '../components/admin/AuditFeedPanel';
import { PatientAccessProvider } from '../context/PatientAccessContext';
import { LanguageProvider } from '../i18n/LanguageContext';
import Admin from '../pages/admin/Dashboard';
import OutbreakMonitor from '../pages/admin/OutbreakMonitor';

// Admin dashboard fix pack (new test file). Synthetic demonstration fixtures only.
const mockMapProps = [];
jest.mock('../api/axiosInstance', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() }, SOCKET_SERVER_URL: 'inert-only' }));
jest.mock('socket.io-client', () => ({ io: jest.fn(() => ({ on: jest.fn(), disconnect: jest.fn() })) }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock('../components/ui/AppShell', () => ({ children }) => <main>{children}</main>);
jest.mock('../components/common/PageTransition', () => ({ children }) => <>{children}</>);
jest.mock('../components/common/ActiveOutbreakBanner', () => () => null);
jest.mock('../components/common/GeographicMap', () => props => { mockMapProps.push(props); return <div data-testid="map">map with {props.alerts.length} alerts{props.includePending ? ' incl. pending' : ''}</div>; });

const NOW = Date.parse('2026-11-17T06:00:00Z');
const HEX = '64b0f00d64b0f00d64b0f00d';
const events = [
  ...Array.from({ length: 12 }, (_, i) => ({ _id: `h${i}`, action: 'USER_HEARTBEAT', actorRole: 'admin', actorId: HEX, accessedNic: 'REDACTED', timestamp: new Date(NOW - i * 30000).toISOString() })),
  { _id: 'g1', action: 'GET__API_ADMIN_STATS', actorRole: 'admin', actorId: HEX, accessedNic: 'REDACTED', timestamp: new Date(NOW - 400000).toISOString() },
  { _id: 'a1', action: 'ALERT_APPROVED', actorRole: 'admin', actorId: HEX, accessedNic: HEX, timestamp: new Date(NOW - 600000).toISOString() },
  { _id: 'l1', action: 'USER_LOGIN', actorRole: 'doctor', actorId: HEX, timestamp: new Date(NOW - 7200000).toISOString() },
  { _id: 'l2', action: 'USER_LOGIN', actorRole: 'doctor', actorId: HEX, timestamp: new Date(NOW - 7300000).toISOString() },
];

describe('audit feed presentation (item 2)', () => {
  test('plain lines, no raw ids, no "regarding REDACTED"; system events hidden by default', () => {
    const { rows, hiddenSystemEvents } = buildAuditFeed(events, { now: NOW });
    expect(hiddenSystemEvents).toBe(13);
    expect(rows.map(rowSentence)).toEqual(['Administrator: Approved outbreak alert (outbreak alert)', 'Doctor: Signed in × 2 (session)']);
    const text = JSON.stringify(rows);
    expect(text).not.toContain(HEX);
    expect(text).not.toMatch(/REDACTED|regarding/);
    expect(rows[0].ago).toBe('10 min ago');
  });

  test('toggle shows system events grouped ("Heartbeat × 12")', () => {
    const { rows } = buildAuditFeed(events, { now: NOW, showSystem: true });
    expect(rowSentence(rows[0])).toBe('Administrator: Heartbeat × 12 (session)');
    expect(rowSentence(rows[1])).toBe('Administrator: Viewed dashboard');
    expect(isSystemEvent('GET__API_ADMIN_STATS')).toBe(true);
    expect(isSystemEvent('ALERT_APPROVED')).toBe(false);
    expect(describeAction('SOME_NEW_ACTION').text).toBe('Some new action');
  });

  test('panel renders the toggle and grouped rows', () => {
    render(<AuditFeedPanel events={events} now={NOW} />);
    expect(screen.getAllByTestId('audit-row')).toHaveLength(2);
    expect(screen.getByText(/13 hidden/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Show system events'));
    expect(screen.getAllByTestId('audit-row')).toHaveLength(4);
    expect(screen.getAllByTestId('audit-count')[0]).toHaveTextContent('× 12');
    expect(screen.getByTestId('audit-feed').textContent).not.toMatch(/REDACTED|regarding/);
  });
});

const show = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><PatientAccessProvider><Admin /></PatientAccessProvider></QueryClientProvider>);
};
const pendingAlert = { _id: 'p1', status: 'Pending', disease: 'ICD10:A90', location: 'Kurunegala', severity: 'Critical', alert72h: { actual72h: 38 } };
const activeAlert = { _id: 'a1', status: 'Active', disease: 'ICD10:A279', location: 'Kegalle', severity: 'High', alert72h: { actual72h: 13 }, message: 'Unreviewed statistical signal' };

describe('dashboard map and loading (items 3 and 5)', () => {
  beforeEach(() => { localStorage.clear(); localStorage.setItem('role', 'admin'); setMockRoute('/dashboard'); mockMapProps.length = 0; api.get.mockReset(); });
  afterEach(cleanup);
  const routes = (alerts, { statsFail = false, alertsFail = false } = {}) => api.get.mockImplementation(async url => {
    if (url === '/admin/stats') { if (statsFail) throw Error('offline'); return { data: { data: { totalPatients: 600, auditEvents: events } } }; }
    if (url === '/admin/outbreak/alerts') { if (alertsFail) throw Error('offline'); return { data: { data: alerts } }; }
    return { data: {} };
  });

  test('reads alerts from the authenticated admin list and passes pending alerts to the map', async () => {
    routes([pendingAlert]);
    show();
    expect(await screen.findByTestId('map-empty-state')).toHaveTextContent('No approved alerts. 1 pending alert needs review in the outbreak monitor.');
    expect(api.get).toHaveBeenCalledWith('/admin/outbreak/alerts');
    expect(api.get).not.toHaveBeenCalledWith('/alerts/active');
    const props = mockMapProps[mockMapProps.length - 1];
    expect(props.includePending).toBe(true);
    expect(props.alerts.map(a => a.status)).toEqual(['Pending']);
    expect(screen.getByTestId('map-legend')).toHaveTextContent('Pending review');
    expect(screen.getByRole('link', { name: 'outbreak monitor' })).toHaveAttribute('href', '/admin/dashboard/outbreak');
  });

  test('approved alert: no empty-state line; banner uses the approved alert only', async () => {
    routes([pendingAlert, activeAlert]);
    show();
    await screen.findByTestId('map');
    expect(screen.queryByTestId('map-empty-state')).not.toBeInTheDocument();
    expect(screen.getByText(/Unreviewed statistical signal/)).toBeInTheDocument();
  });

  test('a failed alert request shows an explicit error state with Retry, the rest of the page still renders', async () => {
    routes([], { alertsFail: true });
    show();
    expect(await screen.findByTestId('overview-error')).toHaveTextContent('Could not load outbreak alerts');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(screen.getByTestId('map')).toBeInTheDocument();
  });

  test('failed statistics keep the existing explicit "metrics unavailable" state (not a blank page)', async () => {
    routes([pendingAlert], { statsFail: true });
    show();
    expect(await screen.findByText('Dashboard metrics unavailable')).toBeInTheDocument();
  });
});

describe('outbreak monitor does not wait for the ML status probe (item 5)', () => {
  beforeEach(() => { localStorage.clear(); api.get.mockReset(); });
  afterEach(cleanup);
  test('alerts render while /admin/ml-status is still pending', async () => {
    api.get.mockImplementation(path => {
      if (path === '/admin/ml-status') return new Promise(() => {}); // a sleeping ML engine never answers here
      if (path === '/admin/outbreak/alerts') return Promise.resolve({ data: { data: [{ ...pendingAlert, createdAt: '2026-11-17T01:00:00Z' }] } });
      return Promise.resolve({ data: {} });
    });
    render(<LanguageProvider><OutbreakMonitor /></LanguageProvider>);
    const table = await screen.findByRole('table');
    expect(within(table).getAllByText('Kurunegala').length).toBeGreaterThan(0);
  });

  test('alert-list failure shows an error with Retry', async () => {
    let fail = true;
    api.get.mockImplementation(path => {
      if (path === '/admin/outbreak/alerts') return fail ? Promise.reject(Error('offline')) : Promise.resolve({ data: { data: [] } });
      return Promise.resolve({ data: {} });
    });
    render(<LanguageProvider><OutbreakMonitor /></LanguageProvider>);
    expect(await screen.findByTestId('alerts-error')).toHaveTextContent('Alerts could not be loaded.');
    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByTestId('alerts-error')).not.toBeInTheDocument());
  });
});
