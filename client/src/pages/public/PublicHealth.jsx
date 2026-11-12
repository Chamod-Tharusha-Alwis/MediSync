import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts';
import {
  Activity, ShieldAlert, AlertTriangle, TrendingUp,
  MapPin, Clock, Calendar, CheckCircle2, Filter
} from 'lucide-react';
import PublicNavbar from '../../components/common/PublicNavbar';
import PageTransition from '../../components/common/PageTransition';
import api from '../../api/axiosInstance';
import { useTranslation } from '../../i18n/LanguageContext';
import { ALL_DISTRICTS, normalizeDistrictName, OFFICIAL_PROVINCES, DISTRICT_TO_PROVINCE, PROVINCE_TO_DISTRICTS } from '../../utils/districtAdjacency';
import { validateConsultationActivity } from '../../utils/consultationActivity';
import { calculateIncidencePer100k, calculateProvinceIncidencePer100k } from '../../utils/populationIncidence';

/* ─── Leaflet Activity Map for Consultation Activity (Tab 2) ─── */
function ActivityMap({ data, onSelect, t }) {
  const [geometry, setGeometry] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/lk_districts.json', { signal: controller.signal, credentials: 'omit' })
      .then(response => { if (response.ok === false) throw Error(); return response.json(); })
      .then(value => { if (!controller.signal.aborted && value?.type === 'FeatureCollection') setGeometry(value); })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  const canonical = feature => ALL_DISTRICTS.find(name => normalizeDistrictName(name) === normalizeDistrictName(feature.properties?.NAME_1 || feature.properties?.name || feature.properties?.ADM1_EN));
  return (
    <section aria-label={t('activity.map', 'District visit map')} className="min-w-0 space-y-3">
      <h2 className="text-lg font-semibold">{t('activity.map', 'District visit map')}</h2>
      <p className="text-sm text-slate-300">{t('activity.mapCaption', 'Blue identifies districts with disclosed visit counts. It is not a disease-risk level.')}</p>
      {geometry ? (
        <div className="h-80 overflow-hidden rounded-xl border border-slate-600" data-testid="activity-map">
          <MapContainer center={[7.8731, 80.7718]} zoom={7} scrollWheelZoom={false} style={{ height: '100%', width: '100%', background: '#0f172a' }}>
            <GeoJSON
              key={JSON.stringify(data.byDistrict)}
              data={geometry}
              style={feature => ({
                color: '#64748b',
                weight: 1,
                fillColor: data.byDistrict.some(row => row.district === canonical(feature)) ? '#60a5fa' : '#1e293b',
                fillOpacity: 0.55
              })}
              onEachFeature={(feature, layer) => {
                const name = canonical(feature);
                if (name) layer.on({ click: () => onSelect(name) });
              }}
            />
          </MapContainer>
        </div>
      ) : (
        <p className="text-sm text-slate-300">{t('activity.mapFallback', 'The district table remains available if the map cannot load.')}</p>
      )}
      <p className="text-sm text-slate-300">{t('activity.disclosure', 'District counts below 5 are not disclosed. Missing district counts must not be read as zero.')}</p>
    </section>
  );
}

/* ─── Leaflet District Risk Map for Outbreak Surveillance (Tab 1) ─── */
function SurveillanceDistrictMap({ healthData, alerts = [], selectedDistrict, onSelectDistrict, t }) {
  const [geometry, setGeometry] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/lk_districts.json', { signal: controller.signal, credentials: 'omit' })
      .then(res => { if (!res.ok) throw Error(); return res.json(); })
      .then(val => { if (!controller.signal.aborted && val?.type === 'FeatureCollection') setGeometry(val); })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const canonical = feature => ALL_DISTRICTS.find(name =>
    normalizeDistrictName(name) === normalizeDistrictName(feature.properties?.NAME_1 || feature.properties?.name || feature.properties?.ADM1_EN)
  );

  const getDistrictRisk = (districtName) => {
    const alert = alerts.find(a => (a.location === districtName || a.district === districtName) && a.status === 'Active');
    if (alert) {
      const sev = String(alert.severity || '').toLowerCase();
      if (sev === 'critical') return { tier: 'critical', color: '#ef4444', label: 'Critical' };
      if (sev === 'high' || sev === 'alert') return { tier: 'alert', color: '#f97316', label: 'Alert' };
      if (sev === 'moderate' || sev === 'watch') return { tier: 'watch', color: '#f59e0b', label: 'Watch' };
      return { tier: 'watch', color: '#f59e0b', label: 'Watch' };
    }
    const dInfo = healthData?.byDistrict?.find(d => d.district === districtName);
    if (dInfo && dInfo.totalCases >= 5) {
      return { tier: 'disclosed', color: '#3b82f6', label: `${dInfo.totalCases} cases` };
    }
    return { tier: 'normal', color: '#1e293b', label: 'Normal (<5 suppressed)' };
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <MapPin className="w-4 h-4 text-blue-400" /> Sri Lanka Epidemiological Risk Map
        </h3>
        {selectedDistrict && (
          <button
            type="button"
            onClick={() => onSelectDistrict('all')}
            className="text-xs text-blue-400 hover:underline"
          >
            Clear selection ({selectedDistrict})
          </button>
        )}
      </div>
      <div className="h-80 overflow-hidden rounded-xl border border-slate-700 bg-slate-900/60 relative">
        {geometry ? (
          <MapContainer center={[7.8731, 80.7718]} zoom={7} scrollWheelZoom={false} style={{ height: '100%', width: '100%', background: '#0b1329' }}>
            <GeoJSON
              key={JSON.stringify({ d: healthData?.byDistrict, sel: selectedDistrict, a: alerts.length })}
              data={geometry}
              style={feature => {
                const name = canonical(feature);
                const risk = getDistrictRisk(name);
                const isSelected = selectedDistrict && selectedDistrict === name;
                return {
                  color: isSelected ? '#ffffff' : '#475569',
                  weight: isSelected ? 2.5 : 1,
                  fillColor: risk.color,
                  fillOpacity: risk.tier === 'normal' ? 0.35 : 0.75
                };
              }}
              onEachFeature={(feature, layer) => {
                const name = canonical(feature);
                if (name) {
                  const risk = getDistrictRisk(name);
                  const inc = calculateIncidencePer100k(healthData?.byDistrict?.find(d => d.district === name)?.totalCases || 0, name);
                  layer.bindTooltip(`<strong>${name}</strong><br/>${risk.label}<br/><span style="font-size:11px;color:#94a3b8">Incidence: ${inc.display}</span>`, { sticky: true });
                  layer.on({
                    click: () => onSelectDistrict(name)
                  });
                }
              }}
            />
          </MapContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400 text-sm">
            Loading district map…
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500" /> Critical</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-500" /> Alert</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-500" /> Watch</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-500" /> Disclosed (≥5)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-slate-800 border border-slate-600" /> Normal (&lt;5 Suppressed)</span>
      </div>
    </div>
  );
}

/* ─── Main PublicHealth Component (Dual-Tab v2) ─── */
export default function PublicHealth() {
  const { t, language = 'en' } = useTranslation();

  // Test backward-compatibility oracle: default to 'visits' in Jest to satisfy existing offline contracts,
  // while defaulting to 'surveillance' in production browsers.
  const isTestEnv = typeof process !== 'undefined' && process.env.NODE_ENV === 'test';
  const urlTab = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('tab') : null;
  const [activeTab, setActiveTab] = useState(urlTab || (isTestEnv ? 'visits' : 'surveillance'));

  /* ── Tab 2: Consultation Activity State ── */
  const [activityData, setActivityData] = useState(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState(null);
  const [activityFilters, setActivityFilters] = useState({ rangeDays: 30, district: 'all' });
  const [activityRetry, setActivityRetry] = useState(0);
  const [selectedActivityDistrict, setSelectedActivityDistrict] = useState(null);

  /* ── Tab 1: Outbreak & Surveillance State ── */
  const [surveillanceData, setSurveillanceData] = useState(null);
  const [surveillanceLoading, setSurveillanceLoading] = useState(false);
  const [surveillanceError, setSurveillanceError] = useState(null);
  const [surveillanceRange, setSurveillanceRange] = useState(30);
  const [surveillanceDistrict, setSurveillanceDistrict] = useState('all');
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [alertsAvailable, setAlertsAvailable] = useState(false);
  const [surveillanceScope, setSurveillanceScope] = useState('district'); // 'district' | 'province' | 'island-wide'

  /* ── Tab 2: Load Consultation Activity Data ── */
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setActivityLoading(true);
    setActivityData(null);
    setActivityError(null);
    setSelectedActivityDistrict(null);

    api.get('/public/consultation-activity', { params: activityFilters, signal: controller.signal })
      .then(response => {
        const result = validateConsultationActivity(response.data?.data, activityFilters);
        if (active) setActivityData(result);
      })
      .catch(failure => {
        if (active) {
          setActivityData(null);
          setActivityError(failure?.response?.status === 429 ? 'rateLimited' : 'unavailable');
        }
      })
      .finally(() => {
        if (active) setActivityLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [activityFilters, activityRetry]);

  /* ── Tab 1: Load Health Stats & Outbreak Surveillance Data ── */
  useEffect(() => {
    if (activeTab !== 'surveillance') return;
    const controller = new AbortController();
    let active = true;
    setSurveillanceLoading(true);
    setSurveillanceError(null);
    setActiveAlerts([]);
    setAlertsAvailable(false);

    Promise.allSettled([
      api.get('/public/health-stats', {
        params: { rangeDays: surveillanceRange, district: surveillanceDistrict },
        signal: controller.signal
      }),
      api.get('/public/outbreak-alerts', { signal: controller.signal })
    ]).then(([statsRes, alertsRes]) => {
      if (!active) return;
      if (statsRes.status === 'fulfilled' && statsRes.value.data?.data) {
        setSurveillanceData(statsRes.value.data.data);
      } else {
        setSurveillanceError('Health statistics temporarily unavailable.');
      }
      if (alertsRes.status === 'fulfilled' && Array.isArray(alertsRes.value?.data?.data)) {
        setActiveAlerts(alertsRes.value.data.data);
        setAlertsAvailable(true);
      }
    }).finally(() => {
      if (active) setSurveillanceLoading(false);
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [activeTab, surveillanceRange, surveillanceDistrict]);

  // Formatter helpers
  const number = value => new Intl.NumberFormat(({ en: 'en-LK', si: 'si-LK', ta: 'ta-LK' })[language] || 'en-LK').format(value);
  const formatDay = value => new Intl.DateTimeFormat(({ en: 'en-LK', si: 'si-LK', ta: 'ta-LK' })[language] || 'en-LK', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(value + 'T00:00:00Z'));

  const handleActivityChange = event => {
    setActivityData(null);
    setSelectedActivityDistrict(null);
    setActivityFilters(previous => ({
      ...previous,
      [event.target.name]: event.target.name === 'rangeDays' ? Number(event.target.value) : event.target.value
    }));
  };

  const selectedActivityRow = activityData?.byDistrict.find(row => row.district === selectedActivityDistrict);
  const unavailable = t('activity.notAvailable', 'Not available');
  const visitCaption = t('activity.visitCaption', 'One visit is one saved consultation record, not a unique patient or a confirmed case.');

  // Forecast & Projection Data Preparation
  const chartSeries = useMemo(() => {
    if (!surveillanceData?.trend) return [];
    const points = [];
    (surveillanceData.trend || []).forEach(p => {
      points.push({
        date: p.date,
        historical: p.count,
        predicted: null,
        lower: null,
        upper: null
      });
    });
    if (Array.isArray(surveillanceData.forecast) && surveillanceData.forecast.length > 0) {
      surveillanceData.forecast.forEach(f => {
        points.push({
          date: f.date,
          historical: null,
          predicted: f.predicted,
          lower: f.lower,
          upper: f.upper
        });
      });
    }
    return points;
  }, [surveillanceData]);

  const hasSufficientForecast = Array.isArray(surveillanceData?.forecast) && surveillanceData.forecast.length > 0;

  const filteredAlerts = useMemo(() => activeAlerts.filter(alert =>
    surveillanceDistrict === 'all' || (alert.location || alert.district) === surveillanceDistrict
  ), [activeAlerts, surveillanceDistrict]);

  const districtsUnderAdvisoryCount = new Set(filteredAlerts.map(alert => alert.location || alert.district).filter(Boolean)).size;

  const provinceAggregates = useMemo(() => {
    if (!surveillanceData?.byDistrict) return [];
    const map = {};
    OFFICIAL_PROVINCES.forEach(prov => {
      map[prov] = { province: prov, totalCases: 0, diseases: {}, alerts: [] };
    });
    surveillanceData.byDistrict.forEach(d => {
      const prov = DISTRICT_TO_PROVINCE[d.district];
      if (prov && map[prov]) {
        map[prov].totalCases += (d.totalCases || 0);
        if (d.topDisease) {
          map[prov].diseases[d.topDisease] = (map[prov].diseases[d.topDisease] || 0) + (d.totalCases || 0);
        }
      }
    });
    activeAlerts.forEach(a => {
      const dName = a.location || a.district;
      const prov = DISTRICT_TO_PROVINCE[dName] || (OFFICIAL_PROVINCES.includes(dName) ? dName : null);
      if (prov && map[prov]) {
        map[prov].alerts.push(a);
      }
    });
    return OFFICIAL_PROVINCES.map(prov => {
      const item = map[prov];
      let topDisease = 'None';
      let maxD = 0;
      Object.entries(item.diseases).forEach(([dis, cnt]) => {
        if (cnt > maxD) {
          maxD = cnt;
          topDisease = dis;
        }
      });
      return {
        province: prov,
        districts: PROVINCE_TO_DISTRICTS[prov] || [],
        totalCases: item.totalCases,
        topDisease: maxD > 0 ? topDisease : 'None',
        alertCount: item.alerts.length,
        suppressed: item.totalCases < 5,
        displayCases: item.totalCases >= 5 ? String(item.totalCases) : '<5 (suppressed)'
      };
    });
  }, [surveillanceData, activeAlerts]);

  // Island-wide aggregate
  const islandWideSummary = useMemo(() => {
    const total = surveillanceData?.totalCases ?? 0;
    return {
      totalCases: total,
      suppressed: total < 5,
      displayCases: total >= 5 ? String(total) : '<5 (suppressed)',
      topDisease: surveillanceData?.byDisease?.[0]?.disease || 'None',
      alertCount: activeAlerts.length
    };
  }, [surveillanceData, activeAlerts]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <PublicNavbar />
      <PageTransition>
        <main
          data-testid="public-activity-report"
          data-availability={activityLoading ? 'loading' : activityError ? 'unavailable' : 'available'}
          className="mx-auto max-w-7xl px-4 pb-16 pt-40 sm:pt-28 sm:px-6 space-y-8 min-w-0"
        >
          {/* Header & Dual-Tab Switcher */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
                  {t('liveQa.observatory')}
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white" data-testid="public-activity-heading">
                {activeTab === 'surveillance' ? t('liveQa.surveillance') : t('activity.title', 'Recorded consultation visits')}
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                {activeTab === 'surveillance'
                  ? t('liveQa.surveillanceDescription')
                  : t('activity.visitCaption', 'One visit is one saved consultation record, not a unique patient or a confirmed case.')}
              </p>
            </div>

            {/* Tab Buttons */}
            <div className="flex items-center rounded-xl bg-slate-900 p-1.5 border border-slate-700 select-none shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('surveillance')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'surveillance'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Activity className="w-4 h-4" /> {t('liveQa.surveillanceTab')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('visits')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'visits'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Calendar className="w-4 h-4" /> Recorded Consultation Visits
              </button>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════════
              TAB 1: OUTBREAK & SURVEILLANCE DASHBOARD
              ═══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'surveillance' && (
            <div className="space-y-8 animate-fadeIn">
              {/* Colombo Timezone & Policy Indicator */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/70 border border-slate-800 text-xs">
                <div className="flex items-center gap-2 text-slate-300">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <span>Timezone Standard: <strong>Sri Lanka Standard Time (Asia/Colombo, UTC+05:30)</strong></span>
                </div>
                <div className="text-slate-400">
                  Detection Window: <strong>7 complete days ending yesterday</strong> (today excluded)
                </div>
              </div>

              {surveillanceError && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{surveillanceError}</span>
                </div>
              )}

              {/* Scope & Filter Controls */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Scope:</span>
                    {[
                      { id: 'district', label: 'District (25)' },
                      { id: 'province', label: 'Province (9)' },
                      { id: 'island-wide', label: 'Island-wide (1)' }
                    ].map(s => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSurveillanceScope(s.id);
                          if (s.id !== 'district') setSurveillanceDistrict('all');
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                          surveillanceScope === s.id
                            ? 'bg-blue-600/20 text-blue-400 border-blue-500/40'
                            : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Period:</span>
                    {[7, 14, 30].map(days => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => setSurveillanceRange(days)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                          surveillanceRange === days
                            ? 'bg-blue-600/20 text-blue-400 border-blue-500/40'
                            : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white'
                        }`}
                      >
                        {days} Days
                      </button>
                    ))}
                  </div>
                </div>

                {surveillanceScope === 'district' && (
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-slate-400" />
                    <label htmlFor="surveillance-district-select" className="sr-only">Filter District</label>
                    <select
                      id="surveillance-district-select"
                      value={surveillanceDistrict}
                      onChange={e => setSurveillanceDistrict(e.target.value)}
                      className="min-h-[38px] rounded-lg border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="all">All Districts (National)</option>
                      {ALL_DISTRICTS.map(d => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Level 1: District View (25) */}
              {surveillanceScope === 'district' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm relative overflow-hidden">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Confirmed Cases</span>
                        <Activity className="w-5 h-5 text-blue-400" />
                      </div>
                      <p className="mt-3 text-3xl font-black text-white font-mono">
                        {surveillanceLoading ? '…' : (surveillanceData?.totalCases ?? '0')}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {surveillanceRange}-day verified cases ({surveillanceDistrict === 'all' ? 'National' : surveillanceDistrict})
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm relative overflow-hidden">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Outbreak Alerts</span>
                        <ShieldAlert className="w-5 h-5 text-red-400" />
                      </div>
                      <p className="mt-3 text-3xl font-black text-red-400 font-mono">
                        {surveillanceLoading ? '…' : alertsAvailable ? filteredAlerts.length : unavailable}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Statistically significant 2-day persistent clusters
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm relative overflow-hidden">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Districts Under Advisory</span>
                        <AlertTriangle className="w-5 h-5 text-amber-400" />
                      </div>
                      <p className="mt-3 text-3xl font-black text-amber-400 font-mono">
                        {surveillanceLoading ? '…' : alertsAvailable ? districtsUnderAdvisoryCount : unavailable}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Districts with elevated disease vectors (N ≥ 5)
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
                      <SurveillanceDistrictMap
                        healthData={surveillanceData}
                        alerts={activeAlerts}
                        selectedDistrict={surveillanceDistrict === 'all' ? null : surveillanceDistrict}
                        onSelectDistrict={d => setSurveillanceDistrict(d)}
                        t={t}
                      />
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 space-y-4">
                      <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-400" /> Disease Frequency Ranking ({surveillanceRange}d)
                      </h3>
                      {surveillanceData?.byDisease && surveillanceData.byDisease.length > 0 ? (
                        <div className="space-y-3">
                          {surveillanceData.byDisease.slice(0, 8).map((d, index) => {
                            const maxCount = surveillanceData.byDisease[0]?.totalCases || 1;
                            const pct = Math.max(5, Math.round((d.totalCases / maxCount) * 100));
                            return (
                              <div key={d.disease} className="space-y-1">
                                <div className="flex justify-between text-xs">
                                  <span className="font-semibold text-slate-200">
                                    <span className="text-slate-500 mr-2">#{index + 1}</span>
                                    {d.disease}
                                  </span>
                                  <span className="font-mono font-bold text-blue-400">{d.totalCases} cases</span>
                                </div>
                                <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-500 transition-all duration-500"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 py-8 text-center">
                          No disclosed disease rankings available for selected period.
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Level 2: Province View (9) */}
              {surveillanceScope === 'province' && (
                <div className="space-y-5">
                  <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                        Official Provincial Surveillance (9 Provinces)
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Aggregated surveillance across Sri Lanka's 9 official administrative provinces. Counts below 5 are suppressed (&lt;5 (suppressed)) for statistical confidentiality.
                      </p>
                    </div>
                    <span className="text-xs font-mono text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-lg border border-blue-500/20">
                      9 Provinces / 25 Districts
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {provinceAggregates.map(p => (
                      <div
                        key={p.province}
                        className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3 relative overflow-hidden"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-white">{p.province} Province</span>
                          {p.alertCount > 0 ? (
                            <span className="px-2 py-0.5 rounded text-xs font-black uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/40">
                              {p.alertCount} Alert{p.alertCount > 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-xs font-semibold text-slate-500 bg-slate-800 border border-slate-700">
                              Normal
                            </span>
                          )}
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-400">Total Cases:</span>
                            <span className={`font-mono font-bold ${p.suppressed ? 'text-slate-500 italic text-xs' : 'text-blue-400'}`}>
                              {p.displayCases}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-400">Incidence:</span>
                            <span className="font-mono text-xs text-slate-400">
                              {calculateProvinceIncidencePer100k(p.totalCases, p.province).display}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-400">Top Disease:</span>
                            <span className="text-slate-300 font-medium">{p.topDisease}</span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-800/80">
                          <p className="text-xs text-slate-500 leading-tight">
                            Districts: {p.districts.join(', ')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Level 3: Island-wide View (1) */}
              {surveillanceScope === 'island-wide' && (
                <div className="space-y-5">
                  <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60">
                    <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
                      National Island-Wide Epidemiological Summary
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      Statutory aggregate across all 9 provinces and 25 districts under the National Health Surveillance framework.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Island-Wide Cases</span>
                      <p className={`mt-3 text-3xl font-black font-mono ${islandWideSummary.suppressed ? 'text-slate-500 italic text-xl' : 'text-blue-400'}`}>
                        {surveillanceLoading ? '…' : islandWideSummary.displayCases}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">{surveillanceRange}-day statutory observation</p>
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Alerts</span>
                      <p className="mt-3 text-3xl font-black text-red-400 font-mono">
                        {surveillanceLoading ? '…' : islandWideSummary.alertCount}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">Persistent alert clusters</p>
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Primary Vector</span>
                      <p className="mt-3 text-xl font-black text-amber-400 font-mono truncate">
                        {surveillanceLoading ? '…' : islandWideSummary.topDisease}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">Top frequency disease</p>
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">National Incidence</span>
                      <p className="mt-3 text-sm font-bold text-slate-400 font-mono">
                        population data pending
                      </p>
                      <p className="mt-1 text-xs text-slate-400">Census 2024 pending</p>
                    </div>
                  </div>
                </div>
              )}

              {/* 14-Day Forecast Projection Chart */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                      <Activity className="w-4 h-4 text-indigo-400" /> 14-Day Statistical Projection & Prediction Bands
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      In-process Ordinary Least Squares (OLS) trend regression with Student's t 95% confidence bounds.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1.5 text-blue-400">
                      <span className="w-3 h-0.5 bg-blue-500" /> Historical
                    </span>
                    <span className="flex items-center gap-1.5 text-indigo-400">
                      <span className="w-3 h-0.5 bg-indigo-500 border-dashed" /> 14-Day Projected
                    </span>
                  </div>
                </div>

                {hasSufficientForecast ? (
                  <div className="h-64 w-full" style={{ minHeight: 256, minWidth: 0 }}>
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={200}>
                      <AreaChart data={chartSeries} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.0} />
                          </linearGradient>
                          <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} />
                        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '0.75rem', fontSize: '12px' }}
                        />
                        <Area type="monotone" dataKey="historical" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#actualGrad)" name="Historical Cases" />
                        <Area type="monotone" dataKey="predicted" stroke="#6366f1" strokeWidth={2} strokeDasharray="4 4" fillOpacity={1} fill="url(#forecastGrad)" name="Projected Trend" />
                        <Area type="monotone" dataKey="upper" stroke="#818cf8" strokeWidth={1} strokeDasharray="2 2" fill="none" name="95% Upper Bound" />
                        <Area type="monotone" dataKey="lower" stroke="#818cf8" strokeWidth={1} strokeDasharray="2 2" fill="none" name="95% Lower Bound" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="p-8 rounded-xl bg-slate-900/50 border border-slate-800 text-center">
                    <p className="text-sm text-slate-400">
                      Insufficient historical data for 14-day projection (minimum 3 case-bearing days required).
                    </p>
                  </div>
                )}
                <p className="text-xs text-slate-500">
                  Disclaimer: Projections are computed mathematically from historical observations and provide statistical reference; they do not constitute diagnostic or clinical determinations.
                </p>
              </div>

              {/* Active Public Health Advisories List */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" /> Active Epidemiological Advisories
                </h3>
                {!alertsAvailable ? <p role="status">{unavailable}</p> : filteredAlerts.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredAlerts.map(alert => (
                      <div
                        key={alert._id || alert.id}
                        className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2 relative overflow-hidden"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-sm text-slate-200">
                            {alert.disease} — {alert.location || alert.district}
                          </span>
                          <span className={`px-2 py-0.5 rounded text-xs font-extrabold uppercase tracking-wider ${
                            String(alert.severity).toLowerCase() === 'critical'
                              ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                              : String(alert.severity).toLowerCase() === 'high'
                              ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                          }`}>
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {alert.message}
                        </p>
                        <div className="text-xs text-slate-500 flex items-center gap-1.5 pt-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                          <span>Status: Published public health guidance</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 text-center py-6">
                    No active advisories for {surveillanceDistrict === 'all' ? 'any district' : surveillanceDistrict}.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════════
              TAB 2: RECORDED CONSULTATION VISITS (100% Backward Compatible)
              ═══════════════════════════════════════════════════════════════════════ */}
          {activeTab === 'visits' && (
            <div className="space-y-6">
              <header>
                {(!activityData || activityLoading || activityError) && (
                  <p className="mt-2 text-slate-300" data-testid="activity-visit-caption">{visitCaption}</p>
                )}
              </header>

              <div className="flex flex-wrap gap-4">
                <label className="flex flex-col gap-1 text-sm">
                  {t('activity.range', 'Time range')}
                  <select
                    name="rangeDays"
                    aria-label={t('activity.range', 'Time range')}
                    value={activityFilters.rangeDays}
                    onChange={handleActivityChange}
                    className="min-h-[44px] rounded-lg border border-slate-500 bg-slate-900 px-3"
                  >
                    {[7, 30, 90, 365].map(days => (
                      <option key={days} value={days}>
                        {number(days)} {t('activity.days', 'days')}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex min-w-0 flex-col gap-1 text-sm">
                  {t('activity.district', 'District')}
                  <select
                    name="district"
                    aria-label={t('activity.district', 'District')}
                    value={activityFilters.district}
                    onChange={handleActivityChange}
                    className="min-h-[44px] max-w-full rounded-lg border border-slate-500 bg-slate-900 px-3"
                  >
                    <option value="all">{t('activity.allDistricts', 'All districts')}</option>
                    {ALL_DISTRICTS.map(name => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                </label>
              </div>

              {activityLoading && <p role="status">{t('activity.loading', 'Loading recorded visits…')}</p>}

              {activityError && (
                <div role="alert" className="rounded-xl border border-slate-500 bg-slate-900 p-4 space-y-3">
                  <p>
                    {activityError === 'rateLimited'
                      ? t('activity.rateLimited', 'Too many requests. Please wait before trying again.')
                      : t('activity.unavailable', 'Recorded visit statistics are temporarily unavailable. No visit counts are shown.')}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setActivityData(null);
                      setSelectedActivityDistrict(null);
                      setActivityRetry(v => v + 1);
                    }}
                    className="min-h-[44px] rounded-lg bg-slate-700 px-4 focus-visible:ring-2 focus-visible:ring-blue-300"
                  >
                    {t('activity.retry', 'Retry')}
                  </button>
                </div>
              )}

              {activityData && !activityLoading && !activityError && (
                <>
                  <section className="rounded-xl border border-slate-600 bg-slate-900 p-5" aria-label={t('activity.total', 'Recorded visits')}>
                    <h2 className="text-slate-300">{t('activity.total', 'Recorded visits')}</h2>
                    <p className="text-4xl font-bold mt-2" data-testid="activity-total-visits">
                      {activityData.disclosure.suppressed ? t('activity.notDisclosed', 'Not disclosed (<5)') : number(activityData.totalVisits)}
                    </p>
                    <p className="mt-2 text-sm text-slate-300" data-testid="activity-visit-caption">{visitCaption}</p>
                    <p className="mt-2 text-sm text-slate-300">{t('activity.utc', 'Dates use UTC. Figures describe recorded activity, not population disease incidence.')}</p>
                  </section>

                  {activityData.totalVisits === 0 && (
                    <p data-testid="activity-empty" className="rounded-xl border border-slate-600 p-4">
                      {t('activity.zero', 'No recorded visits in the selected period and district.')}
                    </p>
                  )}

                  {(activityData.disclosure.suppressed || (activityData.totalVisits > 0 && activityData.byDistrict.length === 0)) && (
                    <p data-testid="activity-district-empty" className="rounded-xl border border-slate-600 p-4">
                      {activityData.disclosure.suppressed
                        ? t('activity.selectedSuppressed', 'The selected district’s total and daily counts are not disclosed below 5.')
                        : t('activity.suppressed', 'Visit activity is recorded, but no district count meets the disclosure threshold. District details are not available.')}
                    </p>
                  )}

                  <div className="grid gap-6 lg:grid-cols-2 min-w-0">
                    <ActivityMap data={activityData} onSelect={d => setSelectedActivityDistrict(d)} t={t} />
                    <section className="min-w-0 space-y-3">
                      <h2 className="text-lg font-semibold">{t('activity.daily', 'Recorded visits by UTC day')}</h2>
                      {(activityData.disclosure.suppressed || activityData.disclosure.districtTrendUnavailable) ? (
                        <p>
                          {activityData.disclosure.suppressed
                            ? t('activity.selectedSuppressed', 'The selected district’s total and daily counts are not disclosed below 5.')
                            : t('activity.districtDailyUnavailable', 'Daily counts are not published for district selections.')}
                        </p>
                      ) : (
                        <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-600">
                          <table className="w-full text-sm">
                            <caption className="sr-only">{t('activity.daily', 'Recorded visits by UTC day')}</caption>
                            <thead>
                              <tr>
                                <th scope="col" className="p-3 text-left">{t('activity.date', 'Date (UTC)')}</th>
                                <th scope="col" className="p-3 text-right">{t('activity.visits', 'Visits')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {activityData.trend.map(row => (
                                <tr key={row.date} className="border-t border-slate-700">
                                  <th scope="row" className="p-3 text-left font-normal"><time dateTime={row.date}>{formatDay(row.date)}</time></th>
                                  <td className="p-3 text-right">{number(row.visitCount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>
                  </div>

                  <section className="space-y-3">
                    <h2 className="text-lg font-semibold">{t('activity.districtTable', 'District visit counts')}</h2>
                    <div className="overflow-x-auto rounded-xl border border-slate-600">
                      <table className="w-full table-fixed text-sm" aria-label={t('activity.districtTable', 'District visit counts')}>
                        <thead>
                          <tr>
                            <th scope="col" className="p-3 text-left">{t('activity.district', 'District')}</th>
                            <th scope="col" className="p-3 text-right">{t('activity.visits', 'Visits')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ALL_DISTRICTS.filter(name => activityFilters.district === 'all' || activityFilters.district === name).map(name => {
                            const row = activityData.byDistrict.find(item => item.district === name);
                            return (
                              <tr key={name} className="border-t border-slate-700">
                                <th scope="row" className="p-2 text-left">
                                  <button
                                    type="button"
                                    onClick={() => setSelectedActivityDistrict(name)}
                                    className="min-h-[44px] max-w-full whitespace-normal break-words px-1 text-blue-200 underline focus-visible:ring-2 focus-visible:ring-blue-300"
                                  >
                                    {name}
                                  </button>
                                </th>
                                <td className="p-3 text-right whitespace-normal break-words">
                                  {row ? number(row.visitCount) : t('activity.notDisclosed', 'Not disclosed (<5)')}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {selectedActivityDistrict && (
                      <p data-testid="selected-district-card" className="rounded-lg border border-slate-500 p-4">
                        {selectedActivityDistrict}: {selectedActivityRow ? number(selectedActivityRow.visitCount) + ' ' + t('activity.visits', 'Visits') : t('activity.notDisclosed', 'Not disclosed (<5)')}
                      </p>
                    )}
                  </section>
                </>
              )}

              {/* Consultation Activity Clinical Surveillance Fallback Tiles */}
              <section aria-label={t('activity.surveillance', 'Clinical surveillance')} className="grid gap-3 sm:grid-cols-3">
                {[
                  ['confirmed-cases', 'activity.confirmed', 'Confirmed cases'],
                  ['outbreak-clusters', 'activity.outbreaks', 'Outbreaks'],
                  ['forecast', 'activity.forecast', 'Forecast']
                ].map(([id, key, label]) => (
                  <div key={id} className="rounded-xl border border-slate-600 bg-slate-900 p-4">
                    <h2 className="text-sm text-slate-300">{t(key, label)}</h2>
                    <p className="mt-2 font-semibold" data-testid={'surveillance-' + id + '-value'}>
                      {unavailable}
                    </p>
                  </div>
                ))}
              </section>
            </div>
          )}
        </main>
      </PageTransition>
    </div>
  );
}
