import { safeDisconnectSocket } from '../utils/safeSocketDisconnect';

describe('safeDisconnectSocket', () => {
  test('handles null and undefined without throwing', () => {
    expect(() => safeDisconnectSocket(null)).not.toThrow();
    expect(() => safeDisconnectSocket(undefined)).not.toThrow();
  });

  test('immediately disconnects a standard socket with no underlying WebSocket', () => {
    const mockOff = jest.fn();
    const mockDisconnect = jest.fn();
    const socket = {
      off: mockOff,
      disconnect: mockDisconnect,
    };

    safeDisconnectSocket(socket);
    expect(mockOff).toHaveBeenCalledTimes(1);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  test('defers disconnect when WebSocket is in CONNECTING state (readyState 0)', () => {
    const mockOff = jest.fn();
    const mockDisconnect = jest.fn();
    const listeners = {};
    const mockWs = {
      readyState: 0, // WebSocket.CONNECTING
      addEventListener: jest.fn((event, handler) => {
        listeners[event] = handler;
      }),
    };

    const socket = {
      off: mockOff,
      disconnect: mockDisconnect,
      io: {
        skipReconnect: false,
        engine: {
          transport: {
            ws: mockWs,
          },
        },
      },
    };

    safeDisconnectSocket(socket);

    // Assert that auto-reconnect is stopped and listeners are detached
    expect(socket.io.skipReconnect).toBe(true);
    expect(mockOff).toHaveBeenCalledTimes(1);

    // Assert that ws.close / socket.disconnect was NOT called while connecting (prevents Blink warning)
    expect(mockDisconnect).not.toHaveBeenCalled();
    expect(mockWs.addEventListener).toHaveBeenCalledWith('open', expect.any(Function), { once: true });
    expect(mockWs.addEventListener).toHaveBeenCalledWith('error', expect.any(Function), { once: true });
    expect(mockWs.addEventListener).toHaveBeenCalledWith('close', expect.any(Function), { once: true });

    // When connection opens, socket disconnects cleanly
    listeners.open();
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  test('immediately disconnects when WebSocket is already OPEN (readyState 1)', () => {
    const mockOff = jest.fn();
    const mockDisconnect = jest.fn();
    const mockWs = {
      readyState: 1, // WebSocket.OPEN
      addEventListener: jest.fn(),
    };

    const socket = {
      off: mockOff,
      disconnect: mockDisconnect,
      io: {
        skipReconnect: false,
        engine: {
          transport: {
            ws: mockWs,
          },
        },
      },
    };

    safeDisconnectSocket(socket);

    expect(socket.io.skipReconnect).toBe(true);
    expect(mockOff).toHaveBeenCalledTimes(1);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
    expect(mockWs.addEventListener).not.toHaveBeenCalled();
  });

  test('safely catches errors if disconnect throws', () => {
    const socket = {
      off: () => {},
      disconnect: () => {
        throw new Error('Socket already dead');
      },
    };

    expect(() => safeDisconnectSocket(socket)).not.toThrow();
  });
});
