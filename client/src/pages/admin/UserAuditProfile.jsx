import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, User, ShieldCheck, ShieldAlert, Monitor,
  Activity, Smartphone, LogOut,
  RefreshCw, Loader2, AlertCircle, MapPin, Mail, Phone, Lock
} from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../../api/axiosInstance';

const UserAuditProfile = () => {
  const { userId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);
  const [activeSubTab, setActiveSubTab] = useState('audit'); // 'audit' | 'sessions' | 'devices'
  const [actionFilter, setActionFilter] = useState('');

  const fetchProfile = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await api.get(`/admin/audit-logs/profile/${userId}`);
      setProfileData(res.data.data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to load user audit profile');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleForceLogout = async (sessionId) => {
    try {
      await api.post(`/devices/admin/sessions/${sessionId}/force-logout`);
      toast.success('Session terminated successfully');
      fetchProfile();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to terminate session');
    }
  };

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const timeAgo = (dateString) => {
    if (!dateString) return '—';
    const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
    if (seconds < 60) return `${Math.max(1, seconds)}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const getActionBadge = (action = '') => {
    if (action.includes('POST') || action.includes('create') || action.includes('register')) {
      return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
    }
    if (action.includes('DELETE') || action.includes('revoke') || action.includes('ban')) {
      return 'bg-red-500/10 text-red-400 border border-red-500/20';
    }
    if (action.includes('PUT') || action.includes('update') || action.includes('toggle')) {
      return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
    }
    return 'bg-sky-500/10 text-sky-400 border border-sky-500/20';
  };

  const getRoleColor = (role = '') => {
    switch (role) {
      case 'admin':
      case 'super_admin':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'doctor':
        return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
      case 'patient':
        return 'bg-violet-500/10 text-violet-400 border-violet-500/20';
      case 'pharmacist':
      case 'pharmacy_admin':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'hospital_admin':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center select-none">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto mb-3" />
        <p className="text-sm font-semibold text-slate-400">Loading comprehensive audit profile...</p>
      </div>
    );
  }

  if (!profileData || !profileData.user) {
    return (
      <div className="glass-panel p-12 text-center rounded-2xl border border-white/5 space-y-4">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto opacity-60" />
        <h2 className="text-lg font-bold text-white">User Profile Not Found</h2>
        <p className="text-xs text-slate-400">The requested user ID does not exist in MediSync records.</p>
        <button
          onClick={() => navigate('/admin/dashboard/sessions')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 text-slate-200 text-xs font-bold hover:bg-slate-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Session Monitor
        </button>
      </div>
    );
  }

  const { user, auditLogs = [], devices = [], sessions = [] } = profileData;

  const filteredLogs = actionFilter
    ? auditLogs.filter(l => (l.action || '').toLowerCase().includes(actionFilter.toLowerCase()) || (l.deviceModel || '').toLowerCase().includes(actionFilter.toLowerCase()))
    : auditLogs;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Back Nav & Quick Refresh */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/admin/dashboard/sessions')}
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-colors bg-slate-900/60 px-3.5 py-2 rounded-xl border border-white/5 hover:border-white/10"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Session Monitor
        </button>
        <button
          onClick={fetchProfile}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white transition-colors bg-slate-900/60 px-3.5 py-2 rounded-xl border border-white/5 hover:border-white/10"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh Profile
        </button>
      </div>

      {/* ── USER OVERVIEW HERO CARD ────────────────────────────────────────── */}
      <div className="glass-panel rounded-2xl p-6 border border-white/10 bg-slate-900/40 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 flex items-center justify-center text-slate-300 shadow-xl shrink-0">
              <User className="w-8 h-8 text-slate-300" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl font-black text-white tracking-tight">{user.fullName || 'System User'}</h1>
                <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider border ${getRoleColor(user.role)}`}>
                  {user.role?.replace('_', ' ')}
                </span>
                {user.isOnline ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Online Now
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-500/10 text-slate-400 border border-slate-500/20">
                    Offline
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                {user.identifier && (
                  <span className="font-mono text-slate-300 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-slate-500" /> {user.identifier}
                  </span>
                )}
                {user.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="w-3 h-3 text-slate-500" /> {user.email}
                  </span>
                )}
                {user.contactInfo && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3 text-slate-500" /> {user.contactInfo}
                  </span>
                )}
                {user.district && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-500" /> {user.district}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <div className="px-4 py-2.5 rounded-xl bg-slate-950/40 border border-white/5 flex-1 md:flex-initial text-center md:text-left">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total Actions</span>
              <span className="text-base font-extrabold text-white">{auditLogs.length}</span>
            </div>
            <div className="px-4 py-2.5 rounded-xl bg-slate-950/40 border border-white/5 flex-1 md:flex-initial text-center md:text-left">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Known Devices</span>
              <span className="text-base font-extrabold text-white">{devices.length || sessions.length ? new Set([...devices.map(d => d.deviceFingerprint), ...sessions.map(s => s.deviceFingerprint)]).size : 0}</span>
            </div>
            <div className="px-4 py-2.5 rounded-xl bg-slate-950/40 border border-white/5 flex-1 md:flex-initial text-center md:text-left">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Sessions Logged</span>
              <span className="text-base font-extrabold text-white">{sessions.length}</span>
            </div>
          </div>
        </div>

        {/* Account Details Sub-Row */}
        <div className="mt-5 pt-4 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Account Created</span>
            <span className="text-slate-300 font-mono text-[11px]">{formatDate(user.createdAt)}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Last Login</span>
            <span className="text-slate-300 font-mono text-[11px]">{formatDate(user.lastLoginAt)}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Last Sign Out</span>
            <span className="text-slate-300 font-mono text-[11px]">{user.isOnline ? '— (Active Session)' : formatDate(user.lastSignOutAt)}</span>
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">User MongoDB ID</span>
            <span className="text-slate-400 font-mono text-[10px] truncate block">{user._id}</span>
          </div>
        </div>
      </div>

      {/* ── SUB-TABS NAVIGATION ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-1">
        <button
          onClick={() => setActiveSubTab('audit')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'audit'
              ? 'bg-slate-800 text-white shadow-lg border border-white/10'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          Full Audit Log History
          <span className="ml-1.5 px-2 py-0.2 rounded-full bg-slate-900 border border-white/10 text-[10px] text-slate-400">
            {auditLogs.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('sessions')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'sessions'
              ? 'bg-slate-800 text-white shadow-lg border border-white/10'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Monitor className="w-3.5 h-3.5" />
          Sessions History
          <span className="ml-1.5 px-2 py-0.2 rounded-full bg-slate-900 border border-white/10 text-[10px] text-slate-400">
            {sessions.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('devices')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeSubTab === 'devices'
              ? 'bg-slate-800 text-white shadow-lg border border-white/10'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          Devices & Fingerprints
          <span className="ml-1.5 px-2 py-0.2 rounded-full bg-slate-900 border border-white/10 text-[10px] text-slate-400">
            {devices.length}
          </span>
        </button>
      </div>

      {/* ── TAB 1: AUDIT LOG HISTORY ─────────────────────────────────────────── */}
      {activeSubTab === 'audit' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <input
              type="text"
              placeholder="Filter actions or devices..."
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="glass-input text-xs max-w-sm"
            />
            <span className="text-xs text-slate-500">
              Showing {filteredLogs.length} of {auditLogs.length} events
            </span>
          </div>

          <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
            {filteredLogs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-900/60 border-b border-white/5 text-slate-400 text-xs font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-4">Timestamp</th>
                      <th className="px-6 py-4">Action</th>
                      <th className="px-6 py-4">Device Model</th>
                      <th className="px-6 py-4 text-right">Target / Accessed Entity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-sm text-slate-200">
                    {filteredLogs.map((log) => (
                      <tr key={log._id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-4 text-slate-400 font-mono text-xs select-none">
                          {formatDate(log.timestamp)}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full select-none ${getActionBadge(log.action)}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-300 text-xs">
                          <span className="inline-flex items-center gap-1.5">
                            <Smartphone className="w-3.5 h-3.5 text-slate-500" />
                            {log.deviceModel || '—'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-xs text-slate-400">
                          {log.accessedNic && log.accessedNic !== 'N/A' ? (
                            <span className="inline-flex items-center gap-1 text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded">
                              <Lock className="w-3 h-3 text-slate-500" /> {log.accessedNic}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center text-slate-500">
                <Activity className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-xs font-semibold">No audit logs matching search filter.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 2: SESSIONS HISTORY ──────────────────────────────────────────── */}
      {activeSubTab === 'sessions' && (
        <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
          {sessions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-900/60 border-b border-white/5 text-slate-400 text-xs font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Device Model</th>
                    <th className="px-6 py-4">Trust Level</th>
                    <th className="px-6 py-4">Device Fingerprint</th>
                    <th className="px-6 py-4">Login Time (Start)</th>
                    <th className="px-6 py-4">Last Active</th>
                    <th className="px-6 py-4">Logout Time</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm text-slate-200">
                  {sessions.map((s) => (
                    <tr key={s._id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        {s.isValid ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700/50">
                            Ended
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-white font-semibold text-xs">{s.deviceModel}</td>
                      <td className="px-6 py-4">
                        {s.isTrusted ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                            <ShieldCheck className="w-3 h-3" /> Trusted
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] font-bold">
                            <ShieldAlert className="w-3 h-3 text-red-400" /> New / Untrusted
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-400">
                        {s.deviceFingerprint ? `${s.deviceFingerprint.slice(0, 16)}...` : '—'}
                      </td>
                      <td className="px-6 py-4 text-slate-300 font-mono text-xs select-none">{formatDate(s.loginTime)}</td>
                      <td className="px-6 py-4 text-slate-400 text-xs">{timeAgo(s.lastUsed)}</td>
                      <td className="px-6 py-4 text-slate-400 font-mono text-xs select-none">
                        {s.isValid ? '— (Online)' : (s.logoutTime ? formatDate(s.logoutTime) : '—')}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {s.isValid && (
                          <button
                            onClick={() => handleForceLogout(s._id)}
                            className="text-[10px] font-bold px-3 py-1.5 rounded-lg border bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20 transition-colors inline-flex items-center gap-1.5"
                          >
                            <LogOut className="w-3 h-3" /> Terminate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-500">
              <Monitor className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-xs font-semibold">No session history records found for this account.</p>
            </div>
          )}
        </div>
      )}

      {/* ── TAB 3: REGISTERED & TRUSTED DEVICES ─────────────────────────────── */}
      {activeSubTab === 'devices' && (
        <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
          {devices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-900/60 border-b border-white/5 text-slate-400 text-xs font-bold uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Device Label</th>
                    <th className="px-6 py-4">Model</th>
                    <th className="px-6 py-4">Trust Status</th>
                    <th className="px-6 py-4">Device Fingerprint</th>
                    <th className="px-6 py-4">First Seen</th>
                    <th className="px-6 py-4 text-right">Last Seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm text-slate-200">
                  {devices.map((d) => (
                    <tr key={d._id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 font-bold text-white text-xs">{d.deviceLabel || 'Unnamed Device'}</td>
                      <td className="px-6 py-4 text-slate-300 text-xs">{d.deviceModel || '—'}</td>
                      <td className="px-6 py-4">
                        {d.isRevoked ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-xs font-bold">
                            <ShieldAlert className="w-3.5 h-3.5" /> Revoked Device
                          </span>
                        ) : d.isTrusted === false ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold shadow-sm shadow-red-500/10">
                            <ShieldAlert className="w-3.5 h-3.5 text-red-400" /> New Device — Not Yet Trusted
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
                            <ShieldCheck className="w-3.5 h-3.5" /> Trusted Device
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-400">
                        {d.deviceFingerprint ? `${d.deviceFingerprint.slice(0, 24)}...` : '—'}
                      </td>
                      <td className="px-6 py-4 text-slate-400 font-mono text-xs select-none">{formatDate(d.createdAt)}</td>
                      <td className="px-6 py-4 text-right text-slate-400 font-mono text-xs select-none">{formatDate(d.lastSeenAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-12 text-center text-slate-500">
              <Smartphone className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-xs font-semibold">No explicitly registered trusted devices yet (session-based fingerprints active).</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UserAuditProfile;
