import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import NotificationBell from '../components/common/NotificationBell';
import api from '../api/axiosInstance';

// Mocks
jest.mock('../api/axiosInstance', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({ data: { data: [], unreadCount: 0 } }),
    put: jest.fn().mockResolvedValue({ data: { success: true } }),
    post: jest.fn().mockResolvedValue({ data: {} }),
  },
  SOCKET_SERVER_URL: 'http://127.0.0.1:3100',
}));

jest.mock('socket.io-client', () => ({
  io: () => ({
    on: jest.fn(),
    off: jest.fn(),
    disconnect: jest.fn(),
  }),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
}));

jest.mock('../i18n/LanguageContext', () => ({
  useTranslation: () => ({
    t: (key, fallback) => fallback || key,
  }),
}));

jest.mock('framer-motion', () => ({
  AnimatePresence: ({ children }) => <>{children}</>,
  motion: {
    div: ({ children, initial, animate, exit, transition, ...props }) => (
      <div {...props}>{children}</div>
    ),
  },
}));

/**
 * Layout simulator for jsdom geometry assertions.
 * Resolves CSS box coordinates based on Tailwind positioning classes,
 * viewport width, and parent container bounds.
 */
function computeLayoutBounds(element, viewportWidth, parentRect) {
  const classes = element.className || '';
  const classList = classes.split(/\s+/);
  const isMobile = viewportWidth < 640;

  // Determine active positioning rules based on viewport
  let position = 'static';
  let insetX = null;
  let top = 0;
  let right = null;
  let left = null;
  let width = 320; // default w-80 = 20rem = 320px

  if (isMobile) {
    if (classList.includes('fixed')) {
      position = 'fixed';
    } else if (classList.includes('absolute')) {
      position = 'absolute';
    }

    if (classList.includes('inset-x-2')) {
      insetX = 8; // 2 * 0.25rem = 0.5rem = 8px
    }
    if (classList.includes('top-16')) {
      top = 64; // 16 * 0.25rem = 4rem = 64px
    }
    if (classList.includes('right-0')) {
      right = 0;
    }
  } else {
    // Desktop (sm: >= 640px)
    if (classList.some(c => c === 'sm:absolute' || (!c.startsWith('sm:') && c === 'absolute'))) {
      position = 'absolute';
    }
    if (classList.some(c => c === 'sm:right-0' || (!c.startsWith('sm:') && c === 'right-0'))) {
      right = 0;
    }
    if (classList.some(c => c === 'sm:w-80' || (!c.startsWith('sm:') && c === 'w-80'))) {
      width = 320;
    }
  }

  // Max-width constraint: max-w-[calc(100vw-1rem)] = viewportWidth - 16px
  if (classList.some(c => c.includes('max-w-[calc(100vw-1rem)]'))) {
    width = Math.min(width, Math.max(0, viewportWidth - 16));
  }

  // Compute bounding box coordinates
  if (position === 'fixed' && insetX !== null) {
    left = insetX;
    const computedRight = viewportWidth - insetX;
    const computedWidth = computedRight - left;
    return {
      left,
      right: computedRight,
      width: computedWidth,
      top,
      clippedLeft: left < 0,
      clippedRight: computedRight > viewportWidth,
      isClipped: left < 0 || computedRight > viewportWidth,
    };
  }

  if (position === 'absolute' && right === 0) {
    // Anchored to parent container's right edge
    const anchorRight = parentRect ? parentRect.right : viewportWidth;
    const computedLeft = anchorRight - width;
    return {
      left: computedLeft,
      right: anchorRight,
      width,
      top,
      clippedLeft: computedLeft < 0,
      clippedRight: anchorRight > viewportWidth,
      isClipped: computedLeft < 0 || anchorRight > viewportWidth,
    };
  }

  return {
    left: 0,
    right: width,
    width,
    top,
    clippedLeft: false,
    clippedRight: false,
    isClipped: false,
  };
}

describe('NotificationBell Responsive Mobile Dropdown (Item U8)', () => {
  let gbcSpy;

  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    api.get.mockReset();
    api.get.mockResolvedValue({ data: { data: [], unreadCount: 0 } });
  });

  afterEach(() => {
    if (gbcSpy) gbcSpy.mockRestore();
    jest.useRealTimers();
  });

  test('dropdown uses responsive positioning classes to prevent mobile clipping', async () => {
    await act(async () => {
      render(<NotificationBell />);
    });

    // Open notification dropdown
    const bellButton = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(bellButton);

    const heading = screen.getByText('Notifications', { selector: 'h3' });
    const dropdown = heading.closest('.glass-panel');
    expect(dropdown).toBeInTheDocument();

    // Verify mobile responsive classes
    expect(dropdown.className).toContain('fixed');
    expect(dropdown.className).toContain('inset-x-2');
    expect(dropdown.className).toContain('top-16');

    // Verify desktop override classes
    expect(dropdown.className).toContain('sm:absolute');
    expect(dropdown.className).toContain('sm:inset-x-auto');
    expect(dropdown.className).toContain('sm:top-full');
    expect(dropdown.className).toContain('sm:right-0');
    expect(dropdown.className).toContain('sm:w-80');
  });

  test('dropdown stays strictly inside viewport at 320px without left edge clipping', async () => {
    const viewportWidth = 320;
    // Simulate mounting inside Sidebar mobile drawer (w-[280px]), bell button at right = 260px
    const parentContainerRect = { left: 220, right: 260, width: 40, top: 20, bottom: 60 };

    await act(async () => {
      render(
        <div style={{ width: '280px', position: 'relative' }}>
          <NotificationBell />
        </div>
      );
    });

    const bellButton = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(bellButton);

    const dropdown = screen.getByText('Notifications', { selector: 'h3' }).closest('.glass-panel');
    expect(dropdown).toBeInTheDocument();

    // Attach getBoundingClientRect spy modeling actual CSS layout
    gbcSpy = jest.spyOn(dropdown, 'getBoundingClientRect').mockImplementation(() => {
      return computeLayoutBounds(dropdown, viewportWidth, parentContainerRect);
    });

    const rect = dropdown.getBoundingClientRect();

    // Geometry assertions
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(viewportWidth);
    expect(rect.isClipped).toBe(false);
    expect(rect.clippedLeft).toBe(false);

    // Specifically at 320px with inset-x-2: left should be exactly 8px, right 312px
    expect(rect.left).toBe(8);
    expect(rect.right).toBe(312);
  });

  test('dropdown stays strictly inside viewport at 375px without left edge clipping', async () => {
    const viewportWidth = 375;
    // Simulate mounting inside user card container in mobile drawer or header
    const parentContainerRect = { left: 230, right: 270, width: 40, top: 20, bottom: 60 };

    await act(async () => {
      render(
        <div style={{ width: '280px', position: 'relative' }}>
          <NotificationBell />
        </div>
      );
    });

    const bellButton = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(bellButton);

    const dropdown = screen.getByText('Notifications', { selector: 'h3' }).closest('.glass-panel');
    expect(dropdown).toBeInTheDocument();

    gbcSpy = jest.spyOn(dropdown, 'getBoundingClientRect').mockImplementation(() => {
      return computeLayoutBounds(dropdown, viewportWidth, parentContainerRect);
    });

    const rect = dropdown.getBoundingClientRect();

    // Geometry assertions
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(viewportWidth);
    expect(rect.isClipped).toBe(false);
    expect(rect.clippedLeft).toBe(false);

    // At 375px with inset-x-2: left should be 8px, right 367px
    expect(rect.left).toBe(8);
    expect(rect.right).toBe(367);
  });

  test('desktop viewport (1024px) retains absolute right-aligned layout', async () => {
    const viewportWidth = 1024;
    // Bell button placed in desktop top bar at right = 980px
    const parentContainerRect = { left: 940, right: 980, width: 40, top: 20, bottom: 60 };

    await act(async () => {
      render(
        <div style={{ position: 'relative' }}>
          <NotificationBell />
        </div>
      );
    });

    const bellButton = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(bellButton);

    const dropdown = screen.getByText('Notifications', { selector: 'h3' }).closest('.glass-panel');

    gbcSpy = jest.spyOn(dropdown, 'getBoundingClientRect').mockImplementation(() => {
      return computeLayoutBounds(dropdown, viewportWidth, parentContainerRect);
    });

    const rect = dropdown.getBoundingClientRect();

    // On desktop, should be absolute right-0 with width 320px
    expect(rect.right).toBe(980);
    expect(rect.width).toBe(320);
    expect(rect.left).toBe(660); // 980 - 320
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.isClipped).toBe(false);
  });
});
