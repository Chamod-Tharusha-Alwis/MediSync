import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { LayoutDashboard, Users, FileText, Settings, ActivitySquare } from 'lucide-react';
import api from '../../api/axiosInstance';
import Sidebar from '../../components/common/Sidebar';
import StatCard from '../../components/common/StatCard';
import PageTransition from '../../components/common/PageTransition';

// Sub-components
const DoctorRoster = () => {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [licenseNo, setLicenseNo] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const fetchDoctors = async () => {
    try {
      const { data } = await api.get('/hospital/staff');
      setDoctors(data.data);
    } catch (err) {
      toast.error('Failed to load doctor roster');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoctors();
  }, []);

  const handleAddDoctor = async (e) => {
    e.preventDefault();
    setIsAdding(true);
    try {
      await api.post('/hospital/staff', { email, licenseNo });
      toast.success('Doctor linked successfully. Email sent.');
      setEmail('');
      setLicenseNo('');
      fetchDoctors();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add doctor');
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggle = async (id) => {
    try {
      await api.put(`/hospital/staff/${id}/toggle`, {});
      toast.success('Status updated');
      fetchDoctors();
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  return (
    <PageTransition className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">Doctor Roster</h1>
        <p className="text-slate-400 mt-1">Manage doctors linked to this hospital.</p>
      </div>

      <div className="glass-panel p-6 rounded-xl mb-8">
        <h3 className="text-lg font-semibold text-white mb-4">Link New Doctor</h3>
        <form onSubmit={handleAddDoctor} className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-300 mb-1">Doctor Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white" placeholder="doctor@example.com" />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-slate-300 mb-1">OR License No</label>
            <input type="text" value={licenseNo} onChange={e => setLicenseNo(e.target.value)} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white" placeholder="SLMC-12345" />
          </div>
          <button type="submit" disabled={isAdding || (!email && !licenseNo)} className="glass-button primary-gradient px-6 py-2 h-[42px] disabled:opacity-50">
            {isAdding ? 'Adding...' : 'Add Doctor'}
          </button>
        </form>
      </div>

      <div className="glass-panel rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading roster...</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-800/80 border-b border-slate-700 text-slate-300">
              <tr>
                <th className="px-6 py-4 font-medium">Name</th>
                <th className="px-6 py-4 font-medium">Specialization</th>
                <th className="px-6 py-4 font-medium">Email</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {doctors.map(doc => (
                <tr key={doc._id} className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4 font-medium text-white">{doc.fullName}</td>
                  <td className="px-6 py-4 text-slate-300">{doc.specialization}</td>
                  <td className="px-6 py-4 text-slate-400 text-sm">{doc.orgEmail}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${doc.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                      {doc.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => handleToggle(doc._id)} className="text-sm text-blue-400 hover:text-blue-300">Toggle Status</button>
                  </td>
                </tr>
              ))}
              {doctors.length === 0 && (
                <tr><td colSpan="5" className="p-8 text-center text-slate-400">No doctors linked yet.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </PageTransition>
  );
};

const SettingsPage = () => {
  const [profile, setProfile] = useState({ name: '', email: '', district: '', address: '', emergencyHotline: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/hospital/profile').then(res => {
      setProfile(res.data.data);
      setLoading(false);
    });
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/hospital/settings', profile);
      toast.success('Settings updated successfully');
    } catch (err) {
      toast.error('Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-white">Loading settings...</div>;

  return (
    <PageTransition className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">Hospital Settings</h1>
        <p className="text-slate-400 mt-1">Update your organization's profile and contact details.</p>
      </div>
      <div className="glass-panel p-6 rounded-xl max-w-2xl">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Hospital Name</label>
            <input type="text" value={profile.name || ''} onChange={e => setProfile({...profile, name: e.target.value})} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Contact Email</label>
              <input type="email" value={profile.email || ''} onChange={e => setProfile({...profile, email: e.target.value})} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Emergency Hotline</label>
              <input type="text" value={profile.emergencyHotline || ''} onChange={e => setProfile({...profile, emergencyHotline: e.target.value})} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Address</label>
            <input type="text" value={profile.address || ''} onChange={e => setProfile({...profile, address: e.target.value})} className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2 text-white" />
          </div>
          <div className="pt-4">
            <button type="submit" disabled={saving} className="glass-button primary-gradient px-8 py-2">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </PageTransition>
  );
};

const Overview = ({ stats }) => (
  <PageTransition className="p-6">
    <div className="mb-8">
      <h1 className="text-3xl font-bold text-white tracking-tight">Hospital Administration</h1>
      <p className="text-slate-400 mt-1">Real-time metrics for your facility.</p>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatCard 
        icon={Users} 
        title="Active Doctors" 
        value={stats?.activeDoctors || 0} 
        gradient="from-purple-500 to-fuchsia-400"
        delay={0.1}
      />
      <StatCard 
        icon={Users} 
        title="Inactive Doctors" 
        value={stats?.inactiveDoctors || 0} 
        gradient="from-slate-600 to-slate-400"
        delay={0.2}
      />
      <StatCard 
        icon={ActivitySquare} 
        title="Consultations Today" 
        value={stats?.consultationsToday || 0} 
        gradient="from-blue-500 to-cyan-400"
        delay={0.3}
      />
      <StatCard 
        icon={FileText} 
        title="Prescriptions Today" 
        value={stats?.prescriptionsToday || 0} 
        gradient="from-emerald-500 to-teal-400"
        delay={0.4}
      />
    </div>

    <div className="mt-8">
      <div className="glass-panel p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
        <div className="flex gap-4">
          <button className="glass-button primary-gradient px-6 py-2">Add New Doctor</button>
          <button className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-600 transition-colors">View All Consultations</button>
        </div>
      </div>
    </div>
  </PageTransition>
);

const HospitalDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data } = await api.get('/hospital/stats');
        setStats(data.data);
      } catch (err) {
        toast.error('Failed to load hospital statistics');
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const menuItems = [
    { label: 'Overview', path: '/hospital/dashboard', icon: LayoutDashboard, end: true },
    { label: 'Doctor Roster', path: '/hospital/dashboard/doctors', icon: Users },
    { label: 'Settings', path: '/hospital/dashboard/settings', icon: Settings },
  ];

  return (
    <div className="hospital-theme flex min-h-screen bg-[#0b1120]">
      <Sidebar menuItems={menuItems} title="Hospital Admin" themePrefix="hospital" />
      
      <main className="flex-1 ml-64 p-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <Routes>
            <Route path="/dashboard" element={<Overview stats={stats} />} />
            <Route path="/dashboard/doctors" element={<DoctorRoster />} />
            <Route path="/dashboard/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/hospital/dashboard" replace />} />
          </Routes>
        )}
      </main>
    </div>
  );
};

export default HospitalDashboard;
