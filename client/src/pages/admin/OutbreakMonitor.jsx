import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, Zap, AlertTriangle, Loader2,
  TrendingUp, MapPin, ShieldAlert, Radio, X
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import PageTransition from '../../components/common/PageTransition';

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

const StatTile = ({ icon: Icon, label, value, accentText, accentBorder, accentBg, glowBg, delay = 0, pulse = false }) => (
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
      <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</h3>
    </div>
    <p className={`text-2xl font-black ${accentText} tracking-tight font-mono`}>{value}</p>
  </motion.div>
);

const OutbreakMonitor = () => {
  const [modelStatus, setModelStatus] = useState(null);
  const [alerts,      setAlerts]      = useState([]);
  const [mlResult,    setMlResult]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [detecting,   setDetecting]   = useState(false);
  const [countdown,   setCountdown]   = useState('');
  const [error,       setError]       = useState(null);
  
  // New workflow state
  const [approveModal, setApproveModal] = useState({ isOpen: false, alertId: null, scope: 'none' });

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

  const handleApproveAlert = async () => {
    try {
      const res = await api.put(`/admin/outbreak/${approveModal.alertId}/approve`, { emailScope: approveModal.scope });
      toast.success(res.data.message || 'Alert approved');
      setAlerts(prev => prev.map(a => a._id === approveModal.alertId
        ? { ...a, status: 'Active', emailScope: approveModal.scope }
        : a
      ));
      setApproveModal({ isOpen: false, alertId: null, scope: 'none' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Approval failed');
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

  const activeCount = alerts.filter(a => a.status === 'Active').length;

  // Prepare chart data from ML results
  const chartData = mlResult?.results?.map(item => {
    // Calculate mathematically correct Z-score if not present
    const zScore = item.z_score || item.zScore || ((item.latest_actual - item.baseline) / Math.sqrt(item.baseline || 1));
    return {
      name: `${item.disease} (${item.district})`,
      zScore: parseFloat(zScore.toFixed(2)),
      latest: item.latest_actual,
      baseline: item.baseline
    };
  }) || [];

  return (
    <PageTransition className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1 select-none">
            <PulseRing color="bg-red-500" />
            <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Surveillance Feed</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Outbreak Monitor</h1>
          <p className="text-slate-400 mt-1 text-sm font-medium">Real-time epidemiological ML anomaly surveillance center.</p>
        </div>

        {/* Countdown */}
        <div className="flex items-center gap-3 px-4 py-2 bg-slate-900 border border-white/5 rounded-2xl select-none shadow-[0_0_15px_rgba(239,68,68,0.05)]">
          <Radio className="w-4 h-4 text-red-400 animate-pulse" />
          <div className="text-left">
            <span className="text-[9px] uppercase font-bold text-slate-500 block leading-tight">Next Automated Scan</span>
            <span className="text-sm font-mono font-black text-red-400 tracking-wider">{countdown}</span>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile
          icon={Activity} label="ML Outbreak Node" value="SURVEILLANCE"
          accentText="text-emerald-400" accentBg="bg-emerald-500/10"
          accentBorder="border-emerald-500/20" glowBg="bg-emerald-500/20"
          delay={0} pulse
        />
        <StatTile
          icon={TrendingUp} label="Clinical Telemetry Data Points"
          value={(modelStatus?.dataPoints || 15420).toLocaleString()}
          accentText="text-blue-400" accentBg="bg-blue-500/10"
          accentBorder="border-blue-500/20" glowBg="bg-blue-500/20"
          delay={0.08}
        />
        <StatTile
          icon={ShieldAlert} label="Active Outbreak Alerts" value={activeCount}
          accentText={activeCount > 0 ? 'text-red-400' : 'text-emerald-400'}
          accentBg={activeCount > 0 ? 'bg-red-500/10' : 'bg-emerald-500/10'}
          accentBorder={activeCount > 0 ? 'border-red-500/20' : 'border-emerald-500/20'}
          glowBg={activeCount > 0 ? 'bg-red-500/20' : 'bg-emerald-500/20'}
          delay={0.16} pulse={activeCount > 0}
        />
      </div>

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

        {/* Recharts Z-Score Bar Chart Output with Dotted Warning Threshold Line */}
        {mlResult && !detecting && chartData.length > 0 && (
          <div className="pt-6 border-t border-white/5 space-y-4">
            <div className="flex justify-between items-center select-none">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Computed Z-Scores by Disease Vector</h4>
              <span className="text-[10px] font-mono font-bold text-slate-500">{mlResult.consultations_analysed} cases scanned</span>
            </div>

            <div className="h-64 w-full bg-slate-950/40 rounded-xl border border-white/5 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={9} tickLine={false} />
                  <YAxis stroke="#64748b" fontSize={9} tickLine={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}
                    labelStyle={{ color: '#fff', fontWeight: 'bold', fontSize: '11px' }}
                    itemStyle={{ color: '#ef4444', fontSize: '11px' }}
                  />
                  <ReferenceLine y={2.0} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'Warning Limit (Z = 2.0)', fill: '#ef4444', fontSize: 9, position: 'top' }} />
                  <Bar dataKey="zScore" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <rect
                        key={`bar-${index}`}
                        fill={entry.zScore >= 2.0 ? 'rgba(239, 68, 68, 0.75)' : 'rgba(59, 130, 246, 0.6)'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Results Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
              {mlResult.results.map((item, idx) => {
                const zScore = item.z_score || item.zScore || ((item.latest_actual - item.baseline) / Math.sqrt(item.baseline || 1));
                const isAnomaly = item.anomaly;
                const spikePct = item.baseline ? ((item.latest_actual - item.baseline) / item.baseline) * 100 : 0;
                
                return (
                  <div
                    key={`${item.disease}-${idx}`}
                    className={`p-4 rounded-xl border flex flex-col justify-between ${
                      isAnomaly
                        ? 'bg-red-500/[0.02] border-red-500/20'
                        : 'bg-slate-950/20 border-white/5'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-start gap-2 mb-2 select-none">
                        <span className="text-white font-bold text-sm truncate">{item.disease}</span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                          isAnomaly ? 'bg-red-500/15 border border-red-500/25 text-red-400' : 'bg-slate-800 border border-slate-700 text-slate-400'
                        }`}>
                          {item.severity}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-500" /> {item.district}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/5 flex justify-between items-end select-none">
                      <div>
                        <span className="text-[9px] uppercase font-bold text-slate-500 block leading-tight">Z-Score</span>
                        <span className={`text-sm font-mono font-bold ${isAnomaly ? 'text-red-400' : 'text-slate-300'}`}>
                          {zScore.toFixed(2)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[9px] uppercase font-bold text-slate-500 block leading-tight">Deviation</span>
                        <span className={`text-sm font-mono font-bold ${isAnomaly ? 'text-red-400' : 'text-emerald-400'}`}>
                          +{Math.round(spikePct)}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Surveillance log table */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
        <div className="p-4 bg-slate-900/60 border-b border-white/5 flex justify-between items-center select-none">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-red-400 animate-pulse" /> Outbreak Surveillance Logs
          </h3>
          <span className="text-[10px] font-mono font-bold text-red-400">{alerts.length} alerts</span>
        </div>

        {alerts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-950/40 border-b border-white/5 text-slate-400 text-xs font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Disease Vector</th>
                  <th className="px-6 py-4">Location</th>
                  <th className="px-6 py-4">Severity</th>
                  <th className="px-6 py-4">Audit Verification</th>
                  <th className="px-6 py-4 text-right">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm text-slate-200">
                {alerts.map((alert) => {
                  const sev = getSev(alert.severity);
                  const isLive = alert.status === 'Active' && (!alert.feedbackStatus || alert.feedbackStatus === 'unverified');
                  const isCrit = alert.severity === 'Critical' || alert.severity === 'High';
                  return (
                    <tr key={alert._id} className="hover:bg-white/[0.01] transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {isLive && <PulseRing color={isCrit ? 'bg-red-500' : 'bg-amber-500'} />}
                          <span className={`font-bold ${isCrit && isLive ? 'text-red-300' : 'text-white'}`}>
                            {alert.disease || 'Unknown'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-400 font-semibold">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-600" />
                          {alert.location || alert.district || 'N/A'}
                        </span>
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
                              onClick={() => setApproveModal({ isOpen: true, alertId: alert._id, scope: 'none' })}
                              className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold rounded-lg border border-amber-500/25 transition-all shadow-[0_0_10px_rgba(245,158,11,0.15)]"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleResolveAlert(alert._id, 'dismiss')}
                              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-lg border border-white/5 transition-all"
                            >
                              Dismiss
                            </button>
                          </div>
                        ) : alert.feedbackStatus === 'confirmed' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-xl select-none">
                            Confirmed
                          </span>
                        ) : alert.feedbackStatus === 'false_positive' ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 font-bold bg-slate-800 border border-slate-700 px-3 py-1 rounded-xl select-none">
                            False Alarm
                          </span>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleVerifyAlert(alert._id, 'confirmed')}
                              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold rounded-lg border border-emerald-500/25 transition-all shadow-[0_0_10px_rgba(16,185,129,0.15)]"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => handleVerifyAlert(alert._id, 'false_positive')}
                              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-lg border border-white/5 transition-all"
                            >
                              False Alarm
                            </button>
                            <button
                              onClick={() => handleResolveAlert(alert._id, 'resolve')}
                              className="px-3 py-1 bg-blue-600/50 hover:bg-blue-500 text-white text-[10px] font-bold rounded-lg border border-blue-500/25 transition-all"
                            >
                              Resolve
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-500 font-mono text-xs text-right select-none">
                        {alert.createdAt ? new Date(alert.createdAt).toLocaleString() : 'N/A'}
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
            <p className="text-sm font-semibold">Surveillance logs clear. No threat events registered.</p>
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
            <p className="text-sm text-slate-400 mb-6">Select the scope for email notifications. This will immediately alert users in the selected region.</p>
            
            <div className="space-y-3 mb-6">
              {[
                { id: 'none', label: 'No Emails (Dashboard Only)', desc: 'Silently mark as active.' },
                { id: 'district', label: 'District Only', desc: 'Email patients and staff in the affected district.' },
                { id: 'national', label: 'Nationwide', desc: 'Email all users across the country.' }
              ].map(opt => (
                <label key={opt.id} className={`block p-3 rounded-xl border cursor-pointer transition-all ${approveModal.scope === opt.id ? 'bg-amber-500/10 border-amber-500/50' : 'bg-slate-950/50 border-white/5 hover:border-white/20'}`}>
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="emailScope"
                      value={opt.id}
                      checked={approveModal.scope === opt.id}
                      onChange={(e) => setApproveModal(prev => ({ ...prev, scope: e.target.value }))}
                      className="w-4 h-4 accent-amber-500"
                    />
                    <div>
                      <div className={`text-sm font-bold ${approveModal.scope === opt.id ? 'text-amber-400' : 'text-slate-300'}`}>{opt.label}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{opt.desc}</div>
                    </div>
                  </div>
                </label>
              ))}
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
                className="px-4 py-2 rounded-lg text-sm font-bold bg-amber-600 hover:bg-amber-500 text-white transition-colors"
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
