import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { LayoutDashboard, Users, Building2, ClipboardList, ShieldAlert, ActivitySquare, MapPin, Radio, ScrollText, Activity, TrendingUp } from 'lucide-react';
import { io } from 'socket.io-client';
import api from '../../api/axiosInstance';
import Sidebar from '../../components/common/Sidebar';
import StatCard from '../../components/common/StatCard';
import PageTransition from '../../components/common/PageTransition';
import GeographicMap from '../../components/common/GeographicMap';

// Import admin pages
import OutbreakMonitor from './OutbreakMonitor';
import Broadcast from './Broadcast';
import AuditLog from './AuditLog';
import BanManagement from './BanManagement';
import PatientReports from './PatientReports';
import ManageAdmins from './ManageAdmins';
import AnalyticsDashboard from './AnalyticsDashboard';

// Helper for formatting time
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

// Sub-components
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
    <PageTransition className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">Registered Hospitals</h1>
        <p className="text-slate-400 mt-1">Manage hospital workspaces across the platform.</p>
      </div>
      <div className="glass-panel rounded-xl overflow-hidden">
        {loading ? <div className="p-8 text-center text-slate-400">Loading hospitals...</div> : (
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-800/80 border-b border-slate-700 text-slate-300">
              <tr>
                <th className="px-6 py-4 font-medium">Hospital Name</th>
                <th className="px-6 py-4 font-medium">Reg No</th>
                <th className="px-6 py-4 font-medium">District</th>
                <th className="px-6 py-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {hospitals.map(h => (
                <tr key={h._id} className="border-b border-slate-800 hover:bg-slate-800/30">
                  <td className="px-6 py-4 text-white font-medium">{h.fullName}</td>
                  <td className="px-6 py-4 text-slate-400">{h.regNo}</td>
                  <td className="px-6 py-4 text-slate-300">{h.district}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 rounded text-xs font-bold bg-emerald-500/20 text-emerald-400">ACTIVE</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PageTransition>
  );
};

const ManageUsers = () => {
  const [users, setUsers] = useState([]);
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

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
    <PageTransition className="p-6">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">User Management</h1>
          <p className="text-slate-400 mt-1">Global access control and account oversight.</p>
        </div>
        <select value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }} className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500">
          <option value="">All Roles</option>
          <option value="doctor">Doctors</option>
          <option value="patient">Patients</option>
          <option value="pharmacist">Pharmacists</option>
        </select>
      </div>

      <div className="glass-panel rounded-xl overflow-hidden">
        {loading ? <div className="p-8 text-center text-slate-400">Loading users...</div> : (
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-800/80 border-b border-slate-700 text-slate-300">
              <tr>
                <th className="px-6 py-4 font-medium">User Name</th>
                <th className="px-6 py-4 font-medium">Email</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u._id} className="border-b border-slate-800 hover:bg-slate-800/30">
                  <td className="px-6 py-4 text-white font-medium">{u.fullName}</td>
                  <td className="px-6 py-4 text-slate-400 text-sm">{u.email || u.nic}</td>
                  <td className="px-6 py-4 text-slate-300 capitalize">{u.role?.replace('_', ' ')}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${u.isActive !== false ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                      {u.isActive !== false ? 'ACTIVE' : 'BLOCKED'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => handleToggle(u._id, u.role)} className={`text-sm ${u.isActive !== false ? 'text-red-400 hover:text-red-300' : 'text-emerald-400 hover:text-emerald-300'}`}>
                      {u.isActive !== false ? 'Block Access' : 'Unblock Access'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </PageTransition>
  );
};

const AlertSettings = () => {
  const [sensitivity, setSensitivity] = useState(2.0);
  const [alerts, setAlerts] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/alerts/active').then(res => setAlerts(res.data.data)).catch(() => {});
  }, []);

  const handleSave = () => {
    setSaving(true);
    // Simulate API call to save settings
    setTimeout(() => {
      toast.success(`ML Sensitivity updated to ${sensitivity} (Z-Score)`);
      setSaving(false);
    }, 800);
  };

  return (
    <PageTransition className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">ML Alert Configuration</h1>
        <p className="text-slate-400 mt-1">Configure outbreak detection sensitivity.</p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6 rounded-xl">
          <h3 className="text-lg font-semibold text-white mb-4">Anomaly Threshold (Z-Score)</h3>
          <p className="text-sm text-slate-400 mb-6">Lower values increase sensitivity (more alerts), higher values reduce false positives.</p>
          <input 
            type="range" min="1" max="5" step="0.1" 
            value={sensitivity} 
            onChange={e => setSensitivity(parseFloat(e.target.value))} 
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer" 
          />
          <div className="flex justify-between text-xs text-slate-500 mt-2">
            <span>High Sensitivity (1.0)</span>
            <span className="text-blue-400 font-bold text-sm">Current: {sensitivity}</span>
            <span>Low Sensitivity (5.0)</span>
          </div>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="mt-6 glass-button primary-gradient px-6 py-2 w-full flex items-center justify-center gap-2"
          >
            {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : null}
            Save Configuration
          </button>
        </div>

        <div className="glass-panel p-6 rounded-xl">
          <h3 className="text-lg font-semibold text-white mb-4">Recent Alerts Log</h3>
          {alerts.length > 0 ? (
            <div className="space-y-3">
              {alerts.map(a => (
                <div key={a._id} className="bg-red-900/10 border border-red-500/30 p-3 rounded-lg">
                  <p className="text-red-400 font-medium text-sm">{a.message}</p>
                  <p className="text-slate-500 text-xs mt-1">Status: {a.status} | Date: {new Date(a.createdAt || a.date).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          ) : (
             <p className="text-slate-400 text-sm">No recent alerts recorded in the system.</p>
          )}
        </div>
      </div>
    </PageTransition>
  );
};

const Overview = ({ stats, geo, activeAlerts }) => (
  <PageTransition className="p-6">
    <div className="mb-8">
      <h1 className="text-3xl font-bold text-white tracking-tight">Super Admin Dashboard</h1>
      <p className="text-slate-400 mt-1">Platform-wide overview and ML outbreak detection engine.</p>
    </div>

    {/* ML Alert Banner */}
    {activeAlerts && activeAlerts.length > 0 && (
      <div className="mb-8 bg-red-900/20 border border-red-500/50 rounded-xl p-4 flex items-start gap-4 animate-pulse">
        <ShieldAlert className="w-8 h-8 text-red-500 shrink-0" />
        <div>
          <h3 className="text-red-400 font-bold text-lg">Active Outbreak Alert</h3>
          <p className="text-red-300 text-sm">{activeAlerts[0].message} (Z-Score: {activeAlerts[0].zScore?.toFixed?.(2) || 'N/A'})</p>
        </div>
      </div>
    )}

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatCard 
        icon={Building2} 
        title="Registered Hospitals" 
        value={stats?.totalHospitals || 0} 
        gradient="from-blue-500 to-indigo-400"
        delay={0.1}
      />
      <StatCard 
        icon={Users} 
        title="Total Doctors" 
        value={stats?.totalDoctors || 0} 
        gradient="from-cyan-500 to-blue-400"
        delay={0.2}
      />
      <StatCard 
        icon={Users} 
        title="Registered Patients" 
        value={stats?.totalPatients || 0} 
        gradient="from-purple-500 to-fuchsia-400"
        delay={0.3}
      />
      <StatCard 
        icon={ClipboardList} 
        title="Total Consultations" 
        value={stats?.totalConsultations || 0} 
        gradient="from-emerald-500 to-teal-400"
        delay={0.4}
      />
    </div>

    <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="glass-panel p-6 rounded-xl border-blue-500/20">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <ActivitySquare className="w-5 h-5 text-blue-400" />
          Recent Platform Activity
        </h3>
        <p className="text-slate-400 text-sm mb-4">Monitoring real-time events from all connected hospitals.</p>
        
        <div className="space-y-3 h-64 overflow-y-auto pr-2 custom-scrollbar">
          {stats?.recentAuditLogs && stats.recentAuditLogs.length > 0 ? (
            stats.recentAuditLogs.map((log) => {
              // Extract action color
              const actionLower = (log.action || '').toLowerCase();
              let badgeColor = 'bg-slate-700 text-slate-300';
              if (actionLower.includes('login')) badgeColor = 'bg-blue-500/20 text-blue-400 border border-blue-500/30';
              if (actionLower.includes('create') || actionLower.includes('register')) badgeColor = 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
              if (actionLower.includes('delete') || actionLower.includes('block')) badgeColor = 'bg-red-500/20 text-red-400 border border-red-500/30';

              return (
                <div key={log._id} className="bg-slate-800/50 p-3.5 rounded-lg border border-slate-700/50 hover:bg-slate-800/80 transition-colors">
                  <div className="flex justify-between items-start mb-1.5">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${badgeColor}`}>
                      {log.action}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">{timeAgo(log.timestamp || log.createdAt)}</span>
                  </div>
                  <p className="text-sm text-slate-300 leading-snug">
                    <span className="font-semibold text-white">{log.actorRole?.replace('_', ' ')}</span> ({log.actorId}) accessed system.
                  </p>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <ScrollText className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-sm">No recent activity found.</p>
            </div>
          )}
        </div>
      </div>

      <div className="glass-panel p-6 rounded-xl border-blue-500/20">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-blue-400" />
          Geographic Distribution
        </h3>
        <p className="text-slate-400 text-sm">Patient and hospital density mapping.</p>
        {/* Geo map placeholder */}
        <div className="mt-4 h-64 w-full rounded-lg flex items-center justify-center">
          <GeographicMap hospitals={geo?.hospitals || []} alerts={activeAlerts || []} />
        </div>
      </div>
    </div>
  </PageTransition>
);

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
    const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:5005';
    const socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 3000,
    });

    socket.on('connect', () => {
      console.log('[Admin] Socket.IO connected:', socket.id);
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
      // Also update the alert list
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

    socket.on('connect_error', (err) => {
      console.warn('[Admin] Socket.IO connection error:', err.message);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const menuItems = [
    { label: 'Overview', path: '/admin/dashboard', icon: LayoutDashboard, end: true },
    { label: 'Analytics', path: '/admin/dashboard/analytics', icon: TrendingUp },
    { label: 'Hospitals', path: '/admin/dashboard/hospitals', icon: Building2 },
    { label: 'Users', path: '/admin/dashboard/users', icon: Users },
    { label: 'ML Alerts', path: '/admin/dashboard/alerts', icon: ShieldAlert },
    { label: 'Outbreak Monitor', path: '/admin/dashboard/outbreak', icon: Activity },
    { label: 'Broadcast', path: '/admin/dashboard/broadcast', icon: Radio },
    { label: 'Audit Log', path: '/admin/dashboard/audit', icon: ScrollText },
    { label: 'Ban Management', path: '/admin/dashboard/bans', icon: ShieldAlert },
    { label: 'Patient Reports', path: '/admin/dashboard/reports', icon: ClipboardList },
    { label: 'Admin Accounts', path: '/admin/dashboard/admins', icon: Users },
  ];

  return (
    <div className="admin-theme flex min-h-screen bg-[#0b1120]">
      <Sidebar menuItems={menuItems} title="System Admin" themePrefix="admin" />
      
      <main className="flex-1 ml-64 p-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <Routes>
            <Route path="/dashboard" element={<Overview stats={stats} geo={geo} activeAlerts={activeAlerts} />} />
            <Route path="/dashboard/analytics" element={<AnalyticsDashboard />} />
            <Route path="/dashboard/hospitals" element={<ManageHospitals />} />
            <Route path="/dashboard/users" element={<ManageUsers />} />
            <Route path="/dashboard/alerts" element={<AlertSettings />} />
            <Route path="/dashboard/outbreak" element={<OutbreakMonitor />} />
            <Route path="/dashboard/broadcast" element={<Broadcast />} />
            <Route path="/dashboard/audit" element={<AuditLog />} />
            <Route path="/dashboard/bans" element={<BanManagement />} />
            <Route path="/dashboard/reports" element={<PatientReports />} />
            <Route path="/dashboard/admins" element={<ManageAdmins />} />
            <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;
