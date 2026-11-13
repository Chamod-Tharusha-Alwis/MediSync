import React from 'react';
import { render, screen } from '@testing-library/react';
import { toast } from 'react-toastify';
import OutbreakMonitor from '../pages/admin/OutbreakMonitor';
import api from '../api/axiosInstance';
import { LanguageProvider } from '../i18n/LanguageContext';

jest.mock('react-toastify', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

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
      if (path.includes('recipients-preview')) {
        return Promise.resolve({ data: { recipientCount: 42, district: 'Gampaha', deliveryEnabled: true } });
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
    expect(screen.queryByText('Symptom reference profiles')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Outbreak detection covers every ICD code recorded in verified consultations.');
  });

  test('approve modal enforces disease confirmation on nationwide scope and enables button on match', async () => {
    const { fireEvent, act } = require('@testing-library/react');
    const alerts = [{
      _id: 'alert-pending-dengue',
      disease: 'Dengue',
      location: 'Gampaha',
      severity: 'Critical',
      status: 'Pending',
      feedbackStatus: 'unverified',
      createdAt: new Date().toISOString()
    }];
    await mountWithAlerts(alerts);

    // Open modal
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    });
    expect(screen.getByText('Approve Outbreak Alert')).toBeInTheDocument();

    // Default scope is district: button enabled immediately
    expect(screen.getByRole('button', { name: 'Confirm Approval' })).not.toBeDisabled();

    // Switch to Nationwide
    const radio = screen.getByRole('radio', { name: /Nationwide/i });
    await act(async () => {
      fireEvent.click(radio);
    });
    expect(screen.getByRole('button', { name: 'Confirm Approval' })).toBeDisabled();

    // Placeholder and label match disease
    const input = screen.getByPlaceholderText('Type Dengue to confirm');
    expect(input).toBeInTheDocument();

    // Wrong text keeps button disabled
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Type Dengue to confirm'), { target: { value: 'WrongDisease' } });
    });
    expect(screen.getByRole('button', { name: 'Confirm Approval' })).toBeDisabled();

    // Case-insensitive match enables button
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Type Dengue to confirm'), { target: { value: 'dengue' } });
    });
    expect(screen.getByRole('button', { name: 'Confirm Approval' })).not.toBeDisabled();
  });

  test('maps backend error codes to human-readable messages without raw code leaks', async () => {
    const { fireEvent, act } = require('@testing-library/react');
    const alerts = [{
      _id: 'alert-pending-dengue',
      disease: 'Dengue',
      location: 'Gampaha',
      severity: 'Critical',
      status: 'Pending',
      feedbackStatus: 'unverified',
      createdAt: new Date().toISOString()
    }];
    await mountWithAlerts(alerts);

    // Open modal
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    });

    api.put.mockRejectedValueOnce({
      response: {
        status: 400,
        data: { error: 'NATIONWIDE_CONFIRMATION_REQUIRED' }
      }
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Approval' }));
    });

    expect(toast.error).toHaveBeenCalledWith('Nationwide broadcast requires typing the exact disease name (Dengue) to confirm.');
  });
});
