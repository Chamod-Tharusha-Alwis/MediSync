import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LanguageProvider, useTranslation } from '../i18n/LanguageContext';
import { getHardwareModel } from '../utils/deviceFingerprint';

function LanguageProbe() {
  const { language, setLanguage } = useTranslation();
  return <><output data-testid="chosen-language">{language}</output><button onClick={() => setLanguage('si')}>Choose language</button></>;
}

let log, warn, error, originalAgentData;
beforeEach(() => {
  localStorage.clear();
  originalAgentData = Object.getOwnPropertyDescriptor(navigator, 'userAgentData');
  log = jest.spyOn(console, 'log').mockImplementation(() => {});
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  error = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  if (originalAgentData) Object.defineProperty(navigator, 'userAgentData', originalAgentData);
  else delete navigator.userAgentData;
  localStorage.clear();
});

test('denied preference storage preserves the in-memory language without logging raw errors', () => {
  render(<LanguageProvider><LanguageProbe /></LanguageProvider>);
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('SYNTHETIC_PRIVATE_STORAGE_DETAIL'); });
  fireEvent.click(screen.getByRole('button', { name: 'Choose language' }));
  expect(screen.getByTestId('chosen-language')).toHaveTextContent('si');
  expect(warn).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
});

test('available preference storage still saves the selected language', () => {
  render(<LanguageProvider><LanguageProbe /></LanguageProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Choose language' }));
  expect(screen.getByTestId('chosen-language')).toHaveTextContent('si');
  expect(localStorage.getItem('medisync_language')).toBe('si');
  expect(warn).not.toHaveBeenCalled();
});

test('optional hardware rejection keeps the existing null fallback without logging device details', async () => {
  Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: {
    getHighEntropyValues: jest.fn().mockRejectedValue(Error('SYNTHETIC_PRIVATE_DEVICE_DETAIL'))
  } });
  await expect(getHardwareModel()).resolves.toBeNull();
  expect(warn).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
  expect(log).not.toHaveBeenCalled();
});

test('available optional hardware metadata preserves the existing model result', async () => {
  Object.defineProperty(navigator, 'userAgentData', { configurable: true, value: {
    getHighEntropyValues: jest.fn().mockResolvedValue({ model: 'SyntheticModelOnly' })
  } });
  await expect(getHardwareModel()).resolves.toBe('SyntheticModelOnly');
  expect(warn).not.toHaveBeenCalled();
});
