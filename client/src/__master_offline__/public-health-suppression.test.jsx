import {activityFixture} from './activityFixture';
import React from 'react';
import {render,screen,waitFor,fireEvent,act,cleanup} from '@testing-library/react';
import PublicHealth from '../pages/public/PublicHealth';
import api from '../api/axiosInstance';
jest.mock('../api/axiosInstance',()=>({get:jest.fn()}));
jest.mock('../components/common/PublicNavbar',()=>()=>null);
jest.mock('../components/common/PageTransition',()=>({children})=><div>{children}</div>);
jest.mock('../i18n/LanguageContext',()=>({useTranslation:()=>({t:(_key,fallback)=>fallback})}));
jest.mock('recharts',()=>({AreaChart:()=>null,Area:()=>null,XAxis:()=>null,YAxis:()=>null,Tooltip:()=>null,ResponsiveContainer:()=>null}));
// Leaflet's layer event interface is inert; the actual MapController handlers,
// refs, selected-card render and data updates run without a real browser/map.
jest.mock('react-leaflet',()=>{
  const React=require('react');
  return {MapContainer:({children})=><div>{children}</div>,GeoJSON:React.forwardRef(({data,onEachFeature},ref)=>{
    const layers=React.useMemo(()=>data.features.map(feature=>{
      const layer={feature,handlers:{},getTooltip:()=>false,bindTooltip:()=>{},setTooltipContent:()=>{},on(events){Object.assign(this.handlers,events)}};
      onEachFeature(feature,layer);return layer;
    }),[data]);
    React.useImperativeHandle(ref,()=>({setStyle:()=>{},eachLayer:fn=>layers.forEach(fn)}),[layers]);
    return <div>{layers.map(layer=><button key={layer.feature.properties.NAME_1} onClick={()=>layer.handlers.click()}>Map select {layer.feature.properties.NAME_1}</button>)}</div>;
  })};
});
const stats=activityFixture(10,{byDistrict:[{district:'Colombo',visitCount:6}]});
beforeEach(()=>{
  jest.clearAllMocks();
  global.fetch=jest.fn(async()=>({json:async()=>({type:'FeatureCollection',features:['Colombo','Badulla'].map(name=>({properties:{NAME_1:name}}))})}));
});
afterEach(cleanup);
test('map handlers use completed data and never turn an omitted district into zero',async()=>{
  let complete;api.get.mockImplementation(()=>new Promise(resolve=>{complete=resolve}));
  render(<PublicHealth/>);
  await act(async()=>complete({data:{data:stats}}));
  await screen.findByRole('button',{name:'Map select Colombo'});
  fireEvent.click(screen.getByRole('button',{name:'Map select Colombo'}));
  expect(screen.getByTestId('selected-district-card')).toHaveTextContent('6 Visits');
  fireEvent.click(screen.getByRole('button',{name:'Map select Badulla'}));
  const card=screen.getByTestId('selected-district-card');
  expect(card).toHaveTextContent('Not disclosed (<5)');
  expect(card).not.toHaveTextContent('0 Visits');
});
test('table selection preserves suppression and clears the old count when filters change',async()=>{
  api.get.mockResolvedValue({data:{data:stats}});render(<PublicHealth/>);
  await waitFor(()=>expect(screen.getByText('Recorded visits')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button',{name:'Badulla'}));
  expect(screen.getByTestId('selected-district-card')).toHaveTextContent('Not disclosed (<5)');
  fireEvent.click(screen.getByRole('button',{name:'Colombo'}));
  expect(screen.getByTestId('selected-district-card')).toHaveTextContent('6 Visits');
  fireEvent.change(screen.getByRole('combobox',{name:'Time range'}),{target:{value:'7'}});
  expect(screen.queryByTestId('selected-district-card')).not.toBeInTheDocument();
  await waitFor(()=>expect(api.get).toHaveBeenLastCalledWith('/public/consultation-activity',expect.objectContaining({params:expect.objectContaining({rangeDays:7})})));
});
test('calendar visit counts never become a clinical forecast',async()=>{
 api.get.mockResolvedValue({data:{data:activityFixture(10)}});render(<PublicHealth/>);await screen.findByTestId('activity-total-visits');
 expect(screen.getByTestId('surveillance-forecast-value')).toHaveTextContent('Not available');expect(screen.queryByText('Predicted Cases')).not.toBeInTheDocument();
});
