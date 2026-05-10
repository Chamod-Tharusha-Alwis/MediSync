import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Flag, CheckCircle, XCircle, Clock, Search, RefreshCw } from 'lucide-react';
import api from '../../api/axiosInstance';
import PageTransition from '../../components/common/PageTransition';

const statusConfig = {
  pending: { label: 'Pending Review', color: 'text-amber-400', bg: 'bg-amber-500/20', icon: Clock },
  reviewed: { label: 'Reviewed', color: 'text-emerald-400', bg: 'bg-emerald-500/20', icon: CheckCircle },
  dismissed: { label: 'Dismissed', color: 'text-slate-400', bg: 'bg-slate-700', icon: XCircle },
};

const PatientReports = () => {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = filter !== 'all' ? `?status=${filter}` : '';
      const { data } = await api.get(`/admin/reports${params}`);
      setReports(data.data || []);
    } catch (err) {
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReports(); }, [filter]);

  const handleReview = async (reportId, action) => {
    try {
      await api.put(`/admin/reports/${reportId}/review`, { status: action });
      toast.success(`Report ${action === 'reviewed' ? 'marked as reviewed' : 'dismissed'}`);
      fetchReports();
    } catch (err) {
      toast.error('Failed to update report');
    }
  };

  const filtered = reports.filter(r =>
    (r.doctorName || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.fullReport?.reason || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <PageTransition className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Patient Reports</h1>
          <p className="text-slate-400 mt-1">Review complaints submitted by patients against healthcare providers</p>
        </div>
        <button onClick={fetchReports} className="p-2.5 bg-slate-800 border border-slate-700 rounded-xl text-slate-400 hover:text-white transition-colors">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex gap-2">
          {['pending', 'reviewed', 'dismissed', 'all'].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
                filter === s ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by doctor or reason…"
            className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400">Loading reports…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Flag className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400">No {filter !== 'all' ? filter : ''} reports found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(report => {
            const cfg = statusConfig[report.fullReport?.status] || statusConfig.pending;
            const StatusIcon = cfg.icon;
            const isExpanded = expandedId === report._id;

            return (
              <div
                key={report._id}
                className="glass-panel rounded-xl border border-slate-800 hover:border-slate-700 overflow-hidden transition-colors"
              >
                {/* Header row */}
                <button
                  className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-slate-800/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : report._id)}
                >
                  <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0">
                    <Flag className="w-5 h-5 text-red-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold">
                      Report against: <span className="text-blue-300">{report.doctorName || 'Unknown Doctor'}</span>
                    </p>
                    <p className="text-slate-400 text-sm mt-0.5">
                      Patient NIC: {report.patientNic}*** ·{' '}
                      {new Date(report.fullReport?.reportedAt || Date.now()).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${cfg.bg} ${cfg.color}`}>
                    <StatusIcon className="w-3 h-3" />
                    {cfg.label}
                  </span>
                  <span className="text-slate-600 text-xs ml-2">{isExpanded ? '▲' : '▼'}</span>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-6 pb-5 border-t border-slate-800">
                    <div className="pt-4">
                      <p className="text-xs uppercase text-slate-500 font-bold tracking-wider mb-2">Reason / Description</p>
                      <p className="text-slate-200 bg-slate-800/50 p-4 rounded-xl text-sm leading-relaxed">
                        {report.fullReport?.reason || 'No reason provided'}
                      </p>
                    </div>

                    {report.fullReport?.status === 'pending' && (
                      <div className="flex gap-3 mt-4">
                        <button
                          onClick={() => handleReview(report.fullReport?._id || report.reportId, 'reviewed')}
                          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition-colors"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Mark Reviewed
                        </button>
                        <button
                          onClick={() => handleReview(report.fullReport?._id || report.reportId, 'dismissed')}
                          className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded-xl text-sm font-semibold transition-colors"
                        >
                          <XCircle className="w-4 h-4" />
                          Dismiss
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PageTransition>
  );
};

export default PatientReports;
