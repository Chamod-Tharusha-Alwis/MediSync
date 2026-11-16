import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import OutbreakMonitor from '../pages/admin/OutbreakMonitor';
import api from '../api/axiosInstance';
import { LanguageProvider } from '../i18n/LanguageContext';

// Synthetic demonstration data fixtures. New test file (alert 72h upgrade); existing tests are unchanged.
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock('../api/axiosInstance', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
jest.mock('../components/common/PageTransition', () => ({ children }) => <main>{children}</main>);

const SENTENCE = 'Demonstration alert generated from synthetic seed data. Not an active public health notice.';
const view = (extra = {}) => ({
  previous72h: 17, actual72h: 38, change: 21, projected: 38, low: 31, high: 46, enoughHistory: true, historyWindows: 19,
  window: { previousStart: '2026-11-11T18:30:00Z', previousEnd: '2026-11-13T18:30:00Z', actualStart: '2026-11-13T18:30:00Z', actualEnd: '2026-11-16T18:30:00Z', nextStart: '2026-11-16T18:30:00Z', nextEnd: '2026-11-19T18:30:00Z' },
  stored: true, outcome: null, caveat: 'projection, not a forecast', methodVersion: 'alert72h-naive-empirical-v1',
  helpText: "Expected value = the actual last 72 hours repeated. In this project's tests it has not been shown to beat repeating the last 72 hours.",
  dataNote: 'verified MediSync consultations only (lower bound)', ...extra,
});
const synthetic = { _id: 'a-syn', disease: 'ICD10:A90', location: 'Kurunegala', severity: 'Critical', status: 'Pending', createdAt: '2026-11-17T06:30:00Z',
  isDemoData: true, isSynthetic: true, syntheticSeedBatch: 'viva-2026-11-outbreaks', syntheticLabel: SENTENCE, alert72h: view() };
const real = { _id: 'a-real', disease: 'ICD10:A01', location: 'Colombo', severity: 'High', status: 'Pending', createdAt: '2026-11-17T06:30:00Z',
  alert72h: view({ previous72h: 2, actual72h: 9, projected: 9, low: null, high: null, enoughHistory: false, historyWindows: 3 }) };

async function mount(alerts) {
  api.get.mockImplementation(path => {
    if (path === '/admin/ml-status') return Promise.resolve({ data: { available: true, dataPoints: 100, dataPointUnit: 'reference disease profiles' } });
    if (path === '/admin/outbreak/alerts') return Promise.resolve({ data: { data: alerts } });
    if (path.includes('recipients-preview')) return Promise.resolve({ data: { recipientCount: 1, district: 'Kurunegala', deliveryEnabled: true, isDemonstration: true } });
    return Promise.reject(new Error('not handled'));
  });
  render(<LanguageProvider><OutbreakMonitor /></LanguageProvider>);
  await screen.findByRole('table');
}

describe('alert list: compact synthetic badge and 72-hour numbers', () => {
  beforeEach(() => { localStorage.clear(); api.get.mockReset(); api.post.mockReset(); api.put.mockReset(); });

  test('badge only on the synthetic-batch alert; the long sentence is not in the list row', async () => {
    await mount([synthetic, real]);
    const badges = screen.getAllByTestId('synthetic-demo-badge');
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent('SYNTHETIC DEMO DATA');
    expect(screen.queryByText(SENTENCE)).not.toBeInTheDocument();
  });

  test('three labelled numbers with range, caveat and help text; not-enough-history case', async () => {
    await mount([synthetic, real]);
    const blocks = screen.getAllByTestId('alert-72h-numbers');
    const syn = within(blocks[0]);
    expect(syn.getByText(/Previous 72 hours/)).toBeInTheDocument();
    expect(syn.getByTestId('n-previous')).toHaveTextContent('17');
    expect(syn.getByTestId('n-actual')).toHaveTextContent('38');
    expect(syn.getByTestId('n-projected')).toHaveTextContent('38');
    expect(syn.getByTestId('n-range')).toHaveTextContent('range 31–46');
    expect(syn.getByText('projection, not a forecast')).toBeInTheDocument();
    expect(syn.getByRole('tooltip', { hidden: true })).toHaveTextContent('has not been shown to beat repeating the last 72 hours');
    expect(within(blocks[1]).getByTestId('n-range')).toHaveTextContent('not enough history');
  });

  test('detail view keeps the full sentence; real alert detail has none', async () => {
    await mount([synthetic, real]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Details' })[0]);
    expect(screen.getByTestId('alert-detail-synthetic-sentence')).toHaveTextContent(SENTENCE);
    expect(screen.getByTestId('d-previous')).toHaveTextContent('17');
    expect(screen.getByTestId('d-actual')).toHaveTextContent('38');
    expect(screen.getByTestId('d-projected')).toHaveTextContent('38');
    fireEvent.click(screen.getByRole('button', { name: 'Hide details' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Details' })[1]);
    expect(screen.queryByTestId('alert-detail-synthetic-sentence')).not.toBeInTheDocument();
  });

  test('actual next 72 hours and absolute error appear beside the stored projection', async () => {
    await mount([{ ...synthetic, alert72h: view({ outcome: { actualNext72h: 30, absoluteError: 8, withinRange: false } }) }]);
    expect(screen.getByTestId('n-outcome')).toHaveTextContent('Actual next 72 hours: 30 (error 8, outside range)');
  });

  test('approval preview shows the full sentence for a synthetic alert', async () => {
    await mount([synthetic]);
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(await screen.findByTestId('approve-synthetic-sentence')).toHaveTextContent(SENTENCE);
  });
});
