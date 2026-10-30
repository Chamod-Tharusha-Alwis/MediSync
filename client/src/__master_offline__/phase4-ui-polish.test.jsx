import React from 'react';
import { render, screen, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { formatDoctorName, stripDoctorPrefix } from '../utils/doctorName';
import PrototypeNotice from '../components/common/PrototypeNotice';
import { LanguageProvider } from '../i18n/LanguageContext';
import LoginShell from '../components/common/LoginShell';
import DoctorLogin from '../pages/doctor/Login';
import NotificationBell from '../components/common/NotificationBell';

const mockOff = jest.fn();
const mockDisconnect = jest.fn();
const mockOn = jest.fn();

jest.mock('socket.io-client', () => ({
  io: () => ({
    on: (...args) => mockOn(...args),
    off: (...args) => mockOff(...args),
    disconnect: (...args) => mockDisconnect(...args),
  }),
}));

jest.mock('../api/axiosInstance', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({ data: { data: [], unreadCount: 0 } }),
    put: jest.fn().mockResolvedValue({ data: { success: true } }),
    post: jest.fn().mockResolvedValue({ data: {} }),
  },
  SOCKET_SERVER_URL: 'http://localhost:5000',
}));

jest.mock('react-toastify', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

describe('Phase 4 — UI & Text Polish Offline Acceptance Suite', () => {
  const originalEnv = process.env.REACT_APP_SHOW_PROTOTYPE_BANNER;

  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    process.env.REACT_APP_SHOW_PROTOTYPE_BANNER = originalEnv;
  });

  describe('1. Doctor Name Normalization Utility (Client)', () => {
    test('prepends Dr. to unprefixed doctor name', () => {
      expect(formatDoctorName('Chamod Alwis')).toBe('Dr. Chamod Alwis');
      expect(formatDoctorName('Anura Bandara')).toBe('Dr. Anura Bandara');
    });

    test('preserves single Dr. prefix without duplicating', () => {
      expect(formatDoctorName('Dr. Chamod Alwis')).toBe('Dr. Chamod Alwis');
      expect(formatDoctorName('dr. Anura Bandara')).toBe('Dr. Anura Bandara');
    });

    test('collapses duplicate Dr. Dr. or Doctor Dr. prefixes into single Dr.', () => {
      expect(formatDoctorName('Dr. Dr. Chamod Alwis')).toBe('Dr. Chamod Alwis');
      expect(formatDoctorName('doctor dr. Chamod Alwis')).toBe('Dr. Chamod Alwis');
      expect(formatDoctorName('Doctor Doctor Anura')).toBe('Dr. Anura');
    });

    test('handles "doctor" spelled out in various cases', () => {
      expect(formatDoctorName('Doctor Chamod Alwis')).toBe('Dr. Chamod Alwis');
      expect(formatDoctorName('DOCTOR Chamod Alwis')).toBe('Dr. Chamod Alwis');
    });

    test('handles Dr without dot', () => {
      expect(formatDoctorName('Dr Chamod Alwis')).toBe('Dr. Chamod Alwis');
      expect(formatDoctorName('dr Jane Doe')).toBe('Dr. Jane Doe');
    });

    test('bypasses institutional entities unchanged', () => {
      expect(formatDoctorName('Asiri Laboratory')).toBe('Asiri Laboratory');
      expect(formatDoctorName('General Hospital Colombo')).toBe('General Hospital Colombo');
      expect(formatDoctorName('System Administrator')).toBe('System Administrator');
      expect(formatDoctorName('MediSync Support')).toBe('MediSync Support');
    });

    test('handles empty and fallback values cleanly', () => {
      expect(formatDoctorName('')).toBe('');
      expect(formatDoctorName(null)).toBe('');
      expect(formatDoctorName(undefined)).toBe('');
      expect(formatDoctorName('', 'Attending Physician')).toBe('Dr. Attending Physician');
      expect(formatDoctorName(null, 'Asiri Laboratory')).toBe('Asiri Laboratory');
      expect(formatDoctorName('Dr.')).toBe('Dr. Doctor');
    });

    test('stripDoctorPrefix strips prefixes and preserves valid names starting with Dr', () => {
      expect(stripDoctorPrefix('Dr. Chamod Alwis')).toBe('Chamod Alwis');
      expect(stripDoctorPrefix('Doctor Jane Doe')).toBe('Jane Doe');
      expect(stripDoctorPrefix('Dr. Dr. Chamod Alwis')).toBe('Chamod Alwis');
      expect(stripDoctorPrefix('Drew Barrymore')).toBe('Drew Barrymore');
      expect(stripDoctorPrefix('Drake Graham')).toBe('Drake Graham');
    });
  });

  describe('2. Prototype Banner Environment Gating', () => {
    test('returns null when REACT_APP_SHOW_PROTOTYPE_BANNER is unset', () => {
      delete process.env.REACT_APP_SHOW_PROTOTYPE_BANNER;
      const { container } = render(
        <LanguageProvider>
          <PrototypeNotice />
        </LanguageProvider>
      );
      expect(screen.queryByRole('status')).toBeNull();
      expect(container.firstChild).toBeNull();
    });

    test('returns null when REACT_APP_SHOW_PROTOTYPE_BANNER is false', () => {
      process.env.REACT_APP_SHOW_PROTOTYPE_BANNER = 'false';
      const { container } = render(
        <LanguageProvider>
          <PrototypeNotice />
        </LanguageProvider>
      );
      expect(screen.queryByRole('status')).toBeNull();
      expect(container.firstChild).toBeNull();
    });

    test('renders banner when REACT_APP_SHOW_PROTOTYPE_BANNER is true', () => {
      process.env.REACT_APP_SHOW_PROTOTYPE_BANNER = 'true';
      render(
        <LanguageProvider>
          <PrototypeNotice />
        </LanguageProvider>
      );
      const banner = screen.getByRole('status');
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent(/synthetic data only/i);
    });
  });

  describe('3. Login Accessibility and Form Label Linking', () => {
    test('LoginShell renders error banner with role="alert" and aria-live="assertive"', () => {
      render(
        <LoginShell title="Test Login" subtitle="Sub" error="Invalid credentials">
          <input aria-label="Field" />
        </LoginShell>
      );
      const errorBox = screen.getByRole('alert');
      expect(errorBox).toBeInTheDocument();
      expect(errorBox).toHaveTextContent('Invalid credentials');
      expect(errorBox).toHaveAttribute('aria-live', 'assertive');
    });

    test('DoctorLogin links labels to inputs via htmlFor/id and uses text-slate-300', () => {
      render(
        <MemoryRouter>
          <DoctorLogin />
        </MemoryRouter>
      );

      const emailInput = screen.getByLabelText(/Personal Email/i);
      expect(emailInput).toBeInTheDocument();
      expect(emailInput).toHaveAttribute('id', 'doctor-email');

      const passwordInput = screen.getByLabelText(/Password/i);
      expect(passwordInput).toBeInTheDocument();
      expect(passwordInput).toHaveAttribute('id', 'doctor-password');

      const emailLabel = screen.getByText(/Personal Email/i);
      expect(emailLabel).toHaveClass('text-slate-300');

      const passwordLabel = screen.getByText(/Password/i);
      expect(passwordLabel).toHaveClass('text-slate-300');
    });
  });

  describe('4. WebSocket Teardown Lifecycle Contract', () => {
    test('unmounts NotificationBell detaching socket listeners before disconnect', () => {
      jest.useFakeTimers();
      localStorage.setItem('token', 'synthetic-test-jwt-token');

      const { unmount } = render(
        <MemoryRouter>
          <NotificationBell />
        </MemoryRouter>
      );

      // Advance timers to trigger socket connection
      act(() => {
        jest.advanceTimersByTime(600);
      });

      const callOrder = [];
      mockOff.mockImplementation(() => {
        callOrder.push('socket.off');
      });
      mockDisconnect.mockImplementation(() => {
        callOrder.push('socket.disconnect');
      });

      unmount();

      expect(mockOff).toHaveBeenCalled();
      expect(mockDisconnect).toHaveBeenCalled();
      expect(callOrder).toEqual(['socket.off', 'socket.disconnect']);

      jest.useRealTimers();
    });
  });
});
