import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  LayoutDashboard, Users, Settings, FlaskConical,
  Camera, Key, Loader2, Plus, ArrowRight,
  TrendingUp, Save
} from 'lucide-react';
import api from '../../api/axiosInstance';
import AppShell from '../../components/ui/AppShell';
import Skeleton from '../../components/ui/Skeleton';
import PageTransition from '../../components/common/PageTransition';
import LabManagement from './LabManagement';
import ActiveOutbreakBanner from '../../components/common/ActiveOutbreakBanner';

// ─── DOCTOR ROSTER ───────────────────────────────────────────────────────────
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
      await api.post('/hospital/doctors/link', { email, doctorId: licenseNo });
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
      await api.put(`/hospital/doctors/${id}/status`, {});
      toast.success('Doctor access status updated');
      fetchDoctors();
    } catch (err) {
      toast.error('Failed to update doctor status');
    }
  };

  return (
    <PageTransition>
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-white">Doctor Roster</h1>
        <p className="text-slate-400 mt-1 text-sm font-medium">Manage clinical staff and link verified medical practitioners to your facility.</p>
      </div>

      <div className="glass-card p-6 rounded-2xl mb-8 border border-white/5">
        <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
          <Plus className="w-4 h-4 text-emerald-400" /> Link Certified Medical Practitioner
        </h3>
        <form onSubmit={handleAddDoctor} className="grid md:grid-cols-3 gap-4 items-end">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase text-slate-400">Doctor Corporate Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="glass-input text-sm"
              placeholder="e.g. dr.name@hospital.com"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase text-slate-400">OR SLMC License ID</label>
            <input
              type="text"
              value={licenseNo}
              onChange={e => setLicenseNo(e.target.value)}
              className="glass-input text-sm"
              placeholder="e.g. SLMC-12345"
            />
          </div>
          <button
            type="submit"
            disabled={isAdding || (!email && !licenseNo)}
            className="glass-button text-xs py-3 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 text-white disabled:opacity-40"
          >
            {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {isAdding ? 'Adding Link...' : 'Link Doctor Account'}
          </button>
        </form>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
        {loading ? (
          <div className="p-8"><Skeleton.Card /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-900/60 border-b border-white/5 text-slate-400 text-xs font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4 font-bold">Doctor Name</th>
                  <th className="px-6 py-4 font-bold">Specialization</th>
                  <th className="px-6 py-4 font-bold">Corporate Email</th>
                  <th className="px-6 py-4 font-bold">Access Status</th>
                  <th className="px-6 py-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm text-slate-200">
                {doctors.map(doc => (
                  <tr key={doc._id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 font-bold text-white">{doc.fullName}</td>
                    <td className="px-6 py-4 text-slate-300 font-medium">{doc.specialization}</td>
                    <td className="px-6 py-4 text-slate-400 font-mono text-xs">{doc.orgEmail}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                        doc.isActive
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                          : 'bg-slate-800 text-slate-500 border-slate-700'
                      }`}>
                        {doc.isActive ? 'ACTIVE' : 'SUSPENDED'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleToggle(doc._id)}
                        className={`font-semibold text-xs transition-colors px-3 py-1.5 rounded-lg border ${
                          doc.isActive 
                            ? 'text-red-400 hover:bg-red-500/10 border-red-500/20' 
                            : 'text-emerald-400 hover:bg-emerald-500/10 border-emerald-500/20'
                        }`}
                      >
                        {doc.isActive ? 'Suspend Access' : 'Activate Access'}
                      </button>
                    </td>
                  </tr>
                ))}
                {doctors.length === 0 && (
                  <tr>
                    <td colSpan="5" className="p-12 text-center text-slate-500">
                      <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      No doctors linked to this facility yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageTransition>
  );
};

// ─── SETTINGS PAGE ───────────────────────────────────────────────────────────
const SettingsPage = () => {
  const [profile, setProfile] = useState({ name: '', email: '', district: '', address: '', emergencyHotline: '', description: '', profilePicture: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPic, setUploadingPic] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDraggingLogo, setIsDraggingLogo] = useState(false);

  // Password rotation states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rotatingPassword, setRotatingPassword] = useState(false);

  useEffect(() => {
    api.get('/hospital/profile').then(res => {
      setProfile(res.data.data);
      setLoading(false);
    });
  }, []);

  const handlePhotoUpload = async (file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);

    setUploadingPic(true);
    setUploadProgress(15);
    try {
      const res = await api.post('/users/upload-profile-pic', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        }
      });
      setProfile(prev => ({ ...prev, profilePicture: res.data.imageUrl }));
      toast.success('Hospital logo updated successfully!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to upload logo');
    } finally {
      setUploadingPic(false);
      setUploadProgress(0);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/hospital/settings', profile);
      await api.put('/users/profile', { description: profile.description });
      toast.success('Facility settings updated successfully!');
    } catch (err) {
      toast.error('Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordRotate = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      return toast.error('New passwords do not match.');
    }
    setRotatingPassword(true);
    try {
      await api.post('/auth/change-password', { currentPassword, newPassword });
      toast.success('Credentials rotated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to rotate credentials');
    } finally {
      setRotatingPassword(false);
    }
  };

  if (loading) return <div className="p-8"><Skeleton.Card /></div>;

  return (
    <PageTransition className="space-y-8">
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Hospital Settings</h1>
        <p className="text-slate-400 mt-1 text-sm font-medium">Update your facility info, brand identity, and secure credentials.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8 items-start">
        {/* Forms Card */}
        <div className="lg:col-span-2 space-y-8">
          <form onSubmit={handleSave} className="glass-card p-6 rounded-2xl space-y-6">
            <div className="flex items-center gap-2 pb-3 border-b border-white/5 select-none">
              <Settings className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Organization Details</h3>
            </div>

            {/* Drag and Drop Logo dropzone */}
            <div className="flex items-center gap-6 pb-6 border-b border-white/5">
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDraggingLogo(true); }}
                onDragLeave={() => setIsDraggingLogo(false)}
                onDrop={(e) => { e.preventDefault(); setIsDraggingLogo(false); const file = e.dataTransfer.files[0]; if (file) handlePhotoUpload(file); }}
                className={`relative group w-20 h-20 rounded-2xl overflow-hidden border-2 bg-gradient-to-br from-emerald-500/10 to-teal-500/15 flex items-center justify-center text-white text-xl font-bold transition-all duration-300 ${
                  isDraggingLogo ? 'border-dashed border-emerald-400 bg-emerald-500/20 scale-105 shadow-lg' : 'border-white/10'
                }`}
              >
                {profile.profilePicture ? (
                  <img src={profile.profilePicture} alt="Logo" className="w-full h-full object-cover" />
                ) : (
                  profile.name?.charAt(0) || 'H'
                )}

                {!uploadingPic && (
                  <label className="absolute inset-0 bg-slate-950/80 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-opacity duration-200 p-1 text-center select-none text-[9px] font-bold text-slate-300 leading-tight">
                    <Camera className="w-4.5 h-4.5 text-emerald-400 mb-1" />
                    Drag & Drop
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={(e) => { const file = e.target.files[0]; if (file) handlePhotoUpload(file); }} 
                      className="hidden" 
                      disabled={uploadingPic} 
                    />
                  </label>
                )}

                {uploadingPic && (
                  <div className="absolute inset-0 bg-[#020817]/95 flex flex-col items-center justify-center p-2 text-center rounded-2xl select-none">
                    <Loader2 className="w-4 h-4 text-emerald-400 animate-spin mb-1" />
                    <span className="text-[9px] font-bold text-slate-300 font-mono">{uploadProgress}%</span>
                  </div>
                )}
              </div>
              <div>
                <h4 className="text-white font-bold text-sm">Facility Logo</h4>
                <p className="text-slate-500 text-xs mt-1">Recommended size: 512x512px. Supports PNG or JPG.</p>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase text-slate-400">Hospital Name</label>
              <input type="text" value={profile.name || ''} onChange={e => setProfile({...profile, name: e.target.value})} className="glass-input text-sm" />
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase text-slate-400">Contact Email</label>
                <input type="email" value={profile.email || ''} onChange={e => setProfile({...profile, email: e.target.value})} className="glass-input text-sm" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase text-slate-400">Emergency Hotline</label>
                <input type="text" value={profile.emergencyHotline || ''} onChange={e => setProfile({...profile, emergencyHotline: e.target.value})} className="glass-input text-sm" />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase text-slate-400">Address</label>
              <input type="text" value={profile.address || ''} onChange={e => setProfile({...profile, address: e.target.value})} className="glass-input text-sm" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase text-slate-400">Facility Description / Biography</label>
              <textarea value={profile.description || ''} onChange={e => setProfile({...profile, description: e.target.value})} rows={3} placeholder="Describe facility facilities, specialities..." className="glass-input text-sm resize-none" />
            </div>

            <div className="flex justify-end pt-4 border-t border-white/5">
              <button type="submit" disabled={saving} className="glass-button text-xs py-2.5 px-6">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>

          {/* Password Rotation Card */}
          <form onSubmit={handlePasswordRotate} className="glass-card p-6 rounded-2xl space-y-6">
            <div className="flex items-center gap-2 pb-3 border-b border-white/5 select-none">
              <Key className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Rotate Credentials</h3>
            </div>

            <div className="grid sm:grid-cols-3 gap-5">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase text-slate-400">Current Password</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="glass-input text-sm"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase text-slate-400">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="glass-input text-sm"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase text-slate-400">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  className="glass-input text-sm"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-white/5">
              <button
                type="submit"
                disabled={rotatingPassword}
                className="glass-button text-xs py-2.5 px-6"
              >
                {rotatingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                {rotatingPassword ? 'Updating...' : 'Rotate Password'}
              </button>
            </div>
          </form>
        </div>

        {/* API Credentials Sidebar Card */}
        <div className="space-y-6">
          <div className="glass-card rounded-2xl p-6 border border-white/5 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-white/5">
              <Key className="w-4.5 h-4.5 text-emerald-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">API Integration Credential</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Integrate your LIS (Laboratory Information System) with MediSync secure REST catalogs using OAuth Client credentials.
            </p>
            <div className="space-y-4">
              {[
                { label: 'Facility App ID', value: `HOSP-${profile._id || '9b1a8c'}` },
                { label: 'Sandbox Secret Key', value: 'sk_sandbox_mock_credential_12345' },
                { label: 'Webhook Endpoint', value: 'https://api.medisync.io/v1/webhooks/lis' }
              ].map(cred => (
                <div key={cred.label} className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500">{cred.label}</span>
                  <div className="flex items-center gap-2 bg-slate-950/40 border border-white/5 px-3 py-2 rounded-xl">
                    <span className="font-mono text-[11px] text-slate-300 select-all truncate flex-1">{cred.value}</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(cred.value);
                        toast.success(`${cred.label} copied!`);
                      }}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold shrink-0 uppercase tracking-wider"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
};

// ─── OVERVIEW TAB ────────────────────────────────────────────────────────────
const Overview = ({ stats, labStats, onNavigate }) => {
  return (
    <PageTransition className="space-y-8">
      {/* Overview Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Hospital Administration</h1>
          <p className="text-slate-400 mt-1.5 text-sm font-medium">Facility operations, doctor rosters, and laboratory metrics summary.</p>
        </div>
        <button
          onClick={() => onNavigate('/hospital/dashboard/tests')}
          className="glass-button text-xs py-2.5 px-5 flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-500 text-white"
        >
          Open Lab Management Console <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      <ActiveOutbreakBanner />

      {/* Lab Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Lab Tests Today', value: labStats.receivedToday, color: 'emerald', desc: 'Received for analysis' },
          { label: 'Completed Results', value: labStats.completed, color: 'teal', desc: 'Decrypted & released' },
          { label: 'Pending Processing', value: labStats.pending, color: 'amber', desc: 'In queue or diagnostics' },
          { label: 'Avg Turnaround Time', value: labStats.avgTime, color: 'indigo', desc: 'Acceptance to upload' }
        ].map((stat, i) => (
          <div key={i} className="glass-panel p-5 rounded-2xl border border-white/5 flex flex-col gap-1 relative overflow-hidden">
            <div className={`absolute top-0 right-0 w-16 h-16 bg-${stat.color}-500/5 rounded-full blur-xl`} />
            <span className="text-xs font-bold uppercase text-slate-500 tracking-wider">{stat.label}</span>
            <span className="text-3xl font-extrabold text-white font-mono mt-1">{stat.value}</span>
            <span className="text-[10px] text-slate-400 mt-1">{stat.desc}</span>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        {/* Quick Actions & Facility Stats */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4.5 h-4.5 text-emerald-400" /> Operational Metrics
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-950/20 border border-white/5">
                <span className="text-xs text-slate-400 font-semibold block">Total Linked Doctors</span>
                <span className="text-2xl font-bold text-white mt-1 block">{stats?.totalDoctors || 0}</span>
                <span className="text-[10px] text-slate-500 mt-1 block">Active: {stats?.activeDoctors || 0} | Suspended: {stats?.inactiveDoctors || 0}</span>
              </div>
              <div className="p-4 rounded-xl bg-slate-950/20 border border-white/5">
                <span className="text-xs text-slate-400 font-semibold block">Consultations Today</span>
                <span className="text-2xl font-bold text-white mt-1 block">{stats?.consultationsToday || 0}</span>
                <span className="text-[10px] text-slate-500 mt-1 block">Prescriptions issued: {stats?.prescriptionsToday || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
};

// ─── MAIN ROUTER CONTAINER ───────────────────────────────────────────────────
const HospitalDashboard = () => {
  const [stats, setStats] = useState(null);
  const [labStats, setLabStats] = useState({ receivedToday: 0, completed: 0, pending: 0, avgTime: '0.0h' });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchStats = async () => {
    try {
      const [{ data: generalStats }, { data: labAll }] = await Promise.all([
        api.get('/hospital/stats'),
        api.get('/lab/hospital/all')
      ]);

      setStats(generalStats.data);

      // Compute Lab statistics
      const tests = Array.isArray(labAll) ? labAll : [];
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const receivedToday = tests.filter(t => new Date(t.createdAt) >= startOfToday).length;
      const completed = tests.filter(t => t.status === 'report_ready' || t.status === 'delivered').length;
      const pending = tests.filter(t => ['pending', 'Approved', 'sample_collected', 'processing'].includes(t.status)).length;

      let avgTime = '—';
      const completedTests = tests.filter(t => t.reportUploadedAt && t.createdAt);
      if (completedTests.length > 0) {
        const totalMs = completedTests.reduce((acc, t) => {
          return acc + (new Date(t.reportUploadedAt) - new Date(t.createdAt));
        }, 0);
        const avgHours = (totalMs / completedTests.length / (1000 * 60 * 60)).toFixed(1);
        avgTime = `${avgHours}h`;
      }

      setLabStats({ receivedToday, completed, pending, avgTime });

    } catch (err) {
      toast.error('Failed to load dashboard metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const hospitalName = localStorage.getItem('hospitalName') || 'Hospital';

  const menuItems = [
    { label: 'Overview', path: '/hospital/dashboard', icon: LayoutDashboard, end: true },
    { label: 'Doctor Roster', path: '/hospital/dashboard/doctors', icon: Users },
    { label: 'Lab Tests', path: '/hospital/dashboard/tests', icon: FlaskConical },
    { label: 'Settings', path: '/hospital/dashboard/settings', icon: Settings },
  ];

  return (
    <div className="hospital-theme">
      <AppShell
        role="hospital"
        userName={hospitalName}
        userRole="Hospital Administrator"
        menuItems={menuItems}
      >
        {loading ? (
          <div className="grid grid-cols-1 gap-6">
            <Skeleton.Card />
            <Skeleton.Card />
          </div>
        ) : (
          <Routes>
            <Route path="/dashboard" element={<Overview stats={stats} labStats={labStats} onNavigate={(path) => navigate(path)} />} />
            <Route path="/dashboard/doctors" element={<DoctorRoster />} />
            <Route path="/dashboard/tests" element={<LabManagement />} />
            <Route path="/dashboard/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/hospital/dashboard" replace />} />
          </Routes>
        )}
      </AppShell>
    </div>
  );
};

export default HospitalDashboard;
