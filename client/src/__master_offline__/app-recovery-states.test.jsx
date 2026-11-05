import React from 'react';
import {render, screen, cleanup} from '@testing-library/react';
import App, {ErrorBoundary} from '../App';
import {LanguageProvider} from '../i18n/LanguageContext';
import {en} from '../i18n/translations/en';
import {si} from '../i18n/translations/si';
import {ta} from '../i18n/translations/ta';

jest.mock('react-router-dom', () => {
  const {TextEncoder, TextDecoder} = require('util');
  global.TextEncoder = TextEncoder; global.TextDecoder = TextDecoder;
  const actual = jest.requireActual('react-router');
  return {...actual, BrowserRouter: ({children}) => <actual.MemoryRouter initialEntries={['/']}>{children}</actual.MemoryRouter>};
});
jest.mock('../utils/analytics', () => ({initGA: jest.fn(), usePageTracking: jest.fn()}));
jest.mock('../components/common/NotificationToast', () => () => null);
jest.mock('../components/common/IdleTimer', () => () => null);
jest.mock('../components/BanNotice', () => () => null);
jest.mock('../components/common/AnimatedBackground', () => () => {
  if (global.mockSharedShellFailure) throw Error('owned-private-render-sentinel');
  return null;
});
// A pending route exercises the application's real Suspense fallback.
jest.mock('../pages/Home', () => () => {throw new Promise(() => {});});

beforeEach(() => {global.mockSharedShellFailure = false;});
afterEach(() => {cleanup(); localStorage.clear(); delete global.mockSharedShellFailure;});

test.each([['en', en], ['si', si], ['ta', ta]])('actual app announces its pending route in %s', (locale, dictionary) => {
  localStorage.setItem('medisync_language', locale);
  render(<App />);
  const status = screen.getByRole('status');
  expect(status).toHaveTextContent(dictionary.common.loading);
  expect(status).toHaveAttribute('aria-live', 'polite');
});

test.each([['en', en], ['si', si], ['ta', ta]])('a shared shell render failure is contained by the real app in %s', (locale, dictionary) => {
  localStorage.setItem('medisync_language', locale);
  global.mockSharedShellFailure = true;
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    render(<App />);
    expect(screen.getByRole('heading', {name: dictionary.routeError.title})).toHaveFocus();
    expect(screen.getByText(dictionary.routeError.body)).toBeInTheDocument();
    expect(screen.getByRole('button', {name: dictionary.routeError.reload})).toHaveAttribute('type', 'button');
    expect(document.body.textContent).not.toContain('owned-private-render-sentinel');
    expect(log).toHaveBeenCalledWith('[ErrorBoundary] Runtime render error captured (sanitized operational notice)');
  } finally {log.mockRestore();}
});

test.each([['en', en], ['si', si], ['ta', ta]])('route-only failure focuses its safe recovery heading in %s', (locale, dictionary) => {
  localStorage.setItem('medisync_language', locale);
  const Broken = () => {throw Error('owned-private-render-sentinel');};
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    render(<LanguageProvider><ErrorBoundary><Broken /></ErrorBoundary></LanguageProvider>);
    expect(screen.getByRole('heading', {name: dictionary.routeError.title})).toHaveFocus();
    expect(screen.getByText(dictionary.routeError.body)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('owned-private-render-sentinel');
  } finally {log.mockRestore();}
});
