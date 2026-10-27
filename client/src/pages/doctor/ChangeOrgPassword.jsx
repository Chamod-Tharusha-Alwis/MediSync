import { useTranslation } from '../../i18n/LanguageContext';
import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, Eye, EyeOff, Loader2, CheckCircle, ShieldCheck } from 'lucide-react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import { clearLocalSession } from '../../utils/sessionCleanup';

/**
 * ChangeOrgPassword — Change hospital org login password on first login
 * Route: /doctor/change-org-password?orgLoginId=...
 */
const ChangeOrgPassword = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orgLoginId = searchParams.get('orgLoginId');

  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const getStrength = (pw) => {
    let score = 0;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score;
  };

  const strength = getStrength(passwords.newPassword);
  const strengthLabels = ['Weak', 'Fair', 'Good', 'Strong'];
  const strengthColors = ['bg-red-500', 'bg-amber-500', 'bg-yellow-400', 'bg-emerald-500'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (!passwords.currentPassword || passwords.newPassword.length < 12 || strength < 3) {
      toast.error('Enter your current organization password and a new password of at least 12 characters with mixed character types.');
      return;
    }
    if (!orgLoginId) {
      toast.error('Invalid session. Please login again.');
      navigate('/doctor/login?type=hospital');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/change-org-password', {
        orgLoginId,
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword,
      });
      clearLocalSession();
      toast.success('Password updated! Please login with your new credentials.');
      navigate('/doctor/login?type=hospital');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  const requirements = [
    { label: 'At least 12 characters', met: passwords.newPassword.length >= 12 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(passwords.newPassword) },
    { label: 'One number', met: /[0-9]/.test(passwords.newPassword) },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b1120] px-4"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Card */}
        <div className="bg-slate-900/80 border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-sm">
          {/* Header */}
          <div className="px-8 py-6 bg-gradient-to-r from-teal-900/60 to-cyan-900/60 border-b border-slate-700/60">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-teal-500/20 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-teal-400" />
              </div>
              <div>
                <h1 className="text-white text-xl font-bold">{t('auth.changeOrgPasswordTitle', 'Set Your Hospital Password')}</h1>
                <p className="text-slate-400 text-sm">One-time setup for your hospital account</p>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">
            <label className="block text-sm text-slate-300">
              Current organization password
              <input type="password" autoComplete="current-password" required value={passwords.currentPassword}
                onChange={e => setPasswords({ ...passwords, currentPassword: e.target.value })}
                className="mt-2 w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white" />
            </label>
            <p className="text-slate-400 text-sm leading-relaxed">
              For security, you must set a new password before accessing the hospital portal.
            </p>

            {/* {t("auth.newPassword", "New Password")} */}
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">New Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type={showNew ? 'text' : 'password'}
                  required
                  value={passwords.newPassword}
                  onChange={e => setPasswords({ ...passwords, newPassword: e.target.value })}
                  className="w-full pl-10 pr-10 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-teal-500/70 focus:ring-1 focus:ring-teal-500/30 transition-all"
                  placeholder="Enter new password"
                />
                <button type="button" onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Strength meter */}
              {passwords.newPassword && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[0, 1, 2, 3].map(i => (
                      <div key={i}
                        className={`h-1.5 flex-1 rounded-full transition-all ${i < strength ? strengthColors[strength - 1] : 'bg-slate-700'}`} />
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">Strength: <span className="font-semibold text-white">{strengthLabels[strength - 1] || 'Very Weak'}</span></p>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="text-sm font-medium text-slate-300 mb-2 block">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type={showConfirm ? 'text' : 'password'}
                  required
                  value={passwords.confirmPassword}
                  onChange={e => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                  className={`w-full pl-10 pr-10 py-3 bg-slate-800/50 border rounded-xl text-white placeholder-slate-500 focus:outline-none transition-all ${
                    passwords.confirmPassword && passwords.confirmPassword !== passwords.newPassword
                      ? 'border-red-500/60 focus:border-red-500'
                      : 'border-slate-700 focus:border-teal-500/70 focus:ring-1 focus:ring-teal-500/30'
                  }`}
                  placeholder="Confirm new password"
                />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Requirements */}
            <div className="space-y-1.5">
              {requirements.map(req => (
                <div key={req.label} className="flex items-center gap-2">
                  <CheckCircle className={`w-3.5 h-3.5 transition-colors ${req.met ? 'text-emerald-400' : 'text-slate-600'}`} />
                  <span className={`text-xs ${req.met ? 'text-slate-300' : 'text-slate-500'}`}>{req.label}</span>
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={loading || !passwords.currentPassword || passwords.newPassword.length < 12 || strength < 3 || passwords.newPassword !== passwords.confirmPassword}
              className="w-full py-3 bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              Set Password & Login
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default ChangeOrgPassword;
