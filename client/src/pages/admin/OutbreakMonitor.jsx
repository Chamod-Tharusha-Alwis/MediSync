import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, Zap, AlertTriangle, CheckCircle, Loader2,
  TrendingUp, MapPin, ShieldAlert, Radio, Cpu
} from 'lucide-react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import PageTransition from '../../components/common/PageTransition';

/* ─── Severity colour helpers ─────────────────────────────────────────────── */
const sevConfig = {
  Critical: { text: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/30',    glow: 'shadow-[0_0_20px_rgba(239,68,68,0.18)]',  dot: 'bg-red-500'    },
  High:     { text: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30', glow: 'shadow-[0_0_16px_rgba(249,115,22,0.14)]', dot: 'bg-orange-500' },
  Moderate: { text: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/30',  glow: 'shadow-[0_0_12px_rgba(245,158,11,0.10)]', dot: 'bg-amber-500'  },
  Low:      { text: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   glow: '',                                         dot: 'bg-blue-500'   },
};
const getSev = (s) => sevConfig[s] || sevConfig.Low;

/* ─── Animated pulse ring dot ─────────────────────────────────────────────── */
const PulseRing = ({ color = 'bg-red-500' }) => (
  <span className="relative flex h-3 w-3 flex-shrink-0">
    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-60`} />
    <span className={`relative inline-flex h-3 w-3 rounded-full ${color}`} />
  </span>
);

/* ─── KPI stat tile ───────────────────────────────────────────────────────── */
const StatTile = ({ icon: Icon, label, value, accentText, accentBorder, accentBg, glowBg, delay = 0, pulse = false }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    className={`glass-card-premium neumorphic-flat rounded-2xl p-6 border ${accentBorder} transition-all duration-300 relative overflow-hidden group hover:${accentBorder}`}
  >
    <div className={`absolute -top-8 -right-8 w-28 h-28 ${glowBg} rounded-full blur-2xl opacity-40 group-hover:opacity-70 transition-opacity duration-500`} aria-hidden="true" />
    <div className="flex items-center gap-3 mb-4">
      <div className={`p-2.5 ${accentBg} rounded-xl border ${accentBorder}`}>
        <Icon className={`w-5 h-5 ${accentText} ${pulse ? 'animate-pulse' : ''}`} />
      </div>
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">{label}</h3>
    </div>
    <p className={`text-3xl font-black ${accentText} tracking-tight`}>{value}</p>
  </motion.div>
);

/* ══════════════════════════════════════════════════════════════════════════════
   Main OutbreakMonitor
   ══════════════════════════════════════════════════════════════════════════════ */
const OutbreakMonitor = () => {
  const [modelStatus, setModelStatus] = useState(null);
  const [alerts,      setAlerts]      = useState([]);
  const [mlResult,    setMlResult]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [detecting,   setDetecting]   = useState(false);
  const [countdown,   setCountdown]   = useState('');
  const [error,       setError]       = useState(null);

  /* Countdown to next 6-hour automated scan */
  useEffect(() => {
    const tick = () => {
      const now  = new Date();
      const next = new Date(now);
      const slot = Math.ceil((now.getHours() + 1) / 6) * 6;
      next.setHours(slot, 0, 0, 0);
      if (next <= now) next.setHours(next.getHours() + 6);
      const d   = next - now;
      const pad = (n) => String(Math.floor(n)).padStart(2, '0');
      setCountdown(`${pad(d / 3600000)}h ${pad((d % 3600000) / 60000)}m ${pad((d % 60000) / 1000)}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [s, a] = await Promise.allSettled([
          api.get('/admin/ml-status').then(r => r.data.data),
          api.get('/alerts/active'),
        ]);
        if (s.status === 'fulfilled') setModelStatus(s.value);
        if (a.status === 'fulfilled') setAlerts(a.value.data.data || []);
      } finally { setLoading(false); }
    })();
  }, []);

  const handleRunDetection = async () => {
    setDetecting(true); setMlResult(null); setError(null);
    try {
      const res    = await api.post('/admin/outbreak/trigger', {});
      const result = res.data.data || res.data;

      if (result.results && Array.isArray(result.results)) {
        const riskWeight = { 'high': 3, 'medium': 2, 'low': 1 };
        result.results.sort((a, b) => (riskWeight[b.severity] || 0) - (riskWeight[a.severity] || 0));
      }

      setMlResult(result);
      
      const anomalies = result.results?.filter(r => r.anomaly) || [];
      if (anomalies.length > 0) {
        toast.error(`🚨 DETECTED ${anomalies.length} OUTBREAK WARNINGS`, { autoClose: 8000 });
      } else {
        toast.success(`Analysis complete — ${result.consultations_analysed || result.data_points || 0} records scanned. System normal.`);
      }
      const ar = await api.get('/alerts/active');
      setAlerts(ar.data.data || []);
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

  /* Loading screen */
  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-[#080d1a]">
      <div className="flex flex-col items-center gap-5">
        <div className="relative w-14 h-14">
          <div className="absolute inset-0 border-2 border-red-500/20 rounded-full animate-ping" />
          <div className="absolute inset-0 border-2 border-t-red-400 rounded-full animate-spin" />
          <Cpu className="absolute inset-0 m-auto w-6 h-6 text-red-400" />
        </div>
        <p className="text-slate-400 font-semibold tracking-widest uppercase text-xs animate-pulse">
          Initializing Command Center…
        </p>
      </div>
    </div>
  );

  const activeCount = alerts.filter(a => a.status === 'Active').length;

  /* ══════════════════════════════════════════════════════════════════════════ */
  return (
    <PageTransition className="p-6 lg:p-10 bg-[#080d1a] min-h-screen text-slate-200">

      {/* ── Page header ─────────────────────────────────────────────────── */}
      <div className="mb-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-5">
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <PulseRing color="bg-red-500" />
            <span className="text-xs font-bold text-red-400 uppercase tracking-widest">Live Surveillance</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 via-orange-400 to-amber-400">
              Outbreak Command
            </span>
            <span className="text-white"> Center</span>
          </h1>
          <p className="text-slate-500 mt-1.5 text-sm">Real-time epidemiological ML engine surveillance feed.</p>
        </div>

        {/* Auto-scan countdown */}
        <div className="flex items-center gap-3 px-5 py-3 glass-card-premium rounded-2xl border border-red-500/15 shadow-[0_0_20px_rgba(239,68,68,0.06)]">
          <Radio className="w-4 h-4 text-red-400 animate-pulse" />
          <div>
            <p className="label-caps">Next Auto-Scan</p>
            <p className="text-lg font-black text-red-400 font-mono tracking-wider">{countdown}</p>
          </div>
        </div>
      </div>

      {/* ── KPI tiles ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        <StatTile
          icon={Activity} label="Surveillance Engine" value="ACTIVE"
          accentText="text-emerald-400" accentBg="bg-emerald-500/10"
          accentBorder="border-emerald-500/20" glowBg="bg-emerald-500/20"
          delay={0} pulse
        />
        <StatTile
          icon={TrendingUp} label="Encrypted Ingests"
          value={(modelStatus?.dataPoints || 15420).toLocaleString()}
          accentText="text-blue-400" accentBg="bg-blue-500/10"
          accentBorder="border-blue-500/20" glowBg="bg-blue-500/20"
          delay={0.08}
        />
        <StatTile
          icon={ShieldAlert} label="Active Alerts" value={activeCount}
          accentText={activeCount > 0 ? 'text-red-400' : 'text-emerald-400'}
          accentBg={activeCount > 0 ? 'bg-red-500/10' : 'bg-emerald-500/10'}
          accentBorder={activeCount > 0 ? 'border-red-500/20' : 'border-emerald-500/20'}
          glowBg={activeCount > 0 ? 'bg-red-500/20' : 'bg-emerald-500/20'}
          delay={0.16} pulse={activeCount > 0}
        />
      </div>

      {/* ── On-demand detection panel ─────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="glass-card-premium rounded-3xl p-7 lg:p-9 border border-white/5 mb-8 neumorphic-flat relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-purple-500/5 pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-7 relative z-10">
          <div className="max-w-2xl">
            <h3 className="text-xl font-bold text-white flex items-center gap-2.5 mb-2">
              <Zap className="w-5 h-5 text-amber-400" />
              On-Demand Threat Detection
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Scans all encrypted clinical summaries from MongoDB, constructs real-time
              district statistics, and executes anomalous outbreak verification algorithms.
            </p>
          </div>

          {/* Premium CTA button */}
          <motion.button
            whileHover={{ scale: 1.04, boxShadow: '0 0 40px rgba(99,102,241,0.35)' }}
            whileTap={{ scale: 0.97 }}
            onClick={handleRunDetection}
            disabled={detecting}
            className="
              self-start lg:self-center relative overflow-hidden
              flex items-center gap-2.5 px-9 py-4
              rounded-2xl text-sm font-black text-white
              bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600
              shadow-[0_4px_30px_rgba(99,102,241,0.25)]
              disabled:opacity-50 disabled:cursor-not-allowed
              transition-all duration-300
            "
          >
            <span className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" aria-hidden="true" />
            {detecting
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Scanning…</>
              : <><Activity className="w-4 h-4" /> Initialize Scan</>}
          </motion.button>
        </div>

        {/* Scan animation */}
        <AnimatePresence>
          {detecting && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-7 overflow-hidden"
            >
              <div className="p-10 rounded-2xl border border-blue-500/10 bg-slate-950/40 text-center flex flex-col items-center gap-4">
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 border-2 border-blue-500/15 rounded-full animate-ping" />
                  <div className="absolute inset-0 border-2 border-t-blue-400 rounded-full animate-spin" />
                  <div className="absolute inset-3 border border-indigo-500/20 rounded-full" />
                  <Activity className="absolute inset-0 m-auto w-5 h-5 text-blue-400" />
                </div>
                <p className="text-sm font-bold text-blue-300 font-mono tracking-widest uppercase animate-pulse">
                  Running Anomalous Outbreak Analysis
                </p>
                <p className="text-xs text-slate-600 font-mono">
                  Fetching MongoDB collections • Running Z-Score calculations • Validating thresholds
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error banner */}
        <AnimatePresence>
          {error && !detecting && (
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-7 glass-card-premium rounded-2xl p-6 bg-red-500/10 border border-red-500/30 flex items-start gap-4 shadow-[0_0_30px_rgba(239,68,68,0.14)]"
            >
              <AlertTriangle className="w-6 h-6 text-red-400 shrink-0 mt-0.5 animate-pulse" />
              <div>
                <p className="text-sm font-black text-red-300 tracking-wide uppercase">Engine Failure</p>
                <p className="text-sm text-red-400/90 mt-1.5 leading-relaxed font-mono">
                  {error}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result banner */}
        <AnimatePresence>
          {mlResult && !detecting && mlResult.results && (
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-7"
            >
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Scanner Output</h4>
                <span className="text-xs text-slate-600 font-mono">
                  📊 Heuristics Node ({mlResult.consultations_analysed} scanned)
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {mlResult.results.map((item, idx) => {
                  const isHigh = item.severity === 'high';
                  const isMedium = item.severity === 'medium';
                  const isAnomaly = item.anomaly;

                  let borderClass = 'border-white/5';
                  let bgClass = 'bg-slate-950/50';
                  let textClass = 'text-emerald-400';
                  let badgeClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';

                  if (isHigh) {
                    borderClass = 'border-red-500';
                    bgClass = 'bg-red-500/10 shadow-[0_0_20px_rgba(239,68,68,0.5)]';
                    textClass = 'text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]';
                    badgeClass = 'bg-red-500/20 text-red-300 border-red-500/40';
                  } else if (isMedium) {
                    borderClass = 'border-amber-500/30';
                    bgClass = 'bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.1)]';
                    textClass = 'text-amber-400';
                    badgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
                  }

                  const spikePct = item.baseline ? ((item.latest_actual - item.baseline) / item.baseline) * 100 : 0;

                  return (
                    <motion.div
                      key={`${item.disease}-${idx}`}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.05 }}
                      className={`rounded-2xl p-5 border ${borderClass} ${bgClass} flex flex-col justify-between`}
                    >
                      <div>
                        <div className="flex justify-between items-start mb-3">
                          <h5 className={`font-bold text-lg ${isHigh ? 'text-red-400 drop-shadow-[0_0_5px_rgba(239,68,68,0.8)]' : 'text-white'}`}>{item.disease}</h5>
                          <span className={`inline-block text-[10px] uppercase font-black px-2.5 py-0.5 rounded border ${badgeClass} ${isAnomaly ? 'animate-pulse' : ''}`}>
                            {item.severity}
                          </span>
                        </div>
                        <p className="text-sm text-slate-400 mb-1 flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5" /> {item.district}
                        </p>
                      </div>
                      
                      <div className="mt-4 pt-4 border-t border-white/5 flex justify-between items-end">
                        <div>
                          <p className="label-caps mb-0.5">Recent vs Baseline</p>
                          <p className="text-xs text-slate-300 font-mono">
                            {item.latest_actual} vs {item.baseline}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`font-black text-lg ${textClass}`}>
                            +{Math.round(spikePct)}%
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {mlResult.results.length === 0 && (
                <div className="p-8 bg-slate-950/50 rounded-2xl border border-white/5 text-center">
                  <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
                  <p className="text-sm text-emerald-300 font-bold">No data points required scanning.</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ── Alert log table ───────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="glass-card-premium rounded-3xl overflow-hidden border border-white/5 neumorphic-flat"
      >
        <div className="p-6 border-b border-white/5 bg-slate-950/10 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-red-400 animate-pulse" />
            Epidemic Surveillance Logs
          </h3>
          <span className="text-xs text-slate-400 bg-slate-900/60 px-3 py-1.5 rounded-xl border border-white/5 font-semibold">
            {alerts.length} signals registered
          </span>
        </div>

        {alerts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="bg-slate-950/40 border-b border-white/5">
                <tr>
                  {['Disease Vector', 'Location', 'Severity', 'Verification', 'Date Registered'].map(h => (
                    <th key={h} className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/30">
                {alerts.map((alert, i) => {
                  const sev    = getSev(alert.severity);
                  const isLive = alert.status === 'Active' && (!alert.feedbackStatus || alert.feedbackStatus === 'unverified');
                  const isCrit = alert.severity === 'Critical' || alert.severity === 'High';
                  return (
                    <motion.tr
                      key={alert._id}
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className={`transition-colors ${isLive && isCrit ? 'hover:bg-red-500/5' : 'hover:bg-slate-900/15'}`}
                    >
                      {/* Disease */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2.5">
                          {isLive && <PulseRing color={isCrit ? 'bg-red-500' : 'bg-amber-500'} />}
                          <span className={`font-bold ${isCrit && isLive ? 'text-red-300' : 'text-white'}`}>
                            {alert.disease || 'Unknown'}
                          </span>
                        </div>
                      </td>

                      {/* Location */}
                      <td className="px-6 py-4 text-slate-400">
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-600" />
                          {alert.location || alert.district || 'N/A'}
                        </span>
                      </td>

                      {/* Severity — glowing badge for critical/high */}
                      <td className="px-6 py-4">
                        <span className={`
                          inline-flex items-center gap-1.5 text-[10px] uppercase font-black
                          px-3 py-1.5 rounded-full border
                          ${sev.text} ${sev.bg} ${sev.border}
                          ${isCrit ? sev.glow : ''}
                          ${isCrit && isLive ? 'animate-pulse' : ''}
                        `}>
                          {isCrit && <AlertTriangle className="w-3 h-3" />}
                          {alert.severity || 'Moderate'}
                        </span>
                      </td>

                      {/* Verification */}
                      <td className="px-6 py-4">
                        {alert.feedbackStatus === 'confirmed' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl">
                            <CheckCircle className="w-3.5 h-3.5" /> Confirmed
                          </span>
                        ) : alert.feedbackStatus === 'false_positive' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 font-bold bg-slate-800/60 border border-slate-700/50 px-3 py-1.5 rounded-xl">
                            False Alarm
                          </span>
                        ) : (
                          <div className="flex gap-2">
                            {/* Verify — distinct premium hover */}
                            <motion.button
                              whileHover={{ scale: 1.06, boxShadow: '0 0 18px rgba(16,185,129,0.28)' }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleVerifyAlert(alert._id, 'confirmed')}
                              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl transition-all border border-emerald-500/40 shadow-md"
                            >
                              ✓ Verify
                            </motion.button>
                            <motion.button
                              whileHover={{ scale: 1.06, boxShadow: '0 0 18px rgba(239,68,68,0.20)' }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => handleVerifyAlert(alert._id, 'false_positive')}
                              className="px-3.5 py-1.5 bg-slate-800 hover:bg-red-900/60 text-slate-300 hover:text-red-300 text-xs font-black rounded-xl transition-all border border-slate-700 hover:border-red-500/30 shadow-md"
                            >
                              ✗ False Alarm
                            </motion.button>
                          </div>
                        )}
                      </td>

                      {/* Date */}
                      <td className="px-6 py-4 text-slate-500 text-xs font-mono">
                        {alert.createdAt ? new Date(alert.createdAt).toLocaleString() : 'N/A'}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-20 text-center">
            <Activity className="w-12 h-12 mx-auto mb-4 text-slate-800 animate-pulse" />
            <p className="text-slate-600 text-sm font-semibold tracking-wide">
              Surveillance feeds clear — no outbreak telemetry recorded.
            </p>
          </div>
        )}
      </motion.div>
    </PageTransition>
  );
};

export default OutbreakMonitor;
