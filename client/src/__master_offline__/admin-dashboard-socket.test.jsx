import React from 'react';
import { render, act } from '@testing-library/react';

const mockCalls = [];

jest.mock('../components/common/GeographicMap', () => () => <div>Map mock</div>);
jest.mock('socket.io-client', () => ({
  __esModule: true,
  io: (url, opts) => {
    mockCalls.push({ url, opts });
    return {
      on: () => {},
      off: () => {},
      disconnect: () => {},
    };
  },
}));

import api from '../api/axiosInstance';
import { safeDisconnectSocket } from '../utils/safeSocketDisconnect';
import AdminDashboard from '../pages/admin/Dashboard';

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
});
