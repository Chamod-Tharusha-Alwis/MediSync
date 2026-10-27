import React from 'react';
import { render, screen } from '@testing-library/react';
import PrototypeNotice, { PROTOTYPE_NOTICES } from '../components/common/PrototypeNotice';
import { LanguageProvider, LanguageContext } from '../i18n/LanguageContext';

describe('PrototypeNotice Banner Component', () => {
  const originalEnv = process.env.REACT_APP_PROTOTYPE_MODE;

  afterEach(() => {
    process.env.REACT_APP_PROTOTYPE_MODE = originalEnv;
  });

  test('renders English notice by default', () => {
    process.env.REACT_APP_PROTOTYPE_MODE = 'true';
    render(
      <LanguageProvider>
        <PrototypeNotice />
      </LanguageProvider>
    );

    const noticeElement = screen.getByRole('status');
    expect(noticeElement).toBeInTheDocument();
    expect(noticeElement).toHaveTextContent('Prototype: synthetic data only. Not for real patient use.');
  });

  test('renders Sinhala notice when language is si', () => {
    process.env.REACT_APP_PROTOTYPE_MODE = 'true';
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

  test('renders Tamil notice when language is ta', () => {
    process.env.REACT_APP_PROTOTYPE_MODE = 'true';
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

  test('renders unconditionally even if legacy prototype flag is modified', () => {
    delete process.env.REACT_APP_PROTOTYPE_MODE;
    render(
      <LanguageProvider>
        <PrototypeNotice />
      </LanguageProvider>
    );

    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
