import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { setMockRoute } from 'react-router-dom';
import api from '../api/axiosInstance';
import { LanguageProvider } from '../i18n/LanguageContext';
import { PatientAccessProvider } from '../context/PatientAccessContext';
import OutbreakHistory, { historyQuery } from '../pages/admin/OutbreakHistory';
import Admin from '../pages/admin/Dashboard';
import { en } from '../i18n/translations/en';
import { si } from '../i18n/translations/si';
import { ta } from '../i18n/translations/ta';
import { wakeServices, _resetWakeForTests } from '../utils/wakeServices';

// Outbreak History page (new test file; existing tests unchanged). Fixture values only.
jest.mock('../api/axiosInstance', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() }, SOCKET_SERVER_URL: 'inert-only' }));
jest.mock('socket.io-client', () => ({ io: jest.fn(() => ({ on: jest.fn(), disconnect: jest.fn() })) }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock('../components/ui/AppShell', () => ({ children, menuItems = [] }) => (
  <div><nav aria-label="sidebar">{menuItems.map(m => <a key={m.path} href={m.path}>{m.label}</a>)}</nav><main>{children}</main></div>
));
jest.mock('../components/common/PageTransition', () => ({ children }) => <>{children}</>);
jest.mock('../components/common/ActiveOutbreakBanner', () => () => null);
jest.mock('../components/common/GeographicMap', () => () => null);

const row = (extra = {}) => ({ _id: 'h1', disease: 'ICD10:A90', location: 'Colombo', district: 'Colombo', severity: 'High', status: 'Resolved',
  createdAt: '2026-10-20T04:00:00Z', updatedAt: '2026-10-25T04:00:00Z', closedAt: '2026-10-25T04:00:00Z', historyReason: 'closed', alert72h: null, ...extra });
const page = (rows, total = rows.length) => ({ data: { data: rows, pagination: { page: 1, limit: 20, total, pages: Math.max(1, Math.ceil(total / 20)) } } });
const renderPage = () => render(<LanguageProvider><OutbreakHistory /></LanguageProvider>);

beforeEach(() => { jest.clearAllMocks(); api.get.mockReset(); localStorage.clear(); });
afterEach(cleanup);

test('renders rows from the history view of the alerts route, read-only (no approve/confirm buttons)', async () => {
  api.get.mockResolvedValue(page([row(), row({ _id: 'h2', status: 'Pending', closedAt: null, historyReason: 'older_than_14_days' })]));
  renderPage();
  const rows = await screen.findByTestId('history-rows');
  expect(rows.querySelectorAll('tr')).toHaveLength(2);
  expect(api.get).toHaveBeenCalledWith('/admin/outbreak/alerts?view=history&page=1');
  expect(screen.getByText('Older than 14 days')).toBeInTheDocument();
  expect(screen.getAllByText('Not available (no 72-hour snapshot was stored)')).toHaveLength(2);
  expect(screen.queryByRole('button', { name: /approve|confirm/i })).toBeNull();
});

test('shows the stored 72-hour figures with the "projection, not a forecast" label', async () => {
  const view = { previous72h: 3, actual72h: 7, change: 4, percentChange: 133.3, projected: 7, low: 4, high: 11, enoughHistory: true, caveat: 'projection, not a forecast',
    method: 'naive-last-72h', window: {}, dataNote: 'verified MediSync consultations only (lower bound)' };
  api.get.mockResolvedValue(page([row({ alert72h: view })]));
  renderPage();
  await screen.findByTestId('history-rows');
  expect(screen.getAllByText(/projection, not a forecast/).length).toBeGreaterThan(0);
});

test('empty state: "No past outbreaks yet"', async () => {
  api.get.mockResolvedValue(page([]));
  renderPage();
  expect(await screen.findByTestId('history-empty')).toHaveTextContent('No past outbreaks yet');
});

test('error state with retry; never shows numbers on error', async () => {
  api.get.mockRejectedValueOnce(Object.assign(new Error('offline'), { response: { status: 503 } })).mockResolvedValueOnce(page([row()]));
  renderPage();
  const error = await screen.findByTestId('history-error');
  expect(error).toHaveTextContent('Outbreak history could not be loaded.');
  expect(screen.queryByTestId('history-rows')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByTestId('history-rows')).toBeInTheDocument();
});

test('filters build a validated query and reset to page 1', async () => {
  api.get.mockResolvedValue(page([row()]));
  renderPage();
  await screen.findByTestId('history-rows');
  fireEvent.change(screen.getByLabelText('District'), { target: { value: 'Galle' } });
  fireEvent.change(screen.getByLabelText('Final status'), { target: { value: 'Dismissed' } });
  fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  await waitFor(() => expect(api.get).toHaveBeenLastCalledWith('/admin/outbreak/alerts?view=history&page=1&district=Galle&status=Dismissed&from=2026-10-01'));
  expect(historyQuery({ disease: 'ICD10:A90', to: '2026-11-18' }, 3)).toBe('/admin/outbreak/alerts?view=history&page=3&disease=ICD10%3AA90&to=2026-11-18');
});

test('sidebar has "Outbreak History" right after "Outbreak Monitor", and the route renders the page', async () => {
  setMockRoute('/admin/dashboard/outbreak-history');
  api.get.mockImplementation(url => Promise.resolve(url.startsWith('/admin/outbreak/alerts?view=history') ? page([]) : { data: { data: url === '/admin/stats' ? {} : [] } }));
  render(<LanguageProvider><PatientAccessProvider><Admin /></PatientAccessProvider></LanguageProvider>);
  const links = screen.getAllByRole('link').map(a => [a.textContent, a.getAttribute('href')]);
  const monitor = links.findIndex(([, href]) => href === '/admin/dashboard/outbreak');
  expect(links[monitor + 1]).toEqual(['Outbreak History', '/admin/dashboard/outbreak-history']);
});

test('language key parity: every outbreakHistory key exists in en, si and ta', () => {
  const keys = obj => Object.entries(obj).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v).map(x => `${k}.${x}`) : [k])).sort();
  const enKeys = keys(en.outbreakHistory);
  expect(enKeys.length).toBeGreaterThan(20);
  expect(keys(si.outbreakHistory)).toEqual(enKeys);
  expect(keys(ta.outbreakHistory)).toEqual(enKeys);
  for (const lang of [si, ta]) for (const k of enKeys) expect(k.split('.').reduce((o, p) => o[p], lang.outbreakHistory)).toBeTruthy();
});

test('wake-up ping: one GET to the API health route per page load, nothing in tests, ML only when configured', () => {
  _resetWakeForTests();
  const fetchImpl = jest.fn(() => Promise.resolve({}));
  expect(wakeServices({ NODE_ENV: 'test' }, fetchImpl)).toEqual([]);
  expect(wakeServices({ NODE_ENV: 'production', REACT_APP_API_URL: 'https://api.example.invalid/api' }, fetchImpl)).toEqual(['https://api.example.invalid/api/health']);
  expect(wakeServices({ NODE_ENV: 'production' }, fetchImpl)).toEqual([]); // only once
  _resetWakeForTests();
  expect(wakeServices({ NODE_ENV: 'production', REACT_APP_ML_HEALTH_URL: 'https://ml.example.invalid/health' }, fetchImpl)).toEqual(['/api/health', 'https://ml.example.invalid/health']);
  expect(fetchImpl).toHaveBeenCalledTimes(3);
  expect(fetchImpl.mock.calls.every(([, opts]) => opts.method === 'GET' && opts.credentials === 'omit')).toBe(true);
});
