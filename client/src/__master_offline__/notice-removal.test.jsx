import React from 'react';
import {render,screen,cleanup} from '@testing-library/react';
import App from '../App';
import UniversityApp from '../UniversityApp';
jest.mock('react-router-dom', () => ({ BrowserRouter: ({ children }) => <>{children}</>, Routes: () => null, Route: () => null, Navigate: () => null, useLocation: () => ({ pathname: '/' }) }));
jest.mock('../utils/analytics', () => ({ initGA: jest.fn(), usePageTracking: jest.fn() }));
jest.mock('../components/common/NotificationToast', () => () => null);
jest.mock('../components/common/AnimatedBackground', () => () => null);
jest.mock('../components/common/IdleTimer', () => () => null);
jest.mock('../components/BanNotice', () => () => null);
jest.mock('../components/auth/PrivateRoute', () => () => null);


const previous=Object.fromEntries(['REACT_APP_SHOW_PROTOTYPE_BANNER','REACT_APP_MEDISYNC_UNIVERSITY_DEMO'].map(key=>[key,process.env[key]]));
afterEach(()=>{cleanup();localStorage.clear();for(const[key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});

test('the actual application keeps its default shell without a reserved notice gap',()=>{
 delete process.env.REACT_APP_MEDISYNC_UNIVERSITY_DEMO;
 const {container}=render(<App/>);
 expect(screen.queryByRole('note')).not.toBeInTheDocument();expect(screen.queryByTestId('prototype-notice')).not.toBeInTheDocument();
 expect(container.firstChild).not.toHaveClass('pb-40');
});
test('legacy development banner flags cannot restore a notice in the clinical shell',()=>{
 process.env.REACT_APP_MEDISYNC_UNIVERSITY_DEMO='true';process.env.REACT_APP_SHOW_PROTOTYPE_BANNER='true';
 render(<App/>);expect(screen.queryByRole('note')).not.toBeInTheDocument();expect(screen.queryByTestId('prototype-notice')).not.toBeInTheDocument();
});
test.each(['en','si','ta'])('neither shell mounts a temporary notice or layout gap in %s',language=>{
 process.env.REACT_APP_MEDISYNC_UNIVERSITY_DEMO='true';process.env.REACT_APP_SHOW_PROTOTYPE_BANNER='true';localStorage.setItem('medisync_language',language);
 for(const Shell of [App,UniversityApp]){
  const {container,unmount}=render(<Shell/>);
  expect(screen.queryByRole('note')).not.toBeInTheDocument();expect(screen.queryByTestId('prototype-notice')).not.toBeInTheDocument();
  expect(container.firstChild).not.toHaveClass('pb-40');expect(container.firstChild.style.paddingBottom).toBe('');unmount();
 }
});
