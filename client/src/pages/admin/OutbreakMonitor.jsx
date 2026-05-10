import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, Zap, AlertTriangle, CheckCircle, Loader2, RefreshCw, TrendingUp, MapPin } from 'lucide-react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import PageTransition from '../../components/common/PageTransition';

const OutbreakMonitor = () => {
  const [modelStatus, setModelStatus] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [mlResult, setMlResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statusRes, alertsRes] = await Promise.allSettled([
          fetch('http://localhost:5001/model-status').then(r => r.json()),
          api.get('/alerts/active'),
        ]);
        if (statusRes.status === 'fulfilled') setModelStatus(statusRes.value);
        if (alertsRes.status === 'fulfilled') setAlerts(alertsRes.value.data.data || []);
      } catch (err) {
        console.error('Failed to load outbreak data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleRunDetection = async () => {
    setDetecting(true);
    setMlResult(null);
    try {
      const res = await api.post('/admin/outbreak/trigger', { district: 'Colombo' });
      setMlResult(res.data.data || res.data);
      toast.success('Outbreak detection completed');
      // Refresh alerts
      const alertsRes = await api.get('/alerts/active');
      setAlerts(alertsRes.data.data || []);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Detection failed');
      setMlResult({ error: err.response?.data?.error || 'Detection failed' });
    } finally {
      setDetecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-20">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <PageTransition className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">Outbreak Monitor</h1>
        <p className="text-slate-400 mt-1">ML-powered outbreak detection and surveillance engine.</p>
      </div>

      {/* ML Model Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-xl p-6 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-emerald-500/20 rounded-lg">
              <Activity className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Engine Status</h3>
          </div>
          <div className="flex items-center gap-2">
            {modelStatus?.status === 'active' ? (
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            )}
            <span className={`text-xl font-bold ${modelStatus?.status === 'active' ? 'text-emerald-400' : 'text-amber-400'}`}>
              {modelStatus?.status === 'active' ? 'ACTIVE' : 'OFFLINE'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-2">Last trained: {modelStatus?.lastTrained || 'Unknown'}</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel rounded-xl p-6 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <TrendingUp className="w-5 h-5 text-blue-400" />
            </div>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Data Points</h3>
          </div>
          <p className="text-3xl font-black text-white">{(modelStatus?.dataPoints || 0).toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-2">Ingested consultation records</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-panel rounded-xl p-6 border border-slate-700/50">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-red-500/20 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Active Alerts</h3>
          </div>
          <p className="text-3xl font-black text-white">{alerts.length}</p>
          <p className="text-xs text-slate-500 mt-2">Current unresolved outbreak alerts</p>
        </motion.div>
      </div>

      {/* Run Detection */}
      <div className="glass-panel rounded-xl p-6 border border-slate-700/50 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-white">Manual Detection</h3>
            <p className="text-sm text-slate-400 mt-1">Trigger an immediate outbreak analysis scan across all districts.</p>
          </div>
          <button
            onClick={handleRunDetection}
            disabled={detecting}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {detecting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</>
            ) : (
              <><Zap className="w-4 h-4" /> Run Detection Now</>
            )}
          </button>
        </div>

        {/* Detection Result */}
        {mlResult && !mlResult.error && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
            <h4 className="text-sm font-bold text-slate-400 uppercase mb-3">Detection Result</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-slate-500">Disease</p>
                <p className="text-white font-medium">{mlResult.disease || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">District</p>
                <p className="text-white font-medium">{mlResult.district || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Z-Score</p>
                <p className={`font-bold ${
                  (mlResult.z_score ?? 0) > 3 ? 'text-red-400' : 
                  (mlResult.z_score ?? 0) > 1.5 ? 'text-amber-400' : 'text-emerald-400'
                }`}>
                  {mlResult.z_score !== undefined && mlResult.z_score !== null
                    ? mlResult.z_score.toFixed(3) 
                    : '0.000'}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Status</p>
                <span className={`text-xs uppercase font-bold px-2 py-1 rounded ${
                  mlResult.anomaly ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
                }`}>
                  {mlResult.anomaly ? '⚠ ANOMALY' : '✓ NORMAL'}
                </span>
              </div>
            </div>
            
            <div className="mt-4 text-xs text-slate-400 flex gap-4 border-t border-slate-700/50 pt-3">
              <span>Historical Mean: <b>{mlResult.historical_mean}</b></span>
              <span>Data Points: <b>{mlResult.data_points?.toLocaleString()}</b></span>
              <span>Model: <b>{mlResult.model}</b></span>
            </div>
            
            {mlResult.forecast?.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-bold text-slate-400 uppercase mb-2">14-Day Forecast</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-800 border-b border-slate-700 text-slate-300">
                      <tr>
                        <th className="px-3 py-2 font-medium text-xs">Date</th>
                        <th className="px-3 py-2 font-medium text-xs text-right">Predicted Cases</th>
                        <th className="px-3 py-2 font-medium text-xs text-right">Z-Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mlResult.forecast.map((f, i) => (
                        <tr key={i} className={`border-b border-slate-800 ${f.z_score > 3 ? 'bg-red-500/10' : 'hover:bg-slate-800/30'}`}>
                          <td className="px-3 py-2 text-sm text-white">{f.date}</td>
                          <td className="px-3 py-2 text-sm text-white text-right">{f.predicted_cases}</td>
                          <td className={`px-3 py-2 text-sm font-mono text-right ${
                            f.z_score > 3 ? 'text-red-400 font-bold' : 'text-slate-400'
                          }`}>{f.z_score?.toFixed(3) ?? '0.000'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            
            {mlResult.message && (
              <p className="text-sm text-slate-300 mt-3 border-t border-slate-700/50 pt-3">{mlResult.message}</p>
            )}
          </motion.div>
        )}
      </div>

      {/* Historical Alerts Table */}
      <div className="glass-panel rounded-xl overflow-hidden border border-slate-700/50">
        <div className="p-6 border-b border-slate-700/50">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-blue-400" />
            Alert History
          </h3>
        </div>
        {alerts.length > 0 ? (
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-800/80 border-b border-slate-700 text-slate-300">
              <tr>
                <th className="px-6 py-4 font-medium text-xs uppercase">Disease</th>
                <th className="px-6 py-4 font-medium text-xs uppercase">Location</th>
                <th className="px-6 py-4 font-medium text-xs uppercase">Severity</th>
                <th className="px-6 py-4 font-medium text-xs uppercase">Status</th>
                <th className="px-6 py-4 font-medium text-xs uppercase">Date</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map(alert => (
                <tr key={alert._id} className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4 text-white font-medium">{alert.disease || 'Unknown'}</td>
                  <td className="px-6 py-4 text-slate-300 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-500" />{alert.location || alert.district || 'N/A'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-full ${
                      alert.severity === 'Critical' ? 'bg-red-500/20 text-red-400' :
                      alert.severity === 'High' ? 'bg-amber-500/20 text-amber-400' :
                      'bg-blue-500/20 text-blue-400'
                    }`}>
                      {alert.severity || 'Moderate'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] uppercase font-bold px-2.5 py-1 rounded-full ${
                      alert.status === 'Resolved' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {alert.status || 'Active'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-400 text-sm">{alert.createdAt ? new Date(alert.createdAt).toLocaleDateString() : 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-12 text-center text-slate-500">
            <Activity className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>No outbreak alerts recorded.</p>
          </div>
        )}
      </div>
    </PageTransition>
  );
};

export default OutbreakMonitor;
