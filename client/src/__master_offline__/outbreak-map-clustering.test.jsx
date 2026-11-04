import {activityFixture} from './activityFixture';
import React from 'react';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import PublicHealth from '../pages/public/PublicHealth';
import api from '../api/axiosInstance';
import {
  SRI_LANKA_DISTRICT_ADJACENCY,
  ALL_DISTRICTS,
  normalizeDistrictName,
  getRiskTier,
  computeOutbreakClusters,
  RISK_TIERS
} from '../utils/districtAdjacency';
import DiseaseCombobox, { DEFAULT_SURVEILLANCE_DISEASES } from '../components/DiseaseCombobox';

jest.mock('../api/axiosInstance', () => ({
  get: jest.fn(),
  post: jest.fn()
}));
jest.mock('../components/common/PublicNavbar', () => () => null);
jest.mock('../components/common/PageTransition', () => ({ children }) => <div>{children}</div>);
jest.mock('../i18n/LanguageContext', () => ({
  useTranslation: () => ({ t: (_key, fallback) => fallback })
}));
jest.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="mock-map-container">{children}</div>,
  GeoJSON: () => <div data-testid="mock-geojson" />
}));
jest.mock('recharts', () => ({
  AreaChart: ({ children }) => <svg data-testid="recharts-area-chart">{children}</svg>,
  Area: () => null,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }) => <div data-testid="responsive-container">{children}</div>
}));

describe('Feature C3: Outbreak Map & Clustering Suite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        type: 'FeatureCollection',
        features: ALL_DISTRICTS.map(name => ({
          type: 'Feature',
          properties: { NAME_1: name },
          geometry: { type: 'Polygon', coordinates: [] }
        }))
      })
    });
  });

  afterEach(cleanup);

  describe('District Adjacency Topology & Graph Clustering Unit Logic', () => {
    test('contains exact 25 Sri Lankan districts in symmetric adjacency graph', () => {
      expect(ALL_DISTRICTS.length).toBe(25);
      expect(Object.keys(SRI_LANKA_DISTRICT_ADJACENCY).length).toBe(25);

      // Verify symmetry for all edges
      for (const [district, neighbors] of Object.entries(SRI_LANKA_DISTRICT_ADJACENCY)) {
        for (const neighbor of neighbors) {
          expect(SRI_LANKA_DISTRICT_ADJACENCY[neighbor]).toBeDefined();
          expect(SRI_LANKA_DISTRICT_ADJACENCY[neighbor]).toContain(district);
        }
      }
    });

    test('normalizes district names correctly between GeoJSON and API naming conventions', () => {
      expect(normalizeDistrictName('Nuwara Eliya')).toBe('nuwaraeliya');
      expect(normalizeDistrictName('NuwaraEliya')).toBe('nuwaraeliya');
      expect(normalizeDistrictName('Monaragala')).toBe('monaragala');
      expect(normalizeDistrictName('Moneragala')).toBe('monaragala');
      expect(normalizeDistrictName('Colombo')).toBe('colombo');
    });

    test('computes contiguous clusters for neighboring high-risk districts (>500 cases)', () => {
      const mockDistricts = [
        { district: 'Colombo', totalCases: 1250, topDisease: 'Dengue' },
        { district: 'Gampaha', totalCases: 750, topDisease: 'Dengue' },
        { district: 'Kalutara', totalCases: 600, topDisease: 'Leptospirosis' },
        { district: 'Jaffna', totalCases: 800, topDisease: 'Influenza' }, // Disconnected isolated hotspot
        { district: 'Galle', totalCases: 120, topDisease: 'Diarrhoeal disease' } // Moderate, < 500
      ];

      const { clusters, districtClusterMap } = computeOutbreakClusters(mockDistricts);

      // 2 clusters should be formed: 1 contiguous (Colombo, Gampaha, Kalutara) and 1 isolated (Jaffna)
      expect(clusters.length).toBe(2);

      const contiguous = clusters.find(c => c.isContiguousCluster);
      expect(contiguous).toBeDefined();
      expect(contiguous.districts.length).toBe(3);
      expect(contiguous.districts).toContain('Colombo');
      expect(contiguous.districts).toContain('Gampaha');
      expect(contiguous.districts).toContain('Kalutara');
      expect(contiguous.totalCases).toBe(2600);

      const isolated = clusters.find(c => !c.isContiguousCluster);
      expect(isolated).toBeDefined();
      expect(isolated.districts).toEqual(['Jaffna']);
      expect(isolated.totalCases).toBe(800);

      // Lookup in map
      expect(districtClusterMap.get('colombo')).toBe(contiguous);
      expect(districtClusterMap.get('jaffna')).toBe(isolated);
      expect(districtClusterMap.get('galle')).toBeUndefined();
    });

    test('maps risk tiers properly across case counts', () => {
      expect(getRiskTier(1500).key).toBe(RISK_TIERS.CRITICAL.key);
      expect(getRiskTier(600).key).toBe(RISK_TIERS.HIGH.key);
      expect(getRiskTier(250).key).toBe(RISK_TIERS.MODERATE.key);
      expect(getRiskTier(50).key).toBe(RISK_TIERS.LOW.key);
      expect(getRiskTier(5).key).toBe(RISK_TIERS.MINIMAL.key);
      expect(getRiskTier(0).key).toBe(RISK_TIERS.SUPPRESSED.key);
    });
  });

  describe('DiseaseCombobox Surveillance Default Options', () => {
    test('renders with 7 default surveillance diseases when search query is empty', () => {
      const handleChange = jest.fn();
      render(<DiseaseCombobox value="all" onChange={handleChange} />);

      const button = screen.getByRole('button', { name: /disease filter/i });
      expect(button).toBeInTheDocument();
      expect(button).toHaveTextContent('All Diseases');

      fireEvent.click(button);

      // Verify all default surveillance diseases are visible options
      DEFAULT_SURVEILLANCE_DISEASES.forEach(disease => {
        expect(screen.getByRole('option', { name: new RegExp(disease, 'i') })).toBeInTheDocument();
      });
    });
  });

  describe('Public consultation activity integration (clinical cluster helpers above stay unchanged)',()=>{
    test('visit totals cannot create outbreak clusters or a risk-tier legend',async()=>{api.get.mockResolvedValue({data:{data:activityFixture(3200)}});render(<PublicHealth/>);await screen.findByTestId('activity-total-visits');expect(screen.queryByTestId('active-clusters-section')).not.toBeInTheDocument();expect(screen.queryByTestId('map-risk-legend')).not.toBeInTheDocument();expect(screen.getByTestId('surveillance-outbreak-clusters-value')).toHaveTextContent('Not available');});
    test('accessible district table retains25districts and suppression semantics',async()=>{api.get.mockResolvedValue({data:{data:activityFixture(1500)}});render(<PublicHealth/>);await screen.findByTestId('activity-total-visits');const table=screen.getByRole('table',{name:'District visit counts'});expect(table).toBeInTheDocument();expect(table.querySelectorAll('tbody tr')).toHaveLength(25);expect(screen.getByRole('button',{name:'Nuwara Eliya'})).toBeInTheDocument();expect(screen.getAllByText('Not disclosed (<5)').length).toBe(24);});
    test('only district/time filters reach activity endpoint; no disease or confirmed-case request',async()=>{api.get.mockImplementation((_url,options)=>Promise.resolve({data:{data:activityFixture(500,{rangeDays:Number(options.params.rangeDays)})}}));render(<PublicHealth/>);await screen.findByTestId('activity-total-visits');fireEvent.change(screen.getByRole('combobox',{name:'Time range'}),{target:{value:'7'}});await waitFor(()=>expect(api.get).toHaveBeenLastCalledWith('/public/consultation-activity',expect.objectContaining({params:{rangeDays:7,district:'all'}})));expect(api.get.mock.calls.some(([url])=>url.includes('health-stats'))).toBe(false);expect(screen.queryByRole('button',{name:'Disease filter'})).not.toBeInTheDocument();});
  });
});
