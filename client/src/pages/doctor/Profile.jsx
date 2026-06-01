import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import {
  FiUser, FiSave, FiPhone, FiMail, FiMapPin,
  FiAward, FiEdit3, FiCheck, FiLoader,
} from 'react-icons/fi';
import { LayoutDashboard, Users, Stethoscope, BadgeCheck, Building2, Star } from 'lucide-react';
import Sidebar from '../../components/common/Sidebar';
import PageTransition from '../../components/common/PageTransition';
import axios from '../../api/axiosInstance';

/* ─── Sidebar menu (mirrors other doctor pages) ─────────────────────────── */
const workspaceMode   = localStorage.getItem('workspaceMode') || 'personal';
const isPersonalMode  = workspaceMode !== 'hospital';

const MENU_ITEMS = [
  { label: 'Dashboard',         path: '/doctor/dashboard',        icon: LayoutDashboard, end: true },
  { label: 'New Consultation',  path: '/doctor/consultation/new', icon: Stethoscope },
  { label: 'Patient Directory', path: '/doctor/patients',          icon: Users },
  ...(isPersonalMode ? [{ label: 'My Profile', path: '/doctor/profile', icon: FiUser }] : []),
];

/* ─── Helper: avatar initials ───────────────────────────────────────────── */
const initials = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');

/* ─── Glassmorphic field wrapper ────────────────────────────────────────── */
const Field = ({ label, icon: Icon, children }) => (
  <div className="flex flex-col gap-1.5">
    <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
      <Icon className="w-3.5 h-3.5" />
      {label}
    </label>
    {children}
  </div>
);

/* ════════════════════════════════════════════════════════════════════════════
   DoctorProfile — Main component
   ══════════════════════════════════════════════════════════════════════════ */
const DoctorProfile = () => {
  const [profile, setProfile]   = useState(null);   // null = loading
  const [form, setForm]         = useState({
    fullName:      '',
    specialization:'',
    contactNumber: '',
    personalEmail: '',
    clinicAddress: '',
  });
  const [dirty,   setDirty]     = useState(false);
  const [saving,  setSaving]    = useState(false);
  const [saved,   setSaved]     = useState(false);   // brief "saved" indicator

  /* ── Load profile on mount ─────────────────────────────────────────────── */
  useEffect(() => {
    axios.get('/doctor/profile')
      .then(res => {
        const d = res.data.data || {};
        setProfile(d);
        setForm({
          fullName:       d.fullName      || '',
          specialization: d.specialization|| '',
          contactNumber:  d.contactNumber || d.contactInfo || '',
          personalEmail:  d.personalEmail || d.email        || '',
          clinicAddress:  d.clinicAddress || '',
        });
      })
      .catch(() => toast.error('Failed to load profile'));
  }, []);

  /* ── Field change ──────────────────────────────────────────────────────── */
  const handleChange = (field, val) => {
    setForm(prev => ({ ...prev, [field]: val }));
    setDirty(true);
    setSaved(false);
  };

  /* ── Save ──────────────────────────────────────────────────────────────── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    try {
      const res = await axios.put('/doctor/profile', {
        fullName:       form.fullName,
        specialization: form.specialization,
        contactInfo:    form.contactNumber,   // backend field name
        contactNumber:  form.contactNumber,
        personalEmail:  form.personalEmail,
        clinicAddress:  form.clinicAddress,
      });
      setProfile(res.data.data);
      setDirty(false);
      setSaved(true);
      toast.success('Profile updated successfully!');
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Profile save error:', err);
      toast.error(err.response?.data?.error || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  /* ── Loading skeleton ──────────────────────────────────────────────────── */
  if (!profile) {
    return (
      <div className="flex bg-[#080d1a] min-h-screen text-slate-200">
        <Sidebar menuItems={MENU_ITEMS} title="Doctor Portal" themePrefix="doctor" />
        <main className="flex-1 md:ml-64 flex items-center justify-center">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
            <FiLoader className="w-8 h-8 text-teal-400" />
          </motion.div>
        </main>
      </div>
    );
  }

  const avatarText = initials(form.fullName) || '?';

  return (
    <div className="flex bg-[#080d1a] min-h-screen text-slate-200">
      <Sidebar menuItems={MENU_ITEMS} title="Doctor Portal" themePrefix="doctor"
        userName={form.fullName} userRole="Medical Professional" />

      <main className="flex-1 md:ml-64 min-h-screen">
        <PageTransition>
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">

            {/* ── Page header ─────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-white tracking-tight">My Profile</h1>
                <p className="text-sm text-slate-400 mt-0.5">
                  Manage your personal and practice information
                </p>
              </div>

              {/* Workspace badge */}
              <div className="hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-xl
                bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-semibold">
                <BadgeCheck className="w-4 h-4" />
                Private Clinic Mode
              </div>
            </div>

            {/* ── Avatar + identity card ───────────────────────────────── */}
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="glass-card rounded-2xl border border-white/6 p-6 flex items-center gap-6"
            >
              {/* Avatar circle */}
              <motion.div
                whileHover={{ scale: 1.05 }}
                className="relative flex-shrink-0 w-20 h-20 rounded-2xl
                  bg-gradient-to-br from-emerald-500 to-teal-600
                  flex items-center justify-center text-white text-2xl font-bold
                  shadow-lg shadow-emerald-500/25 ring-4 ring-emerald-500/20"
              >
                {avatarText}
                {/* Verified dot */}
                <span className="absolute -bottom-1.5 -right-1.5 w-6 h-6 bg-emerald-400 rounded-full
                  flex items-center justify-center border-2 border-slate-900">
                  <FiCheck className="w-3 h-3 text-slate-900" strokeWidth={3} />
                </span>
              </motion.div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-white truncate">
                    Dr. {form.fullName || profile.fullName}
                  </h2>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full
                    bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
                    <BadgeCheck className="w-3 h-3" />
                    Verified
                  </span>
                </div>
                <p className="text-sm text-slate-400 mt-0.5">
                  {form.specialization || 'Specialization not set'}
                </p>
                {profile.doctorId && (
                  <p className="text-xs text-slate-600 mt-1 font-mono">
                    ID: {profile.doctorId}
                  </p>
                )}
              </div>
            </motion.div>

            {/* ── Edit form ────────────────────────────────────────────── */}
            <motion.form
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.08 }}
              onSubmit={handleSubmit}
              className="glass-card rounded-2xl border border-white/6 p-6 space-y-6"
            >
              <div className="flex items-center gap-2 pb-3 border-b border-white/6">
                <FiEdit3 className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Personal & Practice Details
                </h3>
              </div>

              {/* Row 1: Name + Specialization */}
              <div className="grid sm:grid-cols-2 gap-5">
                <Field label="Full Name" icon={FiUser}>
                  <input
                    id="profile-fullname"
                    type="text"
                    value={form.fullName}
                    onChange={e => handleChange('fullName', e.target.value)}
                    placeholder="Enter your full name"
                    className="glass-input w-full text-sm"
                    required
                  />
                </Field>

                <Field label="Specialization" icon={FiAward}>
                  <input
                    id="profile-specialization"
                    type="text"
                    value={form.specialization}
                    onChange={e => handleChange('specialization', e.target.value)}
                    placeholder="e.g. Cardiologist"
                    className="glass-input w-full text-sm"
                  />
                </Field>
              </div>

              {/* Row 2: Contact + Email */}
              <div className="grid sm:grid-cols-2 gap-5">
                <Field label="Contact Number" icon={FiPhone}>
                  <input
                    id="profile-contact"
                    type="tel"
                    value={form.contactNumber}
                    onChange={e => handleChange('contactNumber', e.target.value)}
                    placeholder="+94 77 000 0000"
                    className="glass-input w-full text-sm"
                  />
                </Field>

                <Field label="Personal Email" icon={FiMail}>
                  <input
                    id="profile-email"
                    type="email"
                    value={form.personalEmail}
                    onChange={e => handleChange('personalEmail', e.target.value)}
                    placeholder="doctor@email.com"
                    className="glass-input w-full text-sm"
                  />
                </Field>
              </div>

              {/* Row 3: Clinic Address (full width) */}
              <Field label="Private Clinic Address" icon={FiMapPin}>
                <textarea
                  id="profile-clinic-address"
                  rows={3}
                  value={form.clinicAddress}
                  onChange={e => handleChange('clinicAddress', e.target.value)}
                  placeholder="No. 12, Galle Road, Colombo 03, Sri Lanka"
                  className="glass-input w-full text-sm resize-none"
                />
              </Field>

              {/* ── Save bar ─────────────────────────────────────────── */}
              <div className="flex items-center justify-between pt-4 border-t border-white/6">
                <AnimatePresence>
                  {saved && (
                    <motion.span
                      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                      className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold"
                    >
                      <FiCheck className="w-3.5 h-3.5" />
                      All changes saved
                    </motion.span>
                  )}
                  {!saved && dirty && (
                    <motion.span
                      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                      className="text-xs text-amber-400/80 font-medium"
                    >
                      Unsaved changes
                    </motion.span>
                  )}
                  {!saved && !dirty && <span />}
                </AnimatePresence>

                <motion.button
                  whileHover={{ scale: dirty ? 1.03 : 1 }}
                  whileTap={{ scale: dirty ? 0.97 : 1 }}
                  type="submit"
                  disabled={saving || !dirty}
                  className={`
                    glass-button px-7 py-3 flex items-center gap-2 text-sm font-semibold
                    transition-opacity duration-200
                    ${!dirty ? 'opacity-40 cursor-not-allowed' : ''}
                  `}
                >
                  {saving
                    ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    : saved
                      ? <FiCheck className="w-4 h-4" />
                      : <FiSave className="w-4 h-4" />
                  }
                  {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
                </motion.button>
              </div>
            </motion.form>

            {/* ── Read-only info card ──────────────────────────────────── */}
            {(profile.licenseNo || profile.email) && (
              <motion.div
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.16 }}
                className="glass-card rounded-2xl border border-white/5 p-5 space-y-3"
              >
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Account Information (read-only)
                </p>
                <div className="grid sm:grid-cols-3 gap-3 text-sm items-center">
                  {profile.email && (
                    <div className="flex items-center gap-2 text-slate-400">
                      <FiMail className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                      <span className="truncate">{profile.email}</span>
                    </div>
                  )}
                  {profile.doctorId && (
                    <div className="flex items-center gap-2 text-slate-400 font-mono text-xs">
                      <BadgeCheck className="w-3.5 h-3.5 text-emerald-500/60 flex-shrink-0" />
                      {profile.doctorId}
                    </div>
                  )}
                  {profile.ratingCount !== undefined && (
                    <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                      <Star className="w-4 h-4 fill-amber-400 text-amber-400 flex-shrink-0" />
                      {profile.averageRating > 0 ? `${profile.averageRating} (${profile.ratingCount} reviews)` : 'No ratings yet'}
                    </div>
                  )}
                </div>
                {profile.hospitals && profile.hospitals.length > 0 && (
                  <div className="pt-3 mt-3 border-t border-white/5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Linked Medical Facilities
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {profile.hospitals.map(h => (
                        <span key={h._id || h} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold hover:bg-indigo-500/20 transition-colors cursor-default">
                          <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                          {h.name || 'Hospital'}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

          </div>
        </PageTransition>
      </main>
    </div>
  );
};

export default DoctorProfile;
