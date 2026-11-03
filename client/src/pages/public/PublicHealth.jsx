import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { MapContainer, GeoJSON } from 'react-leaflet';
import DiseaseCombobox from '../../components/DiseaseCombobox';
import 'leaflet/dist/leaflet.css';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { FiTrendingUp, FiActivity, FiMap, FiInfo } from 'react-icons/fi';
import PublicNavbar from '../../components/common/PublicNavbar';
import PageTransition from '../../components/common/PageTransition';
import api from '../../api/axiosInstance';
import { calculate14DayForecast } from '../../utils/outbreakForecasting';

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
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [geoData, setGeoData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [trendView, setTrendView] = useState('trend'); // 'trend' | 'forecast'
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
    const controller = new AbortController();
    let active = true;
    const fetchStats = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get('/public/health-stats', {
          params: filters, signal: controller.signal
        });
        if (active) setData(response.data.data);
      } catch (err) {
        if (!active) return;
        if (err.response && err.response.status === 429) {
          setError('Too many requests. Please wait a minute and try again.');
        } else {
          setData(null);
          setError(err.response?.status === 503 ? 'Health statistics are temporarily unavailable. No case counts are shown.' : 'Failed to load health statistics.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchStats();
    return () => { active = false; controller.abort(); };
  }, [filters, retryCount]);

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
  };

  const handleFilterChange = (e) => {
    setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const forecastData = useMemo(() => {
    if (Array.isArray(data?.forecast) && data.forecast.length > 0) {
      return data.forecast.map(item => ({
        ...item,
        bandRange: Math.max(0, (item.upper || 0) - (item.lower || 0))
      }));
    }
    if (Array.isArray(data?.trend) && data.trend.length >= 3) {
      const computed = calculate14DayForecast(data.trend);
      return computed.forecast || [];
    }
    return [];
  }, [data]);

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
    <PageTransition className="min-h-screen bg-[#0b1120] text-slate-200 pt-44 xl:pt-28 pb-12 px-6">
      <PublicNavbar />
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-blue-500 mb-2">
              Public Health Dashboard
            </h1>
            <p className="text-slate-400">{t("public.publicHealthSubtitle", "Anonymized disease tracking across Sri Lanka")}</p>
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
          <div role="alert" className="bg-red-500/20 border border-red-500/50 text-red-200 p-4 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <p className="font-medium">{error}</p>
              <p className="text-xs text-red-300/80 mt-1">Please try again or select a different time range.</p>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              disabled={loading}
              className="px-4 py-1.5 rounded-lg bg-red-500/30 hover:bg-red-500/40 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {loading ? 'Retrying...' : 'Retry'}
            </button>
          </div>
        )}

        {/* Content */}
        {!error && (
          <div className="space-y-6">
            {/* Demonstration Data Banner (Requirement R2) */}
            {(data?.isSimulatedDemo || data?.isSynthetic) && (
              <aside
                role="status"
                aria-live="polite"
                data-testid="demonstration-data-banner"
                className="glass-panel p-4 sm:p-5 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-orange-500/10 backdrop-blur-md text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg shadow-amber-950/20"
              >
                <div className="flex items-start sm:items-center gap-3.5">
                  <div className="p-2.5 rounded-lg bg-amber-500/20 border border-amber-400/30 text-amber-300 shrink-0">
                    <FiInfo className="text-xl sm:text-2xl" aria-hidden="true" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-bold text-amber-300 text-sm sm:text-base tracking-wide">
                        {t("public.simulatedNoticeTitle", "Demonstration Data Active")}
                      </h2>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                        {t("public.simulatedBadge", "DEMONSTRATION")}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-amber-200/90 leading-relaxed">
                      {t(
                        "public.simulatedNotice",
                        "Demonstration Data Active — This dashboard currently displays synthetic epidemiological data for simulation and evaluation purposes."
                      )}
                    </p>
                  </div>
                </div>
              </aside>
            )}

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

                {/* Trend Chart with View Switcher */}
                <div className="glass-panel p-4 rounded-xl border border-slate-700/50 bg-slate-800/50 backdrop-blur-md min-h-72 flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-slate-300 font-medium flex items-center gap-2 text-sm sm:text-base">
                      <FiTrendingUp className="text-teal-400" />
                      {trendView === 'forecast' ? t('public.forecastTitle', '14-Day Forecast') : t('public.caseTrend', 'Case Trend')}
                    </h3>
                    <div className="flex items-center gap-1 bg-slate-900/60 p-0.5 rounded-lg text-xs border border-white/5">
                      <button
                        type="button"
                        onClick={() => setTrendView('trend')}
                        className={`px-2 py-0.5 rounded transition-colors ${trendView === 'trend' ? 'bg-teal-500/20 text-teal-300 font-semibold' : 'text-slate-400 hover:text-white'}`}
                      >
                        {t('public.viewHistorical', 'Trend')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setTrendView('forecast')}
                        className={`px-2 py-0.5 rounded transition-colors ${trendView === 'forecast' ? 'bg-purple-500/20 text-purple-300 font-semibold' : 'text-slate-400 hover:text-white'}`}
                      >
                        {t('public.viewForecast', 'Forecast')}
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 relative">
                    {loading ? (
                      <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-xs sm:text-sm">
                        Loading {trendView === 'forecast' ? 'forecast' : 'trend'}...
                      </div>
                    ) : trendView === 'forecast' ? (
                      forecastData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={forecastData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="forecastBandGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.35}/>
                                <stop offset="95%" stopColor="#a855f7" stopOpacity={0.05}/>
                              </linearGradient>
                            </defs>
                            <XAxis dataKey="date" hide />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '0.5rem', color: '#f8fafc' }}
                              formatter={(val, name, item) => {
                                if (name === 'lower') return [null, null];
                                if (name === 'bandRange') return [`[${item.payload.lower} - ${item.payload.upper}]`, t('public.confidenceBand', '95% CI')];
                                return [val, t('public.predictedCases', 'Predicted')];
                              }}
                              labelFormatter={(label) => `Date: ${label}`}
                            />
                            <Area type="monotone" dataKey="lower" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} />
                            <Area type="monotone" dataKey="bandRange" stackId="band" stroke="#c084fc" strokeWidth={1} strokeDasharray="3 3" fill="url(#forecastBandGrad)" isAnimationActive={false} />
                            <Area type="monotone" dataKey="predicted" stroke="#a855f7" strokeWidth={2.5} fill="none" dot={{ r: 2.5, fill: '#c084fc' }} isAnimationActive={false} />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center">
                          <p className="text-slate-400 text-xs leading-relaxed">
                            {t('public.insufficientData', 'Insufficient historical data to compute 14-day outbreak forecast (minimum 3 days required).')}
                          </p>
                        </div>
                      )
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
                      <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-xs sm:text-sm">
                        Not enough data to show trend
                      </div>
                    ))}
                  </div>
                  {trendView === 'forecast' && (
                    <p className="text-[11px] text-purple-300/80 mt-2.5 text-center italic" data-testid="forecast-disclaimer">
                      {t('public.forecastDisclaimer', 'Statistical projection for demonstration and epidemiological trend evaluation; not clinically validated diagnostic advice.')}
                    </p>
                  )}
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

            {/* Dedicated Full-Width 14-Day Outbreak Forecast Section */}
            <div className="glass-panel p-6 rounded-xl border border-purple-500/20 bg-slate-800/40 backdrop-blur-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <FiTrendingUp className="text-purple-400 text-xl" />
                    <h2 className="text-xl font-bold text-white">
                      {t('public.forecastTitle', '14-Day Outbreak Forecast')}
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      {t('public.confidenceBand', '95% Confidence Interval')}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-1">
                    {t('public.forecastSubtitle', 'Epidemiological time-series projection with 95% confidence bands')}
                  </p>
                </div>
                {forecastData.length > 0 && (
                  <div className="flex items-center gap-4 text-xs text-slate-300 bg-slate-900/60 px-3 py-1.5 rounded-lg border border-white/5 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-purple-400 rounded-full inline-block" />
                      <span>{t('public.predictedCases', 'Predicted Cases')}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-2 bg-purple-500/30 border border-purple-400/50 rounded-sm inline-block" />
                      <span>{t('public.confidenceBand', '95% Confidence Band')}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="h-72 relative">
                {loading ? (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                    Loading forecast...
                  </div>
                ) : forecastData.length === 0 ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center rounded-lg border border-dashed border-slate-700/60 bg-slate-900/30">
                    <FiActivity className="text-slate-600 text-3xl mb-2" />
                    <p className="text-slate-300 font-medium text-sm sm:text-base">
                      {t('public.insufficientData', 'Insufficient historical data to compute 14-day outbreak forecast (minimum 3 days required).')}
                    </p>
                    <p className="text-slate-500 text-xs mt-1">
                      Select a different time range or disease filter to analyze active epidemiological trajectories.
                    </p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={forecastData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                      <defs>
                        <linearGradient id="fullForecastBandGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#a855f7" stopOpacity={0.35}/>
                          <stop offset="95%" stopColor="#a855f7" stopOpacity={0.05}/>
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="date"
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        tickLine={{ stroke: '#475569' }}
                        axisLine={{ stroke: '#334155' }}
                      />
                      <YAxis
                        tick={{ fill: '#94a3b8', fontSize: 11 }}
                        tickLine={{ stroke: '#475569' }}
                        axisLine={{ stroke: '#334155' }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', borderRadius: '0.5rem', color: '#f8fafc' }}
                        formatter={(val, name, item) => {
                          if (name === 'lower') return [null, null];
                          if (name === 'bandRange') return [`[${item.payload.lower} - ${item.payload.upper}]`, t('public.confidenceBand', '95% CI')];
                          return [val, t('public.predictedCases', 'Predicted')];
                        }}
                        labelFormatter={(label) => `Date: ${label}`}
                      />
                      <Area type="monotone" dataKey="lower" stackId="fullBand" stroke="none" fill="transparent" isAnimationActive={false} />
                      <Area type="monotone" dataKey="bandRange" stackId="fullBand" stroke="#c084fc" strokeWidth={1.5} strokeDasharray="3 3" fill="url(#fullForecastBandGrad)" isAnimationActive={false} />
                      <Area type="monotone" dataKey="predicted" stroke="#a855f7" strokeWidth={3} fill="none" dot={{ r: 3, fill: '#c084fc' }} activeDot={{ r: 5 }} isAnimationActive={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
};

export default PublicHealth;
