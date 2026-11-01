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
  AreaChart: () => null,
  Area: () => null,
  XAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: () => null
}));

describe('Public Health retry & graceful degradation regression', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({ type: 'FeatureCollection', features: [] })
    });
  });

  afterEach(cleanup);

  test('503 renders error alert with Retry button and hides Total Cases count', async () => {
    api.get.mockRejectedValue({
      response: {
        status: 503,
        data: {
          error: 'PUBLIC_HEALTH_UNAVAILABLE',
          message: 'Health statistics are temporarily unavailable.'
        }
      }
    });

    render(<PublicHealth />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Health statistics are temporarily unavailable. No case counts are shown.');

    const retryBtn = screen.getByRole('button', { name: 'Retry' });
    expect(retryBtn).toBeInTheDocument();

    // Must not render Total Cases during unavailable state
    expect(screen.queryByText('Total Cases')).not.toBeInTheDocument();
  });

  test('Clicking Retry dispatches another request and renders data on success', async () => {
    api.get
      .mockRejectedValueOnce({
        response: { status: 503 }
      })
      .mockResolvedValueOnce({
        data: {
          data: {
            totalCases: 42,
            byDistrict: [{ district: 'Colombo', totalCases: 42 }],
            byDisease: [{ disease: 'Dengue', totalCases: 42 }],
            trend: [{ date: '2026-11-01', count: 42 }]
          }
        }
      });

    render(<PublicHealth />);

    await screen.findByRole('alert');
    const retryBtn = screen.getByRole('button', { name: 'Retry' });

    // Initial fetch count = 1
    expect(api.get).toHaveBeenCalledTimes(1);

    fireEvent.click(retryBtn);

    // After retry click, second call dispatched and Total Cases rendered
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Total Cases')).toBeInTheDocument();
      expect(screen.getAllByText('42').length).toBeGreaterThan(0);
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
