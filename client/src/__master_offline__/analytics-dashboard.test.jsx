import React from 'react';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import api from '../api/axiosInstance';
import AnalyticsDashboard from '../pages/admin/AnalyticsDashboard';

jest.mock('../api/axiosInstance', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
  SOCKET_SERVER_URL: 'http://127.0.0.1:3100'
}));

jest.mock('../components/common/PageTransition', () => ({ children }) => <>{children}</>);

// Mock recharts to avoid SVG/DOM layout size warnings in jsdom
jest.mock('recharts', () => {
  const React = require('react');
  return {
    ResponsiveContainer: ({ children }) => <div>{children}</div>,
    AreaChart: ({ children }) => <div data-testid="area-chart">{children}</div>,
    Area: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    BarChart: ({ children }) => <div data-testid="bar-chart">{children}</div>,
    Bar: () => null,
    Legend: () => null,
    PieChart: ({ children }) => <div data-testid="pie-chart">{children}</div>,
    Pie: () => null,
    Cell: () => null
  };
});

describe('AnalyticsDashboard Resilience & Contract Suite', () => {
  afterEach(() => {
    cleanup();
    jest.clearAllMocks();
  });

  test('1. Renders loading state while waiting for API response', () => {
    api.get.mockImplementation(() => new Promise(() => {})); // pending promise
    render(<AnalyticsDashboard />);
    expect(screen.getByText(/Loading platform analytics/i)).toBeInTheDocument();
  });

  test('2. Renders populated analytics dashboard metrics and charts', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        data: {
          registrationGrowth: [{ _id: '2026-10-18', count: 12 }, { _id: '2026-10-19', count: 8 }],
          topDoctors: [{ name: 'Dr. Test Expert', count: 25 }],
          dispensingStats: { issuedCount: 40, dispensedCount: 30, dispensingRate: 75 },
          topDrugs: [{ name: 'Amoxicillin 500mg', count: 15 }],
          alerts: [{ disease: 'Dengue', district: 'Kandy', severity: 'Critical' }]
        }
      }
    });

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument();
    });

    // Check computed totals
    expect(screen.getByText('20')).toBeInTheDocument(); // total registrations (12+8)
    expect(screen.getByText('25')).toBeInTheDocument(); // total consultations
    expect(screen.getByText('75%')).toBeInTheDocument(); // dispensing rate
    expect(screen.getByText('1')).toBeInTheDocument(); // active alerts count
    expect(screen.getAllByTestId('bar-chart')).toHaveLength(2);
  });

  test('3. Handles legitimate empty data gracefully without throwing undefined errors', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        data: {
          registrationGrowth: [],
          topDoctors: [],
          dispensingStats: { issuedCount: 0, dispensedCount: 0, dispensingRate: 0 },
          topDrugs: [],
          alerts: []
        }
      }
    });

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument();
    });

    // Verify zeros and empty state messaging
    expect(screen.getAllByText('0')).toHaveLength(3); // registrations, consultations, alerts
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText(/No registration growth data recorded/i)).toBeInTheDocument();
    expect(screen.getByText(/No doctor consultation metrics recorded/i)).toBeInTheDocument();
    expect(screen.getByText(/No prescriptions recorded for dispensing analysis/i)).toBeInTheDocument();
    expect(screen.getByText(/No prescription drug activity recorded/i)).toBeInTheDocument();
  });

  test('4. Displays professional failure card on HTTP 500 or network error and provides retry button', async () => {
    api.get.mockRejectedValueOnce({
      response: { data: { error: 'Internal analytics aggregation failure' }, status: 500 }
    });

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Analytics Service Unavailable')).toBeInTheDocument();
    });

    expect(screen.getByText('Internal analytics aggregation failure')).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /Retry Analytics/i });
    expect(retryBtn).toBeInTheDocument();

    // Trigger retry
    api.get.mockResolvedValueOnce({
      data: {
        data: {
          registrationGrowth: [],
          topDoctors: [],
          dispensingStats: { issuedCount: 0, dispensedCount: 0, dispensingRate: 0 },
          topDrugs: [],
          alerts: []
        }
      }
    });

    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('Analytics Dashboard')).toBeInTheDocument();
    });
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  test('5. Handles unauthorized (401/403) failure without converting to zero stats', async () => {
    api.get.mockRejectedValueOnce({
      response: { data: { message: 'Unauthorized administrative role' }, status: 403 }
    });

    render(<AnalyticsDashboard />);

    await waitFor(() => {
      expect(screen.getByText('Analytics Service Unavailable')).toBeInTheDocument();
    });

    expect(screen.getByText(/Unauthorized administrative role/i)).toBeInTheDocument();
    expect(screen.queryByText('Analytics Dashboard')).not.toBeInTheDocument();
  });
});
