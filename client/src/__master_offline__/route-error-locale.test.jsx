import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../App';
import { LanguageProvider, useTranslation } from '../i18n/LanguageContext';
import { en } from '../i18n/translations/en';
import { si } from '../i18n/translations/si';
import { ta } from '../i18n/translations/ta';

jest.mock('../utils/analytics', () => ({ initGA: jest.fn(), usePageTracking: jest.fn() }));
jest.mock('../components/common/NotificationToast', () => () => null);
jest.mock('../components/common/AnimatedBackground', () => () => null);
jest.mock('../components/common/IdleTimer', () => () => null);
jest.mock('../components/BanNotice', () => () => null);

const labels={en:['Something went wrong','Reload Page'],si:['යම් දෝෂයක් සිදු විය','පිටුව නැවත පූරණය කරන්න'],ta:['ஏதோ தவறு ஏற்பட்டது','பக்கத்தை மீண்டும் ஏற்றவும்']};
function Broken(){ throw Error('inert-private-error-not-for-display'); }
afterEach(()=>{cleanup();localStorage.clear();jest.restoreAllMocks();});
test.each(['en','si','ta'])('real route error boundary displays the selected %s locale and never the exception body',lang=>{
  localStorage.setItem('medisync_language',lang);jest.spyOn(console,'error').mockImplementation(()=>{});
  render(<LanguageProvider><ErrorBoundary><Broken/></ErrorBoundary></LanguageProvider>);
  expect(screen.getByRole('heading',{name:labels[lang][0]})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:labels[lang][1]})).toBeInTheDocument();
  expect(screen.queryByText(/inert-private-error/)).not.toBeInTheDocument();
});
const leaves=(node,prefix='',out={})=>{for(const [key,value] of Object.entries(node)){const full=prefix+key;if(value&&typeof value==='object')leaves(value,full+'.',out);else out[full]=value;}return out;};
test('all three actual dictionaries have exactly the same nonempty string keys',()=>{
  const baseline=Object.keys(leaves(en)).sort();
  for(const dictionary of [en,si,ta]){const values=leaves(dictionary);expect(Object.keys(values).sort()).toEqual(baseline);expect(Object.values(values).every(value=>typeof value==='string'&&value.trim().length>0)).toBe(true);}
});
function LocaleControl(){const {language,setLanguage,t}=useTranslation();return <><span data-testid="locale">{language}</span><button onClick={()=>setLanguage('ta')}>Tamil</button><span>{t('inert.missing.key','Safe fallback')}</span></>;}
test('the real language provider persists selection, updates document language and restores on remount',()=>{
  const first=render(<LanguageProvider><LocaleControl/></LanguageProvider>);fireEvent.click(screen.getByRole('button',{name:'Tamil'}));
  expect(screen.getByTestId('locale')).toHaveTextContent('ta');expect(localStorage.getItem('medisync_language')).toBe('ta');expect(document.documentElement.lang).toBe('ta');
  first.unmount();render(<LanguageProvider><LocaleControl/></LanguageProvider>);expect(screen.getByTestId('locale')).toHaveTextContent('ta');expect(screen.getByText('Safe fallback')).toBeInTheDocument();
});
test('a render failure in a locale preserves the warning to verify an interrupted save before retrying',()=>{
  localStorage.setItem('medisync_language','en');jest.spyOn(console,'error').mockImplementation(()=>{});
  render(<LanguageProvider><ErrorBoundary><Broken/></ErrorBoundary></LanguageProvider>);
  expect(screen.getByText(/verify its outcome before submitting again/i)).toBeInTheDocument();
});
test('changing language after a crash updates the actual recovery labels without exposing the failure',()=>{
  jest.spyOn(console,'error').mockImplementation(()=>{});
  render(<LanguageProvider><LocaleControl/><ErrorBoundary><Broken/></ErrorBoundary></LanguageProvider>);
  fireEvent.click(screen.getByRole('button',{name:'Tamil'}));
  expect(screen.getByRole('heading',{name:labels.ta[0]})).toBeInTheDocument();
  expect(screen.queryByText(/inert-private-error/)).not.toBeInTheDocument();
});
