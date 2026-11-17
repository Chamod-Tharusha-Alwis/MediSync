import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import api from '../api/axiosInstance';
import { LanguageProvider } from '../i18n/LanguageContext';
import { consultationTitle } from '../utils/historyTitle';
import { deviceListView } from '../utils/deviceList';
import { otpErrorMessage, formatWait } from '../utils/otpLock';
import LabReportDownloadButton from '../components/common/LabReportDownloadButton';
import PatientAccessModal from '../components/PatientAccessModal';
import VerifyConsultation from '../pages/public/VerifyConsultation';

// Fix pack 2 (A2, A3, A5). New test file; existing tests are unchanged. Fixture values only.
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock('react-router-dom', () => ({ useParams: () => ({ token: 'fixture-token' }), Link: ({ children }) => <span>{children}</span> }));
jest.mock('../api/axiosInstance', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() } }));

beforeEach(() => { api.get.mockReset(); api.post.mockReset(); });

describe('A2: history row title', () => {
  test('diagnosis with ICD code; "Consultation" only without a diagnosis', () => {
    expect(consultationTitle({ diagnosis: 'Dengue fever', icdCode: 'A90' })).toBe('Dengue fever (A90)');
    expect(consultationTitle({ diagnosis: 'Dengue fever' })).toBe('Dengue fever');
    expect(consultationTitle({})).toBe('Consultation');
    expect(consultationTitle({ diagnosis: '6305f3bd73fabd0c82791ba625a6c315:1e4c7c9f' })).toBe('Consultation');
  });
});

describe('A3: lab report download only after the result is uploaded', () => {
  test('pending lab: plain sentence and no download button', () => {
    render(<LanguageProvider><LabReportDownloadButton enabled labTests={[{ testName: 'FBC', status: 'pending', labStatus: 'pending' }]} /></LanguageProvider>);
    expect(screen.getByTestId('lab-result-unavailable')).toHaveTextContent('Lab result unavailable. It will appear after the laboratory uploads the result.');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
  test('uploaded lab: download button is offered', () => {
    render(<LanguageProvider><LabReportDownloadButton enabled labTests={[{ testName: 'FBC', status: 'report_ready', reportId: 'REP-1' }]} /></LanguageProvider>);
    expect(screen.getByRole('button')).toHaveTextContent('Download Lab Report PDF');
  });
});

describe('A5: OTP request lock and spinner', () => {
  const locked = { response: { status: 429, data: { message: 'Too many verification code requests. Please try again later.', retryAfterSeconds: 900 } } };

  test('429 shows the server message and minutes remaining; reopening does not send again', async () => {
    api.post.mockRejectedValue(locked);
    const props = { patientNic: 'FIXTURE-NIC-1', requesterRole: 'doctor', onClose: () => {}, onSuccess: () => {} };
    const first = render(<LanguageProvider><PatientAccessModal {...props} /></LanguageProvider>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many verification code requests. Please try again later.');
    expect(screen.getByTestId('otp-lock-wait')).toHaveTextContent('Try again in 15 minutes.');
    expect(screen.getByText('Retry verification request')).toBeDisabled();
    expect(api.post).toHaveBeenCalledTimes(1);
    first.unmount();
    render(<LanguageProvider><PatientAccessModal {...props} /></LanguageProvider>);
    expect(await screen.findByTestId('otp-lock-wait')).toHaveTextContent(/Try again in 1[45] minutes\./);
    expect(api.post).toHaveBeenCalledTimes(1); // no auto-retry, no 429 flood
  });

  test('timeout and network errors produce a plain message', () => {
    expect(otpErrorMessage({ code: 'ECONNABORTED', message: 'timeout of 20000ms exceeded' }, 'Verification failed.')).toBe('Verification failed: the server did not respond within 20 seconds. Please try again.');
    expect(otpErrorMessage({ request: {} }, 'Verification failed.')).toBe('Verification failed: no connection to the server. Please try again.');
    expect(formatWait(60)).toBe('1 minute');
    expect(formatWait(45)).toBe('45 seconds');
  });

  test('"Verifying & Unlocking" always ends: spinner stops and the message shows after a timeout', async () => {
    api.get.mockResolvedValue({ data: { valid: true, consultationRef: 'CON-FIXTURE', maskedContact: 'f***@example.test' } });
    api.post.mockImplementation(path => {
      if (path.endsWith('/otp/request')) return Promise.resolve({ data: { cooldownSeconds: 60 } });
      return Promise.reject({ code: 'ECONNABORTED', message: 'timeout of 20000ms exceeded' });
    });
    render(<LanguageProvider><VerifyConsultation /></LanguageProvider>);
    const input = await screen.findByPlaceholderText('••••••');
    fireEvent.change(input, { target: { value: '123456' } });
    await act(async () => { fireEvent.submit(input.closest('form')); });
    expect(await screen.findByTestId('otp-inline-error')).toHaveTextContent('the server did not respond within 20 seconds');
    await waitFor(() => expect(screen.queryByText('Verifying & Unlocking…')).not.toBeInTheDocument());
    expect(api.post).toHaveBeenCalledWith('/verify/fixture-token/otp/verify', { otp: '123456' }, { timeout: 20000 });
  });
});

describe('A5: trusted devices view (display only)', () => {
  const day = 86400000, now = Date.parse('2026-11-17T06:00:00Z');
  const devices = [
    ...Array.from({ length: 6 }, (_, i) => ({ _id: `t${i}`, isTrusted: true, lastSeenAt: new Date(now - i * day).toISOString() })),
    { _id: 'old-unverified', isTrusted: false, lastSeenAt: new Date(now - 45 * day).toISOString() },
  ];
  test('five most recent by default; older and stale unverified behind the link; nothing removed', () => {
    const v = deviceListView(devices, { now });
    expect(v.shown.map(d => d._id)).toEqual(['t0', 't1', 't2', 't3', 't4']);
    expect(v.hiddenCount).toBe(2);
    expect(deviceListView(devices, { showOlder: true, now }).shown).toHaveLength(7);
  });
});
