import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { toast } from 'react-toastify';
import api from '../api/axiosInstance';
import { LanguageProvider } from '../i18n/LanguageContext';
import DistrictDrilldown, { drilldownRows } from '../components/public/DistrictDrilldown';
import { showEmailOutcome } from '../pages/admin/OutbreakMonitor';

// Fix pack 2, PR C (C2, C4). New test file; existing tests unchanged. Fixture values only.
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock('../api/axiosInstance', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));

beforeEach(() => { api.get.mockReset(); jest.clearAllMocks(); });

describe('C4: district drill-down (aggregates only, small-cell rule)', () => {
  test('top 5 by people; counts below 5 show "<5"; fewer than 5 cases in total is not disclosed', () => {
    const stats = { totalCases: 40, byDisease: [
      { disease: 'Dengue', totalCases: 21 }, { disease: 'Leptospirosis', totalCases: 9 }, { disease: 'Typhoid', totalCases: 4 },
      { disease: 'Hepatitis A', totalCases: 3 }, { disease: 'Chikungunya', totalCases: 2 }, { disease: 'Measles', totalCases: 1 },
    ] };
    const out = drilldownRows(stats);
    expect(out.disclosed).toBe(true);
    expect(out.rows).toEqual([
      { disease: 'Dengue', people: 21 }, { disease: 'Leptospirosis', people: 9 }, { disease: 'Typhoid', people: '<5' },
      { disease: 'Hepatitis A', people: '<5' }, { disease: 'Chikungunya', people: '<5' },
    ]);
    expect(drilldownRows({ totalCases: 4, byDisease: [{ disease: 'Dengue', totalCases: 4 }] })).toEqual({ disclosed: false, rows: [] });
  });

  test('panel requests the 30-day aggregate for the district and renders suppression', async () => {
    api.get.mockResolvedValue({ data: { data: { totalCases: 12, byDisease: [{ disease: 'Dengue', totalCases: 9 }, { disease: 'Typhoid', totalCases: 3 }] } } });
    render(<LanguageProvider><DistrictDrilldown district="Kurunegala" /></LanguageProvider>);
    const counts = await screen.findAllByTestId('drilldown-count');
    expect(counts.map(c => c.textContent)).toEqual(['9', '<5']);
    expect(api.get).toHaveBeenCalledWith('/public/health-stats', expect.objectContaining({ params: { rangeDays: 30, district: 'Kurunegala' } }));
  });

  test('a district with fewer than 5 verified cases shows "Not disclosed (<5)"', async () => {
    api.get.mockResolvedValue({ data: { data: { totalCases: 3, byDisease: [{ disease: 'Dengue', totalCases: 3 }] } } });
    render(<LanguageProvider><DistrictDrilldown district="Mannar" /></LanguageProvider>);
    expect(await screen.findByTestId('drilldown-not-disclosed')).toHaveTextContent('Not disclosed (<5)');
    expect(screen.queryByText('Dengue')).not.toBeInTheDocument();
  });
});

describe('C2: the admin sees the real email result', () => {
  test('sent / skipped / failed use different messages', async () => {
    showEmailOutcome({ outcome: 'sent', outcomeText: 'Sent: accepted by the email provider (id re_1).' });
    showEmailOutcome({ outcome: 'skipped', outcomeText: 'Skipped: the daily email cap has been reached.' });
    showEmailOutcome({ outcome: 'failed', outcomeText: 'Failed: the email provider did not accept the message (validation_error).' });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Sent: accepted by the email provider (id re_1).', expect.any(Object)));
    expect(toast.info).toHaveBeenCalledWith('Skipped: the daily email cap has been reached.', expect.any(Object));
    expect(toast.error).toHaveBeenCalledWith('Failed: the email provider did not accept the message (validation_error).', expect.any(Object));
  });
});
