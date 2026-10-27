import React from 'react';
import {render,screen,cleanup} from '@testing-library/react';
import {isActivePrescription,patientDashboardTimeline} from '../utils/patientPrescriptionStatus';
import {Overview} from '../pages/patient/Dashboard';
jest.mock('react-router-dom',()=>({useNavigate:()=>jest.fn(),Routes:()=>null,Route:()=>null,Navigate:()=>null}));
jest.mock('../i18n/LanguageContext',()=>({useTranslation:()=>({t:(_key,fallback)=>fallback})}));
jest.mock('../api/axiosInstance',()=>({get:jest.fn()}));
jest.mock('../pages/patient/History',()=>()=>null);
jest.mock('../pages/patient/Profile',()=>()=>null);
jest.mock('../pages/patient/Support',()=>()=>null);
jest.mock('../components/common/ActiveOutbreakBanner',()=>()=>null);
jest.mock('../components/common/PageTransition',()=>({children,...props})=><div {...props}>{children}</div>);
afterEach(cleanup);
test('dashboard includes doctor prescriptions embedded in consultations, deduplicated with standalone events',()=>{
 const rx={_id:'owned-doctor-rx',status:'issued'},otc={_id:'owned-otc-rx',status:'dispensed'};
 const result=patientDashboardTimeline([{type:'consultation',data:{_id:'owned-consultation',prescriptions:[rx]}},{type:'prescription',data:rx},{type:'prescription',data:otc}]);
 expect(result.prescriptions).toEqual([rx,otc]);expect(result.consultations).toHaveLength(1);
});
test.each([{},[{type:'prescription',data:null}],[{type:'consultation',data:{prescriptions:{}}}]])('invalid timeline DTO fails visibly instead of showing no medicines (%p)',data=>expect(()=>patientDashboardTimeline(data)).toThrow());
test.each(['pending','issued'])('%s prescription remains visible until expiry',status=>expect(isActivePrescription({status,expiresAt:'2030-01-01'},Date.parse('2026-01-01'))).toBe(true));
test.each(['dispensed','cancelled','expired','ready_for_pickup',undefined])('%s is not an eligible prescription state',status=>expect(isActivePrescription({status,expiresAt:'2030-01-01'},Date.parse('2026-01-01'))).toBe(false));
test.each([undefined,'not-a-date','2025-01-01','2026-01-01'])('invalid or elapsed expiry %s is not active',expiresAt=>expect(isActivePrescription({status:'issued',expiresAt},Date.parse('2026-01-01'))).toBe(false));
test('actual patient overview displays issued medicines without claiming pharmacy pickup readiness',()=>{
 render(<Overview data={{patient:{fullName:'Synthetic Patient'},prescriptions:[{_id:'owned-rx',status:'issued',expiresAt:'2070-01-01',drugName:'Future issued medicine'}],consultations:[]}}/>);
 expect(screen.getByText('Future issued medicine')).toBeInTheDocument();expect(screen.getByText('Awaiting dispensing')).toBeInTheDocument();expect(screen.queryByText('Ready to pickup')).not.toBeInTheDocument();
});
