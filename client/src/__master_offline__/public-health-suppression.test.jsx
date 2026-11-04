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
const stats={totalCases:10,byDistrict:[{district:'Colombo',totalCases:6,topDisease:'Dengue'}],byDisease:[{disease:'Dengue',totalCases:10}],trend:[],forecast:[]};
beforeEach(()=>{
  jest.clearAllMocks();
  global.fetch=jest.fn(async()=>({json:async()=>({type:'FeatureCollection',features:['Colombo','Badulla'].map(name=>({properties:{NAME_1:name}}))})}));
});
afterEach(cleanup);
test('map handlers use completed data and never turn an omitted district into zero',async()=>{
  let complete;api.get.mockImplementation(()=>new Promise(resolve=>{complete=resolve}));
  render(<PublicHealth/>);
  await screen.findByRole('button',{name:'Map select Colombo'});
  await act(async()=>complete({data:{data:stats}}));
  fireEvent.click(screen.getByRole('button',{name:'Map select Colombo'}));
  expect(screen.getByTestId('selected-district-card')).toHaveTextContent('6 cases');
  fireEvent.click(screen.getByRole('button',{name:'Map select Badulla'}));
  const card=screen.getByTestId('selected-district-card');
  expect(card).toHaveTextContent('Case count not disclosed (<5)');
  expect(card).not.toHaveTextContent('0 cases');
});
test('table selection preserves suppression and clears the old count when filters change',async()=>{
  api.get.mockResolvedValue({data:{data:stats}});render(<PublicHealth/>);
  await waitFor(()=>expect(screen.getByText('Total Cases')).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button',{name:'Toggle accessible district table'}));
  fireEvent.click(screen.getByRole('row',{name:/Badulla/}));
  expect(screen.getByTestId('selected-district-card')).toHaveTextContent('Case count not disclosed (<5)');
  fireEvent.click(screen.getByRole('row',{name:/Colombo/}));
  expect(screen.getByTestId('selected-district-card')).toHaveTextContent('6 cases');
  fireEvent.change(screen.getByRole('combobox',{name:'Time range filter'}),{target:{value:'7'}});
  expect(screen.queryByTestId('selected-district-card')).not.toBeInTheDocument();
  await waitFor(()=>expect(api.get).toHaveBeenLastCalledWith('/public/health-stats',expect.objectContaining({params:expect.objectContaining({rangeDays:'7'})})));
});
test('an explicit insufficient-evidence forecast is not regenerated from calendar zero-fill',async()=>{
  api.get.mockResolvedValue({data:{data:{...stats,forecast:[],trend:[
    {date:'2026-11-01',count:0},{date:'2026-11-02',count:10},{date:'2026-11-03',count:0}
  ]}}});
  render(<PublicHealth/>);
  await screen.findByText('Total Cases');
  expect(screen.getByText(/Insufficient historical data to compute 14-day outbreak forecast/)).toBeInTheDocument();
});
