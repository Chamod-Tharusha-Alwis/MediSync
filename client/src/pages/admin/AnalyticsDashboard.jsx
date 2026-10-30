import { useTranslation } from '../../i18n/LanguageContext';
import React, { useEffect, useState, useCallback } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } from 'recharts';
import { Activity, Pill, Users, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react';
import api from '../../api/axiosInstance';
import PageTransition from '../../components/common/PageTransition';
import { formatDoctorName } from '../../utils/doctorName';

const INITIAL_ANALYTICS = Object.freeze({
  registrationGrowth: [],
  topDoctors: [],
  dispensingStats: { issuedCount: 0, dispensedCount: 0, dispensingRate: 0 },
  topDrugs: [],
  alerts: []
});

const AnalyticsDashboard = () => {
  const { t } = useTranslation();
  const [data, setData] = useState(INITIAL_ANALYTICS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(false);
    setErrorMessage('');
    try {
      const res = await api.get('/admin/analytics/dashboard');
      const payload = res?.data?.data || res?.data || {};

      const normalized = {
        registrationGrowth: Array.isArray(payload.registrationGrowth) ? payload.registrationGrowth : [],
        topDoctors: Array.isArray(payload.topDoctors) ? payload.topDoctors.map(d => ({ ...d, name: formatDoctorName(d.name) })) : [],
        dispensingStats: {
          issuedCount: Number(payload.dispensingStats?.issuedCount) || 0,
          dispensedCount: Number(payload.dispensingStats?.dispensedCount) || 0,
          dispensingRate: Number(payload.dispensingStats?.dispensingRate) || 0,
        },
        topDrugs: Array.isArray(payload.topDrugs) ? payload.topDrugs : [],
        alerts: Array.isArray(payload.alerts) ? payload.alerts : []
      };

      setData(normalized);
    } catch (err) {
      console.error('[AnalyticsDashboard] Failed to fetch analytics data:', err);
      setError(true);
      setErrorMessage(
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to connect to analytics service.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <div className="w-9 h-9 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-400 font-medium">Loading platform analytics…</p>
      </div>
    );
  }

  if (error) {
    return (
      <PageTransition className="p-6">
        <div className="glass-panel p-8 rounded-2xl border border-rose-500/20 bg-rose-500/5 max-w-xl mx-auto text-center space-y-4 my-12 shadow-xl shadow-rose-950/20">
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 mx-auto flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Analytics Service Unavailable</h2>
            <p className="text-sm text-slate-400 mt-1 leading-relaxed">
              {errorMessage}
            </p>
          </div>
          <button
            type="button"
            onClick={fetchAnalytics}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-all shadow-md shadow-blue-600/20"
          >
            <RefreshCw className="w-4 h-4" />
            Retry Analytics
          </button>
        </div>
      </PageTransition>
    );
  }

  const hasDispensingData = (data.dispensingStats.issuedCount > 0 || data.dispensingStats.dispensedCount > 0);
  const pieData = hasDispensingData
    ? [
        { name: 'Issued', value: data.dispensingStats.issuedCount },
        { name: 'Dispensed', value: data.dispensingStats.dispensedCount }
      ]
    : [{ name: 'No Activity', value: 1 }];

  const totalRegistrations = data.registrationGrowth.reduce((acc, curr) => acc + (Number(curr?.count) || 0), 0);
  const totalConsultations = data.topDoctors.reduce((acc, curr) => acc + (Number(curr?.count) || 0), 0);

  return (
    <PageTransition className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gradient-blue tracking-tight">Analytics Dashboard</h1>
        <p className="text-slate-400 mt-1">High-level platform metrics and performance telemetry.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="glass-panel p-6 rounded-xl border border-white/5 flex items-center gap-4">
          <div className="p-3 bg-blue-500/20 rounded-lg text-blue-400">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-slate-400 text-sm">New Registrations</p>
            <p className="text-2xl font-bold text-white">
              {totalRegistrations}
            </p>
          </div>
        </div>
        <div className="glass-panel p-6 rounded-xl border border-white/5 flex items-center gap-4">
          <div className="p-3 bg-emerald-500/20 rounded-lg text-emerald-400">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-slate-400 text-sm">Total Consultations</p>
            <p className="text-2xl font-bold text-white">
              {totalConsultations}
            </p>
          </div>
        </div>
        <div className="glass-panel p-6 rounded-xl border border-white/5 flex items-center gap-4">
          <div className="p-3 bg-purple-500/20 rounded-lg text-purple-400">
            <Pill className="w-6 h-6" />
          </div>
          <div>
            <p className="text-slate-400 text-sm">Dispensing Rate</p>
            <p className="text-2xl font-bold text-white">
              {data.dispensingStats.dispensingRate}%
            </p>
          </div>
        </div>
        <div className="glass-panel p-6 rounded-xl border border-white/5 flex items-center gap-4">
          <div className="p-3 bg-red-500/20 rounded-lg text-red-400">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-slate-400 text-sm">Active Alerts</p>
            <p className="text-2xl font-bold text-white">
              {data.alerts.length}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="glass-panel p-6 rounded-xl border border-white/5 h-80 flex flex-col">
          <h3 className="text-lg font-semibold text-white mb-4">{t("adminManagement.patientFlow", "Patient Registration Growth")}</h3>
          {data.registrationGrowth.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
              No registration growth data recorded in the last 7 days
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.registrationGrowth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="_id" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }} />
                <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="glass-panel p-6 rounded-xl border border-white/5 h-80 flex flex-col">
          <h3 className="text-lg font-semibold text-white mb-4">Top Doctors by Consultations</h3>
          {data.topDoctors.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
              No doctor consultation metrics recorded
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.topDoctors} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={12} width={120} tickLine={false} axisLine={false} />
                <RechartsTooltip cursor={{fill: '#334155'}} contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }} />
                <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6 rounded-xl border border-white/5 h-80 flex flex-col">
          <h3 className="text-lg font-semibold text-white mb-4">Prescription Dispensing Ratio</h3>
          {!hasDispensingData ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
              No prescriptions recorded for dispensing analysis
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  <Cell fill="#3b82f6" />
                  <Cell fill="#10b981" />
                </Pie>
                <RechartsTooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }} />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="glass-panel p-6 rounded-xl border border-white/5 h-80 flex flex-col">
          <h3 className="text-lg font-semibold text-white mb-4">Most Prescribed Medications</h3>
          {data.topDrugs.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">
              No prescription drug activity recorded
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.topDrugs}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <RechartsTooltip cursor={{fill: '#334155'}} contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }} />
                <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </PageTransition>
  );
};

export default AnalyticsDashboard;
