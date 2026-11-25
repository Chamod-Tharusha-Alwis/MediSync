import React from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import api from '../api/axiosInstance';
import { LanguageProvider } from '../i18n/LanguageContext';
import OutbreakHistory from '../pages/admin/OutbreakHistory';
import OutbreakMonitor from '../pages/admin/OutbreakMonitor';
import { AlertTimeline, LastUpdatedCell, firstDetectedText } from '../components/admin/AlertUpdates';
import { en } from '../i18n/translations/en';
import { si } from '../i18n/translations/si';
import { ta } from '../i18n/translations/ta';

// First detected / last updated columns and the update timeline (new test file; existing tests unchanged). Fixture values only.
jest.mock('../api/axiosInstance', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() }, SOCKET_SERVER_URL: 'inert-only' }));
jest.mock('socket.io-client', () => ({ io: jest.fn(() => ({ on: jest.fn(), disconnect: jest.fn() })) }));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock('../components/common/PageTransition', () => ({ children }) => <>{children}</>);
jest.mock('../components/common/GeographicMap', () => () => null);
jest.mock('../pages/admin/SurveillanceReviewQueue', () => () => null);

const entry = (extra = {}) => ({ at: '2026-11-24T06:30:00Z', source: 'statistical_rule', triggeredBy: 'admin_manual', caseCountBefore: 8, caseCountAfter: 12, displayedCaseCount: 12,
  severityBefore: 'High', severityAfter: 'Critical', actual72hBefore: 8, previous72h: 2, actual72h: 11, projected72h: 11, ...extra });
const updated = (extra = {}) => ({ _id: 'u1', disease: 'ICD10:A90', location: 'Colombo', severity: 'Critical', status: 'Pending', createdAt: '2026-11-21T04:00:00Z', firstDetectedAt: '2026-11-21T04:00:00Z',
  lastUpdatedAt: '2026-11-24T06:30:00Z', updateCount: 2, updateHistory: [entry({ at: '2026-11-22T06:30:00Z', caseCountBefore: 6, caseCountAfter: 8 }), entry()], alert72h: null, ...extra });
const old = (extra = {}) => ({ _id: 'o1', disease: 'ICD10:A01', location: 'Galle', severity: 'High', status: 'Resolved', createdAt: '2026-10-20T04:00:00Z', closedAt: null, historyReason: 'closed', alert72h: null, ...extra });
const wrap = node => render(<LanguageProvider>{node}</LanguageProvider>);
const page = rows => ({ data: { data: rows, pagination: { page: 1, limit: 20, total: rows.length, pages: 1 } } });

beforeEach(() => { jest.clearAllMocks(); api.get.mockReset(); localStorage.clear(); });
afterEach(cleanup);

test('last updated: Sri Lanka time, number of updates, and the added cases of the latest update', () => {
  wrap(<LastUpdatedCell alert={updated()} />);
  const cell = screen.getByTestId('alert-last-updated');
  expect(cell).toHaveTextContent('11/24/2026, 12:00:00 PM (Sri Lanka time, UTC+05:30)');
  expect(cell).toHaveTextContent('Updated 2 times');
  expect(screen.getByTestId('alert-added')).toHaveTextContent('+4 cases since last scan');
});

test('no "+X" when the count did not rise or is unknown; singular label for one update', () => {
  wrap(<><LastUpdatedCell alert={updated({ updateCount: 1, updateHistory: [entry({ caseCountAfter: 7 })] })} /><LastUpdatedCell alert={updated({ updateHistory: [entry({ caseCountBefore: null })] })} /></>);
  expect(screen.queryByTestId('alert-added')).toBeNull();
  expect(screen.getByText('Updated 1 time')).toBeInTheDocument();
});

test('an old alert without the new fields shows createdAt as first detected and a dash for the rest', () => {
  expect(firstDetectedText(old())).toMatch(/^10\/20\/2026/);
  expect(firstDetectedText({})).toBe('—');
  wrap(<LastUpdatedCell alert={old()} />);
  expect(screen.getByTestId('alert-last-updated')).toHaveTextContent(/^—$/);
});

test('timeline: newest first, before and after, who started it, projection label, first detection last', () => {
  wrap(<AlertTimeline alert={updated({ alert72hFirst: { actual72h: 8, projected: 8, outcome: { actualNext72h: 10 } } })} />);
  const items = screen.getAllByTestId('alert-timeline-entry');
  expect(items).toHaveLength(2);
  expect(items[0]).toHaveTextContent('Cases in 7 days: 8 → 12');
  expect(items[0]).toHaveTextContent('Severity: High → Critical');
  expect(items[0]).toHaveTextContent('(projection, not a forecast)');
  expect(items[0]).toHaveTextContent('Scan started by an administrator');
  expect(items[1]).toHaveTextContent('Cases in 7 days: 6 → 8');
  expect(screen.getByTestId('alert-timeline-first')).toHaveTextContent('Actual next 72 hours: 10');
  expect(screen.queryByRole('button')).toBeNull(); // read-only
});

test('timeline: lower window note, scheduled scan, dashes for missing values', () => {
  wrap(<AlertTimeline alert={updated({ updateHistory: [{ at: null, triggeredBy: 'scheduled', caseCountBefore: 16, caseCountAfter: 14, displayedCaseCount: 16, note: 'WINDOW_RESULT_LOWER' }] })} />);
  const item = screen.getByTestId('alert-timeline-entry');
  expect(item).toHaveTextContent('displayed count was kept at 16');
  expect(item).toHaveTextContent('Scheduled scan');
  expect(item).toHaveTextContent('Severity: — → —');
  expect(item).not.toHaveTextContent(/undefined|null|NaN/);
});

test('timeline empty state', () => {
  wrap(<AlertTimeline alert={old()} />);
  expect(screen.getByTestId('alert-timeline-empty')).toHaveTextContent('No updates since first detection.');
});

test('History: both columns, details open the timeline; old rows still render', async () => {
  api.get.mockResolvedValue(page([updated({ status: 'Resolved', historyReason: 'closed' }), old()]));
  wrap(<OutbreakHistory />);
  const rows = await screen.findByTestId('history-rows');
  for (const name of ['First detected', 'Last updated']) expect(screen.getByRole('columnheader', { name })).toBeInTheDocument();
  expect(rows).toHaveTextContent('Updated 2 times');
  fireEvent.click(within(rows).getAllByRole('button', { name: 'Details' })[0]);
  expect(screen.getAllByTestId('alert-timeline-entry')).toHaveLength(2);
  fireEvent.click(within(rows).getByRole('button', { name: 'Hide details' }));
  expect(screen.queryByTestId('alert-timeline')).toBeNull();
});

test('History: error and empty states are unchanged', async () => {
  api.get.mockRejectedValueOnce(new Error('offline'));
  wrap(<OutbreakHistory />);
  expect(await screen.findByTestId('history-error')).toBeInTheDocument();
  api.get.mockResolvedValueOnce(page([]));
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByTestId('history-empty')).toBeInTheDocument();
});

test('Monitor: both columns, the updated label and the timeline in Details', async () => {
  api.get.mockImplementation(url => {
    if (url === '/admin/outbreak/alerts') return Promise.resolve(page([updated()]));
    if (url === '/admin/outbreak/growth?window=72h') return Promise.resolve({ data: { success: true } });
    if (url === '/admin/outbreak/last-scan') return Promise.resolve({ data: { success: true, lastScan: null } });
    return Promise.resolve({ data: {} });
  });
  wrap(<OutbreakMonitor />);
  expect(await screen.findByTestId('alert-last-updated')).toHaveTextContent('Updated 2 times');
  for (const name of ['First detected', 'Last updated']) expect(screen.getByRole('columnheader', { name })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Details' }));
  expect(await screen.findAllByTestId('alert-timeline-entry')).toHaveLength(2);
});

test('labels exist in English, Sinhala and Tamil with the same keys and placeholders', () => {
  const keys = Object.keys(en.alertUpdates).sort();
  for (const lang of [si, ta]) {
    expect(Object.keys(lang.alertUpdates).sort()).toEqual(keys);
    for (const k of keys) {
      expect(lang.alertUpdates[k].trim()).not.toBe('');
      expect(lang.alertUpdates[k].includes('{n}')).toBe(en.alertUpdates[k].includes('{n}'));
      expect(lang.alertUpdates[k]).not.toBe(en.alertUpdates[k]);
    }
  }
});
