import React from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import PublicHealth from '../pages/public/PublicHealth';
import { LanguageProvider } from '../i18n/LanguageContext';
import { validateConsultationActivity } from '../utils/consultationActivity';
import { en } from '../i18n/translations/en';
import { si } from '../i18n/translations/si';
import { ta } from '../i18n/translations/ta';
import { activityFixture } from './activityFixture';
import api from '../api/axiosInstance';
jest.mock('../api/axiosInstance', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('../components/common/PublicNavbar', () => {
  const Switcher = require('../components/common/LanguageSwitcher').default;
  return () => <Switcher />;
});
jest.mock('../components/common/PageTransition', () => ({ children }) => <>{children}</>);
jest.mock('react-leaflet', () => ({ MapContainer: ({ children }) => <div>{children}</div>, GeoJSON: () => null }));
beforeEach(() => { jest.clearAllMocks(); localStorage.clear(); global.fetch = jest.fn(async () => ({ json: async () => ({ type: 'FeatureCollection', features: [] }) })); });
afterEach(cleanup);
const mount = () => render(<LanguageProvider><PublicHealth /></LanguageProvider>);

test.each([['en', en], ['si', si], ['ta', ta]])('actual %s caption defines visits beside the figure; unavailable clinical values stay non-numeric', async (language, dictionary) => {
  localStorage.setItem('medisync_language', language); api.get.mockResolvedValue({ data: { data: activityFixture() } }); mount();
  await screen.findByTestId('activity-total-visits');
  const caption = screen.getByTestId('activity-visit-caption');
  expect(caption).toHaveTextContent(dictionary.activity.visitCaption);
  expect(caption.parentElement).toContainElement(screen.getByTestId('activity-total-visits'));
  for (const id of ['confirmed-cases', 'outbreak-clusters', 'forecast']) expect(screen.getByTestId('surveillance-' + id + '-value')).toHaveTextContent(dictionary.activity.notAvailable);
  expect(api.get).toHaveBeenCalledTimes(1); expect(api.get.mock.calls[0][0]).toBe('/public/consultation-activity'); expect(api.post).not.toHaveBeenCalled();
  expect(screen.queryByTestId('prototype-notice')).not.toBeInTheDocument(); expect(screen.queryByTestId('demonstration-data-banner')).not.toBeInTheDocument();
});
test('language changes persist and update the caption without another data call', async () => {
  api.get.mockResolvedValue({ data: { data: activityFixture() } }); mount(); await screen.findByTestId('activity-total-visits');
  fireEvent.click(screen.getByRole('button', { name: 'தமிழ்' }));
  expect(screen.getByTestId('activity-visit-caption')).toHaveTextContent(ta.activity.visitCaption);
  expect(localStorage.getItem('medisync_language')).toBe('ta'); expect(api.get).toHaveBeenCalledTimes(1);
});
test('complete empty activity has a neutral zero-visit state and no zero surveillance values', async () => {
  api.get.mockResolvedValue({ data: { data: activityFixture(0) } }); mount(); await screen.findByTestId('activity-empty');
  expect(screen.getByTestId('activity-total-visits')).toHaveTextContent('0');
  for (const id of ['confirmed-cases', 'outbreak-clusters', 'forecast']) expect(screen.getByTestId('surveillance-' + id + '-value')).toHaveTextContent('Not available');
});
test('all-suppressed activity retains total but shows neutral district empty state', async () => {
  api.get.mockResolvedValue({ data: { data: activityFixture(4) } }); mount();
  expect(await screen.findByTestId('activity-district-empty')).toHaveTextContent(en.activity.suppressed);
  expect(screen.getByTestId('activity-total-visits')).toHaveTextContent('4');
  expect(screen.getAllByText(en.activity.notDisclosed)).toHaveLength(25); expect(screen.queryByText('No outbreaks')).not.toBeInTheDocument();
});
test.each([{ isSynthetic: true }, { isSimulatedDemo: true }, { isDemoData: true }, { isTestFixture: true }, { isDemoAccount: true }, { datasetBatch: 'owned' }, { demoBatchId: 'owned' }, { phase5wOwner: 'owned' }, { mode: 'simulation' }, { unit: 'cases' }, { totalCases: 6 }, { forecast: [] }, { surveillance: { availability: 'available', confirmedCases: 0, outbreakClusters: 0, forecast: [] } }])('mislabeled or synthetic data never becomes public visits %#', async change => {
  api.get.mockResolvedValue({ data: { data: { ...activityFixture(), ...change } } }); mount(); await screen.findByRole('alert');
  expect(screen.queryByTestId('activity-total-visits')).not.toBeInTheDocument(); expect(screen.getByTestId('surveillance-forecast-value')).toHaveTextContent('Not available');
});
test('stale request completion cannot restore previous counts after filter change', async () => {
  let first, second; api.get.mockImplementationOnce(() => new Promise(resolve => { first = resolve; })).mockImplementationOnce(() => new Promise(resolve => { second = resolve; }));
  mount(); fireEvent.change(screen.getByRole('combobox', { name: 'Time range' }), { target: { value: '7' } });
  await act(async () => second({ data: { data: activityFixture(7, { rangeDays: 7 }) } }));
  expect(screen.getByTestId('activity-total-visits')).toHaveTextContent('7');
  await act(async () => first({ data: { data: activityFixture(100) } }));
  expect(screen.getByTestId('activity-total-visits')).toHaveTextContent('7'); expect(api.get.mock.calls[0][1].signal.aborted).toBe(true);
});
test('429 and retry never expose stale totals or invoke the confirmed-case endpoint', async () => {
  api.get.mockRejectedValueOnce({ response: { status: 429 } }).mockResolvedValueOnce({ data: { data: activityFixture(6) } }); mount();
  expect(await screen.findByRole('alert')).toHaveTextContent(en.activity.rateLimited);
  expect(screen.queryByTestId('activity-total-visits')).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByTestId('activity-total-visits'); expect(api.get.mock.calls.every(([url]) => url === '/public/consultation-activity')).toBe(true);
});
test('DTO validation strips private extra fields, checks sums and rejects malformed windows', () => {
  expect(JSON.stringify(validateConsultationActivity({ ...activityFixture(), patientId: 'owned-private-sentinel' }))).not.toContain('owned-private-sentinel');
  for (const change of [{ totalVisits: 100001 }, { totalVisits: 7 }, { trend: [] }, { period: { start: 'bad', end: 'bad', rangeDays: 30 } }, { byDistrict: [{ district: 'Colombo', visitCount: 4 }] }]) expect(() => validateConsultationActivity({ ...activityFixture(), ...change })).toThrow();
});
test('new activity locale keys have exact three-language parity and nonempty captions', () => {
  expect(Object.keys(en.activity).sort()).toEqual(Object.keys(si.activity).sort()); expect(Object.keys(en.activity).sort()).toEqual(Object.keys(ta.activity).sort());
  for (const dictionary of [en, si, ta]) for (const value of Object.values(dictionary.activity)) expect(typeof value === 'string' && value.trim().length > 0).toBe(true);
});
test('selected-district suppression hides both header and daily counts without implying zero', async () => {
  api.get.mockImplementation((_url, options) => Promise.resolve({ data: { data: options.params.district === 'all' ? activityFixture(4) : {
    ...activityFixture(4), totalVisits: null, byDistrict: [], trend: [], disclosure: { districtMinCount: 5, suppressed: true }
  } } }));
  mount(); await screen.findByTestId('activity-total-visits');
  fireEvent.change(screen.getByRole('combobox', { name: 'District' }), { target: { value: 'Colombo' } });
  await screen.findByTestId('activity-district-empty');
  expect(screen.getByTestId('activity-total-visits')).toHaveTextContent(en.activity.notDisclosed);
  expect(screen.queryByRole('table', { name: en.activity.daily })).not.toBeInTheDocument();
  expect(screen.queryByTestId('activity-empty')).not.toBeInTheDocument();
});
test('numeric under-threshold selected-district DTO and incorrectly suppressed national DTO are rejected', () => {
  expect(() => validateConsultationActivity(activityFixture(4), { district: 'Colombo' })).toThrow();
  expect(() => validateConsultationActivity({ ...activityFixture(4), totalVisits: null, byDistrict: [], trend: [], disclosure: { districtMinCount: 5, suppressed: true } }, { district: 'all' })).toThrow();
});
test('district selection may disclose a qualifying total but no daily cells', () => {
  const input = { ...activityFixture(6), trend: [], disclosure: { districtMinCount: 5, districtTrendUnavailable: true } };
  expect(validateConsultationActivity(input, { district: 'Colombo' }).trend).toEqual([]);
  expect(() => validateConsultationActivity(input, { district: 'all' })).toThrow();
  expect(() => validateConsultationActivity(activityFixture(6), { district: 'Colombo' })).toThrow();
});
