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

  describe('PublicHealth Dashboard Component Integration', () => {
    test('renders outbreak map dashboard with active clusters and dynamic legend summing to 25', async () => {
      const mockResponse = {
        totalCases: 3200,
        byDistrict: [
          { district: 'Colombo', totalCases: 1200, topDisease: 'Dengue' },
          { district: 'Gampaha', totalCases: 700, topDisease: 'Dengue' },
          { district: 'Kalutara', totalCases: 600, topDisease: 'Leptospirosis' },
          { district: 'Kandy', totalCases: 550, topDisease: 'Influenza' },
          { district: 'Kurunegala', totalCases: 150, topDisease: 'Dengue' }
        ],
        byDisease: [
          { disease: 'Dengue', totalCases: 2050 },
          { disease: 'Leptospirosis', totalCases: 600 },
          { disease: 'Influenza', totalCases: 550 }
        ],
        trend: [
          { date: '2026-10-29', count: 100 },
          { date: '2026-10-30', count: 110 },
          { date: '2026-10-31', count: 120 }
        ]
      };

      api.get.mockResolvedValue({ data: { data: mockResponse } });

      render(<PublicHealth />);

      await waitFor(() => {
        expect(screen.getByText('Total Cases')).toBeInTheDocument();
        expect(screen.getByText('3,200')).toBeInTheDocument();
      });

      // Active clusters section
      const clusterSection = screen.getByTestId('active-clusters-section');
      expect(clusterSection).toBeInTheDocument();
      expect(clusterSection).toHaveTextContent('Active Regional Outbreak Clusters');

      // Legend rendered with live counts
      const legend = screen.getByTestId('map-risk-legend');
      expect(legend).toBeInTheDocument();
      expect(legend).toHaveTextContent('Risk Tier Legend (25 Districts)');
      expect(legend).toHaveTextContent('Critical: 1'); // Colombo
      expect(legend).toHaveTextContent('High: 3');     // Gampaha, Kalutara, Kandy
      expect(legend).toHaveTextContent('Moderate: 1'); // Kurunegala
    });

    test('toggles accessible table view and renders all 25 districts', async () => {
      api.get.mockResolvedValue({
        data: {
          data: {
            totalCases: 1500,
            byDistrict: [{ district: 'Colombo', totalCases: 1500, topDisease: 'Dengue' }],
            byDisease: [{ disease: 'Dengue', totalCases: 1500 }],
            trend: [{ date: '2026-10-31', count: 50 }]
          }
        }
      });

      render(<PublicHealth />);

      await waitFor(() => {
        expect(screen.getByText('Total Cases')).toBeInTheDocument();
      });

      const toggleBtn = screen.getByTestId('toggle-table-view');
      expect(toggleBtn).toBeInTheDocument();
      expect(toggleBtn).toHaveTextContent('Accessible Table View');

      // Click to toggle to table view
      fireEvent.click(toggleBtn);

      const table = screen.getByRole('table', { name: /district outbreak surveillance table/i });
      expect(table).toBeInTheDocument();

      // Ensure key districts are in the table
      expect(screen.getByRole('cell', { name: 'Colombo' })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: 'Nuwara Eliya' })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: 'Monaragala' })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: 'Jaffna' })).toBeInTheDocument();

      // Toggle back to map view
      fireEvent.click(toggleBtn);
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    test('dispatches disease filter to health stats endpoint', async () => {
      api.get.mockResolvedValue({
        data: {
          data: {
            totalCases: 500,
            byDistrict: [{ district: 'Colombo', totalCases: 500, topDisease: 'Dengue' }],
            byDisease: [{ disease: 'Dengue', totalCases: 500 }],
            trend: []
          }
        }
      });

      render(<PublicHealth />);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith(
          '/public/health-stats',
          expect.objectContaining({
            params: expect.objectContaining({ disease: 'all' })
          })
        );
      });

      // Open combobox and select Dengue
      const diseaseBtn = screen.getByRole('button', { name: /disease filter/i });
      fireEvent.click(diseaseBtn);

      const dengueOption = screen.getByRole('option', { name: /dengue/i });
      fireEvent.click(dengueOption);

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledWith(
          '/public/health-stats',
          expect.objectContaining({
            params: expect.objectContaining({ disease: 'Dengue' })
          })
        );
      });
    });
  });
});
