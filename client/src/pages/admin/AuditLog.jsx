import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ScrollText, Calendar, Shield, Search, ChevronLeft, ChevronRight, User, Globe } from 'lucide-react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import PageTransition from '../../components/common/PageTransition';

const maskNic = (nic) => {
  if (!nic || nic.length < 4) return '****';
  return '****' + nic.slice(-4);
};

const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return 'Invalid Date';
    return d.toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
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

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/admin/audit-logs?page=${page}&limit=25`;
      if (startDate) url += `&startDate=${startDate}`;
      if (endDate) url += `&endDate=${endDate}`;
      if (roleFilter) url += `&actorRole=${roleFilter}`;

      const res = await api.get(url);
      setLogs(res.data.data || []);
      setTotalPages(res.data.pagination?.pages || 1);
    } catch (err) {
      toast.error('Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [page, startDate, endDate, roleFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const getActionBadge = (action) => {
    const lower = (action || '').toLowerCase();
    if (lower.includes('login')) return 'bg-blue-500/20 text-blue-400';
    if (lower.includes('create') || lower.includes('register')) return 'bg-emerald-500/20 text-emerald-400';
    if (lower.includes('delete') || lower.includes('block')) return 'bg-red-500/20 text-red-400';
    if (lower.includes('update') || lower.includes('edit')) return 'bg-amber-500/20 text-amber-400';
    return 'bg-slate-700 text-slate-300';
  };

  return (
    <PageTransition className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">Audit Log</h1>
        <p className="text-slate-400 mt-1">Complete activity trail with HIPAA-compliant data masking.</p>
      </div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-xl p-5 border border-slate-700/50 mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
              className="w-full p-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block flex items-center gap-1">
              <Calendar className="w-3 h-3" /> End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
              className="w-full p-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs font-bold text-slate-400 uppercase mb-1.5 block flex items-center gap-1">
              <Shield className="w-3 h-3" /> Actor Role
            </label>
            <select
              value={roleFilter}
              onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
              className="w-full p-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="doctor">Doctor</option>
              <option value="patient">Patient</option>
              <option value="pharmacist">Pharmacist</option>
              <option value="hospital_admin">Hospital Admin</option>
            </select>
          </div>
          <button
            onClick={() => { setStartDate(''); setEndDate(''); setRoleFilter(''); setPage(1); }}
            className="px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-400 text-sm hover:text-white hover:border-slate-600 transition-colors"
          >
            Clear Filters
          </button>
        </div>
      </motion.div>

      {/* Data Table */}
      <div className="glass-panel rounded-xl overflow-hidden border border-slate-700/50">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-slate-400 mt-3 text-sm">Loading audit records...</p>
          </div>
        ) : logs.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-800/80 border-b border-slate-700 text-slate-400">
                  <tr>
                    <th className="px-5 py-4 font-medium text-xs uppercase tracking-wider">Timestamp</th>
                    <th className="px-5 py-4 font-medium text-xs uppercase tracking-wider">Actor</th>
                    <th className="px-5 py-4 font-medium text-xs uppercase tracking-wider">Role</th>
                    <th className="px-5 py-4 font-medium text-xs uppercase tracking-wider">Action</th>
                    <th className="px-5 py-4 font-medium text-xs uppercase tracking-wider">Patient NIC</th>
                    <th className="px-5 py-4 font-medium text-xs uppercase tracking-wider">IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, index) => (
                    <motion.tr
                      key={log._id || index}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: index * 0.02 }}
                      className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="px-5 py-3.5 text-slate-400 text-sm whitespace-nowrap">
                        {formatDate(log.timestamp || log.createdAt)}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400">
                            {(log.actorRole || '?').charAt(0).toUpperCase()}
                          </div>
                          <span className="text-white font-medium text-sm">{log.actorId || 'system'}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-bold px-2 py-1 rounded bg-slate-800 text-slate-300 uppercase">
                          {log.actorRole || log.role || 'system'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded ${getActionBadge(log.action)}`}>
                          {log.action || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-400 text-sm font-mono">
                        {log.accessedNic && log.accessedNic !== 'N/A' ? maskNic(log.accessedNic) : 'â€”'}
                      </td>
                      <td className="px-5 py-3.5 text-slate-500 text-sm font-mono flex items-center gap-1">
                        <Globe className="w-3 h-3" />{log.ipAddress || log.ip || 'â€”'}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-5 py-4 border-t border-slate-800/50">
              <p className="text-xs text-slate-500">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-2 bg-slate-800/50 border border-slate-700 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="p-12 text-center text-slate-500">
            <ScrollText className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>No audit records found for the selected filters.</p>
          </div>
        )}
      </div>
    </PageTransition>
  );
};

export default AuditLog;

