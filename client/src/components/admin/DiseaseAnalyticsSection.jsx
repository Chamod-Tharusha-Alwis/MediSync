import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer
} from 'recharts';
import {
  Search, TrendingUp, AlertCircle, Activity,
  MapPin, ChevronDown, ChevronUp, Clock, Layers
} from 'lucide-react';
import api from '../../api/axiosInstance';

const PRESET_RANGES = [
  { id: '24h', label: '24h', hours: 24 },
  { id: '72h', label: '72h', hours: 72 },
  { id: '7d', label: '7d', days: 7 },
  { id: '14d', label: '14d', days: 14 },
  { id: '1mo', label: '1mo', days: 30 },
  { id: '3mo', label: '3mo', days: 90 },
  { id: '6mo', label: '6mo', days: 180 },
  { id: '1yr', label: '1yr', days: 365 },
  { id: 'custom', label: 'Custom' }
];

function calculateRangeDates(preset, customStart, customEnd) {
  const now = new Date();
  if (preset === 'custom') {
    if (!customStart || !customEnd) return null;
    const start = new Date(customStart);
    start.setHours(0, 0, 0, 0);
    const end = new Date(customEnd);
    end.setHours(23, 59, 59, 999);
    return { from: start.toISOString(), to: end.toISOString() };
  }
  const match = PRESET_RANGES.find(p => p.id === preset);
  if (!match) return null;
  const to = now.toISOString();
  if (match.hours) {
    const from = new Date(now.getTime() - match.hours * 3600000).toISOString();
    return { from, to };
  }
  if (match.days) {
    const from = new Date(now.getTime() - match.days * 86400000).toISOString();
    return { from, to };
  }
  return null;
}

const DiseaseAnalyticsSection = () => {
  const { t } = useTranslation();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [selectedDisease, setSelectedDisease] = useState(null);

  // Time range state
  const [selectedRange, setSelectedRange] = useState('72h');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [customError, setCustomError] = useState('');

  // Analytics data state
  const [analyticsData, setAnalyticsData] = useState(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState('');

  // View toggle & pagination
  const [viewMode, setViewMode] = useState('district'); // 'district' | 'province' | 'island'
  const [showAllDistricts, setShowAllDistricts] = useState(false);

  const searchDebounceRef = useRef(null);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  // Debounced disease search
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    setShowDropdown(true);
    setSelectedIndex(-1);

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!val || val.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const res = await api.get(`/admin/analytics/diseases/search?q=${encodeURIComponent(val.trim())}&limit=15`);
        const list = res?.data?.data || [];
        setSearchResults(list);
      } catch (err) {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);
  };

  // Keyboard navigation for search results
  const handleKeyDown = (e) => {
    if (!showDropdown || searchResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < searchResults.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
        handleSelectDisease(searchResults[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  const handleSelectDisease = (disease) => {
    setSelectedDisease(disease);
    setSearchQuery(disease.displayName || `${disease.code} - ${disease.description}`);
    setShowDropdown(false);
    setSearchResults([]);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch disease analytics when disease or range changes
  const fetchAnalytics = useCallback(async () => {
    if (!selectedDisease?.code) return;
    const dates = calculateRangeDates(selectedRange, customStart, customEnd);
    if (!dates) return;

    setIsLoadingData(true);
    setDataError('');
    try {
      const res = await api.get(`/admin/analytics/diseases/${encodeURIComponent(selectedDisease.code)}?from=${dates.from}&to=${dates.to}`);
      const payload = res?.data?.data || null;
      setAnalyticsData(payload);
    } catch (err) {
      setDataError(err?.response?.data?.error || err.message || 'Failed to load disease analytics');
      setAnalyticsData(null);
    } finally {
      setIsLoadingData(false);
    }
  }, [selectedDisease, selectedRange, customStart, customEnd]);

  useEffect(() => {
    if (selectedDisease && selectedRange !== 'custom') {
      fetchAnalytics();
    }
  }, [selectedDisease, selectedRange, fetchAnalytics]);

  const handleApplyCustomRange = (e) => {
    e.preventDefault();
    setCustomError('');
    if (!customStart || !customEnd) {
      setCustomError('Both start and end dates are required');
      return;
    }
    const start = new Date(customStart);
    const end = new Date(customEnd);
    if (start > end) {
      setCustomError('Start date must be before or equal to end date');
      return;
    }
    const diffDays = (end - start) / (1000 * 60 * 60 * 24);
    if (diffDays > 730) {
      setCustomError('Date range cannot exceed 2 years');
      return;
    }
    fetchAnalytics();
  };

  const displayedDistricts = analyticsData?.districts
    ? (showAllDistricts ? analyticsData.districts : analyticsData.districts.slice(0, 10))
    : [];

  return (
    <div className="glass-panel p-6 rounded-2xl border border-white/5 space-y-6 mt-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-bold text-white">
              {t('diseaseAnalytics.sectionTitle', 'Disease Analytics')}
            </h2>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            {t('diseaseAnalytics.sectionSubtitle', 'Deep surveillance insights and epidemiological trends by ICD diagnosis.')}
          </p>
        </div>
      </div>

      {/* Disease Search Bar */}
      <div className="relative" ref={dropdownRef}>
        <div className="relative flex items-center">
          <Search className="w-5 h-5 text-slate-400 absolute left-4 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (searchResults.length > 0) setShowDropdown(true); }}
            placeholder={t('diseaseAnalytics.searchPlaceholder', 'Search by disease name or ICD code (e.g. Dengue, A90, 1D20, A27)...')}
            className="w-full pl-12 pr-10 py-3 bg-slate-900/60 border border-white/10 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
          {isSearching && (
            <div className="absolute right-4 w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          )}
        </div>

        {/* Autocomplete Dropdown */}
        {showDropdown && searchResults.length > 0 && (
          <ul
            className="absolute z-30 w-full mt-2 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl max-h-72 overflow-y-auto divide-y divide-white/5"
            role="listbox"
          >
            {searchResults.map((item, idx) => (
              <li
                key={`${item.version}-${item.code}-${idx}`}
                role="option"
                aria-selected={idx === selectedIndex}
                onClick={() => handleSelectDisease(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`px-4 py-3 cursor-pointer flex items-center justify-between text-sm transition-colors ${
                  idx === selectedIndex ? 'bg-blue-600/20 text-white' : 'text-slate-300 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded">
                    {item.code}
                  </span>
                  <span className="font-medium text-white">{item.description}</span>
                </div>
                <span className="text-[11px] uppercase tracking-wider text-slate-400 font-mono">
                  {item.version}
                </span>
              </li>
            ))}
          </ul>
        )}

        {showDropdown && searchQuery.trim().length >= 2 && !isSearching && searchResults.length === 0 && (
          <div className="absolute z-30 w-full mt-2 bg-slate-900 border border-slate-800 rounded-xl p-4 text-center text-sm text-slate-400 shadow-xl">
            {t('diseaseAnalytics.noSearchResults', 'No matching diseases found.')}
          </div>
        )}
      </div>

      {/* Selected Disease Info & Time Range Controls */}
      {selectedDisease ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/40 border border-white/5">
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 rounded-md bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-mono font-bold">
                {selectedDisease.code}
              </span>
              <div>
                <h3 className="text-base font-semibold text-white">
                  {selectedDisease.description || selectedDisease.displayName}
                </h3>
                <p className="text-xs text-slate-400">
                  {selectedDisease.version} • {t('diseaseAnalytics.honestyFootnote', 'Metrics reflect verified MediSync clinical cases only (lower bound).')}
                </p>
              </div>
            </div>

            {/* Range Presets */}
            <div className="flex flex-wrap items-center gap-1.5 bg-slate-950/40 p-1 rounded-xl border border-white/5">
              {PRESET_RANGES.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedRange(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedRange === p.id
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Date Range Picker */}
          {selectedRange === 'custom' && (
            <form onSubmit={handleApplyCustomRange} className="p-4 rounded-xl bg-slate-900/60 border border-white/10 flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {t('diseaseAnalytics.startDate', 'Start Date')}
                </label>
                <input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="px-3 py-2 bg-slate-950 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {t('diseaseAnalytics.endDate', 'End Date')}
                </label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="px-3 py-2 bg-slate-950 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg shadow-md transition-all"
              >
                {t('diseaseAnalytics.applyRange', 'Apply')}
              </button>
              {customError && (
                <p className="text-xs text-rose-400 font-medium flex items-center gap-1 self-center">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {customError}
                </p>
              )}
            </form>
          )}

          {/* Loading Indicator */}
          {isLoadingData && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-400">{t('diseaseAnalytics.loadingData', 'Loading disease analytics...')}</p>
            </div>
          )}

          {/* Error Message */}
          {dataError && !isLoadingData && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{dataError}</span>
            </div>
          )}

          {/* Analytics Results */}
          {!isLoadingData && analyticsData && (
            <div className="space-y-6">
              {/* Summary Tiles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 rounded-xl bg-slate-900/60 border border-white/5 flex items-center gap-4">
                  <div className="p-3 bg-blue-500/10 rounded-lg text-blue-400 border border-blue-500/20">
                    <Activity className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs font-medium">
                      {t('diseaseAnalytics.totalVerifiedCases', 'Total Verified Cases')}
                    </p>
                    <p className="text-2xl font-black text-white font-mono mt-0.5">
                      {analyticsData.summary?.totalCases ?? 0}
                    </p>
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-slate-900/60 border border-white/5 flex items-center gap-4">
                  <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-400 border border-emerald-500/20">
                    <MapPin className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs font-medium">
                      {t('diseaseAnalytics.districtsAffected', 'Districts Affected')}
                    </p>
                    <p className="text-2xl font-black text-white font-mono mt-0.5">
                      {analyticsData.summary?.districtsAffected ?? 0} <span className="text-xs text-slate-400 font-normal">/ 25</span>
                    </p>
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-slate-900/60 border border-white/5 flex items-center gap-4">
                  <div className="p-3 bg-purple-500/10 rounded-lg text-purple-400 border border-purple-500/20">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs font-medium">
                      {t('diseaseAnalytics.changeVsPrevious', 'Change vs Previous Period')}
                    </p>
                    <p className="text-2xl font-black text-white font-mono mt-0.5">
                      {analyticsData.summary?.change > 0 ? `+${analyticsData.summary.change}` : analyticsData.summary?.change ?? 0}
                      <span className="text-xs text-slate-400 font-normal ml-2">
                        {analyticsData.summary?.changePct === 'new'
                          ? `(${t('diseaseAnalytics.newCluster', 'new')})`
                          : `(${analyticsData.summary?.changePct ?? 0}%)`}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="p-5 rounded-xl bg-slate-900/60 border border-white/5 flex items-center gap-4">
                  <div className="p-3 bg-amber-500/10 rounded-lg text-amber-400 border border-amber-500/20">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs font-medium">
                      {t('diseaseAnalytics.peakDay', 'Peak Day')}
                    </p>
                    <p className="text-lg font-bold text-white mt-0.5 truncate">
                      {analyticsData.summary?.peakDay?.date
                        ? `${analyticsData.summary.peakDay.date} (${analyticsData.summary.peakDay.count})`
                        : 'None'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Empty state notice if total cases === 0 */}
              {analyticsData.summary?.totalCases === 0 && (
                <div className="p-8 rounded-xl bg-slate-900/40 border border-white/5 text-center space-y-2">
                  <AlertCircle className="w-8 h-8 text-slate-400 mx-auto opacity-60" />
                  <p className="text-base text-slate-300 font-medium">
                    {t('diseaseAnalytics.emptyCases', 'No verified cases for this disease in this period.')}
                  </p>
                  <p className="text-xs text-slate-400">
                    {t('diseaseAnalytics.honestyFootnote', 'Metrics reflect verified MediSync clinical cases only (lower bound).')}
                  </p>
                </div>
              )}

              {/* Time Series Chart */}
              {analyticsData.summary?.totalCases > 0 && Array.isArray(analyticsData.timeSeries) && analyticsData.timeSeries.length > 0 && (
                <div className="p-6 rounded-xl bg-slate-900/50 border border-white/5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-base font-bold text-white flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-blue-400" />
                      {t('diseaseAnalytics.casesOverTime', 'Verified Cases Over Time')}
                    </h4>
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 font-mono">
                      Bucket: {analyticsData.range?.bucket}
                    </span>
                  </div>
                  <div style={{ minHeight: 280, minWidth: 0 }} className="w-full h-72">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
                      <AreaChart data={analyticsData.timeSeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis
                          dataKey="label"
                          stroke="#94a3b8"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          stroke="#94a3b8"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                          allowDecimals={false}
                        />
                        <RechartsTooltip
                          contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                        />
                        <Area
                          type="monotone"
                          dataKey="count"
                          name={t('diseaseAnalytics.cases', 'Cases')}
                          stroke="#3b82f6"
                          fill="#3b82f6"
                          fillOpacity={0.25}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Breakdown Toggle & Tables */}
              <div className="p-6 rounded-xl bg-slate-900/50 border border-white/5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-4">
                  <h4 className="text-base font-bold text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-400" />
                    {viewMode === 'district' && t('diseaseAnalytics.districtBreakdown', 'District Breakdown')}
                    {viewMode === 'province' && t('diseaseAnalytics.provinceBreakdown', 'Province Breakdown')}
                    {viewMode === 'island' && t('diseaseAnalytics.islandTotal', 'Island-Wide Total')}
                  </h4>

                  {/* Toggle buttons */}
                  <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-white/5">
                    <button
                      type="button"
                      onClick={() => setViewMode('district')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        viewMode === 'district'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {t('diseaseAnalytics.toggleDistrict', 'District')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('province')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        viewMode === 'province'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {t('diseaseAnalytics.toggleProvince', 'Province')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('island')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        viewMode === 'island'
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {t('diseaseAnalytics.toggleIsland', 'Island-wide')}
                    </button>
                  </div>
                </div>

                {/* View Mode: District Table */}
                {viewMode === 'district' && (
                  <div className="space-y-4">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-white/5 bg-slate-950/40">
                          <tr>
                            <th className="py-3 px-4">{t('diseaseAnalytics.toggleDistrict', 'District')}</th>
                            <th className="py-3 px-4 text-right">{t('diseaseAnalytics.cases', 'Cases')}</th>
                            <th className="py-3 px-4 text-right">{t('diseaseAnalytics.population', 'Population')}</th>
                            <th className="py-3 px-4 text-right">{t('diseaseAnalytics.incidencePer100k', 'Incidence (per 100k)')}</th>
                            <th className="py-3 px-4 text-right">{t('diseaseAnalytics.shareOfPopulation', 'Share of Population')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-slate-300">
                          {displayedDistricts.map(d => (
                            <tr key={d.district} className="hover:bg-white/5 transition-colors">
                              <td className="py-3 px-4 font-medium text-white flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${d.cases > 0 ? 'bg-rose-500' : 'bg-slate-700'}`} />
                                {d.district}
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-white">
                                {d.cases}
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-slate-400">
                                {d.population ? d.population.toLocaleString() : 'N/A'}
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-slate-300">
                                {d.incidenceDisplay || '0.00 / 100k'}
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-slate-300">
                                {d.formattedShare || '0%'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {analyticsData.districts && analyticsData.districts.length > 10 && (
                      <div className="text-center pt-2">
                        <button
                          type="button"
                          onClick={() => setShowAllDistricts(prev => !prev)}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 transition-all"
                        >
                          {showAllDistricts ? (
                            <>
                              <ChevronUp className="w-3.5 h-3.5" />
                              {t('diseaseAnalytics.showTop10', 'Show top 10 districts')}
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3.5 h-3.5" />
                              {t('diseaseAnalytics.showAllDistricts', 'Show all 25 districts')}
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* View Mode: Province Table */}
                {viewMode === 'province' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-[11px] uppercase tracking-wider text-slate-400 border-b border-white/5 bg-slate-950/40">
                        <tr>
                          <th className="py-3 px-4">{t('diseaseAnalytics.toggleProvince', 'Province')}</th>
                          <th className="py-3 px-4">{t('diseaseAnalytics.toggleDistrict', 'Districts')}</th>
                          <th className="py-3 px-4 text-right">{t('diseaseAnalytics.cases', 'Cases')}</th>
                          <th className="py-3 px-4 text-right">{t('diseaseAnalytics.population', 'Population')}</th>
                          <th className="py-3 px-4 text-right">{t('diseaseAnalytics.incidencePer100k', 'Incidence (per 100k)')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-slate-300">
                        {(analyticsData.provinces || []).map(p => (
                          <tr key={p.province} className="hover:bg-white/5 transition-colors">
                            <td className="py-3 px-4 font-medium text-white flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${p.cases > 0 ? 'bg-purple-500' : 'bg-slate-700'}`} />
                              {p.province}
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-400">
                              {p.districts.join(', ')}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-white">
                              {p.cases}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-400">
                              {p.population ? p.population.toLocaleString() : 'N/A'}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-300">
                              {p.incidenceDisplay || '0.00 / 100k'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* View Mode: Island Total Card */}
                {viewMode === 'island' && (
                  <div className="p-6 rounded-xl bg-slate-950/60 border border-white/5 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Island-Wide Total Cases</p>
                      <p className="text-3xl font-black text-white font-mono mt-1">
                        {analyticsData.island?.totalCases ?? 0}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Across {analyticsData.island?.districtsAffected ?? 0} reporting districts
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 font-medium">Island Population (DCS 2024)</p>
                      <p className="text-3xl font-black text-white font-mono mt-1">
                        {analyticsData.island?.population ? analyticsData.island.population.toLocaleString() : 'N/A'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">Official national census estimate</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 font-medium">National Incidence Rate</p>
                      <p className="text-3xl font-black text-blue-400 font-mono mt-1">
                        {analyticsData.island?.incidenceDisplay || '0.00 / 100k'}
                      </p>
                      <p className="text-xs text-slate-400 mt-1">Verified MediSync cases per 100,000</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Empty Prompt before selecting disease */
        <div className="p-12 rounded-xl bg-slate-900/30 border border-dashed border-white/10 text-center space-y-3">
          <Search className="w-8 h-8 text-slate-400 mx-auto opacity-40" />
          <h3 className="text-base font-semibold text-white">
            {t('diseaseAnalytics.selectPrompt', 'Search and select a disease above to load epidemiological graphs and telemetry.')}
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {t('diseaseAnalytics.searchInstructions', 'Type at least 2 characters to search over 71,000 ICD-10 and ICD-11 conditions.')}
          </p>
        </div>
      )}
    </div>
  );
};

export default DiseaseAnalyticsSection;
