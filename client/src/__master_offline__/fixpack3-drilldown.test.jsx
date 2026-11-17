import { activityFixture } from './activityFixture';
import React from 'react';
import { render, screen, waitFor, fireEvent, within, cleanup } from '@testing-library/react';
import PublicHealth from '../pages/public/PublicHealth';
import api from '../api/axiosInstance';

// Fix pack 3, item 1: the district drill-down opens as a row directly under the clicked district.
// New test file; existing tests unchanged. Fixture values only, aggregates only.
jest.mock('../api/axiosInstance', () => ({ get: jest.fn() }));
jest.mock('../components/common/PublicNavbar', () => () => null);
jest.mock('../components/common/PageTransition', () => ({ children }) => <div>{children}</div>);
jest.mock('../i18n/LanguageContext', () => ({ useTranslation: () => ({ t: (_key, fallback) => fallback }) }));
jest.mock('recharts', () => ({ AreaChart: () => null, Area: () => null, XAxis: () => null, YAxis: () => null, Tooltip: () => null, ResponsiveContainer: () => null }));
jest.mock('react-leaflet', () => ({ MapContainer: () => null, GeoJSON: () => null }));

const activity = activityFixture(14, { byDistrict: [{ district: 'Colombo', visitCount: 8 }, { district: 'Badulla', visitCount: 6 }] });
const healthStats = {
  Colombo: { totalCases: 31, byDisease: [
    { disease: 'Dengue', totalCases: 12 }, { disease: 'Leptospirosis', totalCases: 7 }, { disease: 'Typhoid', totalCases: 5 },
    { disease: 'Hepatitis A', totalCases: 4 }, { disease: 'Chikungunya', totalCases: 2 }, { disease: 'Measles', totalCases: 1 },
  ] },
  Badulla: { totalCases: 3, byDisease: [{ disease: 'Dengue', totalCases: 3 }] },
};

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn(async () => ({ json: async () => ({ type: 'FeatureCollection', features: [] }) }));
  api.get.mockImplementation((url, config) => {
    if (url === '/public/health-stats' && config?.params?.district) {
      return Promise.resolve({ data: { data: healthStats[config.params.district] || { totalCases: 0, byDisease: [] } } });
    }
    if (url === '/public/consultation-activity') return Promise.resolve({ data: { data: activity } });
    return Promise.resolve({ data: { data: { totalCases: 0, byDisease: [], byDistrict: [] } } });
  });
});
afterEach(cleanup);

const districtTable = () => screen.getByRole('table', { name: 'District visit counts' });
const rowOf = button => button.closest('tr');

test('click expands a row directly under the district, click again closes; only one open; aria-expanded', async () => {
  render(<PublicHealth />);
  await waitFor(() => expect(screen.getByText('Recorded visits')).toBeInTheDocument());
  const colombo = within(districtTable()).getByRole('button', { name: 'Colombo' });
  expect(colombo).toHaveAttribute('aria-expanded', 'false');

  fireEvent.click(colombo);
  expect(colombo).toHaveAttribute('aria-expanded', 'true');
  const panel = await within(districtTable()).findByTestId('district-drilldown-row');
  expect(rowOf(colombo).nextElementSibling).toBe(panel); // directly under the clicked row
  expect(colombo).toHaveAttribute('aria-controls', panel.id);
  await waitFor(() => expect(within(panel).getAllByTestId('drilldown-count')).toHaveLength(5));
  // The old standalone panel below the table is gone.
  expect(screen.queryByTestId('district-drilldown')).not.toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith('/public/health-stats', expect.objectContaining({ params: { rangeDays: 30, district: 'Colombo' } }));

  // Opening another district closes the first.
  const badulla = within(districtTable()).getByRole('button', { name: 'Badulla' });
  fireEvent.click(badulla);
  expect(colombo).toHaveAttribute('aria-expanded', 'false');
  expect(badulla).toHaveAttribute('aria-expanded', 'true');
  expect(within(districtTable()).getAllByTestId('district-drilldown-row')).toHaveLength(1);
  expect(rowOf(badulla).nextElementSibling).toHaveAttribute('data-testid', 'district-drilldown-row');

  // Click again closes it.
  fireEvent.click(badulla);
  expect(badulla).toHaveAttribute('aria-expanded', 'false');
  expect(within(districtTable()).queryByTestId('district-drilldown-row')).not.toBeInTheDocument();
});

test('suppression: counts below 5 show "<5"; a district under 5 verified cases is "Not disclosed (<5)"; no ids', async () => {
  render(<PublicHealth />);
  await waitFor(() => expect(screen.getByText('Recorded visits')).toBeInTheDocument());
  fireEvent.click(within(districtTable()).getByRole('button', { name: 'Colombo' }));
  const panel = await within(districtTable()).findByTestId('district-drilldown-row');
  await waitFor(() => expect(within(panel).getAllByTestId('drilldown-count').map(c => c.textContent)).toEqual(['12', '7', '5', '<5', '<5']));
  expect(panel).not.toHaveTextContent('Measles'); // top 5 only
  expect(panel.textContent).not.toMatch(/\b[0-9a-f]{24}\b/);

  fireEvent.click(within(districtTable()).getByRole('button', { name: 'Badulla' }));
  const suppressed = await within(districtTable()).findByTestId('drilldown-not-disclosed');
  expect(suppressed).toHaveTextContent('Not disclosed (<5)');
  expect(within(districtTable()).getByTestId('district-drilldown-row').textContent).not.toMatch(/(^|[^0-9])3([^0-9]|$)/);
});

test('keyboard: the district control is a native button, so Enter and Space activate it', async () => {
  render(<PublicHealth />);
  await waitFor(() => expect(screen.getByText('Recorded visits')).toBeInTheDocument());
  const colombo = within(districtTable()).getByRole('button', { name: 'Colombo' });
  expect(colombo.tagName).toBe('BUTTON');
  expect(colombo).toHaveAttribute('type', 'button');
  colombo.focus();
  expect(colombo).toHaveFocus();
});
