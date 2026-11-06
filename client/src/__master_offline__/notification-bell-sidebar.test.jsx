import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotificationBell from '../components/common/NotificationBell';
import Sidebar from '../components/common/Sidebar';
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
  useLocation: () => ({ pathname: '/' }),
  NavLink: ({ children, className, ...props }) => (
    <div
      className={typeof className === 'function' ? className({ isActive: false }) : className}
      {...props}
    >
      {typeof children === 'function' ? children({ isActive: false }) : children}
    </div>
  ),
  MemoryRouter: ({ children }) => <div>{children}</div>,
}));

jest.mock('../i18n/LanguageContext', () => ({
  useTranslation: () => ({
    t: (key, fallback) => fallback || key,
  }),
}));

jest.mock('../components/common/LanguageSwitcher', () => () => <div data-testid="language-switcher" />);

jest.mock('framer-motion', () => ({
  AnimatePresence: ({ children }) => <>{children}</>,
  motion: {
    div: ({ children, initial, animate, exit, transition, ...props }) => (
      <div {...props}>{children}</div>
    ),
    aside: ({ children, initial, animate, exit, transition, ...props }) => (
      <aside {...props}>{children}</aside>
    ),
    button: ({ children, whileHover, whileTap, ...props }) => (
      <button {...props}>{children}</button>
    ),
  },
}));

/**
 * Geometric layout bounds simulator for Sidebar & Header notification dropdown.
 * Resolves bounding box coordinates from Tailwind classes, parent container rect, and viewport dimensions.
 */
function computeDropdownLayout(element, viewportWidth, viewportHeight, parentRect) {
  const classes = element.className || '';
  const classList = classes.split(/\s+/);
  const isMobile = viewportWidth < 640;

  let position = 'static';
  let insetX = null;
  let top = null;
  let bottom = null;
  let right = null;
  let left = null;
  let width = 320;
  let height = 384 + 45; // max-h-96 (384px) + header (~45px)

  if (isMobile) {
    if (classList.includes('fixed')) position = 'fixed';
    else if (classList.includes('absolute')) position = 'absolute';

    if (classList.includes('inset-x-2')) insetX = 8;
    if (classList.includes('top-16')) top = 64;
  } else {
    // Desktop (sm: >= 640px)
    if (classList.some(c => c === 'sm:absolute' || (!c.startsWith('sm:') && c === 'absolute'))) {
      position = 'absolute';
    }
    if (classList.some(c => c === 'sm:right-0')) {
      right = 0;
    }
    if (classList.some(c => c === 'sm:left-0')) {
      left = 0;
    }
    if (classList.some(c => c === 'sm:top-full')) {
      top = '100%';
    }
    if (classList.some(c => c === 'sm:bottom-full')) {
      bottom = '100%';
    }
    if (classList.some(c => c === 'sm:w-80')) {
      width = 320;
    }
  }

  // Max-width constraint
  if (classList.some(c => c.includes('max-w-[calc(100vw-1rem)]'))) {
    width = Math.min(width, Math.max(0, viewportWidth - 16));
  }

  // Mobile fixed layout
  if (position === 'fixed' && insetX !== null) {
    const computedLeft = insetX;
    const computedRight = viewportWidth - insetX;
    const computedWidth = computedRight - computedLeft;
    const computedTop = top !== null ? top : 64;
    const computedBottom = computedTop + height;
    return {
      left: computedLeft,
      right: computedRight,
      width: computedWidth,
      top: computedTop,
      bottom: computedBottom,
      height,
      clippedLeft: computedLeft < 0,
      clippedRight: computedRight > viewportWidth,
      clippedTop: computedTop < 0,
      clippedBottom: computedBottom > viewportHeight,
      isClipped: computedLeft < 0 || computedRight > viewportWidth || computedTop < 0 || computedBottom > viewportHeight,
    };
  }

  // Desktop absolute layout
  let computedLeft = 0;
  let computedRight = width;
  let computedTop = 0;
  let computedBottom = height;

  if (position === 'absolute') {
    const pRect = parentRect || { left: 0, right: 0, top: 0, bottom: 0 };

    if (left === 0) {
      computedLeft = pRect.left;
      computedRight = computedLeft + width;
    } else if (right === 0) {
      computedRight = pRect.right;
      computedLeft = computedRight - width;
    }

    const mb2 = classList.some(c => c === 'sm:mb-2') ? 8 : 0;
    const mt2 = classList.some(c => c === 'mt-2' || c === 'sm:mt-2') ? 8 : 0;

    if (bottom === '100%') {
      computedBottom = pRect.top - mb2;
      computedTop = computedBottom - height;
    } else if (top === '100%') {
      computedTop = pRect.bottom + mt2;
      computedBottom = computedTop + height;
    }
  }

  return {
    left: computedLeft,
    right: computedRight,
    width,
    top: computedTop,
    bottom: computedBottom,
    height,
    clippedLeft: computedLeft < 0,
    clippedRight: computedRight > viewportWidth,
    clippedTop: computedTop < 0,
    clippedBottom: computedBottom > viewportHeight,
    isClipped: computedLeft < 0 || computedRight > viewportWidth || computedTop < 0 || computedBottom > viewportHeight,
  };
}

describe('Sidebar NotificationBell Dropdown Viewport Bounds (Hotfix)', () => {
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

  test('sidebar dropdown uses upward and rightward placement classes to prevent viewport clipping', async () => {
    await act(async () => {
      render(<NotificationBell placement="sidebar" />);
    });

    const bellButton = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(bellButton);

    const heading = screen.getByText('Notifications', { selector: 'h3' });
    const dropdown = heading.closest('.glass-panel');
    expect(dropdown).toBeInTheDocument();

    // Mobile classes remain intact
    expect(dropdown.className).toContain('fixed');
    expect(dropdown.className).toContain('inset-x-2');
    expect(dropdown.className).toContain('top-16');

    // Desktop sidebar classes: open upward from bell, aligned to bell left edge
    expect(dropdown.className).toContain('sm:absolute');
    expect(dropdown.className).toContain('sm:inset-x-auto');
    expect(dropdown.className).toContain('sm:bottom-full');
    expect(dropdown.className).toContain('sm:top-auto');
    expect(dropdown.className).toContain('sm:left-0');
    expect(dropdown.className).toContain('sm:right-auto');
    expect(dropdown.className).toContain('sm:w-80');
    expect(dropdown.className).toContain('sm:mb-2');
  });

  test('sidebar dropdown stays strictly inside 1440x900 viewport without left or bottom clipping', async () => {
    const viewportWidth = 1440;
    const viewportHeight = 900;
    // Bell button inside desktop Sidebar (width 256px), user badge near bottom
    const parentContainerRect = { left: 192, right: 228, width: 36, top: 742, bottom: 778, height: 36 };

    await act(async () => {
      render(
        <div style={{ position: 'relative' }}>
          <NotificationBell placement="sidebar" />
        </div>
      );
    });

    const bellButton = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(bellButton);

    const dropdown = screen.getByText('Notifications', { selector: 'h3' }).closest('.glass-panel');

    gbcSpy = jest.spyOn(dropdown, 'getBoundingClientRect').mockImplementation(() => {
      return computeDropdownLayout(dropdown, viewportWidth, viewportHeight, parentContainerRect);
    });

    const rect = dropdown.getBoundingClientRect();

    // Horizontal bounds: starts at 192px and extends to 512px (well inside 1440px)
    expect(rect.left).toBe(192);
    expect(rect.right).toBe(512);
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEaseOrEqual ? expect(rect.right).toBeLessThanOrEqual(viewportWidth) : expect(rect.right).toBeLessThanOrEqual(viewportWidth);
    expect(rect.clippedLeft).toBe(false);
    expect(rect.clippedRight).toBe(false);

    // Vertical bounds: bottom anchored at 734px (742 - 8px mb-2), top at 305px (well inside 900px)
    expect(rect.bottom).toBe(734);
    expect(rect.top).toBe(305);
    expect(rect.top).toBeGreaterThanOrEqual(0);
    expect(rect.bottom).toBeLessThanOrEqual(viewportHeight);
    expect(rect.clippedTop).toBe(false);
    expect(rect.clippedBottom).toBe(false);

    // Zero clipping
    expect(rect.isClipped).toBe(false);
  });

  test('sidebar dropdown on mobile (320x640) stays strictly inside viewport', async () => {
    const viewportWidth = 320;
    const viewportHeight = 640;
    const parentContainerRect = { left: 220, right: 260, width: 40, top: 20, bottom: 60, height: 40 };

    await act(async () => {
      render(
        <div style={{ width: '280px', position: 'relative' }}>
          <NotificationBell placement="sidebar" />
        </div>
      );
    });

    const bellButton = screen.getByRole('button', { name: /notifications/i });
    fireEvent.click(bellButton);

    const dropdown = screen.getByText('Notifications', { selector: 'h3' }).closest('.glass-panel');

    gbcSpy = jest.spyOn(dropdown, 'getBoundingClientRect').mockImplementation(() => {
      return computeDropdownLayout(dropdown, viewportWidth, viewportHeight, parentContainerRect);
    });

    const rect = dropdown.getBoundingClientRect();

    expect(rect.left).toBe(8);
    expect(rect.right).toBe(312);
    expect(rect.top).toBe(64);
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(viewportWidth);
    expect(rect.bottom).toBeLessThanOrEqual(viewportHeight);
    expect(rect.clippedLeft).toBe(false);
    expect(rect.isClipped).toBe(false);
  });

  test('header dropdown placement remains right-aligned and top-full without regression', async () => {
    const viewportWidth = 1440;
    const viewportHeight = 900;
    // Bell button inside desktop top Header bar
    const parentContainerRect = { left: 1360, right: 1400, width: 40, top: 16, bottom: 56, height: 40 };

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

    // Desktop header classes
    expect(dropdown.className).toContain('sm:top-full');
    expect(dropdown.className).toContain('sm:right-0');
    expect(dropdown.className).not.toContain('sm:bottom-full');

    gbcSpy = jest.spyOn(dropdown, 'getBoundingClientRect').mockImplementation(() => {
      return computeDropdownLayout(dropdown, viewportWidth, viewportHeight, parentContainerRect);
    });

    const rect = dropdown.getBoundingClientRect();

    // Right-aligned to 1400px, width 320px -> left = 1080px
    expect(rect.right).toBe(1400);
    expect(rect.left).toBe(1080);
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(viewportWidth);
    expect(rect.top).toBe(64); // 56 + 8
    expect(rect.bottom).toBe(493); // 64 + 429
    expect(rect.bottom).toBeLessThanOrEqual(viewportHeight);
    expect(rect.isClipped).toBe(false);
  });

  test('Sidebar component mounts NotificationBell with sidebar placement', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <Sidebar
            userName="Dr. Perera"
            userRole="doctor"
            menuItems={[{ path: '/dashboard', label: 'Dashboard', icon: () => <svg /> }]}
          />
        </MemoryRouter>
      );
    });

    // Find bell button inside Sidebar user card
    const bellButtons = screen.getAllByRole('button', { name: /notifications/i });
    expect(bellButtons.length).toBeGreaterThanOrEqual(1);

    // Open dropdown
    fireEvent.click(bellButtons[0]);

    const headings = screen.getAllByText('Notifications', { selector: 'h3' });
    const dropdown = headings[0].closest('.glass-panel');
    expect(dropdown).toBeInTheDocument();

    // Dropdown inside sidebar has sidebar positioning classes
    expect(dropdown.className).toContain('sm:bottom-full');
    expect(dropdown.className).toContain('sm:top-auto');
    expect(dropdown.className).toContain('sm:left-0');
    expect(dropdown.className).toContain('sm:right-auto');
  });
});
