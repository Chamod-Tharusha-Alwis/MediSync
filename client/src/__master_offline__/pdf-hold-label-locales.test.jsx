import React from 'react';
import {render,screen,cleanup,fireEvent} from '@testing-library/react';
import LabReportDownloadButton from '../components/common/LabReportDownloadButton';
import {LanguageProvider} from '../i18n/LanguageContext';
import {en} from '../i18n/translations/en';
import {si} from '../i18n/translations/si';
import {ta} from '../i18n/translations/ta';
afterEach(()=>{cleanup();localStorage.clear();});
test.each([['en',en],['si',si],['ta',ta]])('the real held PDF control uses its registered %s label and stays disabled', (locale,dictionary)=>{
  localStorage.setItem('medisync_language',locale);
  render(<LanguageProvider><LabReportDownloadButton labTests={[{id:'inert-test-only'}]}/></LanguageProvider>);
  const button=screen.getByRole('button',{name:dictionary.patient.pdfUnavailable});
  expect(button).toBeDisabled();expect(button).toHaveAttribute('aria-disabled','true');
  fireEvent.click(button);expect(button).toBeDisabled();
});
