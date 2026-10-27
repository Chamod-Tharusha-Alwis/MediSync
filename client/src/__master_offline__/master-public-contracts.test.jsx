import React from 'react';
import {render,screen,waitFor,fireEvent,cleanup} from '@testing-library/react';
import {trustedMapEmbedUrl} from '../utils/trustedMapEmbed';
import {selectDoctorWorkspace} from '../utils/doctorWorkspace';
import PublicHealth from '../pages/public/PublicHealth';
import api from '../api/axiosInstance';
import DoctorProfileModal from '../pages/public/DoctorProfileModal';
jest.mock('../api/axiosInstance',()=>({get:jest.fn(),post:jest.fn()}));
jest.mock('../components/common/PublicNavbar',()=>()=>null);
jest.mock('../components/common/PageTransition',()=>({children})=><div>{children}</div>);
jest.mock('../i18n/LanguageContext',()=>({useTranslation:()=>({t:(_key,fallback)=>fallback})}));
jest.mock('react-leaflet',()=>({MapContainer:()=>null,GeoJSON:()=>null}));
jest.mock('recharts',()=>({AreaChart:()=>null,Area:()=>null,XAxis:()=>null,Tooltip:()=>null,ResponsiveContainer:()=>null}));
beforeEach(()=>{jest.clearAllMocks();localStorage.clear();global.fetch=jest.fn().mockResolvedValue({json:async()=>({type:'FeatureCollection',features:[]})});});
afterEach(cleanup);
test.each(['https://untrusted.invalid/embed','javascript:bad()/embed','http://www.google.com/maps/embed','https://www.google.com.untrusted.invalid/embed','https://user:pass@maps.google.com/maps/embed'])('untrusted map URL %s is never an iframe source',value=>expect(trustedMapEmbedUrl(value)).toBe(''));
test('approved HTTPS Google map embed is retained',()=>expect(trustedMapEmbedUrl('https://www.google.com/maps/embed?pb=synthetic')).toBe('https://www.google.com/maps/embed?pb=synthetic'));
test('hospital selection uses the authenticated login address instead of the first organization',()=>{
 const first={orgEmail:'first@example.invalid',isActive:true},second={orgEmail:'second@example.invalid',isActive:true};expect(selectDoctorWorkspace([first,second],'SECOND@example.invalid')).toBe(second);expect(()=>selectDoctorWorkspace([first,second],'personal@example.invalid')).toThrow();expect(()=>selectDoctorWorkspace([{...second,isActive:false}],'second@example.invalid')).toThrow();
});
test('public-health API uses the configured backend client; unmount aborts its owned request',async()=>{
 api.get.mockRejectedValue(Error('inert unavailable service'));const {unmount}=render(<PublicHealth/>);await screen.findByText('Failed to load health statistics.');const call=api.get.mock.calls.find(row=>row[0]==='/public/health-stats');expect(call).toBeDefined();expect(call[1].signal.aborted).toBe(false);unmount();expect(call[1].signal.aborted).toBe(true);
});
test('review service failure is visible and cannot become an empty-review success',async()=>{
 localStorage.setItem('role','patient');api.get.mockRejectedValue(Error('inert unavailable service'));render(<DoctorProfileModal doctor={{_id:'000000000000000000000001',fullName:'Synthetic Doctor'}} onClose={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'Patient Feedback'}));await waitFor(()=>expect(screen.getByRole('alert')).toBeInTheDocument());expect(screen.getByRole('link',{name:/Review a verified visit/})).toHaveAttribute('href','/patient/dashboard/history');expect(api.post).not.toHaveBeenCalled();
});
