import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import fs from 'fs';
import path from 'path';
import PasswordStrengthMeter from '../components/common/PasswordStrengthMeter';
import ChangeOrgPassword from '../pages/doctor/ChangeOrgPassword';
import { MemoryRouter } from 'react-router-dom';
import { LanguageProvider } from '../i18n/LanguageContext';
import { en } from '../i18n/translations/en';
import { si } from '../i18n/translations/si';
import { ta } from '../i18n/translations/ta';

// Mock axios instance for ChangeOrgPassword
jest.mock('../api/axiosInstance', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
  },
}));

describe('Item U3: Password Strength Meter Visible Fill & Accessibility', () => {
  describe('1. PasswordStrengthMeter Component', () => {
    test('fills at least 1 segment with bg-rose-600 when password is non-empty with score 0 (e.g. "abc")', () => {
      const { container } = render(<PasswordStrengthMeter password="abc" />);
      const segments = container.querySelectorAll('.grid > div');
      expect(segments).toHaveLength(4);

      // In buggy code: index < score (0 < 0) -> false -> renders bg-slate-800
      // Expected: At least 1 segment visibly fills with bg-rose-600
      expect(segments[0].className).toContain('bg-rose-600');
      expect(segments[0].className).not.toContain('bg-slate-800');
      expect(segments[1].className).toContain('bg-slate-800');
      expect(segments[2].className).toContain('bg-slate-800');
      expect(segments[3].className).toContain('bg-slate-800');
    });

    test('exposes accessible progressbar role, aria values and labels', () => {
      render(<PasswordStrengthMeter password="abc" />);
      const meter = screen.getByRole('progressbar');
      expect(meter).toHaveAttribute('aria-valuenow', '0');
      expect(meter).toHaveAttribute('aria-valuemin', '0');
      expect(meter).toHaveAttribute('aria-valuemax', '4');
      expect(meter).toHaveAttribute('aria-valuetext', 'Very Weak');
      expect(screen.getByText('Password Strength')).toBeInTheDocument();
      expect(screen.getByText('Very Weak')).toBeInTheDocument();
    });

    test('fills segments proportionally for scores 1 through 4', () => {
      // Score 1 (12 chars, lower only): 1 segment filled
      const { container: c1 } = render(<PasswordStrengthMeter password="abcdefghijkl" />);
      const segs1 = c1.querySelectorAll('.grid > div');
      expect(segs1[0].className).toContain('bg-rose-600');
      expect(segs1[1].className).toContain('bg-slate-800');

      // Score 2 (12 chars, upper + lower)
      const { container: c2 } = render(<PasswordStrengthMeter password="Abcdefghijkl" />);
      const segs2 = c2.querySelectorAll('.grid > div');
      expect(segs2[0].className).toContain('bg-rose-600');
      expect(segs2[1].className).toContain('bg-amber-500');
      expect(segs2[2].className).toContain('bg-slate-800');

      // Score 4 (strong)
      const { container: c4 } = render(<PasswordStrengthMeter password="ClinicalPass123!" />);
      const segs4 = c4.querySelectorAll('.grid > div');
      expect(segs4[0].className).toContain('bg-emerald-500');
      expect(segs4[1].className).toContain('bg-emerald-500');
      expect(segs4[2].className).toContain('bg-emerald-500');
      expect(segs4[3].className).toContain('bg-emerald-500');
    });

    test('renders null when password is empty and no evaluation provided', () => {
      const { container } = render(<PasswordStrengthMeter password="" />);
      expect(container.firstChild).toBeNull();
    });

    test('renders translated strength labels in Sinhala and Tamil', () => {
      // Sinhala
      localStorage.setItem('medisync_language', 'si');
      const { unmount: unmountSi } = render(
        <LanguageProvider>
          <PasswordStrengthMeter password="abc" />
        </LanguageProvider>
      );
      expect(screen.getByText('මුරපදයේ ශක්තිය')).toBeInTheDocument();
      expect(screen.getByText('ඉතා දුර්වල')).toBeInTheDocument();
      const siMeter = screen.getByRole('progressbar');
      expect(siMeter).toHaveAttribute('aria-valuetext', 'ඉතා දුර්වල');
      unmountSi();

      // Tamil
      localStorage.setItem('medisync_language', 'ta');
      const { unmount: unmountTa } = render(
        <LanguageProvider>
          <PasswordStrengthMeter password="abc" />
        </LanguageProvider>
      );
      expect(screen.getByText('கடவுச்சொல் வலிமை')).toBeInTheDocument();
      expect(screen.getByText('மிகவும் பலவீனமானது')).toBeInTheDocument();
      const taMeter = screen.getByRole('progressbar');
      expect(taMeter).toHaveAttribute('aria-valuetext', 'மிகவும் பலவீனமானது');
      unmountTa();

      localStorage.removeItem('medisync_language');
    });
  });

  describe('2. ChangeOrgPassword Strength Meter & Accessibility', () => {
    test('meter has role="progressbar", accessible attributes, and fills at least 1 bar on short password', () => {
      render(
        <MemoryRouter initialEntries={['/doctor/change-org-password?orgLoginId=test-org']}>
          <ChangeOrgPassword />
        </MemoryRouter>
      );

      // Initially no password entered, meter not visible
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

      // Enter short password "abc"
      const newPwInput = screen.getByPlaceholderText(/enter new password/i);
      const { fireEvent } = require('@testing-library/react');
      fireEvent.change(newPwInput, { target: { value: 'abc' } });

      // Meter should now be visible with progressbar role
      const meter = screen.getByRole('progressbar');
      expect(meter).toBeInTheDocument();
      expect(meter).toHaveAttribute('aria-valuenow', '0');
      expect(meter).toHaveAttribute('aria-valuemin', '0');
      expect(meter).toHaveAttribute('aria-valuemax', '4');
      expect(meter).toHaveAttribute('aria-valuetext', 'Very Weak');

      // At least 1 bar must visibly fill (not all bg-slate-700)
      const bars = meter.querySelectorAll('.flex.gap-1 > div');
      expect(bars).toHaveLength(4);
      expect(bars[0].className).not.toContain('bg-slate-700');
    });
  });

  describe('3. Undefined Tailwind Classes Removal', () => {
    const targetFiles = [
      'client/src/components/common/PasswordStrengthMeter.jsx',
      'client/src/pages/auth/Register.jsx',
      'client/src/pages/hospital/Register.jsx',
      'client/src/pages/doctor/Register.jsx',
      'client/src/pages/patient/Register.jsx',
      'client/src/pages/pharmacy/Register.jsx',
      'client/src/pages/doctor/ChangeOrgPassword.jsx',
    ];

    const forbiddenPatterns = [
      /text-slate-350\b/,
      /text-slate-355\b/,
      /bg-slate-850\b/,
      /bg-slate-855\b/,
      /duration-350\b/,
    ];

    test('no target file contains undefined classes', () => {
      const rootDir = path.resolve(__dirname, '../../..');
      const violations = [];

      for (const relPath of targetFiles) {
        const fullPath = path.join(rootDir, relPath);
        expect(fs.existsSync(fullPath)).toBe(true);
        const content = fs.readFileSync(fullPath, 'utf8');

        for (const pattern of forbiddenPatterns) {
          if (pattern.test(content)) {
            violations.push(`${relPath} matches ${pattern}`);
          }
        }
      }

      expect(violations).toEqual([]);
    });
  });

  describe('4. Translation Keys in en.js, si.js, and ta.js', () => {
    test('password strength keys exist in all three locales', () => {
      const requiredAuthKeys = [
        'passwordStrength',
        'veryWeak',
        'weak',
        'fair',
        'good',
        'strong',
      ];

      for (const key of requiredAuthKeys) {
        expect(en.auth).toHaveProperty(key);
        expect(si.auth).toHaveProperty(key);
        expect(ta.auth).toHaveProperty(key);

        expect(typeof en.auth[key]).toBe('string');
        expect(typeof si.auth[key]).toBe('string');
        expect(typeof ta.auth[key]).toBe('string');

        expect(en.auth[key].length).toBeGreaterThan(0);
        expect(si.auth[key].length).toBeGreaterThan(0);
        expect(ta.auth[key].length).toBeGreaterThan(0);
      }
    });
  });
});
