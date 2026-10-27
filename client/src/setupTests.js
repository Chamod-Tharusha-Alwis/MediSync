import '@testing-library/jest-dom';

if (typeof global.crypto === 'undefined') {
  global.crypto = require('crypto').webcrypto || require('crypto');
}

let mockRoute = '/';

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: mockRoute, search: '', hash: '', state: null }),
  useParams: () => ({}),
  useSearchParams: () => [new URLSearchParams(), jest.fn()],
  Link: ({ to, children, ...props }) => <a href={typeof to === 'string' ? to : '#'} {...props}>{children}</a>,
  NavLink: ({ to, children, ...props }) => <a href={typeof to === 'string' ? to : '#'} {...props}>{children}</a>,
  Navigate: ({ to }) => <div data-testid="redirect">{typeof to === 'string' ? to : JSON.stringify(to)}</div>,
  Outlet: () => <div data-testid="protected-content" />,
  MemoryRouter: ({ children }) => <>{children}</>,
  BrowserRouter: ({ children }) => <>{children}</>,
  Routes: ({ children }) => {
    const React = require('react');
    const childArray = React.Children.toArray(children);
    // Exact child routes must win over an earlier /dashboard prefix. This is
    // test routing only; the application continues to use real React Router.
    const exact = childArray.find(c => c.props?.path === mockRoute);
    const prefix = childArray.filter(c => {
      const p = c.props?.path;
      return p && p !== '*' && mockRoute.startsWith(p.replace(/\/$/, '') + '/');
    }).sort((a, b) => b.props.path.length - a.props.path.length)[0];
    const matched = exact || prefix || childArray[0];
    return matched || null;
  },
  Route: ({ element }) => element || null,
  setMockRoute: (route) => { mockRoute = route; },
}));

jest.mock('framer-motion', () => {
  const React = require('react');
  const actual = jest.requireActual('framer-motion');
  return {
    ...actual,
    motion: new Proxy({}, {
      get: (target, tag) => {
        return ({ children, whileHover, whileTap, initial, animate, exit, transition, variants, custom, ...rest }) =>
          React.createElement(tag, rest, children);
      }
    }),
    AnimatePresence: ({ children }) => React.createElement(React.Fragment, null, children),
  };
});
