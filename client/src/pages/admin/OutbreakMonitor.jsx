import SurveillanceReviewQueue from './SurveillanceReviewQueue';
import { formatSriLankaDateTime } from '../../utils/sriLankaTime';
import React, { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { motion } from 'framer-motion';
import {
  Activity, Zap, AlertTriangle, Loader2,
  TrendingUp, MapPin, ShieldAlert, Radio, X, Users
} from 'lucide-react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import PageTransition from '../../components/common/PageTransition';
import { formatDistrictName } from '../../utils/districtAdjacency';
import { calculateIncidencePer100k, formatPopulationShare } from '../../utils/populationIncidence';


const sevConfig = {
  Critical: { text: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30',    glow: 'shadow-[0_0_20px_rgba(239,68,68,0.18)]',  dot: 'bg-red-500'    },
  High:     { text: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', glow: 'shadow-[0_0_16px_rgba(249,115,22,0.14)]', dot: 'bg-orange-500' },
  Moderate: { text: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  glow: 'shadow-[0_0_12px_rgba(245,158,11,0.10)]', dot: 'bg-amber-500'  },
  Low:      { text: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   glow: '',                                         dot: 'bg-blue-500'   },
};
const getSev = (s) => sevConfig[s] || sevConfig.Low;

const PulseRing = ({ color = 'bg-red-500' }) => (
  <span className="relative flex h-3 w-3 flex-shrink-0 select-none">
    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-60`} />
    <span className={`relative inline-flex h-3 w-3 rounded-full ${color}`} />
  </span>
);

const StatTile = ({ icon: Icon, label, value, subtext, accentText, accentBorder, accentBg, glowBg, delay = 0, pulse = false }) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.4 }}
    className={`glass-card rounded-2xl p-5 border ${accentBorder} transition-all duration-300 relative overflow-hidden group`}
  >
    <div className={`absolute -top-8 -right-8 w-24 h-24 ${glowBg} rounded-full blur-2xl opacity-10 group-hover:opacity-20 transition-opacity`} />
    <div className="flex items-center gap-3 mb-3 select-none">
      <div className={`p-2 ${accentBg} rounded-xl border ${accentBorder}`}>
        <Icon className={`w-4 h-4 ${accentText} ${pulse ? 'animate-pulse' : ''}`} />
      </div>
      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{label}</h3>
    </div>
    <p className={`text-2xl font-black ${accentText} tracking-tight font-mono`}>{value}</p>
    {subtext && <p className="text-xs text-slate-400 mt-2 font-medium leading-relaxed">{subtext}</p>}
  </motion.div>
);

const minLng = 79.5, maxLng = 82.0, minLat = 5.8, maxLat = 9.9;
const svgW = 400, svgH = 500;

function projectGeo(lng, lat) {
  const x = ((lng - minLng) / (maxLng - minLng)) * svgW;
  const y = svgH - ((lat - minLat) / (maxLat - minLat)) * svgH;
  return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
}

function coordsToSvgPath(coords, type) {
  if (!coords) return '';
  if (type === 'Polygon') {
    return coords.map(ring =>
      ring.map((pt, i) => {
        const [x, y] = projectGeo(pt[0], pt[1]);
        return `${i === 0 ? 'M' : 'L'}${x} ${y}`;
      }).join(' ') + ' Z'
    ).join(' ');
  } else if (type === 'MultiPolygon') {
    return coords.map(poly => coordsToSvgPath(poly, 'Polygon')).join(' ');
  }
  return '';
}

const AdminDistrictMap = ({ alerts = [], selectedDistrict, onSelectDistrict }) => {
  const [districts, setDistricts] = useState([]);
  const [hovered, setHovered] = useState(null);

  useEffect(() => {
    if (process.env.NODE_ENV === 'test' || typeof fetch !== 'function') return;
    const controller = new AbortController();
    try {
      const p = fetch('/lk_districts.json', { signal: controller.signal, credentials: 'omit' });
      if (p && typeof p.then === 'function') {
        p.then(res => { if (!res.ok) throw Error(); return res.json(); })
          .then(val => {
            if (!controller.signal.aborted && Array.isArray(val?.features)) {
              const list = val.features.map(f => ({
                name: f.properties?.NAME_1 || f.properties?.name || 'Unknown',
                path: coordsToSvgPath(f.geometry?.coordinates, f.geometry?.type)
              }));
              setDistricts(list);
            }
          })
          .catch(() => {});
      }
    } catch {
      /* ignore boundary fetch errors */
    }
    return () => controller.abort();
  }, []);

  const getDistrictRisk = (districtName) => {
    const alert = alerts.find(a => (a.location === districtName || a.district === districtName) && a.status === 'Active');
    if (alert) {
      const sev = String(alert.severity || '').toLowerCase();
      if (sev === 'critical') return { tier: 'critical', color: '#ef4444', label: 'Critical Alert', alert };
      if (sev === 'high' || sev === 'alert') return { tier: 'alert', color: '#f97316', label: 'High Alert', alert };
      if (sev === 'moderate' || sev === 'watch') return { tier: 'watch', color: '#f59e0b', label: 'Moderate Watch', alert };
      return { tier: 'watch', color: '#f59e0b', label: 'Watch', alert };
    }
    return { tier: 'normal', color: '#1e293b', label: 'Normal / Baseline', alert: null };
  };

  return (
    <div className="glass-panel rounded-2xl overflow-hidden border border-white/5 p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-red-400" /> Sri Lanka Surveillance District Risk Map
        </h3>
        {selectedDistrict && (
          <button
            type="button"
            onClick={() => onSelectDistrict(null)}
            className="text-xs text-blue-400 hover:underline"
          >
            Clear filter ({selectedDistrict})
          </button>
        )}
      </div>

      <div className="flex flex-col md:flex-row items-center gap-6">
        <div className="w-full md:w-64 h-80 flex items-center justify-center bg-slate-950/60 rounded-xl border border-white/5 p-2 relative">
          {districts.length > 0 ? (
            <svg
              viewBox={`0 0 ${svgW} ${svgH}`}
              className="w-full h-full max-h-72 drop-shadow-lg"
              role="img"
              aria-label="Sri Lanka District Epidemiological Risk Map"
            >
              {districts.map(d => {
                const risk = getDistrictRisk(d.name);
                const isSelected = selectedDistrict === d.name;
                const isHovered = hovered?.name === d.name;
                return (
                  <path
                    key={d.name}
                    d={d.path}
                    fill={risk.color}
                    fillOpacity={risk.tier === 'normal' ? 0.35 : 0.85}
                    stroke={isSelected || isHovered ? '#ffffff' : '#475569'}
                    strokeWidth={isSelected ? 3 : isHovered ? 2 : 1}
                    className="cursor-pointer transition-all duration-200 hover:fill-opacity-100"
                    onClick={() => onSelectDistrict(selectedDistrict === d.name ? null : d.name)}
                    onMouseEnter={() => setHovered({ name: d.name, ...risk })}
                    onMouseLeave={() => setHovered(null)}
                  />
                );
              })}
            </svg>
          ) : (
            <div className="text-xs text-slate-500">Loading district risk map…</div>
          )}
          {hovered && (
            <div className="absolute top-2 left-2 bg-slate-900/90 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs pointer-events-none shadow-lg">
              <span className="font-bold text-white block">{hovered.name}</span>
              <span className="text-slate-300 text-xs">{hovered.label}</span>
            </div>
          )}
        </div>

        <div className="flex-1 space-y-4">
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Epidemiological Risk Tiers</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Interactive district threat levels computed from verified 7-day complete windows and 2-day persistent spikes. Click any district polygon to isolate surveillance logs.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-bold">
              <span className="block text-lg font-black font-mono">
                {alerts.filter(a => a.status === 'Active' && String(a.severity).toLowerCase() === 'critical').length}
              </span>
              Critical Tiers
            </div>
            <div className="p-2.5 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 font-bold">
              <span className="block text-lg font-black font-mono">
                {alerts.filter(a => a.status === 'Active' && ['high', 'alert'].includes(String(a.severity).toLowerCase())).length}
              </span>
              Alert Tiers
            </div>
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold">
              <span className="block text-lg font-black font-mono">
                {alerts.filter(a => a.status === 'Active' && ['moderate', 'watch'].includes(String(a.severity).toLowerCase())).length}
              </span>
              Watch Tiers
            </div>
            <div className="p-2.5 rounded-xl bg-slate-800/40 border border-slate-700/40 text-slate-400 font-bold">
              <span className="block text-lg font-black font-mono">
                {25 - new Set(alerts.filter(a => a.status === 'Active').map(a => a.location || a.district)).size}
              </span>
              Baseline Districts
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const OutbreakMonitor = () => {
  const { t } = useTranslation();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [modelStatus, setModelStatus] = useState(null);
  const [alerts,      setAlerts]      = useState([]);
  const [mlResult,    setMlResult]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [detecting,   setDetecting]   = useState(false);
  const [alertsLoaded, setAlertsLoaded] = useState(false);
  const [error,       setError]       = useState(null);
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const [surveillanceLevel, setSurveillanceLevel] = useState('district'); // 'district' | 'province' | 'island'
  const [growthData, setGrowthData] = useState(null);
  const [growthView, setGrowthView] = useState('district'); // 'district' | 'island'
  const lastScanAtRef = React.useRef(0);
  
  // New workflow state
  const [approveModal, setApproveModal] = useState({
    isOpen: false,
    alertId: null,
    scope: 'none',
    confirmDisease: '',
    targetDisease: '',
    targetDistrict: '',
    previewLoading: false,
    previewCount: null,
    previewDistrict: null,
    deliveryEnabled: true,
  });

  const fetchRecipientPreview = async (alertId, scope) => {
    if (!alertId || scope === 'none') {
      setApproveModal(prev => ({ ...prev, previewCount: null, previewLoading: false }));
      return;
    }
    setApproveModal(prev => ({ ...prev, previewLoading: true }));
    try {
      const res = await api.get(`/admin/outbreak/${alertId}/recipients-preview?scope=${scope}`);
      setApproveModal(prev => ({
        ...prev,
        previewLoading: false,
        previewCount: res.data.recipientCount,
        previewDistrict: res.data.district,
        deliveryEnabled: res.data.deliveryEnabled !== false,
      }));
    } catch (_) {
      setApproveModal(prev => ({ ...prev, previewLoading: false, previewCount: null }));
    }
  };

  useEffect(() => {
    let mounted = true;
    let pollTimer = null;
    let pollCount = 0;

    const fetchStatusAndAlerts = async () => {
      const [s, a, g] = await Promise.allSettled([
        api.get('/admin/ml-status'),
        api.get('/admin/outbreak/alerts'),
        api.get('/admin/outbreak/growth?window=72h'),
      ]);
      if (!mounted) return;
      const status = s.status === 'fulfilled' ? s.value?.data : null;
      const isAvailable = status?.available === true && Number.isSafeInteger(status.dataPoints) && status.dataPoints >= 0
        && status.dataPointUnit === 'reference disease profiles';
      const isWaking = status?.availabilityState === 'waking' || status?.status === 'waking';

      setModelStatus(
        isAvailable
          ? status
          : isWaking
            ? status
            : null
      );
      if (a.status === 'fulfilled' && Array.isArray(a.value?.data?.data)) {
        setAlerts(a.value.data.data);
        setAlertsLoaded(true);
      }
      if (g.status === 'fulfilled' && g.value?.data?.districts) {
        setGrowthData(g.value.data);
      }
      setLoading(false);

      if (isWaking && pollCount < 6) {
        pollCount += 1;
        pollTimer = setTimeout(fetchStatusAndAlerts, 10000);
      }
    };

    fetchStatusAndAlerts();

    return () => {
      mounted = false;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, []);

  const handleRunDetection = async () => {
    const nowScan = Date.now();
    if (nowScan - lastScanAtRef.current < 2000) return;
    lastScanAtRef.current = nowScan;
    if (detecting || modelStatus?.availabilityState === 'waking') return;

    setDetecting(true); setMlResult(null); setError(null);
    try {
      const res    = await api.post('/admin/outbreak/trigger', {});
      const result = res.data.data || res.data;

      if (result.results && Array.isArray(result.results)) {
        const getTierRank = (r) => {
          const s = (r.severity || r.risk_level || '').toLowerCase();
          if (s === 'critical') return 4;
          if (s === 'high') return 3;
          if (s === 'warning' || s === 'medium' || s === 'moderate') return 2;
          if (r.latest_actual > 0) return 1;
          return 0;
        };
        result.results.sort((a, b) => getTierRank(b) - getTierRank(a) || (b.latest_actual - a.latest_actual));
      }

      setMlResult(result);
      
      const anomalies = result.results?.filter(r => r.anomaly) || [];
      if (anomalies.length > 0) {
        toast.error(`🚨 DETECTED ${anomalies.length} OUTBREAK WARNINGS`, { autoClose: 8000 });
      } else {
        toast.success(`Analysis complete — ${result.consultations_analysed || result.data_points || 0} records scanned. System normal.`);
      }
      const ar = await api.get('/admin/outbreak/alerts');
      setAlerts(ar.data.data || []);
      api.get('/admin/outbreak/growth?window=72h').then(res => setGrowthData(res.data)).catch(() => {});
    } catch (err) {
      toast.error(err.response?.data?.error || 'Detection failed');
      setError(err.response?.data?.error || err.message || 'Detection failed');
      setMlResult(null);
    } finally { setDetecting(false); }
  };

  const handleVerifyAlert = async (id, status) => {
    try {
      const res = await api.put(`/alerts/${id}/verify`, { feedbackStatus: status });
      toast.success(res.data.message || 'Feedback submitted');
      setAlerts(prev => prev.map(a => a._id === id
        ? { ...a, feedbackStatus: status, status: status === 'false_positive' ? 'Resolved' : a.status }
        : a
      ));
    } catch (err) { toast.error(err.response?.data?.error || 'Verification failed'); }
  };

  const handleApproveAlert = async () => {
    try {
      const payload = {
        emailScope: approveModal.scope,
        confirmationDisease: approveModal.confirmDisease,
      };
      const res = await api.put(`/admin/outbreak/${approveModal.alertId}/approve`, payload);
      toast.success(res.data.message || 'Alert approved');
      setAlerts(prev => prev.map(a => a._id === approveModal.alertId
        ? { ...a, status: 'Active', emailScope: approveModal.scope }
        : a
      ));
      setApproveModal({
        isOpen: false,
        alertId: null,
        scope: 'none',
        confirmDisease: '',
        targetDisease: '',
        targetDistrict: '',
        previewLoading: false,
        previewCount: null,
        previewDistrict: null,
        deliveryEnabled: true,
      });
    } catch (err) {
      const data = err.response?.data;
      const code = data?.error || data?.code;
      const friendlyErrors = {
        NATIONWIDE_CONFIRMATION_REQUIRED: `Nationwide broadcast requires typing the exact disease name (${approveModal.targetDisease || 'the disease name'}) to confirm.`,
        ALERT_ALREADY_APPROVED: 'This outbreak alert has already been approved and activated.',
        ALERT_NOT_FOUND: 'The selected outbreak alert could not be found.',
        ONLY_PENDING_CAN_BE_APPROVED: 'Only pending outbreak alerts can be approved.',
        LEGACY_PROVENANCE_REQUIRED: 'Legacy alert requires provenance review before approval.',
        SYNTHETIC_REVIEWER_REQUIRED: 'Synthetic or simulated alerts require authorized reviewer permissions.',
        ADMIN_REVIEW_REQUIRED: 'Administrator review permissions are required to approve alerts.',
        INVALID_EMAIL_SCOPE: 'Invalid notification scope selected.',
      };
      const message = friendlyErrors[code] || (data?.message && !/^[A-Z0-9_]+$/.test(data.message) ? data.message : 'Approval failed. Please check alert criteria.');
      toast.error(message);
    }
  };

  const handleResolveAlert = async (id, action) => {
    try {
      const res = await api.put(`/admin/outbreak/${id}/resolve`, { action });
      toast.success(res.data.message || `Alert ${action}ed`);
      setAlerts(prev => prev.map(a => a._id === id
        ? { ...a, status: action === 'dismiss' ? 'Dismissed' : 'Resolved' }
        : a
      ));
    } catch (err) {
      toast.error(err.response?.data?.error || `Failed to ${action} alert`);
    }
  };

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-slate-500 animate-spin" />
        <p className="text-slate-500 text-xs font-bold uppercase tracking-wider animate-pulse">Initializing Command Center…</p>
      </div>
    </div>
  );

  const activeCount = alerts.filter(a => a.status === 'Active' && a.approvedBy && a.approvedAt).length;
  const displayedAlerts = selectedDistrict
    ? alerts.filter(a => a.location === selectedDistrict || a.district === selectedDistrict)
    : alerts;

  function deriveAlert72h(alert, gData) {
    if (alert?.metrics72h) return alert.metrics72h;
    const dist = (alert?.district || alert?.location || '').trim();
    const dis = (alert?.disease || '').trim();
    const normDis = dis.replace(/^icd(?:10|11):/i, '').replace('.', '').toLowerCase();
    const dMatch = gData?.districts?.find(d => {
      const dDis = (d.disease || '').replace(/^icd(?:10|11):/i, '').replace('.', '').toLowerCase();
      return (dDis === normDis || d.disease?.toLowerCase() === dis.toLowerCase()) &&
        d.district?.toLowerCase() === dist.toLowerCase();
    });
    const iMatch = gData?.island?.find(i => {
      const iDis = (i.disease || '').replace(/^icd(?:10|11):/i, '').replace('.', '').toLowerCase();
      return iDis === normDis || i.disease?.toLowerCase() === dis.toLowerCase();
    });

    const currentCases = dMatch ? dMatch.currentCases : (alert?.caseCount || alert?.affectedCount || 0);
    const previousCases = dMatch ? dMatch.previousCases : 0;
    const diff = currentCases - previousCases;
    const pct = dMatch ? dMatch.percentChange : (currentCases > 0 ? 'new' : 0);
    const popShare = formatPopulationShare(currentCases, dist);
    const islandCases = iMatch ? iMatch.currentCases : currentCases;
    const islandPrev = iMatch ? iMatch.previousCases : 0;
    const islandDiff = islandCases - islandPrev;

    return {
      currentCases,
      previousCases,
      absoluteChange: diff,
      percentChange: pct,
      population: popShare.population,
      incidencePer100k: popShare.incidencePer100k,
      formattedShare: popShare.formattedShare,
      islandCases,
      islandPreviousCases: islandPrev,
      islandChange: islandDiff,
      censusYear: 2012,
      plainText: `${dist ? dist + ': ' : ''}${currentCases} cases in the last 72h (previous 72h: ${previousCases}, ${diff >= 0 ? '+' : ''}${diff}). ${popShare.formattedShare} of the district population, ${popShare.incidencePer100k} per 100,000. Island-wide: ${islandCases} cases.`
    };
  }

  function formatChange(current, previous, percentChange) {
    const diff = current - previous;
    if (percentChange === 'new' || (previous === 0 && current > 0)) {
      return `+${diff} (new)`;
    }
    if (diff > 0) {
      const pct = typeof percentChange === 'number' ? `+${percentChange}%` : '';
      return `+${diff} ${pct ? `(${pct})` : ''}`.trim();
    }
    if (diff < 0) {
      const pct = typeof percentChange === 'number' ? `${percentChange}%` : '';
      return `${diff} ${pct ? `(${pct})` : ''}`.trim();
    }
    return '0 (0%)';
  }

  const activeGrowthList = growthData ? (approveModal.scope === 'national' ? growthData.island : growthData.districts) : [];
  const growthEvidence = activeGrowthList?.find(item =>
    item.disease?.toLowerCase() === approveModal.targetDisease?.toLowerCase() &&
    (approveModal.scope === 'national' || item.district?.toLowerCase() === (approveModal.targetDistrict || approveModal.previewDistrict || '').toLowerCase())
  ) || growthData?.districts?.find(item => item.disease?.toLowerCase() === approveModal.targetDisease?.toLowerCase());

  return (
    <PageTransition className="space-y-6">
      <button type="button" className="glass-button" aria-expanded={reviewOpen} onClick={() => setReviewOpen(value => !value)}>
        {t('liveQa.reviewTitle')}
      </button>
      {reviewOpen && <SurveillanceReviewQueue />}
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1 select-none">
            <PulseRing color="bg-red-500" />
            <span className="text-[11px] font-bold text-red-400 uppercase tracking-widest">Surveillance Feed</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">{t("nav.outbreakmonitor", "Outbreak Monitor")}</h1>
          <p className="text-slate-400 mt-1 text-sm font-medium">Real-time epidemiological ML anomaly surveillance center.</p>
        </div>

        {/* Countdown */}
        <div className="flex items-center gap-3 px-4 py-2 bg-slate-900 border border-white/5 rounded-2xl select-none shadow-[0_0_15px_rgba(239,68,68,0.05)]">
          <Radio className="w-4 h-4 text-red-400 animate-pulse" />
          <div className="text-left">
            <span className="text-[11px] uppercase font-bold text-slate-500 block leading-tight">Next Automated Scan</span>
            <span className="text-sm font-mono font-black text-red-400 tracking-wider">{t("adminStatus.notAvailable", "Not available")}</span>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile
          icon={Activity} label={t("adminStatus.referenceService", "ML reference service")}
          value={
            modelStatus?.available === true
              ? t("adminStatus.available", "Available")
              : (modelStatus?.availabilityState === 'waking' || modelStatus?.status === 'waking')
                ? t("adminStatus.waking", "Service waking up, retry in 30-60s")
                : t("adminStatus.notAvailable", "Not available")
          }
          accentText={modelStatus?.available === true ? "text-emerald-400" : (modelStatus?.availabilityState === 'waking' || modelStatus?.status === 'waking') ? "text-amber-400" : "text-slate-400"}
          accentBg={modelStatus?.available === true ? "bg-emerald-500/10" : (modelStatus?.availabilityState === 'waking' || modelStatus?.status === 'waking') ? "bg-amber-500/10" : "bg-slate-800/20"}
          accentBorder={modelStatus?.available === true ? "border-emerald-500/20" : (modelStatus?.availabilityState === 'waking' || modelStatus?.status === 'waking') ? "border-amber-500/20" : "border-slate-700/30"}
          glowBg={modelStatus?.available === true ? "bg-emerald-500/20" : "bg-slate-800/10"}
          delay={0} pulse={modelStatus?.available === true || modelStatus?.availabilityState === 'waking' || modelStatus?.status === 'waking'}
        />
        <StatTile
          icon={TrendingUp} label={t("adminStatus.referenceProfiles", "Symptom reference profiles")}
          value={
            modelStatus?.available === true && Number.isFinite(modelStatus.dataPoints)
              ? modelStatus.dataPoints.toLocaleString()
              : (modelStatus?.availabilityState === 'waking' || modelStatus?.status === 'waking')
                ? t("adminStatus.waking", "Service waking up, retry in 30-60s")
                : t("adminStatus.notAvailable", "Not available")
          }
          subtext={t("adminStatus.coverageStatement", "Symptom reference profiles: 41 of 71,704 conditions; any ICD code can be selected manually")}
          accentText={modelStatus?.available === true ? "text-blue-400" : (modelStatus?.availabilityState === 'waking' || modelStatus?.status === 'waking') ? "text-amber-400" : "text-slate-400"}
          accentBg={modelStatus?.available === true ? "bg-blue-500/10" : (modelStatus?.availabilityState === 'waking' || modelStatus?.status === 'waking') ? "bg-amber-500/10" : "bg-slate-800/20"}
          accentBorder={modelStatus?.available === true ? "border-blue-500/20" : (modelStatus?.availabilityState === 'waking' || modelStatus?.status === 'waking') ? "border-amber-500/20" : "border-slate-700/30"}
          glowBg={modelStatus?.available === true ? "bg-blue-500/20" : "bg-slate-800/10"}
          delay={0.08}
        />
        <StatTile
          icon={ShieldAlert} label={t("outbreak.activeAlerts", "Active Outbreak Alerts")} value={alertsLoaded ? activeCount : t("adminStatus.notAvailable", "Not available")}
          accentText={activeCount > 0 ? 'text-red-400' : 'text-emerald-400'}
          accentBg={activeCount > 0 ? 'bg-red-500/10' : 'bg-emerald-500/10'}
          accentBorder={activeCount > 0 ? 'border-red-500/20' : 'border-emerald-500/20'}
          glowBg={activeCount > 0 ? 'bg-red-500/20' : 'bg-emerald-500/20'}
          delay={0.16} pulse={activeCount > 0}
        />
      </div>

      <p role="status" className="text-sm text-slate-400">
        {t("adminStatus.caution", "Clinical validation is not established. Forecast: Not available. The reference count is not a patient or outbreak count.")}
      </p>

      {/* On-Demand Trigger Frame */}
      <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="max-w-xl">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5 select-none">
              <Zap className="w-4 h-4 text-amber-400 animate-pulse-subtle" /> On-Demand Surveillance Scan
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed mt-1.5">
              Force-triggers the ML anomaly engine, querying patient summaries to compute district-level Z-Scores and log potential outbreaks.
            </p>
          </div>
          <button
            onClick={handleRunDetection}
            disabled={detecting}
            className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-40 shrink-0 flex items-center gap-1.5 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
          >
            {detecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
            {detecting ? 'Scanning Telemetry...' : 'Force System Scan'}
          </button>
        </div>

        {detecting && (
          <div className="p-8 bg-slate-950/40 rounded-xl border border-white/5 text-center flex flex-col items-center gap-2 select-none">
            <Loader2 className="w-6 h-6 animate-spin text-red-400" />
            <p className="text-xs font-bold text-red-400 uppercase tracking-widest animate-pulse">Running Epidemic Threat Assessment...</p>
          </div>
        )}

        {error && !detecting && (
          <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <div className="text-xs">
              <p className="text-red-400 font-bold">Surveillance Scan Failed</p>
              <p className="text-slate-400 mt-1 font-mono">{error}</p>
            </div>
          </div>
        )}

        {/* Detected Signals Cards */}
        {mlResult && !detecting && mlResult.results?.length > 0 && (
          <div className="pt-6 border-t border-white/5 space-y-4">
            <div className="flex justify-between items-center select-none">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Detected Signals ({mlResult.results.length})</h4>
              <span className="text-xs font-mono font-bold text-slate-500">{mlResult.consultations_analysed} cases scanned</span>
            </div>

            {/* Results Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
              {mlResult.results.map((item, idx) => {
                const rawZ = typeof item.zScore === 'number' && Number.isFinite(item.zScore)
                  ? item.zScore
                  : (typeof item.z_score === 'number' && Number.isFinite(item.z_score)
                    ? item.z_score
                    : (typeof item.maxZ === 'number' && Number.isFinite(item.maxZ)
                      ? item.maxZ
                      : (item.baseline ? ((item.latest_actual - item.baseline) / Math.sqrt(item.baseline || 1)) : null)));
                const zDisplay = rawZ !== null && Number.isFinite(rawZ) ? rawZ.toFixed(2) : 'N/A';

                const rawDev = typeof item.deviationPct === 'number' && Number.isFinite(item.deviationPct)
                  ? item.deviationPct
                  : (typeof item.spike_percentage === 'number' && Number.isFinite(item.spike_percentage)
                    ? item.spike_percentage
                    : (item.baseline && item.baseline > 0 ? ((item.latest_actual - item.baseline) / item.baseline) * 100 : null));
                const formattedDev = rawDev !== null && Number.isFinite(rawDev) ? `${rawDev > 0 ? '+' : ''}${Math.round(rawDev)}%` : 'N/A';
                
                // Determine normalized tier label
                const s = (item.severity || item.risk_level || '').toLowerCase();
                let tierLabel = 'NORMAL';
                let badgeStyle = 'bg-slate-800 border border-slate-700 text-slate-400';
                let cardStyle = 'bg-slate-950/20 border-white/5';
                let devColor = (rawDev !== null && rawDev < 0) ? 'text-slate-500' : 'text-emerald-400';

                if (s === 'critical') {
                  tierLabel = 'CRITICAL';
                  badgeStyle = 'bg-red-500/15 border border-red-500/30 text-red-400 font-black tracking-wider';
                  cardStyle = 'bg-red-500/[0.04] border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.12)]';
                  devColor = 'text-red-400 font-bold';
                } else if (s === 'high') {
                  tierLabel = 'HIGH';
                  badgeStyle = 'bg-orange-500/15 border border-orange-500/30 text-orange-400 font-black tracking-wider';
                  cardStyle = 'bg-orange-500/[0.04] border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.12)]';
                  devColor = 'text-orange-400 font-bold';
                } else if (s === 'warning' || s === 'medium' || s === 'moderate') {
                  tierLabel = 'WARNING';
                  badgeStyle = 'bg-amber-500/15 border border-amber-500/30 text-amber-400 font-black tracking-wider';
                  cardStyle = 'bg-amber-500/[0.03] border-amber-500/25 shadow-[0_0_15px_rgba(245,158,11,0.10)]';
                  devColor = 'text-amber-400 font-bold';
                }

                const zColor = tierLabel === 'CRITICAL' ? 'text-red-400' : (tierLabel === 'HIGH' ? 'text-orange-400' : (tierLabel === 'WARNING' ? 'text-amber-400' : 'text-slate-300'));
                const m72 = deriveAlert72h(item, growthData);
                const changeStr = formatChange(m72.currentCases, m72.previousCases, m72.percentChange);

                return (
                  <div
                    key={`${item.disease}-${item.district}-${idx}`}
                    className={`p-4 rounded-xl border flex flex-col justify-between transition-all duration-200 ${cardStyle}`}
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2 mb-2 select-none">
                        <span className="text-white font-bold text-sm truncate">{item.disease}</span>
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase ${badgeStyle}`}>
                          {tierLabel}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 flex items-center justify-between gap-1">
                        <span className="flex items-center gap-1 font-semibold text-slate-300">
                          <MapPin className="w-3.5 h-3.5 text-slate-500" /> {formatDistrictName(item.district)}
                        </span>
                        <span className="text-xs text-slate-500 font-mono" title="Department of Census and Statistics (Census 2012)">
                          Pop: {m72.population ? m72.population.toLocaleString() : 'N/A'}
                        </span>
                      </p>

                      {/* Primary figure: Verified cases in last 72 hours */}
                      <div className="my-2.5 p-3 rounded-xl bg-slate-900/80 border border-white/5 space-y-1.5">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Verified cases (last 72h)
                        </div>
                        <div className="text-2xl font-black text-white font-mono leading-none">
                          {m72.currentCases} <span className="text-xs font-normal text-slate-400">cases</span>
                        </div>
                        <div className="pt-2 space-y-1 text-xs text-slate-300 font-sans border-t border-white/5">
                          <div>
                            Previous 72h: <span className="font-mono text-white font-semibold">{m72.previousCases}</span> cases, {changeStr}
                          </div>
                          <div title="Department of Census and Statistics (Census 2012). Verified MediSync cases (lower bound).">
                            <span className="font-mono font-semibold text-white">{m72.formattedShare}</span> of district population, <span className="font-mono font-semibold text-white">{m72.incidencePer100k !== null ? m72.incidencePer100k : 'N/A'}</span> per 100,000
                          </div>
                          <div className="text-slate-400">
                            Island-wide: <span className="font-mono font-semibold text-white">{m72.islandCases}</span> cases
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-slate-500 italic" title="Lower bound: counts only consultations recorded in MediSync">
                        *Verified MediSync cases (lower bound)
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-white/5 flex justify-between items-end select-none">
                      <div>
                        <span className="text-[11px] uppercase font-bold text-slate-500 block leading-tight">Z-Score</span>
                        <span className={`text-sm font-mono font-bold ${zColor}`}>
                          {zDisplay}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] uppercase font-bold text-slate-500 block leading-tight">Deviation</span>
                        <span className={`text-sm font-mono ${devColor}`}>
                          {formattedDev}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Suppressed Signals Panel */}
        {mlResult?.suppressed && mlResult.suppressed.length > 0 && (
          <div className="pt-6 border-t border-white/5 space-y-4">
            <div className="flex justify-between items-center select-none">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-slate-500" /> Suppressed Signals (Governance Floor &amp; Persistence Gates)
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Districts evaluated by surveillance criteria where alerts were suppressed to prevent false alarms.
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-slate-500">{mlResult.suppressed.length} suppressed</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {mlResult.suppressed.map((sig, idx) => (
                <div key={`suppressed-${sig.district}-${sig.disease}-${idx}`} className="p-3 bg-slate-950/40 rounded-xl border border-white/5 space-y-2">
                  <div className="flex justify-between items-start">
                    <span className="text-xs font-bold text-slate-300">{sig.disease}</span>
                    <span className="px-2 py-0.5 rounded text-[11px] uppercase tracking-wide font-bold bg-slate-800 text-slate-400 border border-slate-700">
                      {sig.reason === 'CASE_FLOOR_NOT_MET' ? 'Floor (<5 cases)' : sig.reason === 'PERSISTENCE_CRITERIA_NOT_MET' ? 'Persistence (<2 days)' : sig.reason}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-400 font-mono">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-slate-500" /> {formatDistrictName(sig.district)}
                    </span>
                    <span>{sig.count} cases</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Last 72-Hour Growth Telemetry Panel */}
      <div className="glass-card rounded-2xl p-6 border border-white/10 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 select-none">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Last 72-Hour Epidemiological Growth</h3>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Case trajectories comparing recent 72h window to prior 72h window. Note: Small sample sizes make percentages sensitive; evaluate absolute count alongside rate.
            </p>
          </div>
          <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 border border-white/10 rounded-xl text-xs font-bold select-none">
            <button
              type="button"
              onClick={() => setGrowthView('district')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${growthView === 'district' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm' : 'text-slate-400 hover:text-white border border-transparent'}`}
            >
              District-wise
            </button>
            <button
              type="button"
              onClick={() => setGrowthView('island')}
              className={`px-3 py-1.5 rounded-lg transition-colors ${growthView === 'island' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm' : 'text-slate-400 hover:text-white border border-transparent'}`}
            >
              Island-wide
            </button>
          </div>
        </div>

        {growthData && (growthView === 'district' ? growthData.districts : growthData.island)?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-950/40 border-b border-white/5 text-slate-400 font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Disease Vector</th>
                  <th className="px-4 py-3">Region</th>
                  <th className="px-4 py-3 text-right">Last 72h</th>
                  <th className="px-4 py-3 text-right">Prior 72h</th>
                  <th className="px-4 py-3 text-right">Net Change</th>
                  <th className="px-4 py-3 text-right">Growth Rate</th>
                  <th className="px-4 py-3 text-right">Incidence</th>
                  <th className="px-4 py-3 text-center">7-Day Daily Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-200 font-mono">
                {(growthView === 'district' ? growthData.districts : growthData.island).map((row, idx) => {
                  const isPositive = row.absoluteChange > 0;
                  const isNew = row.percentChange === 'new';
                  return (
                    <tr key={`${row.disease}-${row.district}-${idx}`} className="hover:bg-white/[0.01] transition-colors">
                      <td className="px-4 py-3 font-sans font-bold text-white">{row.disease}</td>
                      <td className="px-4 py-3 font-sans text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-500" />
                          {formatDistrictName(row.district)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-white">{row.currentCases}</td>
                      <td className="px-4 py-3 text-right text-slate-400">{row.previousCases}</td>
                      <td className={`px-4 py-3 text-right font-bold ${isPositive ? 'text-red-400' : (row.absoluteChange < 0 ? 'text-slate-500' : 'text-slate-300')}`}>
                        {row.absoluteChange > 0 ? `+${row.absoluteChange}` : row.absoluteChange}
                      </td>
                      <td className="px-4 py-3 text-right font-bold">
                        {isNew ? (
                          <span className="px-1.5 py-0.5 rounded text-[11px] uppercase tracking-wide bg-red-500/20 text-red-300 border border-red-500/40">NEW</span>
                        ) : (
                          <span className={row.percentChange > 0 ? 'text-red-400' : (row.percentChange < 0 ? 'text-emerald-400' : 'text-slate-400')}>
                            {row.percentChange > 0 ? `+${row.percentChange}%` : `${row.percentChange}%`}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400" title="Department of Census and Statistics (Census 2012)">
                        {row.incidencePer100k !== null ? `${row.incidencePer100k} / 100k` : 'N/A'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-end justify-center gap-1 h-5">
                          {row.dailyCounts?.map((cnt, cIdx) => {
                            const maxCnt = Math.max(1, ...row.dailyCounts);
                            const hPct = Math.max(15, Math.round((cnt / maxCnt) * 100));
                            return (
                              <div
                                key={cIdx}
                                title={`Day ${cIdx + 1}: ${cnt} cases`}
                                style={{ height: `${hPct}%` }}
                                className={`w-1.5 rounded-t ${cnt > 0 ? (isPositive ? 'bg-amber-400' : 'bg-blue-400') : 'bg-slate-800'}`}
                              />
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-slate-500 text-xs">
            No 72-hour clinical episode growth detected in current window.
          </div>
        )}
      </div>

      {/* Surveillance Geographic Level Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-slate-900/60 border border-white/5">
        <div>
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block">Surveillance Geographic Aggregation</span>
          <p className="text-xs text-slate-500 mt-0.5">
            Evaluate epidemic aberration across official administrative tiers (N ≥ 5 floor, 2 consecutive days, z &gt; 2.0). Higher levels can alert when individual districts are below threshold.
          </p>
        </div>
        <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 border border-white/10 rounded-xl select-none">
          {[
            { id: 'district', label: 'District (25)' },
            { id: 'province', label: 'Province (9)' },
            { id: 'island', label: 'Island-wide (1)' }
          ].map(lvl => (
            <button
              key={lvl.id}
              type="button"
              onClick={() => { setSurveillanceLevel(lvl.id); setSelectedDistrict(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                surveillanceLevel === lvl.id
                  ? 'bg-red-600/30 text-red-300 border border-red-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              {lvl.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sri Lanka District Risk Surveillance Map */}
      <AdminDistrictMap
        alerts={alerts}
        selectedDistrict={selectedDistrict}
        onSelectDistrict={setSelectedDistrict}
      />

      {/* Surveillance log table */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
        <div className="p-4 bg-slate-900/60 border-b border-white/5 flex justify-between items-center select-none">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-red-400 animate-pulse" /> Outbreak Surveillance Logs
          </h3>
          <span className="text-xs font-mono font-bold text-red-400">
            {alertsLoaded ? `${displayedAlerts.length}${selectedDistrict ? ` in ${selectedDistrict}` : ''}` : t("adminStatus.notAvailable", "Not available")} alerts
          </span>
        </div>

        {displayedAlerts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-950/40 border-b border-white/5 text-slate-400 text-xs font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Disease Vector</th>
                  <th className="px-6 py-4">Location</th>
                  <th className="px-6 py-4">Verified Cases (72h)</th>
                  <th className="px-6 py-4">Severity</th>
                  <th className="px-6 py-4">Audit Verification</th>
                  <th className="px-6 py-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm text-slate-200">
                {displayedAlerts.map((alert) => {
                  const sev = getSev(alert.severity);
                  const isLive = alert.status === 'Active' && (!alert.feedbackStatus || alert.feedbackStatus === 'unverified');
                  const isCrit = alert.severity === 'Critical' || alert.severity === 'High';
                  const m72 = deriveAlert72h(alert, growthData);
                  const changeStr = formatChange(m72.currentCases, m72.previousCases, m72.percentChange);
                  return (
                    <tr key={alert._id} className="hover:bg-white/[0.01] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {isLive && <PulseRing color={isCrit ? 'bg-red-500' : 'bg-amber-500'} />}
                          <div>
                            <span className={`font-bold ${isCrit && isLive ? 'text-red-300' : 'text-white'}`}>
                            {alert.disease || 'Unknown'}
                            </span>
                            {(alert.isSimulation || alert.isDemoData || alert.isSimulatedDemo) && alert.syntheticLabel && (
                              <span className="block text-[11px] text-amber-400 font-semibold tracking-wide uppercase mt-0.5">
                                {alert.syntheticLabel}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-400 font-semibold">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-600" />
                          {formatDistrictName(alert.location || alert.district) || 'N/A'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs">
                        <div className="font-mono text-sm font-bold text-white">
                          {m72.currentCases} cases <span className="text-xs font-normal text-slate-400">(last 72h)</span>
                        </div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">
                          Prev 72h: {m72.previousCases} ({changeStr})
                        </div>
                        <div
                          className="text-xs text-slate-400 font-mono mt-0.5"
                          title="Department of Census and Statistics (Census 2012). Verified MediSync cases (lower bound)."
                        >
                          {m72.formattedShare} pop ({m72.incidencePer100k !== null ? `${m72.incidencePer100k} / 100k` : 'N/A'})
                        </div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">
                          Island: {m72.islandCases} cases
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${sev.text} ${sev.bg} ${sev.border}`}>
                          {alert.severity || 'Moderate'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {alert.status === 'Pending' ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setApproveModal({
                                  isOpen: true,
                                  alertId: alert._id,
                                  scope: 'district',
                                  confirmDisease: '',
                                  targetDisease: alert.disease || '',
                                  targetDistrict: alert.district || alert.location || '',
                                  previewLoading: false,
                                  previewCount: null,
                                  previewDistrict: null,
                                  deliveryEnabled: true,
                                });
                                fetchRecipientPreview(alert._id, 'district');
                              }}
                              className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg border border-amber-500/25 transition-all shadow-[0_0_10px_rgba(245,158,11,0.15)]"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleResolveAlert(alert._id, 'dismiss')}
                              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg border border-white/5 transition-all"
                            >
                              Dismiss
                            </button>
                          </div>
                        ) : alert.status === 'Resolved' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-blue-400 font-bold bg-blue-500/10 border border-blue-500/20 px-3 py-1 rounded-xl select-none">
                            Resolved
                          </span>
                        ) : alert.status === 'Dismissed' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 font-bold bg-slate-800 border border-slate-700 px-3 py-1 rounded-xl select-none">
                            Dismissed
                          </span>
                        ) : alert.feedbackStatus === 'confirmed' ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-xl select-none">
                              Confirmed
                            </span>
                            <button
                              onClick={() => handleResolveAlert(alert._id, 'resolve')}
                              className="px-3 py-1 bg-blue-600/50 hover:bg-blue-500 text-white text-xs font-bold rounded-lg border border-blue-500/25 transition-all"
                            >
                              Resolve
                            </button>
                          </div>
                        ) : alert.feedbackStatus === 'false_positive' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 font-bold bg-slate-800 border border-slate-700 px-3 py-1 rounded-xl select-none">
                            False Alarm
                          </span>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleVerifyAlert(alert._id, 'confirmed')}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg border border-emerald-500/25 transition-all shadow-[0_0_10px_rgba(16,185,129,0.15)]"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => handleVerifyAlert(alert._id, 'false_positive')}
                              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg border border-white/5 transition-all"
                            >
                              False Alarm
                            </button>
                            <button
                              onClick={() => handleResolveAlert(alert._id, 'resolve')}
                              className="px-3 py-1 bg-blue-600/50 hover:bg-blue-500 text-white text-xs font-bold rounded-lg border border-blue-500/25 transition-all"
                            >
                              Resolve
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-mono text-xs text-right select-none">
                        {alert.createdAt ? formatSriLankaDateTime(alert.createdAt) : 'N/A'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500 select-none">
            <Activity className="w-12 h-12 mx-auto mb-3 opacity-30 animate-pulse" />
            <p className="text-sm font-semibold">{alertsLoaded ? t("adminStatus.noAlerts", "No alerts returned.") : t("adminStatus.notAvailable", "Not available")}</p>
          </div>
        )}
      </div>

      {/* Approval Modal */}
      {approveModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative"
          >
            <button
              onClick={() => setApproveModal({ isOpen: false, alertId: null, scope: 'none' })}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-400" /> Approve Outbreak Alert
            </h2>
            <p className="text-sm text-slate-400 mb-4">Select the scope for email notifications. This will immediately alert users in the selected region.</p>
            
            {(() => {
              const modalTarget = alerts?.find(a => String(a._id) === String(approveModal.alertId)) || {
                disease: approveModal.targetDisease,
                district: approveModal.targetDistrict || approveModal.previewDistrict
              };
              const m72 = deriveAlert72h(modalTarget, growthData);
              const changeStr = formatChange(m72.currentCases, m72.previousCases, m72.percentChange);
              return (
                <div className="mb-5 p-3.5 bg-slate-950/70 border border-white/10 rounded-xl space-y-2 text-xs">
                  <div className="flex justify-between items-center text-slate-300 font-semibold">
                    <span className="flex items-center gap-1.5 text-white">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> Verified Cases (Last 72h) Telemetry
                    </span>
                    <span className="font-mono text-emerald-400 font-bold">
                      {m72.percentChange === 'new' ? 'NEW SIGNAL' : changeStr}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-white/5 space-y-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Verified cases (last 72h)
                    </div>
                    <div className="text-xl font-black text-white font-mono leading-none">
                      {m72.currentCases} <span className="text-xs font-normal text-slate-400">cases</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-slate-300 font-mono text-xs pt-1.5 border-t border-white/5">
                    <div>Previous 72h: <strong className="text-white">{m72.previousCases} ({changeStr})</strong></div>
                    <div>Island-wide: <strong className="text-white">{m72.islandCases} cases</strong></div>
                    <div className="col-span-2" title="Department of Census and Statistics (Census 2012)">
                      Share of population: <strong className="text-white">{m72.formattedShare} ({m72.incidencePer100k !== null ? `${m72.incidencePer100k} / 100k` : 'N/A'})</strong>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500 italic pt-1 border-t border-white/5">
                    *Verified MediSync cases (lower bound; only consultations recorded in MediSync are counted). DCS Census 2012.
                  </div>
                </div>
              );
            })()}
            
            <div className="space-y-3 mb-6">
              {[
                { id: 'none', label: 'No Emails (Dashboard Only)', desc: 'Silently mark as active.' },
                { id: 'district', label: 'District Only', desc: 'Email patients and staff in the affected district.' },
                { id: 'national', label: 'Nationwide', desc: 'Email all users across the country.' }
              ].map(opt => (
                <label htmlFor={`scope-${opt.id}`} key={opt.id} className={`block p-3 rounded-xl border cursor-pointer transition-all ${approveModal.scope === opt.id ? 'bg-amber-500/10 border-amber-500/50' : 'bg-slate-950/50 border-white/5 hover:border-white/20'}`}>
                  <div className="flex items-center gap-3">
                    <input
                      id={`scope-${opt.id}`}
                      type="radio"
                      name="emailScope"
                      value={opt.id}
                      checked={approveModal.scope === opt.id}
                      onChange={(e) => {
                        const newScope = e.target.value;
                        setApproveModal(prev => ({ ...prev, scope: newScope }));
                        fetchRecipientPreview(approveModal.alertId, newScope);
                      }}
                      className="w-4 h-4 accent-amber-500"
                    />
                    <div>
                      <div className={`text-sm font-bold ${approveModal.scope === opt.id ? 'text-amber-400' : 'text-slate-300'}`}>{opt.label}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{opt.desc}</div>
                    </div>
                  </div>
                </label>
              ))}

              {approveModal.scope === 'none' && (
                <div className="p-3 bg-slate-950/70 border border-white/10 rounded-xl space-y-1 text-xs">
                  <p className="text-slate-300">Alert will be published to the public observatory. No emails will be sent.</p>
                </div>
              )}

              {approveModal.scope === 'district' && (
                <div className="p-3 bg-slate-950/70 border border-amber-500/30 rounded-xl space-y-1.5 text-xs">
                  <div className="text-amber-400 font-semibold flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" /> District Broadcast Scope
                  </div>
                  <p className="text-slate-300">Alert will be sent to registered doctors and hospital administrators in <strong>{formatDistrictName(approveModal.targetDistrict || approveModal.previewDistrict || 'the affected district')}</strong>.</p>
                  {approveModal.previewLoading ? (
                    <div className="text-slate-400 flex items-center gap-1.5 py-0.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculating recipient count...
                    </div>
                  ) : approveModal.previewCount !== null ? (
                    <div className="text-slate-200">
                      Estimated recipients: <strong className="text-white font-mono">{approveModal.previewCount}</strong> healthcare professionals.
                    </div>
                  ) : null}
                  {!approveModal.deliveryEnabled && (
                    <p className="text-amber-300 mt-1 font-medium bg-amber-500/10 border border-amber-500/30 p-2 rounded-lg">
                      Email delivery is disabled in this environment. The alert will be published to the public dashboard only.
                    </p>
                  )}
                </div>
              )}

              {approveModal.scope === 'national' && (
                <div className="space-y-3">
                  <div className="p-3 bg-red-950/40 border border-red-500/40 rounded-xl space-y-1.5 text-xs">
                    <div className="text-red-400 font-semibold flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5" /> Nationwide Critical Broadcast
                    </div>
                    <p className="text-red-300 font-semibold">
                      CRITICAL: Alert will be broadcast island-wide to all verified doctors, pharmacies, and hospital administrators across Sri Lanka.
                    </p>
                    {approveModal.previewLoading ? (
                      <div className="text-slate-400 flex items-center gap-1.5 py-0.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculating recipient count...
                      </div>
                    ) : approveModal.previewCount !== null ? (
                      <div className="text-slate-200">
                        Estimated recipients: <strong className="text-white font-mono">{approveModal.previewCount}</strong> healthcare professionals island-wide.
                      </div>
                    ) : null}
                    {!approveModal.deliveryEnabled && (
                      <p className="text-amber-300 mt-1 font-medium bg-amber-500/10 border border-amber-500/30 p-2 rounded-lg">
                        Email delivery is disabled in this environment. The alert will be published to the public dashboard only.
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <label className="text-xs font-bold text-red-400 uppercase tracking-wider block">
                      Type the disease name ({approveModal.targetDisease || 'the disease name'}) to confirm
                    </label>
                    <input
                      type="text"
                      placeholder={`Type ${approveModal.targetDisease || 'disease name'} to confirm`}
                      value={approveModal.confirmDisease}
                      onChange={(e) => setApproveModal(prev => ({ ...prev, confirmDisease: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-950 border border-red-500/40 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-red-400"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setApproveModal({ isOpen: false, alertId: null, scope: 'none' })}
                className="px-4 py-2 rounded-lg text-sm font-bold text-slate-300 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApproveAlert}
                disabled={
                  approveModal.scope === 'national' &&
                  (!approveModal.targetDisease ||
                    approveModal.confirmDisease.trim().toLowerCase() !== approveModal.targetDisease.trim().toLowerCase())
                }
                className="px-4 py-2 rounded-lg text-sm font-bold bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Confirm Approval
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </PageTransition>
  );
};

export default OutbreakMonitor;
