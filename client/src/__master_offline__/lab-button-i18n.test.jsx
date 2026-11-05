import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import LabManagement from '../pages/hospital/LabManagement';
import { LanguageProvider } from '../i18n/LanguageContext';

// Mock API instance
jest.mock('../api/axiosInstance', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({ data: [] }),
    post: jest.fn().mockResolvedValue({ data: {} }),
  },
}));

// Mock react-toastify
jest.mock('react-toastify', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
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

describe('Item U5: Hospital Lab Verification Button i18n Evaluation', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  const renderComponentWithLang = (lang = 'en') => {
    localStorage.setItem('medisync_language', lang);
    return render(
      <LanguageProvider>
        <LabManagement />
      </LanguageProvider>
    );
  };

  test('1. [EN] Submit button must evaluate translation expression and not render raw "{t(" string', () => {
    const { container } = renderComponentWithLang('en');
    const submitBtn = container.querySelector('button[type="submit"]');

    expect(submitBtn).toBeInTheDocument();
    // Must NOT contain verbatim string literal syntax
    expect(submitBtn.textContent).not.toContain('{t(');
    expect(submitBtn.textContent).not.toContain('t("');
    // Must render evaluated translation for common.verify ("Verify")
    expect(submitBtn.textContent).toMatch(/Verify/i);
  });

  test('2. [SI] Submit button must evaluate Sinhala translation and not render raw "{t(" string', () => {
    const { container } = renderComponentWithLang('si');
    const submitBtn = container.querySelector('button[type="submit"]');

    expect(submitBtn).toBeInTheDocument();
    expect(submitBtn.textContent).not.toContain('{t(');
    expect(submitBtn.textContent).not.toContain('t("');
    // In si.js common.verify is "සත්‍යාපනය කරන්න"
    expect(submitBtn.textContent).toContain('සත්‍යාපනය කරන්න');
  });

  test('3. [TA] Submit button must evaluate Tamil translation and not render raw "{t(" string', () => {
    const { container } = renderComponentWithLang('ta');
    const submitBtn = container.querySelector('button[type="submit"]');

    expect(submitBtn).toBeInTheDocument();
    expect(submitBtn.textContent).not.toContain('{t(');
    expect(submitBtn.textContent).not.toContain('t("');
    // In ta.js common.verify is "சரிபார்க்கவும்"
    expect(submitBtn.textContent).toContain('சரிபார்க்கவும்');
  });

  test('4. [EN] Loading state evaluates translation expression without raw text', async () => {
    const api = require('../api/axiosInstance').default;
    let resolvePost;
    api.post.mockImplementationOnce(() => new Promise((resolve) => { resolvePost = resolve; }));

    const { container } = renderComponentWithLang('en');
    const nicInput = container.querySelector('input[type="text"]');
    const submitBtn = container.querySelector('button[type="submit"]');

    fireEvent.change(nicInput, { target: { value: '200012345678' } });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    // During loading, text must not contain literal {t( and should render requesting text
    expect(submitBtn.textContent).not.toContain('{t(');
    expect(submitBtn.textContent).toMatch(/Requesting Consent OTP/i);

    // Cleanup pending promise
    await act(async () => {
      resolvePost({ data: { message: 'OTP sent' } });
    });
  });

  test('5. [SI] Loading state evaluates Sinhala translation without raw text', async () => {
    const api = require('../api/axiosInstance').default;
    let resolvePost;
    api.post.mockImplementationOnce(() => new Promise((resolve) => { resolvePost = resolve; }));

    const { container } = renderComponentWithLang('si');
    const nicInput = container.querySelector('input[type="text"]');
    const submitBtn = container.querySelector('button[type="submit"]');

    fireEvent.change(nicInput, { target: { value: '200012345678' } });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(submitBtn.textContent).not.toContain('{t(');
    expect(submitBtn.textContent).toContain('කැමැත්ත OTP ඉල්ලමින් පවතී...');

    await act(async () => {
      resolvePost({ data: { message: 'OTP sent' } });
    });
  });

  test('6. [TA] Loading state evaluates Tamil translation without raw text', async () => {
    const api = require('../api/axiosInstance').default;
    let resolvePost;
    api.post.mockImplementationOnce(() => new Promise((resolve) => { resolvePost = resolve; }));

    const { container } = renderComponentWithLang('ta');
    const nicInput = container.querySelector('input[type="text"]');
    const submitBtn = container.querySelector('button[type="submit"]');

    fireEvent.change(nicInput, { target: { value: '200012345678' } });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(submitBtn.textContent).not.toContain('{t(');
    expect(submitBtn.textContent).toContain('ஒப்புதல் OTP கோரப்படுகிறது...');

    await act(async () => {
      resolvePost({ data: { message: 'OTP sent' } });
    });
  });
});
