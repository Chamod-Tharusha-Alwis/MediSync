import React from 'react';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import {
  evaluatePasswordStrength,
  getUtf8ByteLength,
  passwordAccepted,
  PASSWORD_REQUIREMENTS,
  MAX_BYTES,
  MIN_LENGTH,
} from '../utils/passwordPolicy';

import PasswordInput from '../components/common/PasswordInput';
import PasswordStrengthMeter from '../components/common/PasswordStrengthMeter';
import PasswordCriteriaTips from '../components/common/PasswordCriteriaTips';
import PasswordField from '../components/common/PasswordField';
import ForgotPassword from '../pages/public/ForgotPassword';
import ResetPassword from '../pages/public/ResetPassword';
import ChangePasswordCard from '../components/common/ChangePasswordCard';
import api from '../api/axiosInstance';

jest.mock('../api/axiosInstance', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    put: jest.fn(),
    get: jest.fn(),
  },
}));

jest.mock('react-toastify', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('Phase 5 (AUTH): Client Password UX & Policy Offline Suite', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('1. passwordPolicy utility', () => {
    test('calculates UTF-8 byte length correctly for ASCII and multi-byte unicode', () => {
      expect(getUtf8ByteLength('Hello123!')).toBe(9);
      expect(getUtf8ByteLength('')).toBe(0);
      // '€' is 3 bytes in UTF-8
      expect(getUtf8ByteLength('€')).toBe(3);
      // 24 euros = 72 bytes
      expect(getUtf8ByteLength('€'.repeat(24))).toBe(72);
      expect(getUtf8ByteLength('€'.repeat(25))).toBe(75);
    });

    test('evaluates password strength scoring and requirement checklist', () => {
      // Too short (<12 chars) -> score 0
      const short = evaluatePasswordStrength('Ab1!short');
      expect(short.score).toBe(0);
      expect(short.valid).toBe(false);
      expect(short.requirements.minLength).toBe(false);

      // Exceeds 72 bytes -> score 0, valid false
      const over72 = evaluatePasswordStrength('A'.repeat(73));
      expect(over72.score).toBe(0);
      expect(over72.valid).toBe(false);
      expect(over72.label).toBe('Invalid length');

      // Valid 12+ chars with 3 character classes (Upper, Lower, Number) -> score 3, Good
      const goodPw = evaluatePasswordStrength('ClinicalPass123');
      expect(goodPw.score).toBe(3);
      expect(goodPw.valid).toBe(true);
      expect(goodPw.label).toBe('Good');

      // Valid 12+ chars with all 4 classes -> score 4, Strong
      const strongPw = evaluatePasswordStrength('ClinicalPass123!');
      expect(strongPw.score).toBe(4);
      expect(strongPw.valid).toBe(true);
      expect(strongPw.label).toBe('Strong');

      expect(passwordAccepted(strongPw)).toBe(true);
      expect(passwordAccepted(short)).toBe(false);
    });
  });

  describe('2. PasswordInput accessible show/hide toggle', () => {
    test('toggles input type between password and text with accessible ARIA attributes', () => {
      render(<PasswordInput id="test-password" value="secret" onChange={() => {}} placeholder="Enter password" />);
      
      const input = screen.getByPlaceholderText('Enter password');
      expect(input).toHaveAttribute('type', 'password');

      const toggleButton = screen.getByRole('button', { name: /show credentials/i });
      expect(toggleButton).toHaveAttribute('aria-pressed', 'false');
      expect(toggleButton).toHaveAttribute('aria-controls', 'test-password');

      // Click to show password
      fireEvent.click(toggleButton);
      expect(input).toHaveAttribute('type', 'text');
      expect(screen.getByRole('button', { name: /hide credentials/i })).toHaveAttribute('aria-pressed', 'true');

      // Click to hide password again
      fireEvent.click(toggleButton);
      expect(input).toHaveAttribute('type', 'password');
      expect(toggleButton).toHaveAttribute('aria-pressed', 'false');
    });

    test('supports Space and Enter key keyboard toggles on show/hide button', () => {
      render(<PasswordInput id="kb-password" value="secret" onChange={() => {}} />);
      const toggleBtn = screen.getByRole('button', { name: /show credentials/i });

      // Space key
      fireEvent.keyDown(toggleBtn, { key: ' ' });
      expect(screen.getByRole('button', { name: /hide credentials/i })).toBeInTheDocument();

      // Enter key
      fireEvent.keyDown(screen.getByRole('button', { name: /hide credentials/i }), { key: 'Enter' });
      expect(screen.getByRole('button', { name: /show credentials/i })).toBeInTheDocument();
    });
  });

  describe('3. PasswordStrengthMeter & PasswordCriteriaTips accessibility', () => {
    test('renders progressbar with accessible 5-tier values and label', () => {
      const evaluation = evaluatePasswordStrength('ClinicalPass123!');
      render(<PasswordStrengthMeter evaluation={evaluation} />);

      const progressbar = screen.getByRole('progressbar');
      expect(progressbar).toHaveAttribute('aria-valuenow', '4');
      expect(progressbar).toHaveAttribute('aria-valuemin', '0');
      expect(progressbar).toHaveAttribute('aria-valuemax', '4');
      expect(progressbar).toHaveAttribute('aria-valuetext', 'Strong');
      expect(screen.getByText('Strong')).toBeInTheDocument();
    });

    test('PasswordCriteriaTips exposes aria-live="polite" and aria-atomic="true"', () => {
      const evaluation = evaluatePasswordStrength('short');
      render(<PasswordCriteriaTips evaluation={evaluation} />);

      const liveRegion = screen.getByRole('region', { name: /password requirement status/i });
      expect(liveRegion).toHaveAttribute('aria-live', 'polite');
      expect(liveRegion).toHaveAttribute('aria-atomic', 'true');

      expect(screen.getByText(/at least 12 characters/i)).toBeInTheDocument();
      expect(screen.getByText(/uppercase letter/i)).toBeInTheDocument();
    });

    test('PasswordField composite links input to criteria with aria-describedby', () => {
      render(<PasswordField id="composite-pw" value="" onChange={() => {}} label="New Password" />);
      const input = screen.getByLabelText(/new password/i);
      expect(input).toHaveAttribute('aria-describedby');
      const describedBy = input.getAttribute('aria-describedby');
      expect(describedBy).toContain('composite-pw-criteria');
    });
  });

  describe('4. ForgotPassword public recovery view', () => {
    test('renders role selector, submits request, and transitions to anti-enumeration confirmation', async () => {
      api.post.mockResolvedValueOnce({
        data: {
          success: true,
          message: 'If an account exists, instructions have been sent',
        },
      });

      render(
        <MemoryRouter initialEntries={['/forgot-password?role=doctor']}>
          <Routes>
            <Route path="/forgot-password" element={<ForgotPassword defaultRole="doctor" />} />
          </Routes>
        </MemoryRouter>
      );

      // Pre-selects doctor role from query param
      const roleSelect = screen.getByLabelText(/account portal \/ role|role/i);
      expect(roleSelect).toHaveValue('doctor');

      const emailInput = screen.getByLabelText(/registered email/i);
      fireEvent.change(emailInput, { target: { value: 'doctor@hospital.org' } });

      const submitBtn = screen.getByRole('button', { name: /send recovery link/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/auth/forgot-password', {
          email: 'doctor@hospital.org',
          role: 'doctor',
        });
      });

      expect(await screen.findByText(/recovery instructions sent/i)).toBeInTheDocument();
      expect(screen.getByText(/secure password reset link has been dispatched/i)).toBeInTheDocument();
    });

    test('displays countdown timer when server returns 429 rate limit', async () => {
      api.post.mockRejectedValueOnce({
        response: {
          status: 429,
          data: {
            retryAfterSeconds: 45,
            error: 'Too many requests',
          },
        },
      });

      render(
        <MemoryRouter initialEntries={['/forgot-password']}>
          <Routes>
            <Route path="/forgot-password" element={<ForgotPassword />} />
          </Routes>
        </MemoryRouter>
      );

      const emailInput = screen.getByLabelText(/registered email/i);
      fireEvent.change(emailInput, { target: { value: 'spam@hospital.org' } });

      fireEvent.click(screen.getByRole('button', { name: /send recovery link/i }));

      expect(await screen.findByText(/too many requests/i)).toBeInTheDocument();
      expect(screen.getByText(/please wait 45 seconds/i)).toBeInTheDocument();
    });
  });

  describe('5. ResetPassword token verification view', () => {
    test('shows invalid token error screen when token query parameter is missing or invalid length', () => {
      render(
        <MemoryRouter initialEntries={['/reset-password?token=invalid_token']}>
          <Routes>
            <Route path="/reset-password" element={<ResetPassword />} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText(/invalid or expired reset link/i)).toBeInTheDocument();
      expect(screen.getByText(/request new recovery link/i)).toBeInTheDocument();
    });

    test('renders reset form and submits when token is a valid 64-char hex string', async () => {
      const validToken = 'a'.repeat(64);
      api.post.mockResolvedValueOnce({
        data: {
          success: true,
          message: 'Password reset successful',
        },
      });

      render(
        <MemoryRouter initialEntries={[`/reset-password?token=${validToken}`]}>
          <Routes>
            <Route path="/reset-password" element={<ResetPassword token={validToken} />} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByRole('heading', { name: /set new password/i })).toBeInTheDocument();
      const newPwInput = screen.getByPlaceholderText('Enter new password (min 12 chars)');
      fireEvent.change(newPwInput, { target: { value: 'ValidPass123!@#' } });

      const confirmPwInput = screen.getByPlaceholderText('Re-enter new password');
      fireEvent.change(confirmPwInput, { target: { value: 'ValidPass123!@#' } });

      const submitBtn = screen.getByRole('button', { name: /update password & sign in|reset password/i });
      expect(submitBtn).not.toBeDisabled();

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/auth/reset-password', {
          token: validToken,
          newPassword: 'ValidPass123!@#',
        });
      });

      expect(await screen.findByText(/password updated!/i)).toBeInTheDocument();
    });
  });

  describe('6. ChangePasswordCard authenticated profile rotation', () => {
    test('validates current password, password policy, and submits rotation request', async () => {
      api.post.mockResolvedValueOnce({
        data: {
          success: true,
          message: 'Password changed successfully',
        },
      });

      render(<ChangePasswordCard />);

      const currentPwInput = screen.getByLabelText(/current password/i);
      const newPwInput = screen.getByLabelText(/^new password/i);
      const confirmPwInput = screen.getByLabelText(/confirm new password/i);

      fireEvent.change(currentPwInput, { target: { value: 'OldPassword123!' } });
      fireEvent.change(newPwInput, { target: { value: 'NewClinicalPass123!' } });
      fireEvent.change(confirmPwInput, { target: { value: 'NewClinicalPass123!' } });

      const rotateBtn = screen.getByRole('button', { name: /rotate password/i });
      expect(rotateBtn).not.toBeDisabled();

      fireEvent.click(rotateBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/auth/change-password', {
          currentPassword: 'OldPassword123!',
          newPassword: 'NewClinicalPass123!',
        });
      });

      // Inputs should be reset on success
      await waitFor(() => {
        expect(currentPwInput.value).toBe('');
      });
    });

    test('prevents submission when new password and confirm password do not match', () => {
      render(<ChangePasswordCard />);

      const currentPwInput = screen.getByLabelText(/current password/i);
      const newPwInput = screen.getByLabelText(/^new password/i);
      const confirmPwInput = screen.getByLabelText(/confirm new password/i);

      fireEvent.change(currentPwInput, { target: { value: 'OldPassword123!' } });
      fireEvent.change(newPwInput, { target: { value: 'NewClinicalPass123!' } });
      fireEvent.change(confirmPwInput, { target: { value: 'DifferentPassword123!' } });

      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
      const rotateBtn = screen.getByRole('button', { name: /rotate password/i });
      expect(rotateBtn).toBeDisabled();
    });
  });
});
