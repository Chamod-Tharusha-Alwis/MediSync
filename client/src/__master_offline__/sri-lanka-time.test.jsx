import React from 'react';
import {act,fireEvent,render,screen} from '@testing-library/react';
import {formatSriLankaDateTime,formatSriLankaDate,formatCalendarDate} from '../utils/sriLankaTime';
import NotificationBell from '../components/common/NotificationBell';
import api from '../api/axiosInstance';
const server=require('../../../server/src/utils/sriLankaTime');
jest.mock('../api/axiosInstance',()=>({__esModule:true,default:{get:jest.fn(),put:jest.fn()},SOCKET_SERVER_URL:'https://example.invalid'}));
jest.mock('socket.io-client',()=>({io:()=>({on:jest.fn(),off:jest.fn(),disconnect:jest.fn()})}));
jest.mock('react-router-dom',()=>({useNavigate:()=>jest.fn()}));
jest.mock('../i18n/LanguageContext',()=>({useTranslation:()=>({t:(_,fallback)=>fallback})}));
const instant='2026-11-04T17:36:43.000Z';
test('UI displays the reported login instant in Sri Lanka time, not host local time',()=>{
  expect(formatSriLankaDateTime(instant)).toBe('11/4/2026, 11:06:43 PM (Sri Lanka time, UTC+05:30)');
});
test('UI date rollover and calendar-date semantics do not change UTC data',()=>{
  const d=new Date('2026-11-04T20:00:00.000Z');
  expect(formatSriLankaDateTime(d)).toBe('11/5/2026, 1:30:00 AM (Sri Lanka time, UTC+05:30)');
  expect(formatSriLankaDate(d)).toBe('11/5/2026 (Sri Lanka time, UTC+05:30)');
  expect(d.toISOString()).toBe('2026-11-04T20:00:00.000Z');
  expect(formatCalendarDate('2026-11-04')).toBe('11/4/2026');
});
test.each(['en-US','si-LK','ta-LK'])('client and server use the same explicit timezone contract for %s',locale=>{
  expect(formatSriLankaDateTime(instant,locale)).toBe(server.formatSriLankaDateTime(instant,locale));
  expect(formatSriLankaDate('2026-12-31T20:00:00Z',locale)).toBe(server.formatSriLankaDate('2026-12-31T20:00:00Z',locale));
});
test.each([undefined,null,'',{},[],true,'invalid','2026-11-04T20:00:00','2026-02-30'])('bad or zone-ambiguous UI dates do not crash (%#)',value=>{
  expect(formatSriLankaDateTime(value)).toBe('—');
});
test('actual notification dropdown renders a zoned absolute timestamp with the UTC machine value',async()=>{
  localStorage.clear();api.get.mockResolvedValue({data:{data:[{_id:'a'.repeat(24),message:'Synthetic notification',read:false,createdAt:instant,type:'general'}],unreadCount:1}});
  const view=render(<NotificationBell/>);await act(async()=>{});
  fireEvent.click(screen.getByRole('button',{name:'Notifications'}));
  expect(screen.getByText('11/4/2026, 11:06:43 PM (Sri Lanka time, UTC+05:30)')).toHaveAttribute('dateTime',instant);
  expect(view.container.querySelector('time').textContent).toContain('UTC+05:30');
  view.unmount();
});
