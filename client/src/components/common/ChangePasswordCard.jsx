import React, { useState } from 'react';
import { Key, ShieldAlert, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../../api/axiosInstance';
import PasswordInput from './PasswordInput';
import PasswordStrengthMeter from './PasswordStrengthMeter';
import PasswordCriteriaTips from './PasswordCriteriaTips';
import { evaluatePasswordStrength } from '../../utils/passwordPolicy';
import { clearLocalSession } from '../../utils/sessionCleanup';

const ChangePasswordCard = ({ onComplete }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [revokeAllDevices, setRevokeAllDevices] = useState(true);

  const strength = evaluatePasswordStrength(newPassword);
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const isFormValid = currentPassword && strength.valid && passwordsMatch;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!currentPassword) {
      toast.error('Current password is required.');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('New password and confirm password do not match.');
      return;
    }

    if (!strength.valid) {
      toast.error('New password does not meet the minimum security requirements.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });

      toast.success('Password changed successfully! Active sessions have been invalidated. Please sign in again.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Clean up session and redirect
      setTimeout(() => {
        if (onComplete) onComplete();
        else {
          clearLocalSession();
          window.location.href = '/select-role';
        }
      }, 1500);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-card rounded-2xl p-6 space-y-6 border border-white/5" data-testid="change-password-card">
      <div className="flex items-center justify-between pb-3 border-b border-white/5 select-none">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-teal-400" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Credential Security</h3>
        </div>
        <span className="text-[10px] text-slate-500 font-mono uppercase">Role Authenticated</span>
      </div>

      <div className="space-y-4">
        <PasswordInput
          id="current-password-input"
          label="Current Password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Enter current password"
          autoComplete="current-password"
        />

        <div className="space-y-2">
          <PasswordInput
            id="new-password-input"
            label="New Password"
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Enter new password (min 12 chars)"
            autoComplete="new-password"
            describedBy="auth-change-meter auth-change-tips"
          />
          <PasswordStrengthMeter
            id="auth-change-meter"
            password={newPassword}
          />
        </div>

        <PasswordInput
          id="confirm-new-password-input"
          label="Confirm New Password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Re-enter new password"
          autoComplete="new-password"
          error={
            confirmPassword && !passwordsMatch
              ? 'Passwords do not match'
              : undefined
          }
        />

        <PasswordCriteriaTips
          id="auth-change-tips"
          password={newPassword}
        />

        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-white/5 flex items-start gap-2.5 text-xs text-slate-300">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-white select-none">
              <input
                type="checkbox"
                checked={revokeAllDevices}
                onChange={(e) => setRevokeAllDevices(e.target.checked)}
                className="rounded border-slate-700 text-teal-500 focus:ring-teal-400 bg-slate-800"
              />
              Terminate all other active sessions and revoke trusted devices
            </label>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              When enabled, any existing sessions on other browsers or phones will be immediately invalidated upon password rotation.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-4 border-t border-white/5">
        <button
          type="submit"
          disabled={loading || !isFormValid}
          className="glass-button text-xs py-2.5 px-6 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 text-white font-semibold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-teal-500/10"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
          {loading ? 'Updating Credentials...' : 'Rotate Password'}
        </button>
      </div>
    </form>
  );
};

export default ChangePasswordCard;
