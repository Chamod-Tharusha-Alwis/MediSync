import React, { useState } from 'react';
import { render, act, fireEvent, screen } from '@testing-library/react';

const mockHandlers = {};
const mockDisconnect = jest.fn();
const mockIoCalls = [];

jest.mock('../components/common/GeographicMap', () => () => <div>Map mock</div>);
jest.mock('socket.io-client', () => ({
  io: (...args) => {
    mockIoCalls.push(args);
    return {
      on: (name, handler) => {
        mockHandlers[name] = handler;
      },
      off: jest.fn(),
      disconnect: mockDisconnect,
    };
  },
}));

import NotificationBell, { NotificationProvider } from '../components/common/NotificationBell';
import api from '../api/axiosInstance';
import { safeDisconnectSocket } from '../utils/safeSocketDisconnect';

jest.mock('../api/axiosInstance', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    put: jest.fn(),
  },
  SOCKET_SERVER_URL: 'https://medisync-wabc.onrender.com',
}));

jest.mock('../utils/safeSocketDisconnect', () => ({
  safeDisconnectSocket: jest.fn(),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
}));

jest.mock('../i18n/LanguageContext', () => ({
  useTranslation: () => ({ t: (_, fallback) => fallback }),
}));

jest.mock('framer-motion', () => ({
  AnimatePresence: ({ children }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }) => <div {...props}>{children}</div>,
  },
}));

const sampleNotification = {
  _id: 'a'.repeat(24),
  message: 'Laboratory results ready',
  read: false,
  createdAt: '2026-10-30T10:00:00.000Z',
  type: 'lab_report_ready',
};

describe('Consolidated Notification Lifecycle (Feature A6)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    api.get.mockReset();
    api.put.mockReset();
    mockIoCalls.length = 0;
    mockDisconnect.mockClear();
    safeDisconnectSocket.mockClear();
    for (const key of Object.keys(mockHandlers)) delete mockHandlers[key];
    api.get.mockResolvedValue({
      data: { data: [sampleNotification], unreadCount: 1 },
    });
    api.put.mockResolvedValue({ data: {} });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('multiple bells inside NotificationProvider share a single fetch and socket lifecycle', async () => {
    localStorage.setItem('token', 'valid_consolidated_test_token');

    const TwoBellsLayout = () => (
      <NotificationProvider>
        <div data-testid="header-bell">
          <NotificationBell />
        </div>
        <div data-testid="sidebar-bell">
          <NotificationBell />
        </div>
      </NotificationProvider>
    );

    await act(async () => {
      render(<TwoBellsLayout />);
    });

    // Exactly 1 network fetch on initial mount despite two bells being mounted
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith('/notifications', expect.any(Object));

    // Advance past 500ms socket timer
    await act(async () => {
      jest.advanceTimersByTime(501);
    });

    // Exactly 1 Socket.IO connection created for the entire shell
    expect(mockIoCalls.length).toBe(1);

    // Both buttons exist and both are rendered
    const bellButtons = screen.getAllByRole('button', { name: 'Notifications' });
    expect(bellButtons.length).toBe(2);
  });

  test('opening and closing mobile drawer (dynamic bell unmount) does NOT teardown socket lifecycle', async () => {
    localStorage.setItem('token', 'valid_consolidated_test_token');

    const ShellWithDrawer = () => {
      const [showDrawer, setShowDrawer] = useState(true);
      return (
        <NotificationProvider>
          <div data-testid="persistent-header-bell">
            <NotificationBell />
          </div>
          {showDrawer && (
            <div data-testid="drawer-bell">
              <NotificationBell />
            </div>
          )}
          <button onClick={() => setShowDrawer(false)}>Close Drawer</button>
        </NotificationProvider>
      );
    };

    await act(async () => {
      render(<ShellWithDrawer />);
    });

    await act(async () => {
      jest.advanceTimersByTime(501);
    });

    expect(mockIoCalls.length).toBe(1);
    expect(safeDisconnectSocket).not.toHaveBeenCalled();

    // Close the drawer (unmounts the second bell)
    await act(async () => {
      fireEvent.click(screen.getByText('Close Drawer'));
    });

    // The shared provider is still alive: socket should NOT be disconnected!
    expect(safeDisconnectSocket).not.toHaveBeenCalled();
    expect(mockDisconnect).not.toHaveBeenCalled();

    // Remaining bell is still in document
    const remainingButtons = screen.getAllByRole('button', { name: 'Notifications' });
    expect(remainingButtons.length).toBe(1);
  });

  test('unmounting the entire NotificationProvider cleanly disconnects the shared socket', async () => {
    localStorage.setItem('token', 'valid_consolidated_test_token');

    let unmountShell;
    await act(async () => {
      const { unmount } = render(
        <NotificationProvider>
          <NotificationBell />
          <NotificationBell />
        </NotificationProvider>
      );
      unmountShell = unmount;
    });

    await act(async () => {
      jest.advanceTimersByTime(501);
    });

    expect(safeDisconnectSocket).not.toHaveBeenCalled();

    // Unmount entire provider
    await act(async () => {
      unmountShell();
    });

    // Now safeDisconnectSocket is invoked once
    expect(safeDisconnectSocket).toHaveBeenCalledTimes(1);
  });

  test('action triggered in one bell updates shared unread state across all bells', async () => {
    api.get.mockResolvedValueOnce({
      data: { data: [sampleNotification], unreadCount: 1 },
    });

    const TwoBells = () => (
      <NotificationProvider>
        <NotificationBell />
        <NotificationBell />
      </NotificationProvider>
    );

    await act(async () => {
      render(<TwoBells />);
    });

    const bells = screen.getAllByRole('button', { name: 'Notifications' });
    // Click the first bell to open dropdown
    fireEvent.click(bells[0]);

    // Mock mark-all-read refresh response (unreadCount: 0)
    api.get.mockResolvedValueOnce({
      data: { data: [{ ...sampleNotification, read: true }], unreadCount: 0 },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Mark all read'));
    });

    expect(api.put).toHaveBeenCalledWith('/notifications/read-all');
    expect(api.get).toHaveBeenCalledTimes(2);
  });
});
