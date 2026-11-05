import React from 'react';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import HistoryErrorBoundary from '../components/common/HistoryErrorBoundary';
import {LanguageProvider} from '../i18n/LanguageContext';
import {en} from '../i18n/translations/en';
import {si} from '../i18n/translations/si';
import {ta} from '../i18n/translations/ta';

const Broken=()=>{throw Error('owned-private-history-sentinel');};
afterEach(()=>{cleanup();localStorage.clear();jest.restoreAllMocks();});
test('the history boundary logs only its fixed notice, never the original exception',()=>{
  jest.spyOn(console,'error').mockImplementation(()=>{});
  const warn=jest.spyOn(console,'warn').mockImplementation(()=>{});
  render(<HistoryErrorBoundary><Broken/></HistoryErrorBoundary>);
  expect(warn.mock.calls).toEqual([['[HistoryErrorBoundary] Captured render error in medical history panel (sanitized notice)']]);
  expect(document.body.textContent).not.toContain('owned-private-history-sentinel');
});

test.each([['en',en],['si',si],['ta',ta]])('history fallback remains contained, localized and operable in %s',(locale,dictionary)=>{
  localStorage.setItem('medisync_language',locale);
  jest.spyOn(console,'error').mockImplementation(()=>{});jest.spyOn(console,'warn').mockImplementation(()=>{});
  const proceed=jest.fn();
  render(<LanguageProvider><HistoryErrorBoundary onProceed={proceed}><Broken/></HistoryErrorBoundary></LanguageProvider>);
  const alert=screen.getByRole('alert');expect(alert).toHaveTextContent(dictionary.historyError.title);expect(alert).toHaveTextContent(dictionary.historyError.body);
  const button=screen.getByRole('button',{name:dictionary.historyError.proceed});button.focus();expect(button).toHaveFocus();fireEvent.click(button);expect(proceed).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).not.toContain('owned-private-history-sentinel');
});
