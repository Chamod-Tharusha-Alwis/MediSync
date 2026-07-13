import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import {
  FiUser, FiSave, FiPhone, FiMail, FiMapPin,
  FiAward, FiEdit3, FiCamera,
} from 'react-icons/fi';
import {
  LayoutDashboard, Users, Stethoscope, BadgeCheck,
  Building2, Loader2, Key, PenTool, CheckCircle, UploadCloud
} from 'lucide-react';
import PageTransition from '../../components/common/PageTransition';
import axios from '../../api/axiosInstance';
import AppShell from '../../components/ui/AppShell';
import Skeleton from '../../components/ui/Skeleton';

const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');

const Field = ({ label, icon: Icon, children }) => (
  <div className="flex flex-col gap-1.5">
    <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 select-none">
      <Icon className="w-3.5 h-3.5 text-teal-500" />
      {label}
    </label>
    {children}
  </div>
);

const DoctorProfile = () => {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    fullName: '',
    specialization: '',
    contactNumber: '',
    personalEmail: '',
    clinicAddress: '',
    description: '',
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Avatar Upload States
  const [uploadingPic, setUploadingPic] = useState(false);
  const [uploadPicProgress, setUploadPicProgress] = useState(0);
  const [isDraggingPic, setIsDraggingPic] = useState(false);

  // Password Rotation States
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rotatingPassword, setRotatingPassword] = useState(false);

  // Digital Signature States
  const [digitalSignature, setDigitalSignature] = useState(localStorage.getItem('digitalSignature') || '');
  const [uploadingSig, setUploadingSig] = useState(false);
  const [uploadSigProgress, setUploadSigProgress] = useState(0);
  const [isDraggingSig, setIsDraggingSig] = useState(false);

  const workspaceMode = localStorage.getItem('workspaceMode') || 'personal';
  const isPersonalMode = workspaceMode !== 'hospital';

  const MENU_ITEMS = [
    { label: 'Dashboard', path: '/doctor/dashboard', icon: LayoutDashboard, end: true },
    { label: 'New Consultation', path: '/doctor/consultation/new', icon: Stethoscope },
    { label: 'Patient Directory', path: '/doctor/patients', icon: Users },
    ...(isPersonalMode ? [{ label: 'My Profile', path: '/doctor/profile', icon: FiUser }] : []),
  ];

  useEffect(() => {
    axios.get('/doctor/profile')
      .then(res => {
        const d = res.data.data || {};
        setProfile(d);
        setForm({
          fullName: d.fullName || '',
          specialization: d.specialization || '',
          contactNumber: d.contactNumber || d.contactInfo || '',
          personalEmail: d.personalEmail || d.email || '',
          clinicAddress: d.clinicAddress || '',
          description: d.description || '',
        });
      })
      .catch(() => toast.error('Failed to load profile'));
  }, []);

  // Avatar Upload Logic
  const uploadAvatarFile = async (file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);

    setUploadingPic(true);
    setUploadPicProgress(10);
    try {
      const res = await axios.post('/users/upload-profile-pic', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadPicProgress(progress);
        }
      });
      setProfile(prev => ({ ...prev, profilePicture: res.data.imageUrl }));
      toast.success('Profile picture updated successfully!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to upload picture');
    } finally {
      setUploadingPic(false);
      setUploadPicProgress(0);
    }
  };

  // Digital Signature Upload Logic
  const uploadSignatureFile = async (file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);

    setUploadingSig(true);
    setUploadSigProgress(10);
    try {
      const res = await axios.post('/users/upload-profile-pic', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadSigProgress(progress);
        }
      });
      localStorage.setItem('digitalSignature', res.data.imageUrl);
      setDigitalSignature(res.data.imageUrl);
      toast.success('Digital signature uploaded successfully!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to upload signature');
    } finally {
      setUploadingSig(false);
      setUploadSigProgress(0);
    }
  };

  // Password Rotation Submit
  const handlePasswordRotate = async (e) => {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      return toast.error('All password fields are required.');
    }
    if (newPassword !== confirmPassword) {
      return toast.error('New password and confirm password do not match.');
    }

    setRotatingPassword(true);
    try {
      await axios.post('/auth/change-password', {
        currentPassword,
        newPassword
      });
      toast.success('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to rotate password');
    } finally {
      setRotatingPassword(false);
    }
  };

  const handleChange = (field, val) => {
    setForm(prev => ({ ...prev, [field]: val }));
    setDirty(true);
    setSaved(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    try {
      const res = await axios.put('/doctor/profile', {
        fullName: form.fullName,
        specialization: form.specialization,
        contactInfo: form.contactNumber,
        contactNumber: form.contactNumber,
        personalEmail: form.personalEmail,
        clinicAddress: form.clinicAddress,
      });
      await axios.put('/users/profile', {
        description: form.description
      });
      setProfile({ ...res.data.data, description: form.description });
      setDirty(false);
      setSaved(true);
      toast.success('Profile updated successfully!');
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return (
      <div className="doctor-theme">
        <AppShell
          role="doctor"
          userName="Doctor"
          userRole="Medical Professional"
          menuItems={MENU_ITEMS}
        >
          <div className="grid grid-cols-1 gap-6">
            <Skeleton.Card />
          </div>
        </AppShell>
      </div>
    );
  }

  const avatarText = initials(form.fullName) || '?';

  return (
    <div className="doctor-theme">
      <AppShell
        role="doctor"
        userName={form.fullName || profile.fullName}
        userRole="Medical Professional"
        menuItems={MENU_ITEMS}
      >
        <PageTransition>
          <div className="max-w-3xl mx-auto py-4 space-y-8">
            
            {/* Page Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-extrabold tracking-tight text-white">My Profile</h1>
                <p className="text-sm text-slate-400 mt-1">Manage your clinical identity and account settings.</p>
              </div>
              <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs font-semibold select-none">
                <BadgeCheck className="w-4 h-4" />
                Verified Doctor Portal
              </div>
            </div>

            {/* Avatar & Identity Card */}
            <div className="glass-panel rounded-2xl p-6 flex flex-col sm:flex-row items-center gap-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-6 opacity-[0.02] pointer-events-none">
                <Building2 className="w-40 h-40 text-teal-400" />
              </div>

              {/* Drag & Drop Avatar Dropzone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDraggingPic(true); }}
                onDragLeave={() => setIsDraggingPic(false)}
                onDrop={(e) => { e.preventDefault(); setIsDraggingPic(false); const file = e.dataTransfer.files[0]; if (file) uploadAvatarFile(file); }}
                className={`relative group w-24 h-24 rounded-2xl overflow-hidden bg-gradient-to-br from-teal-500/10 to-teal-500/20 border-2 transition-all duration-300 flex flex-col items-center justify-center flex-shrink-0 ${
                  isDraggingPic ? 'border-dashed border-teal-400 bg-teal-500/20 scale-105 shadow-lg' : 'border-teal-500/30'
                }`}
              >
                {profile.profilePicture ? (
                  <img src={profile.profilePicture} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl font-black text-teal-400 select-none">{avatarText}</span>
                )}

                {!uploadingPic && (
                  <label className="absolute inset-0 bg-[#020817]/85 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center cursor-pointer transition-opacity duration-200 p-1 text-center select-none">
                    <FiCamera className="w-5 h-5 text-teal-400 mb-1" />
                    <span className="text-[9px] text-slate-300 font-bold leading-tight">Drag & Drop<br />or Click</span>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={(e) => { const file = e.target.files[0]; if (file) uploadAvatarFile(file); }} 
                      className="hidden" 
                      disabled={uploadingPic} 
                    />
                  </label>
                )}

                {uploadingPic && (
                  <div className="absolute inset-0 bg-[#020817]/90 flex flex-col items-center justify-center p-2 text-center select-none">
                    <Loader2 className="w-5 h-5 text-teal-400 animate-spin mb-1" />
                    <span className="text-[10px] font-bold text-slate-300 font-mono">{uploadPicProgress}%</span>
                    <div className="w-full bg-slate-950 h-1 rounded-full overflow-hidden mt-1 border border-white/5 max-w-[80%]">
                      <div className="bg-gradient-to-r from-teal-500 to-emerald-400 h-full" style={{ width: `${uploadPicProgress}%` }} />
                    </div>
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-white truncate">Dr. {form.fullName || profile.fullName}</h2>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-[10px] font-bold uppercase tracking-wider select-none">
                    <BadgeCheck className="w-3.5 h-3.5" /> Active license
                  </span>
                </div>
                <p className="text-sm text-slate-400 mt-1">{form.specialization || 'Clinical Specialist'}</p>
                {profile.doctorId && (
                  <p className="text-xs text-slate-500 mt-1 font-mono select-all">Universal ID: {profile.doctorId}</p>
                )}
              </div>
            </div>

            {/* Profile Editing Details */}
            <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-6 space-y-6">
              <div className="flex items-center gap-2 pb-3 border-b border-white/5 select-none">
                <FiEdit3 className="w-4 h-4 text-teal-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Practice Information</h3>
              </div>

              <div className="grid sm:grid-cols-2 gap-5">
                <Field label="Full Name" icon={FiUser}>
                  <input
                    type="text"
                    value={form.fullName}
                    onChange={e => handleChange('fullName', e.target.value)}
                    className="glass-input text-sm"
                    required
                  />
                </Field>
                <Field label="Specialization" icon={FiAward}>
                  <input
                    type="text"
                    value={form.specialization}
                    onChange={e => handleChange('specialization', e.target.value)}
                    className="glass-input text-sm"
                  />
                </Field>
              </div>

              <div className="grid sm:grid-cols-2 gap-5">
                <Field label="Contact Number" icon={FiPhone}>
                  <input
                    type="tel"
                    value={form.contactNumber}
                    onChange={e => handleChange('contactNumber', e.target.value)}
                    className="glass-input text-sm"
                  />
                </Field>
                <Field label="Personal Email" icon={FiMail}>
                  <input
                    type="email"
                    value={form.personalEmail}
                    onChange={e => handleChange('personalEmail', e.target.value)}
                    className="glass-input text-sm"
                  />
                </Field>
              </div>

              <Field label="Clinic Address" icon={FiMapPin}>
                <textarea
                  rows={2}
                  value={form.clinicAddress}
                  onChange={e => handleChange('clinicAddress', e.target.value)}
                  className="glass-input text-sm resize-none"
                />
              </Field>

              <Field label="Professional Summary" icon={FiEdit3}>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={e => handleChange('description', e.target.value)}
                  className="glass-input text-sm resize-none"
                />
              </Field>

              <div className="flex justify-between items-center pt-4 border-t border-white/5">
                <AnimatePresence>
                  {saved && (
                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> Settings saved successfully
                    </motion.span>
                  )}
                  {!saved && dirty && (
                    <span className="text-xs text-amber-400 font-semibold">Unsaved edits pending</span>
                  )}
                </AnimatePresence>
                <button
                  type="submit"
                  disabled={saving || !dirty}
                  className="glass-button text-xs py-2.5 px-6 disabled:opacity-40"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FiSave className="w-4 h-4" />}
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </form>

            {/* Password Rotation Card */}
            <form onSubmit={handlePasswordRotate} className="glass-card rounded-2xl p-6 space-y-6">
              <div className="flex items-center gap-2 pb-3 border-b border-white/5 select-none">
                <Key className="w-4 h-4 text-teal-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Credential Security</h3>
              </div>

              <div className="grid sm:grid-cols-3 gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-slate-400 font-semibold uppercase">Current Password</label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    className="glass-input text-sm"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-slate-400 font-semibold uppercase">New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="glass-input text-sm"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-slate-400 font-semibold uppercase">Confirm Password</label>
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
                  className="glass-button text-xs py-2.5 px-6 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 disabled:opacity-40"
                >
                  {rotatingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                  {rotatingPassword ? 'Updating...' : 'Rotate Password'}
                </button>
              </div>
            </form>

            {/* Digital Signature Drop Zone */}
            <div className="glass-card rounded-2xl p-6 space-y-6">
              <div className="flex items-center gap-2 pb-3 border-b border-white/5 select-none">
                <PenTool className="w-4 h-4 text-teal-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Digital Prescription Signature</h3>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Add an official digital prescription signing mark. PNG files with transparent backgrounds are recommended for clear embedding on outputs.
              </p>

              <div className="grid md:grid-cols-2 gap-6 items-center">
                {/* Dropzone area */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingSig(true); }}
                  onDragLeave={() => setIsDraggingSig(false)}
                  onDrop={(e) => { e.preventDefault(); setIsDraggingSig(false); const file = e.dataTransfer.files[0]; if (file) uploadSignatureFile(file); }}
                  className={`border-2 rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-2 cursor-pointer transition-all duration-300 bg-slate-950/20 h-44 ${
                    isDraggingSig ? 'border-dashed border-teal-400 bg-teal-500/10 scale-102' : 'border-white/10 hover:border-white/15'
                  }`}
                  onClick={() => document.getElementById('signature-input-elem').click()}
                >
                  <UploadCloud className="w-8 h-8 text-teal-400 animate-pulse-subtle" />
                  <span className="text-xs font-bold text-slate-200">Drag & Drop Signature Image</span>
                  <span className="text-[10px] text-slate-500">Supports PNG, JPG, or SVG</span>
                  
                  <input
                    id="signature-input-elem"
                    type="file"
                    accept="image/*"
                    onChange={(e) => { const file = e.target.files[0]; if (file) uploadSignatureFile(file); }}
                    className="hidden"
                  />
                </div>

                {/* Signature Preview */}
                <div className="border border-white/5 rounded-2xl p-4 bg-slate-950/30 flex flex-col items-center justify-center h-44 select-none relative">
                  {digitalSignature ? (
                    <>
                      <img src={digitalSignature} alt="Digital Signature" className="max-h-24 max-w-full object-contain filter invert" />
                      <span className="text-[10px] font-bold text-teal-400 border border-teal-500/20 bg-teal-500/10 px-2 py-0.5 rounded-full absolute bottom-3">
                        Active Signature Loaded
                      </span>
                    </>
                  ) : (
                    <div className="text-center text-slate-600 text-xs">
                      <PenTool className="w-8 h-8 mx-auto mb-2 opacity-30" />
                      No signature uploaded
                    </div>
                  )}

                  {uploadingSig && (
                    <div className="absolute inset-0 bg-[#020817]/95 flex flex-col items-center justify-center p-4 text-center rounded-2xl">
                      <Loader2 className="w-6 h-6 text-teal-400 animate-spin mb-2" />
                      <span className="text-xs font-bold text-slate-300 font-mono">{uploadSigProgress}%</span>
                      <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden mt-2 border border-white/5 max-w-[60%]">
                        <div className="bg-gradient-to-r from-teal-500 to-emerald-400 h-full" style={{ width: `${uploadSigProgress}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Read-Only Facility Info */}
            {(profile.licenseNo || profile.email) && (
              <div className="glass-card rounded-2xl p-5 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 select-none">License & Verification details</p>
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  {profile.email && (
                    <div className="flex items-center gap-2 text-slate-400 truncate">
                      <FiMail className="w-4 h-4 text-slate-600 flex-shrink-0" />
                      <span>{profile.email}</span>
                    </div>
                  )}
                  {profile.licenseNo && (
                    <div className="flex items-center gap-2 text-slate-400">
                      <BadgeCheck className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <span>License ID: {profile.licenseNo}</span>
                    </div>
                  )}
                </div>
                {profile.hospitals && profile.hospitals.length > 0 && (
                  <div className="pt-3 border-t border-white/5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 select-none">Linked Medical Org Environments</p>
                    <div className="flex flex-wrap gap-2">
                      {profile.hospitals.map(h => (
                        <span key={h._id || h} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-teal-500/5 border border-teal-500/10 text-teal-400 text-xs font-semibold">
                          <Building2 className="w-3.5 h-3.5" />
                          {h.name || 'Hospital'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </PageTransition>
      </AppShell>
    </div>
  );
};

export default DoctorProfile;
