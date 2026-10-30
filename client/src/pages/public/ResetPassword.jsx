import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck, AlertTriangle, Key, Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '../../api/axiosInstance';
import PageTransition from '../../components/common/PageTransition';
import PasswordInput from '../../components/common/PasswordInput';
import PasswordStrengthMeter from '../../components/common/PasswordStrengthMeter';
import PasswordCriteriaTips from '../../components/common/PasswordCriteriaTips';
import { evaluatePasswordStrength } from '../../utils/passwordPolicy';

const ResetPassword = ({ token: propToken = '' }) => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location?.search || '');
  const rawToken = propToken || searchParams.get('token') || (typeof window !== 'undefined' ? new URLSearchParams(window.location?.search || '').get('token') : '') || '';
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [countdown, setCountdown] = useState(3);

  // Validate token structure: exactly 64 hexadecimal characters
  const isTokenFormatValid = /^[a-f0-9]{64}$/i.test(rawToken.trim());

  // Password strength evaluation
  const strength = evaluatePasswordStrength(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  useEffect(() => {
    if (!success) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          navigate('/select-role');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [success, navigate]);

  // Invalid or Missing Token State
  if (!rawToken || !isTokenFormatValid) {
    return (
      <PageTransition className="min-h-screen flex items-center justify-center bg-[#0B0F19] text-white p-4 font-sans">
        <div className="glass-panel p-8 rounded-3xl max-w-md w-full text-center border border-rose-500/20 bg-rose-500/5 shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mx-auto mb-4 text-rose-400">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold mb-2 text-white">Invalid or Expired Reset Link</h2>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed">
            This password recovery link is malformed, missing its cryptographic token, or has expired. Recovery links are valid for 20 minutes from dispatch.
          </p>
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => navigate('/forgot-password')}
              className="w-full py-2.5 bg-rose-500 hover:bg-rose-400 text-slate-950 rounded-xl text-sm font-bold transition-all"
            >
              Request New Recovery Link
            </button>
            <button
              type="button"
              onClick={() => navigate('/select-role')}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-xl text-sm font-semibold transition-all border border-white/5"
            >
              Return to Role Selection
            </button>
          </div>
        </div>
      </PageTransition>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('New password and confirmation password do not match.');
      return;
    }

    if (!strength.valid) {
      toast.error('Password does not satisfy the security requirements (minimum 12 characters, max 72 bytes, and 3 character classes).');
      return;
    }

    setLoading(true);
    try {
      // Calls POST /auth/reset-password with cryptographic token
      await api.post('/auth/reset-password', {
        token: rawToken.trim(),
        newPassword: password,
      });

      setSuccess(true);
      toast.success('Password reset successfully!');
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Failed to reset password. The link may have expired or already been used.';
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  // Successful Reset Confirmation State
  if (success) {
    return (
      <PageTransition className="min-h-screen flex items-center justify-center bg-[#0B0F19] text-white p-4 font-sans">
        <div className="glass-panel p-8 rounded-3xl max-w-md w-full text-center border border-emerald-500/20 bg-emerald-500/5 shadow-2xl space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
            <ShieldCheck className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-extrabold text-white">Password Updated!</h2>
            <p className="text-slate-300 text-sm leading-relaxed">
              Your password has been securely reset. For your security, all prior active sessions and refresh tokens have been revoked.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-white/5 text-xs text-slate-400 font-mono">
            Redirecting to sign in within {countdown} second{countdown !== 1 ? 's' : ''}...
          </div>

          <button
            type="button"
            onClick={() => navigate('/select-role')}
            className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10"
          >
            Go to Sign In Now <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="min-h-screen flex items-center justify-center bg-[#0B0F19] p-4 font-sans text-slate-200">
      <div className="glass-panel p-8 rounded-3xl max-w-md w-full border border-white/10 shadow-2xl relative overflow-hidden space-y-6">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-teal-500 to-cyan-500" />

        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mx-auto text-teal-400 mb-3">
            <Key className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Set New Password</h1>
          <p className="text-sm text-slate-400">
            Create a strong, unique password for your MediSync account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <PasswordInput
              id="reset-new-password"
              label="New Password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password (min 12 chars)"
              autoComplete="new-password"
              describedBy="reset-password-meter reset-password-tips"
            />
            <PasswordStrengthMeter
              id="reset-password-meter"
              password={password}
            />
          </div>

          <div className="space-y-1.5">
            <PasswordInput
              id="reset-confirm-password"
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
          </div>

          <PasswordCriteriaTips
            id="reset-password-tips"
            password={password}
          />

          <div className="p-3 rounded-xl bg-slate-900/40 border border-white/5 text-[11px] text-slate-400 leading-relaxed">
            <span className="font-semibold text-slate-300">Security Invariant:</span> Updating your password terminates all active sessions across all devices and requires re-authentication.
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || !password || !confirmPassword || (confirmPassword && password !== confirmPassword)}
              className="w-full py-3 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-slate-950 font-bold rounded-xl text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-teal-500/10"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {loading ? 'Securing Account...' : 'Update Password & Sign In'}
            </button>
          </div>
        </form>
      </div>
    </PageTransition>
  );
};

export default ResetPassword;
