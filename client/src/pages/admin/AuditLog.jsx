import React, { useEffect, useState, useCallback } from 'react';

import { ScrollText, Calendar, Shield, ChevronLeft, ChevronRight, Smartphone, Lock, Loader2, Search, User, Activity } from 'lucide-react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import PageTransition from '../../components/common/PageTransition';

const maskNic = (nic) => {
  if (!nic || nic.length < 4) return '****';
  return '•••• ' + nic.slice(-4);
};

const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return 'Invalid Date';
    return d.toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  } catch (e) {
    return 'Invalid Date';
  }
};

const AuditLog = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/admin/audit-logs?page=${page}&limit=25`;
      if (startDate) url += `&startDate=${startDate}`;
      if (endDate) url += `&endDate=${endDate}`;
      if (roleFilter) url += `&actorRole=${roleFilter}`;
      if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;

      const res = await api.get(url);
      setLogs(res.data.data || []);
      setTotalPages(res.data.pagination?.pages || 1);
    } catch (err) {
      toast.error('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [page, startDate, endDate, roleFilter, searchTerm]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const getActionBadge = (action) => {
    const lower = (action || '').toLowerCase();
    if (lower.includes('login')) return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
    if (lower.includes('create') || lower.includes('register')) return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    if (lower.includes('delete') || lower.includes('block')) return 'bg-red-500/10 text-red-400 border border-red-500/20';
    if (lower.includes('update') || lower.includes('edit')) return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
    return 'bg-slate-800 text-slate-400 border border-slate-700/50';
  };

  const roles = [
    { value: '', label: 'All Roles' },
    { value: 'admin', label: 'Admin' },
    { value: 'doctor', label: 'Doctor' },
    { value: 'patient', label: 'Patient' },
    { value: 'pharmacist', label: 'Pharmacist' },
    { value: 'hospital_admin', label: 'Hospital Admin' }
  ];

  return (
    <PageTransition className="space-y-6">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Audit Log</h1>
        <p className="text-slate-400 mt-1 text-sm font-medium">Platform surveillance logs with HIPAA-compliant data masking indicators.</p>
      </div>

      {/* Date Filters & Role Chips */}
      <div className="glass-panel rounded-2xl p-6 border border-white/5 space-y-5">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px] flex flex-col gap-1.5 select-none">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Start Date
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="glass-input text-xs"
            />
          </div>
          <div className="flex-1 min-w-[200px] flex flex-col gap-1.5 select-none">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> End Date
            </span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="glass-input text-xs"
            />
          </div>
          <div className="flex-1 min-w-[200px] flex flex-col gap-1.5 select-none">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <Search className="w-3.5 h-3.5" /> Search User ID / NIC
            </span>
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              className="glass-input text-xs"
            />
          </div>
          <button
            onClick={() => { setStartDate(''); setEndDate(''); setRoleFilter(''); setSearchTerm(''); setPage(1); }}
            className="glass-button text-xs py-2.5 px-5 select-none shrink-0"
          >
            Clear Filters
          </button>
        </div>

        {/* Role filter chips */}
        <div className="flex flex-col gap-2 pt-2 border-t border-white/5 select-none">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" /> Filter by Actor Role
          </span>
          <div className="flex flex-wrap gap-2 pt-1">
            {roles.map(r => (
              <button
                key={r.value}
                onClick={() => { setRoleFilter(r.value); setPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                  roleFilter === r.value
                    ? 'bg-slate-700/80 border-slate-600 text-white'
                    : 'bg-slate-950/20 border-white/5 text-slate-400 hover:text-white'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
        {loading ? (
          <div className="p-12 text-center select-none">
            <Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" />
          </div>
        ) : logs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-900/60 border-b border-white/5 text-slate-400 text-xs font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Timestamp</th>
                  <th className="px-6 py-4">Actor</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Logged Action</th>
                  <th className="px-6 py-4">Accessed Patient NIC</th>
                  <th className="px-6 py-4 text-right">Device</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm text-slate-200">
                {logs.map((log, index) => (
                  <tr key={log._id || index} className="hover:bg-white/[0.01] transition-colors">
                    <td className="px-6 py-4 text-slate-400 font-mono text-xs select-none">
                      {formatDate(log.timestamp || log.createdAt)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-400 select-none shrink-0">
                          <User className="w-3 h-3 text-slate-400" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-white font-bold text-xs">{log.actorName || log.actorId || 'System'}</span>
                          {log.actorNic && <span className="text-[10px] text-slate-500 font-mono">{log.actorNic}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col items-start gap-1">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 border border-slate-700/50 text-slate-300 uppercase tracking-wider select-none">
                          {log.actorRole || log.role || 'system'}
                        </span>
                        {log.isOnline ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <Activity className="w-2.5 h-2.5" /> Online
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-500/10 text-slate-400 border border-slate-500/20">
                            Offline
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full select-none ${getActionBadge(log.action)}`}>
                        {log.action || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-300">
                      {log.accessedNic && log.accessedNic !== 'N/A' ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-red-500/[0.03] border border-red-500/10 text-red-400">
                          <Lock className="w-3 h-3 text-red-500/60" /> {maskNic(log.accessedNic)}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-xs text-right">
                      <span className="inline-flex items-center gap-1">
                        <Smartphone className="w-3.5 h-3.5 opacity-40 shrink-0" />
                        {log.deviceModel || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500 select-none">
            <ScrollText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-semibold">No audit logs found matching criteria.</p>
          </div>
        )}

        {/* Pagination */}
        {!loading && logs.length > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-white/5 select-none">
            <p className="text-xs text-slate-500 font-semibold">
              Page <span className="font-mono text-slate-300">{page}</span> of <span className="font-mono text-slate-300">{totalPages}</span>
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 bg-slate-900 border border-white/5 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 bg-slate-900 border border-white/5 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </PageTransition>
  );
};

export default AuditLog;
