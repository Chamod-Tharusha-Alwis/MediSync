import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import UniversityDemoNotice from '../components/common/UniversityDemoNotice';
import App from '../App';
import UniversityApp from '../UniversityApp';
import { LanguageProvider } from '../i18n/LanguageContext';

jest.mock('react-router-dom', () => ({ BrowserRouter: ({ children }) => <>{children}</>, Routes: () => null, Route: () => null, Navigate: () => null, useLocation: () => ({ pathname: '/' }) }));
jest.mock('../utils/analytics', () => ({ initGA: jest.fn(), usePageTracking: jest.fn() }));
jest.mock('../components/common/NotificationToast', () => () => null);
jest.mock('../components/common/AnimatedBackground', () => () => null);
jest.mock('../components/common/IdleTimer', () => () => null);
jest.mock('../components/BanNotice', () => () => null);
jest.mock('../components/auth/PrivateRoute', () => () => null);

const prior = process.env.REACT_APP_MEDISYNC_UNIVERSITY_DEMO;
afterEach(() => { cleanup(); localStorage.clear(); if (prior === undefined) delete process.env.REACT_APP_MEDISYNC_UNIVERSITY_DEMO; else process.env.REACT_APP_MEDISYNC_UNIVERSITY_DEMO = prior; });

test.each([undefined, 'false', 'TRUE', '1'])('the demo presentation mode requires explicit true, not %s', value => {
  if (value === undefined) delete process.env.REACT_APP_MEDISYNC_UNIVERSITY_DEMO; else process.env.REACT_APP_MEDISYNC_UNIVERSITY_DEMO = value;
  render(<UniversityDemoNotice />); expect(screen.queryByRole('note')).not.toBeInTheDocument();
});

test.each([
  ['en', 'Educational demonstration — synthetic data only', 'Do not enter real personal or medical information.'],
  ['si', 'අධ්‍යාපනික නිරූපණයක් — කෘත්‍රිම දත්ත පමණි', 'සැබෑ පුද්ගලික හෝ වෛද්‍ය තොරතුරු ඇතුළත් නොකරන්න.'],
  ['ta', 'கல்வி விளக்கம் — செயற்கைத் தரவு மட்டுமே', 'உண்மையான தனிப்பட்ட அல்லது மருத்துவத் தகவல்களை உள்ளிட வேண்டாம்.'],
])('the %s notice identifies the synthetic-only non-clinical purpose', (language, title, warning) => {
  process.env.REACT_APP_MEDISYNC_UNIVERSITY_DEMO = 'true'; localStorage.setItem('medisync_language', language);
  render(<LanguageProvider><UniversityDemoNotice /></LanguageProvider>);
  expect(screen.getByRole('note', { name: title })).toHaveAttribute('lang', language);
  expect(screen.getByRole('note')).toHaveTextContent(warning);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('the isolated historical application shell mounts the demo notice and reserves content space', () => {
  process.env.REACT_APP_MEDISYNC_UNIVERSITY_DEMO = 'true';
  const { container } = render(<UniversityApp />);
  expect(screen.getByRole('note')).toHaveTextContent('not for diagnosis, treatment or emergency care');
  expect(container.firstChild).toHaveClass('pb-40');
});

test('the actual application shell preserves its default layout when demo mode is not selected', () => {
  delete process.env.REACT_APP_MEDISYNC_UNIVERSITY_DEMO;
  const { container } = render(<App />);
  expect(screen.queryByRole('note')).not.toBeInTheDocument(); expect(container.firstChild).not.toHaveClass('pb-40');
});

test('production shell never mounts the historical notice even when a development flag is present',()=>{process.env.REACT_APP_MEDISYNC_UNIVERSITY_DEMO='true';render(<App/>);expect(screen.queryByRole('note')).not.toBeInTheDocument();});

test('the notice reserves its measured height, responds to wrapping and restores layout on unmount', () => {
  process.env.REACT_APP_MEDISYNC_UNIVERSITY_DEMO = 'true';
  const root = document.documentElement, property = '--medisync-demo-notice-height';
  const originalProperty = root.style.getPropertyValue(property), originalPadding = root.style.scrollPaddingBottom;
  const previousObserver = global.ResizeObserver;
  let callback, height = 121.4;
  const disconnect = jest.fn(), observe = jest.fn();
  global.ResizeObserver = class { constructor(fn) { callback = fn; } observe(...args) { observe(...args); } disconnect() { disconnect(); } };
  const geometry = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ height }));
  root.style.setProperty(property, '17px'); root.style.scrollPaddingBottom = '23px';
  let unmount;
  try {
    ({ unmount } = render(<UniversityDemoNotice />));
    expect(observe).toHaveBeenCalledWith(screen.getByRole('note'));
    expect(root.style.getPropertyValue(property)).toBe('122px'); expect(root.style.scrollPaddingBottom).toBe('122px');
    height = 179.8; callback();
    expect(root.style.getPropertyValue(property)).toBe('180px'); expect(root.style.scrollPaddingBottom).toBe('180px');
    unmount(); unmount = null;
    expect(disconnect).toHaveBeenCalledTimes(1); expect(root.style.getPropertyValue(property)).toBe('17px'); expect(root.style.scrollPaddingBottom).toBe('23px');
  } finally {
    unmount?.(); geometry.mockRestore(); global.ResizeObserver = previousObserver;
    if (originalProperty) root.style.setProperty(property, originalProperty); else root.style.removeProperty(property);
    root.style.scrollPaddingBottom = originalPadding;
  }
});
