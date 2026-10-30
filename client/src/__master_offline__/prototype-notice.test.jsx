import React from 'react';
import { render, screen } from '@testing-library/react';
import PrototypeNotice, { PROTOTYPE_NOTICES } from '../components/common/PrototypeNotice';
import { LanguageProvider } from '../i18n/LanguageContext';

describe('PrototypeNotice Banner Component', () => {
  const originalEnv = process.env.REACT_APP_SHOW_PROTOTYPE_BANNER;

  afterEach(() => {
    process.env.REACT_APP_SHOW_PROTOTYPE_BANNER = originalEnv;
    localStorage.clear();
  });

  test('renders English notice when REACT_APP_SHOW_PROTOTYPE_BANNER is true', () => {
    process.env.REACT_APP_SHOW_PROTOTYPE_BANNER = 'true';
    render(
      <LanguageProvider>
        <PrototypeNotice />
      </LanguageProvider>
    );

    const noticeElement = screen.getByRole('status');
    expect(noticeElement).toBeInTheDocument();
    expect(noticeElement).toHaveTextContent('Prototype: synthetic data only. Not for real patient use.');
  });

  test('renders Sinhala notice when language is si and flag is true', () => {
    process.env.REACT_APP_SHOW_PROTOTYPE_BANNER = 'true';
    localStorage.setItem('medisync_language', 'si');
    render(
      <LanguageProvider>
        <PrototypeNotice />
      </LanguageProvider>
    );

    const noticeElement = screen.getByRole('status');
    expect(noticeElement).toBeInTheDocument();
    expect(noticeElement).toHaveTextContent(PROTOTYPE_NOTICES.si.text);
  });

  test('renders Tamil notice when language is ta and flag is true', () => {
    process.env.REACT_APP_SHOW_PROTOTYPE_BANNER = 'true';
    localStorage.setItem('medisync_language', 'ta');
    render(
      <LanguageProvider>
        <PrototypeNotice />
      </LanguageProvider>
    );

    const noticeElement = screen.getByRole('status');
    expect(noticeElement).toBeInTheDocument();
    expect(noticeElement).toHaveTextContent(PROTOTYPE_NOTICES.ta.text);
  });

  test('returns null and does not mount in document when flag is false or omitted (default)', () => {
    delete process.env.REACT_APP_SHOW_PROTOTYPE_BANNER;
    const { container } = render(
      <LanguageProvider>
        <PrototypeNotice />
      </LanguageProvider>
    );

    expect(screen.queryByRole('status')).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  test('returns null when flag is explicitly set to false', () => {
    process.env.REACT_APP_SHOW_PROTOTYPE_BANNER = 'false';
    const { container } = render(
      <LanguageProvider>
        <PrototypeNotice />
      </LanguageProvider>
    );

    expect(screen.queryByRole('status')).toBeNull();
    expect(container.firstChild).toBeNull();
  });
});
