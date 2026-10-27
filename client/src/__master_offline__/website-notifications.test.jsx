import React from 'react';
import {act,fireEvent,render,screen} from '@testing-library/react';
import NotificationBell from '../components/common/NotificationBell';
import api from '../api/axiosInstance';
import {clearLocalSession} from '../utils/sessionCleanup';
const mockHandlers={};
const mockDisconnect=jest.fn();
jest.mock('../api/axiosInstance',()=>({__esModule:true,default:{get:jest.fn(),put:jest.fn()},SOCKET_SERVER_URL:'http://127.0.0.1:3100'}));
jest.mock('socket.io-client',()=>({io:()=>({on:(name,handler)=>{mockHandlers[name]=handler;},disconnect:mockDisconnect})}));
jest.mock('react-router-dom',()=>({useNavigate:()=>jest.fn()}));
jest.mock('../i18n/LanguageContext',()=>({useTranslation:()=>({t:(_,fallback)=>fallback})}));
jest.mock('framer-motion',()=>({AnimatePresence:({children})=><>{children}</>,motion:{div:({children,initial,animate,exit,transition,...props})=><div {...props}>{children}</div>}}));
const row={_id:'a'.repeat(24),message:'SYNTHETIC previous-session notice',read:false,createdAt:'2026-10-22T00:00:00Z',type:'general'};
beforeEach(()=>{jest.useFakeTimers();localStorage.clear();api.get.mockReset();api.put.mockReset();mockDisconnect.mockClear();api.get.mockResolvedValue({data:{data:[],unreadCount:0}});api.put.mockResolvedValue({data:{}});for(const key of Object.keys(mockHandlers))delete mockHandlers[key];});
afterEach(()=>jest.useRealTimers());
test('a delayed prior-session notification cannot repopulate after session clearing',async()=>{
 let resolve;api.get.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));render(<NotificationBell/>);clearLocalSession();await act(async()=>resolve({data:{data:[row],unreadCount:1}}));fireEvent.click(screen.getAllByRole('button')[0]);expect(screen.queryByText(row.message)).not.toBeInTheDocument();
});
test('failed notification fetch is visible rather than a false no-notifications success',async()=>{
 api.get.mockRejectedValueOnce(Error('private driver detail'));await act(async()=>render(<NotificationBell/>));fireEvent.click(screen.getAllByRole('button')[0]);expect(screen.getByRole('alert')).toBeInTheDocument();expect(screen.queryByText(/private driver detail/)).not.toBeInTheDocument();
});
test('malformed successful notification DTO cannot crash the dropdown',async()=>{
 api.get.mockResolvedValueOnce({data:{data:null,unreadCount:0}});await act(async()=>render(<NotificationBell/>));fireEvent.click(screen.getAllByRole('button')[0]);expect(screen.getByRole('alert')).toBeInTheDocument();
});
test('mark-all refreshes authoritative count instead of assuming an unchanged server',async()=>{
 api.get.mockResolvedValue({data:{data:[row],unreadCount:101}});await act(async()=>render(<NotificationBell/>));fireEvent.click(screen.getAllByRole('button')[0]);await act(async()=>fireEvent.click(screen.getByText('Mark all read')));expect(api.put).toHaveBeenCalledWith('/notifications/read-all');expect(api.get).toHaveBeenCalledTimes(2);
});
test('a stale socket logout cannot clear a newly established session',async()=>{
 localStorage.setItem('token','old-offline-session');await act(async()=>render(<NotificationBell/>));await act(async()=>jest.advanceTimersByTime(501));const oldHandler=mockHandlers.force_logout;expect(oldHandler).toBeDefined();clearLocalSession();localStorage.setItem('token','new-offline-session');await act(async()=>oldHandler({message:'old socket'}));expect(localStorage.getItem('token')).toBe('new-offline-session');
});

test('unmount aborts its pending fetch, disconnects its socket and stops poll retries',async()=>{
 let resolve;
 api.get.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));
 localStorage.setItem('token','owned-offline-token');
 const {unmount}=render(<NotificationBell/>);
 const signal=api.get.mock.calls[0][1].signal;
 await act(async()=>jest.advanceTimersByTime(501));
 unmount();expect(signal.aborted).toBe(true);expect(mockDisconnect).toHaveBeenCalledTimes(1);
 await act(async()=>resolve({data:{data:[row],unreadCount:1}}));
 await act(async()=>jest.advanceTimersByTime(60001));
 expect(api.get).toHaveBeenCalledTimes(1);
 expect(screen.queryByText(row.message)).not.toBeInTheDocument();
});
