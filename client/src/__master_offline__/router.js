import React from 'react';
export const useNavigate=()=>jest.fn();
export const Navigate=({to})=><div data-testid="redirect">{to}</div>;
export const Outlet=()=> <div data-testid="protected-content">Allowed</div>;
export const NavLink=({to,children,...props})=><a href={to}>{children}</a>;
let route='/dashboard';
export const setMockRoute=value=>{route=value;};
export const Routes=({children})=>{const match=React.Children.toArray(children).find(child=>child.props.path===route);return match?.props.element || null;};
export const Route=()=>null;
