import React from 'react';
import {render,screen,waitFor,fireEvent,act,cleanup} from '@testing-library/react';
import {usePublicDirectory} from '../api/usePublicDirectory';
import DirectoryLoadError from '../components/common/DirectoryLoadError';
import api from '../api/axiosInstance';
jest.mock('../api/axiosInstance',()=>({get:jest.fn()}));
jest.mock('../i18n/LanguageContext',()=>({useTranslation:()=>({t:(_key,fallback)=>fallback})}));
function Probe({endpoint='/public/doctors'}){const {records,loading,error,retry}=usePublicDirectory(endpoint);return error?<DirectoryLoadError retry={retry}/>:loading?<span>Loading</span>:<span>{records.length?records.map(x=>x.name).join(','):'Empty directory'}</span>;}
afterEach(()=>{cleanup();jest.resetAllMocks();});
test('service failure is not rendered as an empty successful directory; explicit retry can recover',async()=>{
  api.get.mockRejectedValueOnce(Error('inert unavailable')).mockResolvedValueOnce({data:{data:[]}});
  render(<Probe/>);expect(await screen.findByRole('alert')).toHaveTextContent('Directory unavailable');expect(screen.queryByText('Empty directory')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Try again'}));expect(await screen.findByText('Empty directory')).toBeInTheDocument();expect(api.get).toHaveBeenCalledTimes(2);
});
test.each([null,{},'invalid'])('malformed directory DTO %p produces a recoverable error',async payload=>{
  api.get.mockResolvedValue({data:{data:payload}});render(<Probe/>);expect(await screen.findByRole('alert')).toBeInTheDocument();
});
test('an old request cannot replace a new directory after navigation',async()=>{
  let old;api.get.mockImplementationOnce(()=>new Promise(r=>{old=r;})).mockResolvedValueOnce({data:{data:[{name:'New directory'}]}});
  const view=render(<Probe/>);view.rerender(<Probe endpoint='/public/hospitals'/>);expect(await screen.findByText('New directory')).toBeInTheDocument();
  await act(async()=>{old({data:{data:[{name:'Stale directory'}]}});});expect(screen.queryByText('Stale directory')).not.toBeInTheDocument();
});
