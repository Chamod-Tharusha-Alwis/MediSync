import React from 'react';
import {act,fireEvent,render,screen} from '@testing-library/react';
import {DoctorRoster} from '../pages/hospital/Dashboard';
import api from '../api/axiosInstance';
import {toast} from 'react-toastify';
jest.mock('../api/axiosInstance',()=>({__esModule:true,default:{get:jest.fn(),post:jest.fn(),put:jest.fn()}}));
jest.mock('react-toastify',()=>({toast:{success:jest.fn(),error:jest.fn()}}));
jest.mock('../i18n/LanguageContext',()=>({useTranslation:()=>({t:(_,fallback)=>fallback})}));
jest.mock('react-router-dom',()=>({useNavigate:()=>jest.fn(),Routes:()=>null,Route:()=>null,Navigate:()=>null}));
jest.mock('../components/common/PageTransition',()=>({children})=><>{children}</>);
jest.mock('../components/common/ActiveOutbreakBanner',()=>()=>null);
jest.mock('../components/common/LanguagePreferenceCard',()=>()=>null);
jest.mock('../components/ui/AppShell',()=>()=>null);
jest.mock('../pages/hospital/LabManagement',()=>()=>null);
beforeEach(()=>{api.get.mockReset().mockResolvedValue({data:{data:[]}});api.post.mockReset().mockResolvedValue({data:{}});toast.success.mockClear();});
test('hospital form identifies and submits actual MediSync doctor ID rather than an SLMC licence',async()=>{
 await act(async()=>render(<DoctorRoster/>));fireEvent.change(screen.getByLabelText('OR MediSync Doctor ID'),{target:{value:' DR-OFFLINE '}});await act(async()=>fireEvent.submit(screen.getByRole('button',{name:'Link Doctor Account'}).closest('form')));expect(api.post).toHaveBeenCalledWith('/hospital/doctors/link',{email:'',doctorId:'DR-OFFLINE'});expect(screen.queryByText('OR SLMC License ID')).not.toBeInTheDocument();
});
test('hospital linking confirms only saved state, never claims invitation delivery',async()=>{
 await act(async()=>render(<DoctorRoster/>));fireEvent.change(screen.getByLabelText('Doctor Registered Email'),{target:{value:'doctor@example.invalid'}});await act(async()=>fireEvent.submit(screen.getByRole('button',{name:'Link Doctor Account'}).closest('form')));expect(api.post).toHaveBeenCalledWith('/hospital/doctors/link',{email:'doctor@example.invalid',doctorId:''});expect(toast.success).toHaveBeenCalledWith('Doctor linked. Invitation delivery is not confirmed.');
});
