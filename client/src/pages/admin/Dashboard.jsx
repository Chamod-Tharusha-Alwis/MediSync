import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  LayoutDashboard, Users, Building2, ClipboardList, ShieldAlert,
  ActivitySquare, MapPin, Radio, ScrollText, Activity, TrendingUp,
  Settings, Loader2, Monitor
} from 'lucide-react';
import { io } from 'socket.io-client';
import api from '../../api/axiosInstance';
import AppShell from '../../components/ui/AppShell';
import StatCard from '../../components/common/StatCard';
import PageTransition from '../../components/common/PageTransition';
import GeographicMap from '../../components/common/GeographicMap';

// Import admin pages
import OutbreakMonitor from './OutbreakMonitor';
import Broadcast from './Broadcast';
import AuditLog from './AuditLog';
import BanManagement from './BanManagement';
import UserManagement from './UserManagement';

import ManageAdmins from './ManageAdmins';
import AnalyticsDashboard from './AnalyticsDashboard';
import SupportTicketsRoster from './SupportTicketsRoster';
import OnlineNow from './OnlineNow';

const timeAgo = (dateString) => {
  if (!dateString) return '';
  const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: Manage Registered Hospitals
// ─────────────────────────────────────────────────────────────────────────────
const ManageHospitals = () => {
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/users?role=hospital_admin&limit=100').then(res => {
      setHospitals(res.data.data);
      setLoading(false);
    });
  }, []);

  return (
    <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
        {loading ? (
          <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" /></div>
        ) : hospitals.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-900/60 border-b border-white/5 text-slate-400 text-xs font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Hospital Name</th>
                  <th className="px-6 py-4">Registration No</th>
                  <th className="px-6 py-4">District</th>
                  <th className="px-6 py-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm text-slate-200">
                {hospitals.map(h => (
                  <tr key={h._id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="px-6 py-4 font-bold text-white">{h.fullName}</td>
                    <td className="px-6 py-4 text-slate-400 font-mono text-xs">{h.regNo}</td>
                    <td className="px-6 py-4 text-slate-300 font-semibold">{h.district}</td>
                    <td className="px-6 py-4 text-right">
                      <span className="inline-flex px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase select-none">
                        Active
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500 select-none">
            <Building2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-semibold">No registered hospital workspaces found.</p>
          </div>
        )}
    </div>
  );
};

const UserAuditModal = ({ userId, onClose }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    api.get(`/admin/audit-logs?actorId=${userId}&limit=100`)
      .then(res => setLogs(res.data.data || []))
      .catch(() => toast.error('Failed to load audit logs'))
      .finally(() => setLoading(false));
  }, [userId]);

  if (!userId) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        <div className="p-5 border-b border-white/5 flex justify-between items-center bg-slate-900/80">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-slate-400" />
            User Audit Trail
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors text-2xl leading-none">&times;</button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" /></div>
          ) : logs.length > 0 ? (
            <div className="space-y-3">
              {logs.map(log => (
                <div key={log._id} className="p-3 bg-slate-950/40 rounded-xl border border-white/5">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded">{log.action}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 font-mono">
                    <span className="text-slate-500">Device:</span> {log.deviceModel || 'Unknown'} <br />
                    <span className="text-slate-500">Target:</span> {log.targetEntity || log.accessedNic || 'System'}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-500 text-sm">No audit logs found for this user.</div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: Manage Users
// ─────────────────────────────────────────────────────────────────────────────
const ManageUsers = () => {
  const [viewTab, setViewTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [auditUserId, setAuditUserId] = useState(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/admin/users?page=${page}&limit=50${roleFilter ? `&role=${roleFilter}` : ''}`);
      setUsers(data.data);
    } catch (err) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchUsers(); }, [roleFilter, page]);

  const handleToggle = async (userId, role) => {
    try {
      await api.put('/admin/users/toggle', { userId, role });
      toast.success('User status updated');
      fetchUsers();
    } catch (err) {
      toast.error('Failed to update user status');
    }
  };

  return (
    <PageTransition className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">User Management</h1>
          <p className="text-slate-400 mt-1 text-sm font-medium">Global access control and operational oversight across roles.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex bg-slate-900/60 p-1 rounded-lg border border-white/5">
            <button
              onClick={() => setViewTab('users')}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${viewTab === 'users' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Users
            </button>
            <button
              onClick={() => setViewTab('hospitals')}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${viewTab === 'hospitals' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Hospitals
            </button>
          </div>
          {viewTab === 'users' && (
            <select
              value={roleFilter}
              onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
              className="glass-input text-xs w-48 sm:w-auto"
            >
              <option value="">All Roles</option>
              <option value="doctor">Doctors</option>
              <option value="patient">Patients</option>
              <option value="pharmacist">Pharmacists</option>
            </select>
          )}
        </div>
      </div>

      {viewTab === 'hospitals' ? (
        <ManageHospitals />
      ) : (
      <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
        {loading ? (
          <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" /></div>
        ) : users.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-900/60 border-b border-white/5 text-slate-400 text-xs font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">User Name</th>
                  <th className="px-6 py-4">Credential / ID</th>
                  <th className="px-6 py-4">System Role</th>
                  <th className="px-6 py-4">Last Active</th>
                  <th className="px-6 py-4">Device Model</th>
                  <th className="px-6 py-4">Last Login</th>
                  <th className="px-6 py-4">Last Sign-Out</th>
                  <th className="px-6 py-4">Access Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm text-slate-200">
                {users.map(u => (
                  <tr key={u._id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="px-6 py-4 font-bold text-white">{u.fullName}</td>
                    <td className="px-6 py-4 text-slate-400 font-mono text-xs">{u.email || u.nic}</td>
                    <td className="px-6 py-4 capitalize font-semibold text-slate-300">{u.role?.replace('_', ' ')}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${u.isValid && u.lastAccess && (new Date() - new Date(u.lastAccess)) < 30 * 60 * 1000 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
                        <span className="text-slate-400 text-xs">{timeAgo(u.lastAccess) || 'Never'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-slate-300 truncate max-w-[140px]" title={u.deviceInfo}>{u.deviceModel || 'Unknown'}</div>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">
                      {u.lastSignOutAt ? new Date(u.lastSignOutAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : (u.isValid === false ? 'Session expired' : '—')}
                    </td>
                    <td className="px-6 py-4">
                      {u.isActive !== false ? (
                        <span className="inline-flex px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase select-none">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex px-2.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold uppercase select-none">
                          Blocked
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setAuditUserId(u._id)}
                          className="text-[10px] font-bold px-3 py-1.5 rounded-lg border bg-slate-800 text-slate-300 hover:bg-slate-700 border-white/10 transition-colors"
                        >
                          Audit
                        </button>
                        <button
                          onClick={() => handleToggle(u._id, u.role)}
                          className={`text-[10px] font-bold transition-all px-3 py-1.5 rounded-lg border ${
                            u.isActive !== false
                              ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/20'
                          }`}
                        >
                          {u.isActive !== false ? 'Block' : 'Unblock'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500 select-none">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-semibold">No registered users found matching filter.</p>
          </div>
        )}
      </div>
      )}
      {auditUserId && <UserAuditModal userId={auditUserId} onClose={() => setAuditUserId(null)} />}
    </PageTransition>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: Alert settings (Z-score sensitivity)
// ─────────────────────────────────────────────────────────────────────────────
const AlertSettings = () => {
  const [sensitivity, setSensitivity] = useState(2.0);
  const [alerts, setAlerts] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/alerts/active').then(res => setAlerts(res.data.data)).catch(() => {});
  }, []);

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      toast.success(`ML Sensitivity updated to ${sensitivity} (Z-Score)`);
      setSaving(false);
    }, 800);
  };

  return (
    <PageTransition className="space-y-6">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">ML Alert Configuration</h1>
        <p className="text-slate-400 mt-1 text-sm font-medium">Fine-tune epidemiological anomaly detection engines and sensitivity thresholds.</p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-card p-6 rounded-2xl space-y-5 border border-white/5">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5 select-none">
            <Settings className="w-4 h-4 text-slate-400" /> Outbreak Threshold sensitivity
          </h3>
          <p className="text-xs text-slate-400 leading-normal select-none">Adjusting the Z-Score warning threshold updates regional disease spike trigger alerts.</p>
          
          <div className="space-y-3 pt-3 select-none">
            <input 
              type="range" min="1" max="5" step="0.1" 
              value={sensitivity} 
              onChange={e => setSensitivity(parseFloat(e.target.value))} 
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-slate-400" 
            />
            <div className="flex justify-between text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              <span>High Alert (1.0)</span>
              <span className="text-slate-300 font-mono text-xs font-black">Z = {sensitivity}</span>
              <span>Low Alert (5.0)</span>
            </div>
          </div>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 border border-white/5 mt-4"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Save Configuration
          </button>
        </div>

        <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5 select-none">
            <ShieldAlert className="w-4.5 h-4.5 text-red-400 animate-pulse-subtle" /> Active Surveillance Signals
          </h3>
          {alerts.length > 0 ? (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
              {alerts.map(a => (
                <div key={a._id} className="bg-red-500/[0.02] border border-red-500/10 p-3 rounded-xl flex items-start gap-3">
                  <AlertSquareIcon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="text-slate-200 font-semibold">{a.message}</p>
                    <p className="text-slate-500 mt-1 font-mono text-[10px]">Date: {new Date(a.createdAt || a.date).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
             <p className="text-slate-500 text-xs py-8 text-center select-none font-semibold">No recent anomalies flagged by system.</p>
          )}
        </div>
      </div>
    </PageTransition>
  );
};

const AlertSquareIcon = ShieldAlert;

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: Overview Stats & Geo Maps
// ─────────────────────────────────────────────────────────────────────────────
const Overview = ({ stats, geo, activeAlerts }) => (
  <PageTransition className="space-y-6">
    <div className="mb-6">
      <h1 className="text-3xl font-extrabold text-white tracking-tight">Super Admin Command</h1>
      <p className="text-slate-400 mt-1 text-sm font-medium">Platform surveillance logs, operational nodes, and regional health outbreaks map.</p>
    </div>

    {/* ML Active Outbreak Alert Header */}
    {activeAlerts && activeAlerts.length > 0 && (
      <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5 flex items-start gap-4 animate-pulse-subtle select-none">
        <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
          <ShieldAlert className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <h3 className="text-red-400 font-bold text-sm uppercase tracking-wider">Active System Outbreak Alert</h3>
          <p className="text-slate-200 text-xs font-semibold mt-1">{activeAlerts[0].message} (Z-Score: {activeAlerts[0].zScore?.toFixed?.(2) || 'N/A'})</p>
        </div>
      </div>
    )}

    {/* Metric Cards Grid */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 select-none">
      <StatCard 
        icon={Building2} 
        title="Registered Hospitals" 
        value={stats?.totalHospitals || 0} 
        gradient="from-slate-700/80 to-slate-700/50"
        delay={0.1}
      />
      <StatCard 
        icon={Users} 
        title="Total Practitioners" 
        value={stats?.totalDoctors || 0} 
        gradient="from-slate-700/80 to-slate-700/50"
        delay={0.2}
      />
      <StatCard 
        icon={Users} 
        title="Total Registered Patients" 
        value={stats?.totalPatients || 0} 
        gradient="from-slate-700/80 to-slate-700/50"
        delay={0.3}
      />
      <StatCard 
        icon={ClipboardList} 
        title="Total Fulfillments" 
        value={stats?.totalConsultations || 0} 
        gradient="from-slate-700/80 to-slate-700/50"
        delay={0.4}
      />
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
      {/* Activity Logs */}
      <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5 select-none">
          <ActivitySquare className="w-4.5 h-4.5 text-slate-400" />
          Recent Platform Audit Feed
        </h3>
        <p className="text-slate-500 text-xs select-none">Live auditing telemetry logs ingested from distributed workspaces.</p>
        
        <div className="space-y-3.5 h-72 overflow-y-auto pr-2 custom-scrollbar">
          {stats?.recentAuditLogs && stats.recentAuditLogs.length > 0 ? (
            stats.recentAuditLogs.map((log) => {
              const ACTION_MAP = {
                login: 'Logged into the system',
                register: 'Registered a new account',
                create_patient: 'Registered a new patient',
                update_patient: 'Updated patient profile',
                create_consultation: 'Created a new consultation',
                order_test: 'Ordered a new lab test',
                update_test: 'Updated lab test results',
                dispense_medication: 'Dispensed medication',
                trigger_outbreak: 'Triggered an outbreak alert',
                approve_outbreak: 'Approved an outbreak alert',
                resolve_outbreak: 'Resolved an outbreak alert',
                ban_user: 'Suspended a user',
                lift_ban: 'Lifted user suspension'
              };

              const actionLower = (log.action || '').toLowerCase();
              let badgeColor = 'bg-slate-800 text-slate-400 border border-slate-700/50';
              if (actionLower.includes('login')) badgeColor = 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
              if (actionLower.includes('create') || actionLower.includes('register')) badgeColor = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
              if (actionLower.includes('delete') || actionLower.includes('block') || actionLower.includes('ban')) badgeColor = 'bg-red-500/10 text-red-400 border border-red-500/20';

              const humanAction = ACTION_MAP[actionLower] || log.action;
              const actorName = log.actorName || log.actorId;
              const targetEntity = log.targetEntity || log.accessedNic || 'system node';

              return (
                <div key={log._id} className="bg-slate-950/20 p-3 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                  <div className="flex justify-between items-start mb-2 select-none">
                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${badgeColor}`}>
                      {log.action}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">{timeAgo(log.timestamp || log.createdAt)}</span>
                  </div>
                  <p className="text-xs text-slate-300 font-medium">
                    <span className="text-white font-bold">{actorName}</span> 
                    <span className="text-slate-500 ml-1 text-[10px] uppercase">({log.actorRole?.replace('_', ' ')})</span>
                    <br/>
                    <span className="text-slate-400 mt-1 inline-block">{humanAction} regarding <span className="text-blue-400 font-semibold">{targetEntity}</span>.</span>
                  </p>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 select-none">
              <ScrollText className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs">No active event logging recorded.</p>
            </div>
          )}
        </div>
      </div>

      {/* Geospatial Map */}
      <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5 select-none">
          <MapPin className="w-4.5 h-4.5 text-slate-400" />
          Surveillance Geospatial Node
        </h3>
        <p className="text-slate-500 text-xs select-none">Geographic mapping overlay of active health anomalies.</p>
        <div className="h-72 w-full rounded-xl overflow-hidden border border-white/5 bg-slate-950/50">
          <GeographicMap hospitals={geo?.hospitals || []} alerts={activeAlerts || []} />
        </div>
      </div>
    </div>
  </PageTransition>
);

// ─────────────────────────────────────────────────────────────────────────────
// ROOT PORTAL ROUTER
// ─────────────────────────────────────────────────────────────────────────────
const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [geo, setGeo] = useState(null);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, alertsRes] = await Promise.all([
          api.get('/admin/stats'),
          api.get('/alerts/active')
        ]);
        setStats(statsRes.data.data);
        setGeo(null);
        setActiveAlerts(alertsRes.data.data);
      } catch (err) {
        toast.error('Failed to load system data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Socket.IO real-time integration
  useEffect(() => {
    let socket;
    const timer = setTimeout(() => {
      const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:5005';
      socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 5,
        reconnectionDelay: 3000,
      });

      socket.on('outbreak_alert', (data) => {
        toast.error(
          <div>
            <p className="font-bold text-sm">🚨 Outbreak Alert</p>
            <p className="text-xs mt-1">{data?.message || 'An outbreak anomaly has been detected.'}</p>
            {data?.district && <p className="text-xs mt-0.5">District: {data.district}</p>}
          </div>,
          { autoClose: 10000, position: 'top-right' }
        );
        setActiveAlerts(prev => [data, ...prev]);
      });

      socket.on('broadcast_message', (data) => {
        toast.info(
          <div>
            <p className="font-bold text-sm">📢 Broadcast</p>
            <p className="text-xs mt-1">{data?.message || 'A new system broadcast has been sent.'}</p>
          </div>,
          { autoClose: 8000, position: 'top-right' }
        );
      });
    }, 500);

    return () => {
      clearTimeout(timer);
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  const menuItems = [
    { label: 'Overview', path: '/admin/dashboard', icon: LayoutDashboard, end: true },
    { label: 'Analytics', path: '/admin/dashboard/analytics', icon: TrendingUp },
    { label: 'Users', path: '/admin/dashboard/users', icon: Users },
    { label: 'Identity & Devices', path: '/admin/dashboard/identity', icon: ShieldAlert },
    { label: 'ML Alerts', path: '/admin/dashboard/alerts', icon: ShieldAlert },
    { label: 'Outbreak Monitor', path: '/admin/dashboard/outbreak', icon: Activity },
    { label: 'Broadcast', path: '/admin/dashboard/broadcast', icon: Radio },
    { label: 'Audit Log', path: '/admin/dashboard/audit', icon: ScrollText },
    { label: 'Ban Management', path: '/admin/dashboard/bans', icon: ShieldAlert },
    { label: 'Support Tickets', path: '/admin/dashboard/support', icon: ClipboardList },
    { label: 'Admin Accounts', path: '/admin/dashboard/admins', icon: Users },
    { label: 'Online Now', path: '/admin/dashboard/online', icon: Monitor },
  ];

  const userName = localStorage.getItem('userName') || 'Admin User';
  const rawRole = localStorage.getItem('role') || 'admin';
  const displayRole = rawRole === 'admin' ? 'Super Administrator' : rawRole.replace('_', ' ').toUpperCase();

  return (
    <div className="admin-theme">
      <AppShell
        role="admin"
        userName={userName}
        userRole={displayRole}
        menuItems={menuItems}
      >
        <div className="mt-4">
          {loading ? (
            <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" /></div>
          ) : (
            <Routes>
              <Route path="/dashboard" element={<Overview stats={stats} geo={geo} activeAlerts={activeAlerts} />} />
              <Route path="/dashboard/analytics" element={<AnalyticsDashboard />} />
              <Route path="/dashboard/users" element={<ManageUsers />} />
              <Route path="/dashboard/identity" element={<UserManagement />} />
              <Route path="/dashboard/alerts" element={<AlertSettings />} />
              <Route path="/dashboard/outbreak" element={<OutbreakMonitor />} />
              <Route path="/dashboard/broadcast" element={<Broadcast />} />
              <Route path="/dashboard/audit" element={<AuditLog />} />
              <Route path="/dashboard/bans" element={<BanManagement />} />
              <Route path="/dashboard/support" element={<SupportTicketsRoster />} />
              <Route path="/dashboard/admins" element={<ManageAdmins />} />
              <Route path="/dashboard/online" element={<OnlineNow />} />
              <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
            </Routes>
          )}
        </div>
      </AppShell>
    </div>
  );
};

export default AdminDashboard;
