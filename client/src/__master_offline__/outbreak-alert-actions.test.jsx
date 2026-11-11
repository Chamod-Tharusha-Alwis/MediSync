import React from 'react';
import { render, screen } from '@testing-library/react';
import OutbreakMonitor from '../pages/admin/OutbreakMonitor';
import api from '../api/axiosInstance';
import { LanguageProvider } from '../i18n/LanguageContext';

jest.mock('../api/axiosInstance', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  },
}));

jest.mock('../components/common/PageTransition', () => ({ children }) => <main>{children}</main>);

describe('Outbreak Monitor Alert Action Buttons Lifecycle (Task B)', () => {
  beforeEach(() => {
    localStorage.clear();
    api.get.mockReset();
    api.post.mockReset();
    api.put.mockReset();
  });

  const mountWithAlerts = async (alertsList) => {
    api.get.mockImplementation((path) => {
      if (path === '/admin/ml-status') {
        return Promise.resolve({ data: { available: true, dataPoints: 100, dataPointUnit: 'reference disease profiles' } });
      }
      if (path === '/admin/outbreak/alerts') {
        return Promise.resolve({ data: { data: alertsList } });
      }
      return Promise.reject(new Error('not handled'));
    });

    render(
      <LanguageProvider>
        <OutbreakMonitor />
      </LanguageProvider>
    );

    // Wait until table is loaded
    await screen.findByRole('table');
  };

  test('alert with feedbackStatus confirmed renders Confirmed label AND a Resolve button', async () => {
    const alerts = [{
      _id: 'alert-colombo-dengue',
      disease: 'Dengue Fever',
      location: 'Colombo',
      severity: 'Critical',
      status: 'Active',
      feedbackStatus: 'confirmed',
      createdAt: new Date().toISOString()
    }];

    await mountWithAlerts(alerts);

    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'False Alarm' })).not.toBeInTheDocument();
  });

  test('alert with status Pending renders Approve and Dismiss buttons', async () => {
    const alerts = [{
      _id: 'alert-gampaha-pending',
      disease: 'Influenza',
      location: 'Gampaha',
      severity: 'Moderate',
      status: 'Pending',
      feedbackStatus: 'unverified',
      createdAt: new Date().toISOString()
    }];

    await mountWithAlerts(alerts);

    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  test('alert in terminal Resolved state renders Resolved badge and no action buttons', async () => {
    const alerts = [{
      _id: 'alert-kandy-resolved',
      disease: 'Cholera',
      location: 'Kandy',
      severity: 'Low',
      status: 'Resolved',
      feedbackStatus: 'confirmed',
      createdAt: new Date().toISOString()
    }];

    await mountWithAlerts(alerts);

    expect(screen.getByText('Resolved')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resolve' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'False Alarm' })).not.toBeInTheDocument();
  });

  test('active unverified alert renders Confirm, False Alarm, and Resolve buttons', async () => {
    const alerts = [{
      _id: 'alert-galle-active',
      disease: 'Leptospirosis',
      location: 'Galle',
      severity: 'High',
      status: 'Active',
      feedbackStatus: 'unverified',
      createdAt: new Date().toISOString()
    }];

    await mountWithAlerts(alerts);

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'False Alarm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeInTheDocument();
  });

  test('renders symptom reference profiles coverage statement and honest 71,704 catalog denominator', async () => {
    const alerts = [{
      _id: 'alert-sample',
      disease: 'Dengue',
      location: 'Colombo',
      severity: 'High',
      status: 'Active',
      feedbackStatus: 'confirmed',
      createdAt: new Date().toISOString()
    }];
    await mountWithAlerts(alerts);
    expect(screen.getByText('Symptom reference profiles')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText(/Symptom reference profiles: 41 of 71,704 conditions; any ICD code can be selected manually/)).toBeInTheDocument();
  });
});
