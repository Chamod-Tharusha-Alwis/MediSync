import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import PrivateRoute from '../components/auth/PrivateRoute';
const { resolveClinicalEndpoints } = require('../config/clinicalEndpoints');
jest.mock('react-router-dom', () => ({ Navigate: ({ to }) => <div data-testid="redirect">{to}</div>, Outlet: () => <div>Authorized clinical portal</div> }));
afterEach(() => { cleanup(); localStorage.clear(); });
const portals = [['admin',['admin','super_admin']],['doctor',['doctor']],['patient',['patient']],['pharmacy',['pharmacist','pharmacy_admin']],['hospital',['hospital_admin']]];
for (const [portal, allowedRoles] of portals) {
  test(`${portal} requires a session`, () => { render(<PrivateRoute allowedRoles={allowedRoles} />); expect(screen.getByTestId('redirect')).toHaveTextContent('/select-role'); });
  for (const [actor, roles] of portals) test(`${actor} actor ${actor === portal ? 'enters' : 'cannot enter'} ${portal} portal`, () => {
    localStorage.setItem('token','synthetic-offline-session'); localStorage.setItem('role',roles[0]);
    render(<PrivateRoute allowedRoles={allowedRoles} />);
    expect(screen.queryByText('Authorized clinical portal') !== null).toBe(actor === portal);
    if(actor !== portal) expect(screen.getByTestId('redirect')).toBeInTheDocument();
  });
}
test('production API and Socket.IO share configured HTTPS Render origin', () => {
  expect(resolveClinicalEndpoints('https://synthetic-backend.example/api/','https://synthetic-backend.example')).toEqual({apiBaseUrl:'https://synthetic-backend.example/api',socketServerUrl:'https://synthetic-backend.example'});
});
test.each([[undefined,undefined],['/api','https://synthetic.example'],['http://synthetic.example/api','http://synthetic.example'],['https://user:pass@synthetic.example/api','https://synthetic.example'],['https://localhost/api','https://localhost'],['https://127.0.0.1/api','https://127.0.0.1'],['https://synthetic.example/api?token=secret','https://synthetic.example'],['https://synthetic.example/api#fragment','https://synthetic.example'],['https://synthetic.example/api','https://other.example'],['https://synthetic.example/not-api','https://synthetic.example'],['https://synthetic.example/api','https://synthetic.example/socket.io']])('invalid clinical endpoint pair fails before a request (%s)', (api, server) => { expect(() => resolveClinicalEndpoints(api,server)).toThrow(/CLINICAL_/); });
