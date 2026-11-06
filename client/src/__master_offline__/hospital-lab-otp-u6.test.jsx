import React from 'react';
import { render, fireEvent, act, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import LabManagement from '../pages/hospital/LabManagement';
import { LanguageProvider } from '../i18n/LanguageContext';
import api from '../api/axiosInstance';
import { toast } from 'react-toastify';

// Mock API instance
jest.mock('../api/axiosInstance', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({ data: [] }),
    post: jest.fn(),
  },
}));

// Mock react-toastify
jest.mock('react-toastify', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock framer-motion
jest.mock('framer-motion', () => ({
  AnimatePresence: ({ children }) => <>{children}</>,
  motion: {
    div: ({ children, initial, animate, exit, transition, variants, ...props }) => <div {...props}>{children}</div>,
    button: ({ children, initial, animate, exit, transition, variants, ...props }) => <button {...props}>{children}</button>,
  },
}));

describe('Item U6: Hospital Lab OTP Request Throttle & Cooldown Hardening', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  const renderComponent = (lang = 'en') => {
    localStorage.setItem('medisync_language', lang);
    return render(
      <LanguageProvider>
        <LabManagement />
      </LanguageProvider>
    );
  };

  test('1. Zero calls to /lab/hospital/request-otp on initial mount', () => {
    renderComponent('en');
    const otpCalls = api.post.mock.calls.filter((c) => c[0] === '/lab/hospital/request-otp');
    expect(otpCalls).toHaveLength(0);
  });

  test('2. Rapid double-click on Send Verification OTP calls endpoint exactly once', async () => {
    let resolvePost;
    api.post.mockImplementation((url) => {
      if (url === '/lab/hospital/request-otp') {
        return new Promise((resolve) => {
          resolvePost = resolve;
        });
      }
      return Promise.resolve({ data: {} });
    });

    const { container } = renderComponent('en');
    const nicInput = container.querySelector('input[type="text"]');
    const submitBtn = container.querySelector('button[type="submit"]');

    fireEvent.change(nicInput, { target: { value: '200012345678' } });

    // Rapid double/triple click
    await act(async () => {
      fireEvent.click(submitBtn);
      fireEvent.click(submitBtn);
      fireEvent.click(submitBtn);
    });

    const otpCalls = api.post.mock.calls.filter((c) => c[0] === '/lab/hospital/request-otp');
    expect(otpCalls).toHaveLength(1);

    // Resolve post to complete cleanly
    await act(async () => {
      resolvePost({ data: { patientName: 'John Perera', patientEmail: 'john@example.com' } });
    });
  });

  test('3. Button disabled during cooldown after successful OTP send', async () => {
    jest.useFakeTimers();

    api.post.mockImplementation((url) => {
      if (url === '/lab/hospital/request-otp') {
        return Promise.resolve({
          data: {
            patientName: 'John Perera',
            patientEmail: 'john@example.com',
            retryAfterSeconds: 60,
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    const { container } = renderComponent('en');
    const nicInput = container.querySelector('input[type="text"]');
    const submitBtn = container.querySelector('button[type="submit"]');

    fireEvent.change(nicInput, { target: { value: '200012345678' } });

    await act(async () => {
      fireEvent.click(submitBtn);
    });

    // We are now in step 'otp'. The resend button in OtpInput should show cooldown and be disabled
    const resendBtn = screen.getByRole('button', { name: /Wait 60s before resending/i });
    expect(resendBtn).toBeInTheDocument();
    expect(resendBtn).toBeDisabled();

    // Advance 1 second
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByRole('button', { name: /Wait 59s before resending/i })).toBeDisabled();

    jest.useRealTimers();
  });

  test('4. HTTP 429 triggers countdown from retryAfterSeconds and displays localized warning in EN', async () => {
    jest.useFakeTimers();

    api.post.mockImplementation((url) => {
      if (url === '/lab/hospital/request-otp') {
        const error = new Error('Too many requests');
        error.response = {
          status: 429,
          data: {
            message: 'Too many OTP requests',
            retryAfterSeconds: 45,
          },
        };
        return Promise.reject(error);
      }
      return Promise.resolve({ data: {} });
    });

    const { container } = renderComponent('en');
    const nicInput = container.querySelector('input[type="text"]');
    const submitBtn = container.querySelector('button[type="submit"]');

    fireEvent.change(nicInput, { target: { value: '200012345678' } });

    await act(async () => {
      fireEvent.click(submitBtn);
    });

    // Should show toast error with server seconds
    expect(toast.error).toHaveBeenCalledWith('Too many requests. Please wait 45 seconds.');

    // Step stays 'nic', submit button must be disabled and show cooldown
    expect(submitBtn).toBeDisabled();
    expect(submitBtn.textContent).toContain('Wait 45s before resending');

    // Advance 5 seconds
    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(submitBtn.textContent).toContain('Wait 40s before resending');

    jest.useRealTimers();
  });

  test('5. Localized 429 message and cooldown in Sinhala (SI) and Tamil (TA)', async () => {
    jest.useFakeTimers();

    api.post.mockImplementation((url) => {
      if (url === '/lab/hospital/request-otp') {
        const error = new Error('Too many requests');
        error.response = {
          status: 429,
          data: {
            retryAfterSeconds: 30,
          },
        };
        return Promise.reject(error);
      }
      return Promise.resolve({ data: {} });
    });

    // Test SI
    const { container: siContainer, unmount: siUnmount } = renderComponent('si');
    const siNicInput = siContainer.querySelector('input[type="text"]');
    const siSubmitBtn = siContainer.querySelector('button[type="submit"]');
    fireEvent.change(siNicInput, { target: { value: '200012345678' } });
    await act(async () => {
      fireEvent.click(siSubmitBtn);
    });
    expect(toast.error).toHaveBeenCalledWith('ඉල්ලීම් ගණන වැඩියි. කරුණාකර තත්පර 30ක් රැඳී සිටින්න.');
    expect(siSubmitBtn.textContent).toContain('නැවත යැවීමට පෙර තත්පර 30ක් රැඳී සිටින්න');
    siUnmount();

    // Test TA
    const { container: taContainer, unmount: taUnmount } = renderComponent('ta');
    const taNicInput = taContainer.querySelector('input[type="text"]');
    const taSubmitBtn = taContainer.querySelector('button[type="submit"]');
    fireEvent.change(taNicInput, { target: { value: '200012345678' } });
    await act(async () => {
      fireEvent.click(taSubmitBtn);
    });
    expect(toast.error).toHaveBeenCalledWith('அதிகப்படியான கோரிக்கைகள். தயவுசெய்து 30 வினாடிகள் காத்திருக்கவும்.');
    expect(taSubmitBtn.textContent).toContain('மீண்டும் அனுப்புவதற்கு முன் 30 வினாடிகள் காத்திருக்கவும்');
    taUnmount();

    jest.useRealTimers();
  });

  test('6. Unmounting RegisterNewTest clears countdown interval without leak', async () => {
    jest.useFakeTimers();
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

    api.post.mockImplementation((url) => {
      if (url === '/lab/hospital/request-otp') {
        return Promise.resolve({
          data: {
            patientName: 'Jane Doe',
            patientEmail: 'jane@example.com',
            retryAfterSeconds: 60,
          },
        });
      }
      return Promise.resolve({ data: {} });
    });

    const { container, unmount } = renderComponent('en');
    const nicInput = container.querySelector('input[type="text"]');
    const submitBtn = container.querySelector('button[type="submit"]');
    fireEvent.change(nicInput, { target: { value: '200012345678' } });

    await act(async () => {
      fireEvent.click(submitBtn);
    });

    // Unmount while cooldown timer is running
    act(() => {
      unmount();
    });

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
    jest.useRealTimers();
  });
});
