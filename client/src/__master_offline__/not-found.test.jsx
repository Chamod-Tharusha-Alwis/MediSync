import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import App, { ErrorBoundary } from '../App';
import { en } from '../i18n/translations/en';
import { si } from '../i18n/translations/si';
import { ta } from '../i18n/translations/ta';

jest.mock('react-router-dom', () => {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
  const actual = jest.requireActual('react-router');
  return { ...actual, BrowserRouter: ({ children }) => <actual.MemoryRouter initialEntries={[global.window.location.pathname + global.window.location.search]}>{children}</actual.MemoryRouter> };
});
jest.mock('../utils/analytics', () => ({ initGA: jest.fn(), usePageTracking: jest.fn() }));
jest.mock('../components/common/NotificationToast', () => () => null);
jest.mock('../components/common/AnimatedBackground', () => () => null);
jest.mock('../components/common/IdleTimer', () => () => null);
jest.mock('../components/BanNotice', () => () => null);
jest.mock('../pages/Home', () => () => <h1>Home destination</h1>);
jest.mock('../pages/SelectRole', () => () => <h1>Role destination</h1>);
jest.mock('../pages/doctor/Login', () => () => <h1>Existing login destination</h1>);

afterEach(() => { cleanup(); localStorage.clear(); window.history.replaceState({}, '', '/'); });

test.each([['en', en], ['si', si], ['ta', ta]])('real application catchall renders a localized, focused 404 without reflecting input (%s)', async (language, dictionary) => {
  localStorage.setItem('medisync_language', language);
  window.history.replaceState({}, '', '/unknown-path?private=owned-private-sentinel');
  render(<App />);
  const heading = await screen.findByRole('heading', { name: dictionary.notFound.title, level: 1 });
  expect(heading).toHaveFocus();
  expect(document.documentElement.lang).toBe(language);
  expect(screen.getByText(dictionary.notFound.description)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: dictionary.notFound.home })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: dictionary.notFound.signIn })).toHaveAttribute('href', '/select-role');
  expect(document.body.textContent).not.toContain('owned-private-sentinel');
  expect(document.body.textContent).not.toContain('/unknown-path');
  expect(screen.queryByRole('heading', { name: 'Role destination' })).not.toBeInTheDocument();
});

test.each([['home', 'Home destination'], ['signIn', 'Role destination']])('404 recovery link navigates through the actual router (%s)', async (key, destination) => {
  window.history.replaceState({}, '', '/missing');
  render(<App />);
  fireEvent.click(await screen.findByRole('link', { name: en.notFound[key] }));
  expect(await screen.findByRole('heading', { name: destination })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: en.notFound.title })).not.toBeInTheDocument();
});

test('404 language selection updates actual text and persists without navigation or a request', async () => {
  window.history.replaceState({}, '', '/missing');
  render(<App />);
  await screen.findByRole('heading', { name: en.notFound.title });
  fireEvent.click(screen.getByRole('button', { name: 'தமிழ்' }));
  expect(await screen.findByRole('heading', { name: ta.notFound.title })).toBeInTheDocument();
  expect(localStorage.getItem('medisync_language')).toBe('ta');
  expect(document.documentElement.lang).toBe('ta');
  expect(screen.getByRole('button', { name: 'தமிழ்' })).toHaveAttribute('aria-pressed', 'true');
});

test('existing authentication route remains selected instead of the catchall', async () => {
  window.history.replaceState({}, '', '/doctor/login');
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Existing login destination' })).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: en.notFound.title })).not.toBeInTheDocument();
});

test('existing boundary contains a render failure without exposing the exception', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  const Broken = () => { throw Error('owned-private-sentinel'); };
  try {
    render(<ErrorBoundary><Broken /></ErrorBoundary>);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Something went wrong' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Reload Page' })).toHaveAttribute('type', 'button');
    expect(document.body.textContent).not.toContain('owned-private-sentinel');
  } finally { log.mockRestore(); }
});
