import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Shield, Phone, Heart, Lock, Save, Loader2,
  AlertCircle, Stethoscope, Weight, Ruler, X, Plus,
} from 'lucide-react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import PageTransition from '../../components/common/PageTransition';

/* ─── shared input class ──────────────────────────────────────────────────── */
const inputCls =
  'w-full px-4 py-3 bg-slate-900/60 border border-white/10 rounded-xl ' +
  'text-slate-100 placeholder:text-slate-500 ' +
  'focus:outline-none focus:border-pink-500/60 focus:bg-slate-900/80 ' +
  'transition-all duration-200';

const labelCls = 'block text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5';

/* ─── Section tab config ──────────────────────────────────────────────────── */
const TABS = [
  { key: 'edit',      label: 'Edit Profile',      icon: User },
  { key: 'emergency', label: 'Emergency Contact',  icon: Phone },
  { key: 'security',  label: 'Security',           icon: Lock },
];

/* ─── Blood group options ─────────────────────────────────────────────────── */
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

/* ═══════════════════════════════════════════════════════════════════════════
   AllergyTags — inline tag editor
   ══════════════════════════════════════════════════════════════════════════ */
const AllergyTags = ({ tags, onChange }) => {
  const [input, setInput] = useState('');

  const add = () => {
    const val = input.trim();
    if (!val || tags.includes(val)) return;
    onChange([...tags, val]);
    setInput('');
  };

  const remove = (tag) => onChange(tags.filter(t => t !== tag));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 min-h-[2.5rem] p-2 bg-slate-900/60 border border-white/10 rounded-xl">
        {tags.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/30 text-red-300 text-xs font-semibold"
          >
            {tag}
            <button
              type="button"
              onClick={() => remove(tag)}
              className="text-red-400 hover:text-red-200 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {tags.length === 0 && (
          <span className="text-slate-600 text-xs self-center pl-1">No allergies added</span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder="Type an allergy and press Enter or +"
          className={inputCls + ' flex-1'}
        />
        <button
          type="button"
          onClick={add}
          className="px-3 py-2 rounded-xl bg-rose-600/20 border border-rose-500/30 text-rose-400 hover:bg-rose-600/35 transition-all"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   Main component
   ══════════════════════════════════════════════════════════════════════════ */
const PatientProfile = () => {
  const [patient,  setPatient]  = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [activeTab, setActiveTab] = useState('edit');

  /* ── Editable form state ── */
  const [form, setForm] = useState({
    contactInfo:  '',
    bloodGroup:   '',
    height:       '',
    weight:       '',
    allergies:    [],
  });

  const [emergency, setEmergency] = useState({
    name: '', relationship: '', phone: '',
  });

  const [passwords, setPasswords] = useState({
    current: '', newPassword: '', confirmPassword: '',
  });

  const nic = localStorage.getItem('nic')
    || (() => { try { return JSON.parse(localStorage.getItem('user') || '{}').nic; } catch { return ''; } })();

  /* ── Load patient data ── */
  useEffect(() => {
    if (!nic) return;
    api.get(`/patient/${nic}`)
      .then(res => {
        const d = res.data.data?.patient || res.data.data || res.data;
        setPatient(d);
        setForm({
          contactInfo: d.contactInfo || '',
          bloodGroup:  d.bloodGroup  || '',
          height:      d.height      != null ? String(d.height) : '',
          weight:      d.weight      != null ? String(d.weight) : '',
          allergies:   Array.isArray(d.allergies) ? d.allergies : [],
        });
        if (d.emergencyContact) setEmergency(d.emergencyContact);
      })
      .catch(() => toast.error('Failed to load profile'))
      .finally(() => setLoading(false));
  }, [nic]);

  /* ── Save main profile ── */
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        contactInfo:  form.contactInfo,
        bloodGroup:   form.bloodGroup,
        allergies:    form.allergies,
        ...(form.height ? { height: Number(form.height) } : {}),
        ...(form.weight ? { weight: Number(form.weight) } : {}),
      };
      const res = await api.put('/patient/profile', payload);
      // Refresh local patient state with what the server returned
      const updated = res.data.data;
      if (updated) setPatient(updated);
      toast.success('Profile saved successfully!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  /* ── Save emergency contact ── */
  const handleSaveEmergency = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put('/patient/profile', { emergencyContact: emergency });
      toast.success('Emergency contact updated!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  /* ── Change password ── */
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
        newPassword:     passwords.newPassword,
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
    if (level === 'high')   return 'text-red-400 bg-red-500/20 border-red-500/30';
    if (level === 'medium') return 'text-amber-400 bg-amber-500/20 border-amber-500/30';
    return 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30';
  };

  /* ── Guards ── */
  if (loading) return (
    <div className="flex h-full items-center justify-center p-20">
      <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!patient) return (
    <div className="p-8 text-center text-slate-400">
      <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
      <p>Unable to load profile data.</p>
    </div>
  );

  const bmi =
    form.height && form.weight
      ? (Number(form.weight) / Math.pow(Number(form.height) / 100, 2)).toFixed(1)
      : null;

  return (
    <PageTransition className="p-4 md:p-8">
      {/* ── Page header ── */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">My Profile</h1>
        <p className="text-slate-400 mt-1">Manage your personal information and health data.</p>
      </div>

      {/* ── Hero card ── */}
      <div className="glass-panel rounded-2xl p-6 mb-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-6 opacity-5">
          <Shield className="w-40 h-40 text-pink-500" />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-6">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 border border-pink-500/30 flex items-center justify-center text-3xl font-black text-pink-400 select-none">
            {patient.fullName?.charAt(0) || '?'}
          </div>

          <div className="flex-1">
            <h2 className="text-2xl font-bold text-white">{patient.fullName}</h2>
            <p className="text-slate-400 text-sm mt-0.5">NIC: {patient.nic}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {patient.bloodGroup && (
                <span className="text-xs px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full font-semibold">
                  <Heart className="w-3 h-3 inline mr-1" />{patient.bloodGroup}
                </span>
              )}
              {patient.gender && (
                <span className="text-xs px-3 py-1.5 bg-slate-800 text-slate-300 border border-slate-700 rounded-full font-semibold">
                  {patient.gender}
                </span>
              )}
              {patient.district && (
                <span className="text-xs px-3 py-1.5 bg-slate-800 text-slate-300 border border-slate-700 rounded-full font-semibold">
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

          {/* BMI + risk score column */}
          <div className="flex gap-6 text-center">
            {bmi && (
              <div>
                <p className="text-xs text-slate-500 uppercase font-bold">BMI</p>
                <p className="text-2xl font-black text-white">{bmi}</p>
                <p className="text-[10px] text-slate-500">
                  {bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese'}
                </p>
              </div>
            )}
            {patient.riskScore !== undefined && (
              <div>
                <p className="text-xs text-slate-500 uppercase font-bold">Risk Score</p>
                <p className="text-2xl font-black text-white">{patient.riskScore}</p>
              </div>
            )}
          </div>
        </div>

        {/* Allergies preview row */}
        {patient.allergies?.length > 0 && (
          <div className="mt-5 pt-5 border-t border-slate-700/50">
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Known Allergies</p>
            <div className="flex flex-wrap gap-2">
              {patient.allergies.map((a, i) => (
                <span key={i} className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-xs font-semibold border border-red-500/30">
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Chronic conditions preview row */}
        {patient.chronicConditions?.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Chronic Conditions</p>
            <div className="flex flex-wrap gap-2">
              {patient.chronicConditions.map((c, i) => (
                <span key={i} className="px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-xs font-semibold border border-amber-500/30">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Tab switcher ── */}
      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map(t => (
          <button
            key={t.key}
            id={`tab-${t.key}`}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border transition-all duration-200 ${
              activeTab === t.key
                ? 'bg-pink-500/20 text-pink-400 border-pink-500/30'
                : 'bg-slate-800/40 text-slate-400 border-slate-700/50 hover:border-slate-600 hover:text-slate-300'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TAB: Edit Profile
          ══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence mode="wait">
        {activeTab === 'edit' && (
          <motion.form
            key="edit"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
            onSubmit={handleSaveProfile}
            className="glass-panel rounded-2xl p-6 space-y-8"
          >
            <div>
              <h3 className="text-lg font-bold text-white mb-1">Basic Information</h3>
              <p className="text-slate-500 text-xs">Contact details visible to your healthcare providers.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Read-only fields */}
              <div>
                <label className={labelCls}>Full Name</label>
                <div className={inputCls + ' text-slate-400 cursor-not-allowed opacity-60'}>{patient.fullName}</div>
              </div>
              <div>
                <label className={labelCls}>NIC</label>
                <div className={inputCls + ' text-slate-400 cursor-not-allowed opacity-60'}>{patient.nic}</div>
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <div className={inputCls + ' text-slate-400 cursor-not-allowed opacity-60'}>{patient.email || '—'}</div>
              </div>

              {/* Editable: Contact Number */}
              <div>
                <label htmlFor="contactInfo" className={labelCls}>Contact Number</label>
                <input
                  id="contactInfo"
                  type="tel"
                  value={form.contactInfo}
                  onChange={e => setForm(f => ({ ...f, contactInfo: e.target.value }))}
                  placeholder="+94 77 123 4567"
                  className={inputCls}
                />
              </div>
            </div>

            {/* ── Medical Data ── */}
            <div>
              <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-pink-400" />
                Medical Data
              </h3>
              <p className="text-slate-500 text-xs mb-5">Used to calculate BMI and assist your care team.</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                {/* Blood Group */}
                <div>
                  <label htmlFor="bloodGroup" className={labelCls}>Blood Group</label>
                  <select
                    id="bloodGroup"
                    value={form.bloodGroup}
                    onChange={e => setForm(f => ({ ...f, bloodGroup: e.target.value }))}
                    className={inputCls + ' cursor-pointer'}
                  >
                    <option value="">— Select —</option>
                    {BLOOD_GROUPS.map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>

                {/* Height */}
                <div>
                  <label htmlFor="height" className={labelCls}>
                    <Ruler className="w-3 h-3 inline mr-1" />Height (cm)
                  </label>
                  <input
                    id="height"
                    type="number"
                    min="50"
                    max="300"
                    step="0.1"
                    value={form.height}
                    onChange={e => setForm(f => ({ ...f, height: e.target.value }))}
                    placeholder="e.g. 170"
                    className={inputCls}
                  />
                </div>

                {/* Weight */}
                <div>
                  <label htmlFor="weight" className={labelCls}>
                    <Weight className="w-3 h-3 inline mr-1" />Weight (kg)
                  </label>
                  <input
                    id="weight"
                    type="number"
                    min="1"
                    max="500"
                    step="0.1"
                    value={form.weight}
                    onChange={e => setForm(f => ({ ...f, weight: e.target.value }))}
                    placeholder="e.g. 65"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* BMI live preview */}
              {bmi && (
                <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-500/10 border border-teal-500/20">
                  <span className="text-teal-400 text-sm font-bold">BMI: {bmi}</span>
                  <span className="text-slate-400 text-xs">
                    — {bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal weight' : bmi < 30 ? 'Overweight' : 'Obese'}
                  </span>
                </div>
              )}
            </div>

            {/* ── Known Allergies ── */}
            <div>
              <label className={labelCls}>
                <Heart className="w-3 h-3 inline mr-1 text-red-400" />
                Known Allergies
              </label>
              <AllergyTags
                tags={form.allergies}
                onChange={tags => setForm(f => ({ ...f, allergies: tags }))}
              />
              <p className="text-slate-600 text-xs mt-1.5">Type a substance and press Enter or + to add. Click × to remove.</p>
            </div>

            {/* ── Save button ── */}
            <div className="pt-2 border-t border-slate-700/50">
              <button
                id="save-profile-btn"
                type="submit"
                disabled={saving}
                className="flex items-center gap-2.5 px-7 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 shadow-[0_4px_20px_rgba(244,63,94,0.30)] hover:shadow-[0_4px_28px_rgba(244,63,94,0.45)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving…' : 'Save Profile'}
              </button>
            </div>
          </motion.form>
        )}

        {/* ═════════════════════════════════════════════════════════════════
            TAB: Emergency Contact
            ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'emergency' && (
          <motion.form
            key="emergency"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
            onSubmit={handleSaveEmergency}
            className="glass-panel rounded-2xl p-6"
          >
            <h3 className="text-lg font-bold text-white mb-1">Emergency Contact</h3>
            <p className="text-slate-500 text-xs mb-6">This person will be contacted in a medical emergency.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
              <div>
                <label htmlFor="ec-name" className={labelCls}>Contact Name</label>
                <input
                  id="ec-name"
                  type="text"
                  value={emergency.name}
                  onChange={e => setEmergency(ec => ({ ...ec, name: e.target.value }))}
                  placeholder="Full name"
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="ec-relationship" className={labelCls}>Relationship</label>
                <input
                  id="ec-relationship"
                  type="text"
                  value={emergency.relationship}
                  onChange={e => setEmergency(ec => ({ ...ec, relationship: e.target.value }))}
                  placeholder="e.g. Spouse, Parent, Sibling"
                  className={inputCls}
                />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="ec-phone" className={labelCls}>Phone Number</label>
                <input
                  id="ec-phone"
                  type="tel"
                  value={emergency.phone}
                  onChange={e => setEmergency(ec => ({ ...ec, phone: e.target.value }))}
                  placeholder="+94 77 123 4567"
                  className={inputCls}
                />
              </div>
            </div>

            <div className="pt-2 border-t border-slate-700/50">
              <button
                id="save-emergency-btn"
                type="submit"
                disabled={saving}
                className="flex items-center gap-2.5 px-7 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 shadow-[0_4px_20px_rgba(244,63,94,0.30)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving…' : 'Save Emergency Contact'}
              </button>
            </div>
          </motion.form>
        )}

        {/* ═════════════════════════════════════════════════════════════════
            TAB: Security
            ══════════════════════════════════════════════════════════════ */}
        {activeTab === 'security' && (
          <motion.form
            key="security"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
            onSubmit={handleChangePassword}
            className="glass-panel rounded-2xl p-6"
          >
            <h3 className="text-lg font-bold text-white mb-1">Change Password</h3>
            <p className="text-slate-500 text-xs mb-6">Use a strong password — at least 8 characters with mixed case and numbers.</p>

            <div className="space-y-5 max-w-md">
              {[
                { id: 'pw-current', label: 'Current Password', key: 'current',         placeholder: '••••••••' },
                { id: 'pw-new',     label: 'New Password',     key: 'newPassword',     placeholder: '••••••••' },
                { id: 'pw-confirm', label: 'Confirm Password', key: 'confirmPassword', placeholder: '••••••••' },
              ].map(({ id, label, key, placeholder }) => (
                <div key={key}>
                  <label htmlFor={id} className={labelCls}>{label}</label>
                  <input
                    id={id}
                    type="password"
                    required
                    value={passwords[key]}
                    onChange={e => setPasswords(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className={inputCls}
                  />
                </div>
              ))}

              <div className="pt-2 border-t border-slate-700/50">
                <button
                  id="change-password-btn"
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2.5 px-7 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 shadow-[0_4px_20px_rgba(244,63,94,0.30)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                  {saving ? 'Updating…' : 'Update Password'}
                </button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </PageTransition>
  );
};

export default PatientProfile;
