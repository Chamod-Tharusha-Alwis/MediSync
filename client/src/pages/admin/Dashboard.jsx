import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { LayoutDashboard, Users, Building2, ClipboardList, ShieldAlert, ActivitySquare, MapPin } from 'lucide-react';
import api from '../../api/axiosInstance';
import Sidebar from '../../components/common/Sidebar';
import StatCard from '../../components/common/StatCard';
import PageTransition from '../../components/common/PageTransition';
import GeographicMap from '../../components/common/GeographicMap';

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

  useEffect(() => {
    api.get('/alerts/active').then(res => setAlerts(res.data.data)).catch(() => {});
  }, []);

  return (
    <PageTransition className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">ML Alert Configuration</h1>
        <p className="text-slate-400 mt-1">Configure outbreak detection sensitivity.</p>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass-panel p-6 rounded-xl">
          <h3 className="text-lg font-semibold text-white mb-4">Anomaly Threshold (Z-Score)</h3>
          <p className="text-sm text-slate-400 mb-6">Lower values increase sensitivity, higher values reduce false positives.</p>
          <input type="range" min="1" max="5" step="0.1" value={sensitivity} onChange={e => setSensitivity(e.target.value)} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
          <div className="flex justify-between text-xs text-slate-500 mt-2">
            <span>High Sensitivity (1.0)</span>
            <span className="text-blue-400 font-bold text-sm">Current: {sensitivity}</span>
            <span>Low Sensitivity (5.0)</span>
          </div>
          <button className="mt-6 glass-button primary-gradient px-6 py-2 w-full">Save Configuration</button>
        </div>

        <div className="glass-panel p-6 rounded-xl">
          <h3 className="text-lg font-semibold text-white mb-4">Recent Alerts Log</h3>
          {alerts.length > 0 ? (
            <div className="space-y-3">
              {alerts.map(a => (
                <div key={a._id} className="bg-red-900/10 border border-red-500/30 p-3 rounded-lg">
                  <p className="text-red-400 font-medium text-sm">{a.message}</p>
                  <p className="text-slate-500 text-xs mt-1">Z-Score: {a.zScore.toFixed(2)} | Date: {new Date(a.date).toLocaleDateString()}</p>
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
          <p className="text-red-300 text-sm">{activeAlerts[0].message} (Z-Score: {activeAlerts[0].zScore.toFixed(2)})</p>
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
        <p className="text-slate-400 text-sm">Monitoring real-time events from all connected hospitals.</p>
        {/* Activity feed placeholder */}
        <div className="mt-4 space-y-3">
          {[1,2,3].map(i => (
             <div key={i} className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
               <p className="text-sm text-slate-300">New consultation recorded at General Hospital</p>
               <span className="text-xs text-slate-500">Just now</span>
             </div>
          ))}
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

  const menuItems = [
    { label: 'Overview', path: '/admin/dashboard', icon: LayoutDashboard, end: true },
    { label: 'Hospitals', path: '/admin/dashboard/hospitals', icon: Building2 },
    { label: 'Users', path: '/admin/dashboard/users', icon: Users },
    { label: 'ML Alerts', path: '/admin/dashboard/alerts', icon: ShieldAlert },
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
            <Route path="/dashboard/hospitals" element={<ManageHospitals />} />
            <Route path="/dashboard/users" element={<ManageUsers />} />
            <Route path="/dashboard/alerts" element={<AlertSettings />} />
            <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;
