import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { User, Shield, Phone, Heart, Lock, Save, Loader2, AlertCircle } from 'lucide-react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import PageTransition from '../../components/common/PageTransition';

const PatientProfile = () => {
  const [patient, setPatient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState('info');
  const [emergencyContact, setEmergencyContact] = useState({ name: '', relationship: '', phone: '' });
  const [passwords, setPasswords] = useState({ current: '', newPassword: '', confirmPassword: '' });
  const nic = localStorage.getItem('nic') || JSON.parse(localStorage.getItem('user') || '{}').nic;

  useEffect(() => {
    if (!nic) return;
    api.get(`/patient/${nic}`)
      .then(res => {
        const data = res.data.data?.patient || res.data.data || res.data;
        setPatient(data);
        if (data.emergencyContact) {
          setEmergencyContact(data.emergencyContact);
        }
      })
      .catch(() => toast.error('Failed to load profile'))
      .finally(() => setLoading(false));
  }, [nic]);

  const handleUpdateEmergency = async () => {
    setSaving(true);
    try {
      await api.put(`/patient/${nic}`, { emergencyContact });
      toast.success('Emergency contact updated!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (passwords.newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setSaving(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: passwords.current,
        newPassword: passwords.newPassword,
      });
      toast.success('Password updated successfully!');
      setPasswords({ current: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  const getRiskColor = (level) => {
    switch (level) {
      case 'high': return 'text-red-400 bg-red-500/20 border-red-500/30';
      case 'medium': return 'text-amber-400 bg-amber-500/20 border-amber-500/30';
      default: return 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30';
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-20">
        <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="p-8 text-center text-slate-400">
        <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
        <p>Unable to load profile data.</p>
      </div>
    );
  }

  const sections = [
    { key: 'info', label: 'Personal Info', icon: User },
    { key: 'emergency', label: 'Emergency Contact', icon: Phone },
    { key: 'security', label: 'Security', icon: Lock },
  ];

  return (
    <PageTransition className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">My Profile</h1>
        <p className="text-slate-400 mt-1">Manage your personal information and security settings.</p>
      </div>

      {/* Profile Hero Card */}
      <div className="glass-panel rounded-2xl p-6 mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-6 opacity-5">
          <Shield className="w-40 h-40 text-pink-500" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 border border-pink-500/30 flex items-center justify-center text-3xl font-bold text-pink-400">
            {patient.fullName?.charAt(0) || '?'}
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-white">{patient.fullName}</h2>
            <p className="text-slate-400 text-sm mt-1">NIC: {patient.nic}</p>
            <div className="flex flex-wrap gap-3 mt-3">
              {patient.bloodGroup && (
                <span className="text-xs px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full font-medium">
                  <Heart className="w-3 h-3 inline mr-1" />{patient.bloodGroup}
                </span>
              )}
              {patient.gender && (
                <span className="text-xs px-3 py-1.5 bg-slate-800 text-slate-300 border border-slate-700 rounded-full font-medium">
                  {patient.gender}
                </span>
              )}
              {patient.district && (
                <span className="text-xs px-3 py-1.5 bg-slate-800 text-slate-300 border border-slate-700 rounded-full font-medium">
                  {patient.district}
                </span>
              )}
              {patient.riskLevel && (
                <span className={`text-xs px-3 py-1.5 border rounded-full font-bold uppercase ${getRiskColor(patient.riskLevel)}`}>
                  Risk: {patient.riskLevel}
                </span>
              )}
            </div>
          </div>
          {patient.riskScore !== undefined && (
            <div className="text-center">
              <p className="text-xs text-slate-500 uppercase font-bold">Risk Score</p>
              <p className="text-3xl font-black text-white">{patient.riskScore}</p>
            </div>
          )}
        </div>

        {/* Allergies */}
        {patient.allergies?.length > 0 && (
          <div className="mt-6 pt-6 border-t border-slate-700/50">
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Known Allergies</p>
            <div className="flex flex-wrap gap-2">
              {patient.allergies.map((allergy, i) => (
                <span key={i} className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm font-medium border border-red-500/30">
                  {allergy}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Chronic Conditions */}
        {patient.chronicConditions?.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Chronic Conditions</p>
            <div className="flex flex-wrap gap-2">
              {patient.chronicConditions.map((condition, i) => (
                <span key={i} className="px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-sm font-medium border border-amber-500/30">
                  {condition}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Section Tabs */}
      <div className="flex gap-2 mb-6">
        {sections.map(s => (
          <button
            key={s.key}
            onClick={() => setActiveSection(s.key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeSection === s.key
                ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30'
                : 'bg-slate-800/40 text-slate-400 border border-slate-700/50 hover:border-slate-600'
            }`}
          >
            <s.icon className="w-4 h-4" />
            {s.label}
          </button>
        ))}
      </div>

      {/* Section Content */}
      {activeSection === 'info' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-6">Personal Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-xs text-slate-500 uppercase font-bold mb-1">Full Name</p>
              <p className="text-white">{patient.fullName}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-bold mb-1">Email</p>
              <p className="text-white">{patient.email || 'Not set'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-bold mb-1">Date of Birth</p>
              <p className="text-white">{patient.dateOfBirth ? new Date(patient.dateOfBirth).toLocaleDateString() : 'Not set'}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase font-bold mb-1">Contact</p>
              <p className="text-white">{patient.contactInfo || 'Not set'}</p>
            </div>
            {patient.insurance && (
              <>
                <div>
                  <p className="text-xs text-slate-500 uppercase font-bold mb-1">Insurance Provider</p>
                  <p className="text-white">{patient.insurance.provider || 'None'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase font-bold mb-1">Policy Number</p>
                  <p className="text-white">{patient.insurance.policyNumber || 'N/A'}</p>
                </div>
              </>
            )}
          </div>
        </motion.div>
      )}

      {activeSection === 'emergency' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-6">Emergency Contact</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">Contact Name</label>
              <input
                type="text"
                value={emergencyContact.name}
                onChange={(e) => setEmergencyContact({ ...emergencyContact, name: e.target.value })}
                className="w-full p-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                placeholder="Emergency contact name"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">Relationship</label>
              <input
                type="text"
                value={emergencyContact.relationship}
                onChange={(e) => setEmergencyContact({ ...emergencyContact, relationship: e.target.value })}
                className="w-full p-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                placeholder="e.g. Spouse, Parent"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium text-slate-300 mb-2 block">Phone Number</label>
              <input
                type="tel"
                value={emergencyContact.phone}
                onChange={(e) => setEmergencyContact({ ...emergencyContact, phone: e.target.value })}
                className="w-full p-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                placeholder="+94 77 123 4567"
              />
            </div>
          </div>
          <button
            onClick={handleUpdateEmergency}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium text-white bg-pink-600/80 hover:bg-pink-600 border border-pink-600/50 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Emergency Contact
          </button>
        </motion.div>
      )}

      {activeSection === 'security' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-xl p-6">
          <h3 className="text-lg font-bold text-white mb-6">Change Password</h3>
          <form onSubmit={handleChangePassword} className="space-y-5 max-w-md">
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">Current Password</label>
              <input
                type="password"
                required
                value={passwords.current}
                onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                className="w-full p-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">New Password</label>
              <input
                type="password"
                required
                value={passwords.newPassword}
                onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
                className="w-full p-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">Confirm New Password</label>
              <input
                type="password"
                required
                value={passwords.confirmPassword}
                onChange={(e) => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                className="w-full p-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium text-white bg-pink-600/80 hover:bg-pink-600 border border-pink-600/50 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              Update Password
            </button>
          </form>
        </motion.div>
      )}
    </PageTransition>
  );
};

export default PatientProfile;
