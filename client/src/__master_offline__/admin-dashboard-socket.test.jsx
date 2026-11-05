import React from 'react';
import { render, act } from '@testing-library/react';

const mockCalls = [];

jest.mock('../components/common/GeographicMap', () => () => <div>Map mock</div>);
jest.mock('socket.io-client', () => ({
  __esModule: true,
  io: (url, opts) => {
    const handlers = {};
    const socket = {
      on: (name, handler) => { handlers[name] = handler; },
      off: () => {},
      disconnect: () => {},
    };
    mockCalls.push({ url, opts, socket, handlers });
    return socket;
  },
}));

import api from '../api/axiosInstance';
import { safeDisconnectSocket } from '../utils/safeSocketDisconnect';
import AdminDashboard from '../pages/admin/Dashboard';
import { toast } from 'react-toastify';

jest.mock('react-toastify', () => ({toast: {error: jest.fn(), info: jest.fn()}}));

jest.mock('../api/axiosInstance', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
  SOCKET_SERVER_URL: 'https://medisync-wabc.onrender.com',
}));

jest.mock('../utils/safeSocketDisconnect', () => ({
  safeDisconnectSocket: jest.fn(),
}));

jest.mock('react-router-dom', () => ({
  Routes: ({ children }) => <div>{children}</div>,
  Route: () => null,
  Navigate: () => null,
  NavLink: ({ children }) => <div>{children}</div>,
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: '/admin/dashboard' }),
}));

jest.mock('../i18n/LanguageContext', () => ({
  useTranslation: () => ({ t: (k, def) => def || k }),
}));

jest.mock('framer-motion', () => ({
  AnimatePresence: ({ children }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
    button: ({ children, ...props }) => <button {...props}>{children}</button>,
    aside: ({ children, ...props }) => <aside {...props}>{children}</aside>,
  },
}));

jest.mock('../components/ui/AppShell', () => ({
  __esModule: true,
  default: ({ children }) => <div data-testid="app-shell">{children}</div>,
}));

describe('Admin Dashboard Socket Auth Guard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    mockCalls.length = 0;
    safeDisconnectSocket.mockClear();
    toast.error.mockClear();
    toast.info.mockClear();
    api.get.mockResolvedValue({ data: { stats: {}, users: [], alerts: [] } });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('does not initiate socket connection when token is absent', async () => {
    await act(async () => {
      render(<AdminDashboard />);
    });

    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    expect(mockCalls.length).toBe(0);
  });

  test('does not initiate socket connection when token is literal string "undefined"', async () => {
    localStorage.setItem('token', 'undefined');

    await act(async () => {
      render(<AdminDashboard />);
    });

    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    expect(mockCalls.length).toBe(0);
  });

  test('does not initiate socket connection when token is literal string "null"', async () => {
    localStorage.setItem('token', 'null');

    await act(async () => {
      render(<AdminDashboard />);
    });

    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    expect(mockCalls.length).toBe(0);
  });

  test('initiates socket connection with valid token and safely disconnects on unmount', async () => {
    localStorage.setItem('token', 'valid_admin_jwt_token');

    let unmountFn;
    await act(async () => {
      const { unmount } = render(<AdminDashboard />);
      unmountFn = unmount;
    });

    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    expect(mockCalls.length).toBe(1);
    expect(mockCalls[0].url).toBe('https://medisync-wabc.onrender.com');
    expect(mockCalls[0].opts.auth).toEqual({ token: 'valid_admin_jwt_token' });

    await act(async () => {
      unmountFn();
    });

    expect(safeDisconnectSocket).toHaveBeenCalledTimes(1);
  });
  test('session clear before delayed initialization cancels the admin socket', async () => {
    localStorage.setItem('token', 'inert-only-admin-session');
    const {unmount} = render(<AdminDashboard />);
    await act(async () => {
      window.dispatchEvent(new Event('medisync:session-cleared'));
      jest.advanceTimersByTime(1000);
    });
    expect(mockCalls).toHaveLength(0);
    expect(safeDisconnectSocket).not.toHaveBeenCalled();
    unmount();
  });
  test('session clear disconnects the connected admin socket exactly once, including later unmount', async () => {
    localStorage.setItem('token', 'inert-only-admin-session');
    const {unmount} = render(<AdminDashboard />);
    await act(async () => { jest.advanceTimersByTime(600); });
    expect(mockCalls).toHaveLength(1);
    await act(async () => {
      window.dispatchEvent(new Event('medisync:session-cleared'));
      window.dispatchEvent(new Event('medisync:session-cleared'));
    });
    expect(safeDisconnectSocket).toHaveBeenCalledTimes(1);
    expect(safeDisconnectSocket).toHaveBeenCalledWith(mockCalls[0].socket);
    unmount();
    expect(safeDisconnectSocket).toHaveBeenCalledTimes(1);
  });
  test('queued admin alert callbacks cannot update the page after session cleanup', async () => {
    localStorage.setItem('token', 'inert-only-admin-session');
    const {unmount} = render(<AdminDashboard />);
    await act(async () => { jest.advanceTimersByTime(600); });
    await act(async () => { mockCalls[0].handlers.broadcast_message({message: 'Synthetic notification'}); });
    expect(toast.info).toHaveBeenCalledTimes(1);
    await act(async () => {
      window.dispatchEvent(new Event('medisync:session-cleared'));
      mockCalls[0].handlers.broadcast_message({message: 'Synthetic notification'});
      mockCalls[0].handlers.outbreak_alert({message: 'Synthetic notification'});
    });
    expect(toast.info).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
    unmount();
  });
  test('unmount removes its session listener and cannot restart or disconnect another session', async () => {
    localStorage.setItem('token', 'inert-only-admin-session');
    const remove = jest.spyOn(window, 'removeEventListener');
    const {unmount} = render(<AdminDashboard />);
    await act(async () => { jest.advanceTimersByTime(600); });
    unmount();
    expect(remove).toHaveBeenCalledWith('medisync:session-cleared', expect.any(Function));
    window.dispatchEvent(new Event('medisync:session-cleared'));
    expect(safeDisconnectSocket).toHaveBeenCalledTimes(1);
    expect(mockCalls).toHaveLength(1);
    remove.mockRestore();
  });
});
