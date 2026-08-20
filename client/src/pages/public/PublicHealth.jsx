import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, GeoJSON } from 'react-leaflet';
import DiseaseCombobox from '../../components/DiseaseCombobox';
import 'leaflet/dist/leaflet.css';
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { FiTrendingUp, FiActivity, FiMap } from 'react-icons/fi';
import PublicNavbar from '../../components/common/PublicNavbar';
import PageTransition from '../../components/common/PageTransition';
import axios from 'axios';

const MapController = ({ data, geoData, getFeatureStyle }) => {
  const geoJsonLayerRef = useRef(null);

  useEffect(() => {
    if (geoJsonLayerRef.current) {
      geoJsonLayerRef.current.setStyle(getFeatureStyle);
      // Update tooltips
      geoJsonLayerRef.current.eachLayer((layer) => {
        const feature = layer.feature;
        if (feature) {
          const districtName = feature.properties.NAME_1 || feature.properties.name || feature.properties.ADM1_EN || feature.properties.id;
          const districtData = data?.byDistrict?.find(d => d.district.toLowerCase() === districtName.toLowerCase());
          const cases = districtData ? districtData.totalCases : 'No data (<5)';
          const tooltipContent = `<b>${districtName}</b><br/>Cases: ${cases}`;
          
          if (layer.getTooltip()) {
            layer.setTooltipContent(tooltipContent);
          } else {
            layer.bindTooltip(tooltipContent);
          }
        }
      });
    }
  }, [data, getFeatureStyle]);

  return (
    <GeoJSON 
      ref={geoJsonLayerRef}
      data={geoData} 
      style={getFeatureStyle}
      onEachFeature={(feature, layer) => {
        const districtName = feature.properties.NAME_1 || feature.properties.name || feature.properties.ADM1_EN || feature.properties.id;
        const districtData = data?.byDistrict?.find(d => d.district.toLowerCase() === districtName.toLowerCase());
        const cases = districtData ? districtData.totalCases : 'No data (<5)';
        layer.bindTooltip(`<b>${districtName}</b><br/>Cases: ${cases}`);
      }}
    />
  );
};

const PublicHealth = () => {
  const [data, setData] = useState(null);
  const [geoData, setGeoData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    rangeDays: 30,
    district: 'all',
    disease: 'all'
  });

  useEffect(() => {
    // Load GeoJSON
    fetch('/lk_districts.json')
      .then(res => res.json())
      .then(data => setGeoData(data))
      .catch(err => console.error("Failed to load map data:", err));
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await axios.get('/api/public/health-stats', {
          params: filters
        });
        setData(response.data.data);
      } catch (err) {
        if (err.response && err.response.status === 429) {
          setError('Too many requests. Please wait a minute and try again.');
        } else {
          setError('Failed to load health statistics.');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [filters]);

  const handleFilterChange = (e) => {
    setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const getFeatureStyle = useCallback((feature) => {
    const getDistrictColor = (districtName) => {
      if (!data || !data.byDistrict) return '#319795'; // default teal
      const districtData = data.byDistrict.find(d => d.district.toLowerCase() === districtName.toLowerCase());
      if (!districtData) return '#E2E8F0'; // gray for no data
      
      const count = districtData.totalCases;
      if (count > 1000) return '#9B2C2C'; // Dark red
      if (count > 500) return '#C53030';
      if (count > 100) return '#DD6B20';
      if (count > 10) return '#D69E2E';
      return '#319795'; // teal
    };

    return {
      fillColor: getDistrictColor(feature.properties.NAME_1 || feature.properties.name || feature.properties.ADM1_EN || feature.properties.id),
      weight: 1,
      opacity: 1,
      color: '#1e293b',
      fillOpacity: 0.7
    };
  }, [data]);

  return (
    <PageTransition className="min-h-screen bg-[#0b1120] text-slate-200 pt-28 pb-12 px-6">
      <PublicNavbar />
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-blue-500 mb-2">
              Public Health Dashboard
            </h1>
            <p className="text-slate-400">Anonymized disease tracking across Sri Lanka</p>
          </div>
          
          {/* Filters */}
          <div className="glass-panel p-3 flex flex-wrap gap-4 rounded-xl border border-white/10 bg-white/5 backdrop-blur-md relative z-50">
            <select 
              name="rangeDays" 
              value={filters.rangeDays} 
              onChange={handleFilterChange}
              className="bg-slate-800 border border-slate-700 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
            >
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
              <option value="90">Last 90 Days</option>
            </select>
            
            <DiseaseCombobox 
              value={filters.disease} 
              onChange={(val) => setFilters(prev => ({ ...prev, disease: val }))} 
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 text-red-200 p-4 rounded-lg">
            {error}
          </div>
        )}

        {/* Content */}
        {!error && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Column: Stats & Trend */}
            <div className="lg:col-span-1 space-y-6">
              
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className="glass-panel p-4 rounded-xl border border-teal-500/20 bg-teal-500/5 backdrop-blur-md">
                  <h3 className="text-slate-400 text-sm font-medium">Total Cases</h3>
                  <p className="text-3xl font-bold text-teal-400 mt-1">
                    {loading ? '...' : data?.totalCases?.toLocaleString() || 0}
                  </p>
                </div>
                <div className="glass-panel p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 backdrop-blur-md">
                  <h3 className="text-slate-400 text-sm font-medium">Top Disease</h3>
                  <p className="text-xl font-bold text-blue-400 mt-1 truncate" title={data?.byDisease?.[0]?.disease || 'None'}>
                    {loading ? '...' : data?.byDisease?.[0]?.disease || 'None'}
                  </p>
                </div>
              </div>

              {/* Trend Chart */}
              <div className="glass-panel p-4 rounded-xl border border-slate-700/50 bg-slate-800/50 backdrop-blur-md h-64 flex flex-col">
                <h3 className="text-slate-300 font-medium mb-4 flex items-center gap-2">
                  <FiTrendingUp className="text-teal-400" /> Case Trend
                </h3>
                <div className="flex-1 relative">
                  {loading ? (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-500">Loading trend...</div>
                  ) : (data?.trend?.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.trend} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" hide />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', color: '#f8fafc' }}
                          itemStyle={{ color: '#2dd4bf' }}
                        />
                        <Area type="monotone" dataKey="count" stroke="#2dd4bf" fillOpacity={1} fill="url(#colorCount)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-500">Not enough data to show trend</div>
                  ))}
                </div>
              </div>
              
              {/* Disease Breakdown */}
              <div className="glass-panel p-4 rounded-xl border border-slate-700/50 bg-slate-800/50 backdrop-blur-md flex-1">
                 <h3 className="text-slate-300 font-medium mb-4 flex items-center gap-2">
                  <FiActivity className="text-blue-400" /> Breakdown by Disease
                </h3>
                <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar pr-2">
                  {loading ? (
                    <div className="text-slate-500 text-center py-4">Loading breakdown...</div>
                  ) : (data?.byDisease?.length > 0 ? (
                    data.byDisease.map((d, i) => (
                      <div key={d.disease} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 w-4">{i+1}.</span>
                          <span className="text-slate-300">{d.disease}</span>
                        </div>
                        <span className="text-slate-400 font-medium">{d.totalCases.toLocaleString()}</span>
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-500 text-center py-4">No data</div>
                  ))}
                </div>
              </div>

            </div>

            {/* Right Column: Map */}
            <div className="lg:col-span-2 glass-panel rounded-xl border border-slate-700/50 bg-slate-800/50 backdrop-blur-md overflow-hidden relative min-h-[500px]">
              {loading && (
                <div className="absolute inset-0 z-10 bg-slate-900/50 backdrop-blur-sm flex flex-col items-center justify-center">
                  <FiMap className="text-teal-500 text-4xl animate-bounce mb-4" />
                  <p className="text-teal-400 font-medium">Aggregating district data...</p>
                </div>
              )}
              
              {geoData ? (
                <MapContainer 
                  center={[7.8731, 80.7718]} 
                  zoom={7.4} 
                  className="w-full h-full bg-transparent z-0"
                  zoomControl={false}
                 >
                   <MapController data={data} geoData={geoData} getFeatureStyle={getFeatureStyle} />
                 </MapContainer>
               ) : (
                 <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 min-h-[500px]">
                   <p>Loading Map Data...</p>
                 </div>
               )}
            </div>
            
          </div>
        )}
      </div>
    </PageTransition>
  );
};

export default PublicHealth;
