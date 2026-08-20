import React, { useEffect, useState, useCallback } from 'react';
import { Monitor, ShieldCheck, ShieldAlert, LogOut, Loader2, RefreshCw } from 'lucide-react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import PageTransition from '../../components/common/PageTransition';

const timeAgo = (date) => {
  if (!date) return 'Never';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const OnlineNow = () => {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/devices/admin/sessions/active');
      setSessions(data.data || []);
    } catch (err) {
      toast.error('Failed to load active sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const handleForceLogout = async (sessionId, userName) => {
    try {
      await api.post(`/devices/admin/sessions/${sessionId}/force-logout`);
      toast.success(`Session terminated for ${userName}`);
      setSessions(prev => prev.filter(s => s._id !== sessionId));
    } catch (err) {
      toast.error('Failed to terminate session');
    }
  };

  return (
    <PageTransition className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <Monitor className="w-8 h-8 text-emerald-400" />
            Online Now
          </h1>
          <p className="text-slate-400 mt-1 text-sm font-medium">
            {sessions.length} active session{sessions.length !== 1 ? 's' : ''} across all users.
          </p>
        </div>
        <button
          onClick={fetchSessions}
          disabled={loading}
          className="glass-button text-xs py-2.5 px-5 flex items-center gap-2"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
        {loading ? (
          <div className="p-12 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" />
          </div>
        ) : sessions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-900/60 border-b border-white/5 text-slate-400 text-xs font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Device Model</th>
                  <th className="px-6 py-4">Login Time</th>
                  <th className="px-6 py-4">Last Activity</th>
                  <th className="px-6 py-4">Trust Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm text-slate-200">
                {sessions.map(s => (
                  <tr key={s._id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <span className="font-bold text-white">{s.fullName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 border border-slate-700/50 text-slate-300 uppercase tracking-wider">
                        {s.role?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-300 text-xs">{s.deviceModel || 'Unknown'}</td>
                    <td className="px-6 py-4 text-slate-400 text-xs font-mono">
                      {s.loginTime ? new Date(s.loginTime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-6 py-4 text-slate-400 text-xs">{timeAgo(s.lastUsed)}</td>
                    <td className="px-6 py-4">
                      {s.isTrusted ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
                          <ShieldCheck className="w-3 h-3" /> Trusted
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold">
                          <ShieldAlert className="w-3 h-3" /> New Device
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleForceLogout(s._id, s.fullName)}
                        className="text-[10px] font-bold px-3 py-1.5 rounded-lg border bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20 transition-colors inline-flex items-center gap-1.5"
                      >
                        <LogOut className="w-3 h-3" /> Force Logout
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500 select-none">
            <Monitor className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-semibold">No active sessions found.</p>
          </div>
        )}
      </div>
    </PageTransition>
  );
};

export default OnlineNow;
