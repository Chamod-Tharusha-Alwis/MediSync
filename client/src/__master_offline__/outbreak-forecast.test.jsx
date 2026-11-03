import React from 'react';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import PublicHealth from '../pages/public/PublicHealth';
import api from '../api/axiosInstance';

jest.mock('../api/axiosInstance', () => ({
  get: jest.fn(),
  post: jest.fn()
}));
jest.mock('../components/common/PublicNavbar', () => () => null);
jest.mock('../components/common/PageTransition', () => ({ children }) => <div>{children}</div>);
jest.mock('../i18n/LanguageContext', () => ({
  useTranslation: () => ({ t: (_key, fallback) => fallback })
}));
jest.mock('react-leaflet', () => ({ MapContainer: () => null, GeoJSON: () => null }));
jest.mock('recharts', () => ({
  AreaChart: ({ children }) => <svg data-testid="recharts-area-chart">{children}</svg>,
  Area: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>
}));

describe('Public Health 14-Day Outbreak Forecasting UI & Degradation Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ type: 'FeatureCollection', features: [] })
    });
  });

  afterEach(cleanup);

  test('handles empty historical trend gracefully with explanatory message and zero NaN crashes', async () => {
    api.get.mockResolvedValue({
      data: {
        data: {
          totalCases: 0,
          byDistrict: [],
          byDisease: [],
          trend: [],
          forecast: []
        }
      }
    });

    render(<PublicHealth />);

    // Total Cases renders without crashing
    await waitFor(() => {
      expect(screen.getByText('Total Cases')).toBeInTheDocument();
    });

    // Both the dedicated forecast card and the switcher handle insufficient data
    const notices = await screen.findAllByText(/Insufficient historical data to compute 14-day outbreak forecast/i);
    expect(notices.length).toBeGreaterThan(0);

    // No broken NaN text in the whole DOM
    expect(document.body.innerHTML).not.toContain('NaN');
  });

  test('renders 14-day forecast with prediction interval badges and disclaimer footer when trend is provided', async () => {
    const historicalTrend = [
      { date: '2026-10-25', count: 10 },
      { date: '2026-10-26', count: 12 },
      { date: '2026-10-27', count: 15 },
      { date: '2026-10-28', count: 18 },
      { date: '2026-10-29', count: 20 },
      { date: '2026-10-30', count: 24 },
      { date: '2026-10-31', count: 28 }
    ];

    api.get.mockResolvedValue({
      data: {
        data: {
          totalCases: 127,
          byDistrict: [{ district: 'Colombo', totalCases: 127, topDisease: 'Dengue' }],
          byDisease: [{ disease: 'Dengue', totalCases: 127 }],
          trend: historicalTrend
        }
      }
    });

    render(<PublicHealth />);

    await waitFor(() => {
      expect(screen.getByText('Total Cases')).toBeInTheDocument();
      expect(screen.getAllByText('127').length).toBeGreaterThan(0);
    });

    // Dedicated 14-day forecast section rendered
    expect(screen.getAllByText('14-Day Outbreak Forecast').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/95% (Prediction|Confidence) Interval/).length).toBeGreaterThan(0);
    expect(screen.getByText('Predicted Cases')).toBeInTheDocument();

    // Chart container rendered
    const charts = screen.getAllByTestId('recharts-area-chart');
    expect(charts.length).toBeGreaterThanOrEqual(1);

    // Dedicated full-width forecast disclaimer footer rendered
    const disclaimer = screen.getByTestId('full-forecast-disclaimer');
    expect(disclaimer).toBeInTheDocument();
    expect(disclaimer).toHaveTextContent(/Statistical projection for demonstration, not clinically validated/i);
  });

  test('toggles between Historical Trend and 14-Day Forecast in widget', async () => {
    const historicalTrend = [
      { date: '2026-10-25', count: 10 },
      { date: '2026-10-26', count: 12 },
      { date: '2026-10-27', count: 15 }
    ];

    api.get.mockResolvedValue({
      data: {
        data: {
          totalCases: 37,
          byDistrict: [{ district: 'Galle', totalCases: 37, topDisease: 'Viral Flu' }],
          byDisease: [{ disease: 'Viral Flu', totalCases: 37 }],
          trend: historicalTrend
        }
      }
    });

    render(<PublicHealth />);

    await waitFor(() => {
      expect(screen.getByText('Total Cases')).toBeInTheDocument();
    });

    const forecastBtn = screen.getByRole('button', { name: '14-Day Forecast' });
    const trendBtn = screen.getByRole('button', { name: 'Historical Trend' });

    // Switch to Forecast
    fireEvent.click(forecastBtn);
    expect(screen.getAllByText(/14-Day Outbreak Forecast/i).length).toBeGreaterThan(0);

    // Switch back to Trend
    fireEvent.click(trendBtn);
    expect(screen.getByText('Case Trend')).toBeInTheDocument();
  });
});
