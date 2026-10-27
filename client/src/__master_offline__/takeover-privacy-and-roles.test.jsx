import React from 'react';
import {render,screen,cleanup} from '@testing-library/react';
import {initGA,usePageTracking} from '../utils/analytics';
import PrivateRoute from '../components/auth/PrivateRoute';
import PharmacyDashboard from '../pages/pharmacy/Dashboard';
import ReactGA from 'react-ga4';
import {requiresWriteReconciliation} from '../utils/clinicalSaveOutcome';
jest.mock('react-ga4',()=>({initialize:jest.fn(),send:jest.fn()}));
jest.mock('react-router-dom',()=>({Navigate:({to})=><span>{to}</span>,Outlet:()=> <span>Permitted portal</span>,Routes:()=>null,Route:()=>null}));
jest.mock('../api/axiosInstance',()=>({get:jest.fn(),post:jest.fn()}));
jest.mock('../i18n/LanguageContext',()=>({useTranslation:()=>({t:(_key,fallback)=>fallback})}));
jest.mock('../components/common/ActiveOutbreakBanner',()=>()=>null);
jest.mock('../components/ui/AppShell',()=>({menuItems,children})=><div>{menuItems.map(x=><span key={x.path}>{x.label}</span>)}{children}</div>);
afterEach(()=>{cleanup();localStorage.clear();jest.clearAllMocks();});
test.each([{}, {response:{status:503}}, {response:{status:500}}, {response:{status:400,data:{error:'TRANSACTION_OUTCOME_UNKNOWN'}}}])('uncertain clinical write is held for reconciliation (%p)',error=>expect(requiresWriteReconciliation(error)).toBe(true));
test.each([400,401,403,409])('definitive %s rejection does not assert an unknown commit',status=>expect(requiresWriteReconciliation({response:{status}})).toBe(false));
test('clinical application cannot initialize analytics or transmit location/title metadata',()=>{
  document.title='synthetic-sensitive-title';window.history.replaceState({},'', '/patient/record/synthetic?nic=private');
  function Probe(){usePageTracking();return null;}initGA();render(<Probe/>);
  expect(ReactGA.initialize).not.toHaveBeenCalled();expect(ReactGA.send).not.toHaveBeenCalled();
});
test('assistant session may enter pharmacy portal but not doctor portal',()=>{
  localStorage.setItem('token','offline-session');localStorage.setItem('role','assistant');
  render(<PrivateRoute allowedRoles={['pharmacist','pharmacy_admin','assistant']}/>);expect(screen.getByText('Permitted portal')).toBeInTheDocument();cleanup();
  render(<PrivateRoute allowedRoles={['doctor']}/>);expect(screen.queryByText('Permitted portal')).not.toBeInTheDocument();expect(screen.getByText('/pharmacy/dashboard')).toBeInTheDocument();
});
test.each(['assistant','pharmacist','pharmacy_admin'])('%s gets only permitted dispensing navigation',role=>{
  localStorage.setItem('role',role);render(<PharmacyDashboard/>);
  expect(Boolean(screen.queryByText('Manual OTC'))).toBe(role!=='assistant');
  expect(Boolean(screen.queryByText('Dispense'))).toBe(role!=='assistant');
  expect(screen.getByText('Settings')).toBeInTheDocument();
});
