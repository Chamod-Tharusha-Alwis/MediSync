import React from 'react';
import {render,screen,cleanup} from '@testing-library/react';
import GeographicMap from '../components/common/GeographicMap';
jest.mock('react-leaflet',()=>({
  MapContainer:({children})=><div>{children}</div>,GeoJSON:()=> <div data-testid="owned-map-outline"/>,
  Marker:({children})=><div>{children}</div>,CircleMarker:({children})=><div>{children}</div>,Popup:({children})=><div>{children}</div>
}));
jest.mock('leaflet',()=>{
  function Default() {}
  Default.mergeOptions=()=>{};
  return {Icon:{Default}};
});
beforeEach(()=>{global.fetch=jest.fn(async()=>({ok:true,json:async()=>({type:'FeatureCollection',features:[]})}));});
afterEach(cleanup);
test.each([{isSimulation:true},{syntheticSeedBatch:'owned-fixture'},{demoBatchId:'owned-fixture'}])('removes the floating notice but keeps each simulated alert explicitly labeled (%p)',async provenance=>{
  render(<GeographicMap alerts={[{status:'Active',disease:'Dengue',district:'Colombo',severity:'High',affectedCount:6,...provenance}]}/>);
  await screen.findByTestId('owned-map-outline');
  expect(screen.queryByText(/SIMULATION MODE:/)).not.toBeInTheDocument();
  expect(screen.getByText(/SIMULATION SCENARIO — DEMO ONLY/)).toBeInTheDocument();
  expect(screen.getByText('Synthetic testing data (not official public health data).')).toBeInTheDocument();
});
test('an ordinary alert gets no synthetic label',async()=>{
  render(<GeographicMap alerts={[{status:'Active',disease:'Dengue',district:'Colombo',severity:'High',affectedCount:6}]}/>);
  await screen.findByTestId('owned-map-outline');
  expect(screen.queryByText(/SIMULATION MODE:|SIMULATION SCENARIO/)).not.toBeInTheDocument();
});
