import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mail, ArrowLeft, ShieldCheck, Clock, Loader2, AlertCircle } from 'lucide-react';
import api from '../../api/axiosInstance';
import PageTransition from '../../components/common/PageTransition';

const ROLES = [
  { value: '', label: 'Universal Account Lookup (All Roles)' },
  { value: 'doctor', label: 'Doctor / Medical Professional' },
  { value: 'patient', label: 'Patient / Citizen' },
  { value: 'hospital_admin', label: 'Hospital Administrator' },
  { value: 'pharmacy', label: 'Pharmacy Staff' },
  { value: 'admin', label: 'System Administrator' },
];

const ForgotPassword = ({ defaultRole: propRole = '' }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryRole = propRole || new URLSearchParams(location?.search || '').get('role') || '';

  const [email, setEmail] = useState('');
  const [role, setRole] = useState(queryRole);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState(null);

  // Cooldown countdown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (cooldown > 0) return;

    setLoading(true);
    setError(null);

    try {
      await api.post('/auth/forgot-password', {
        email: email.trim().toLowerCase(),
        role: role || undefined,
      });

      // Uniform success state prevents account enumeration
      setSubmitted(true);
      setCooldown(60); // 60s cooldown matches server throttle
    } catch (err) {
      if (err.response?.status === 429) {
        const retryAfter = err.response.data?.retryAfterSeconds || 60;
        setCooldown(retryAfter);
        setError(`Too many requests. Please wait ${retryAfter} seconds before requesting another recovery email.`);
      } else {
        setError(err.response?.data?.error || 'Unable to process recovery request. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  const getReturnPath = () => {
    if (role === 'doctor') return '/doctor/login';
    if (role === 'patient') return '/patient/login';
    if (role === 'hospital_admin' || role === 'hospital') return '/hospital/login';
    if (role === 'pharmacy' || role === 'pharmacist') return '/pharmacy/login';
    if (role === 'admin') return '/admin/login';
    return '/select-role';
  };

  return (
    <PageTransition className="min-h-screen flex items-center justify-center bg-[#0B0F19] p-4 font-sans text-slate-200">
      <div className="glass-panel p-8 rounded-3xl max-w-md w-full border border-white/10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-teal-500 via-cyan-500 to-indigo-500" />

        {submitted ? (
          <div className="text-center space-y-6" data-testid="forgot-password-success">
            <div className="w-16 h-16 rounded-2xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center mx-auto text-teal-400">
              <ShieldCheck className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-extrabold text-white tracking-tight">Recovery Instructions Sent</h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                If an account exists for <span className="font-semibold text-white">{email}</span>, a secure password reset link has been dispatched to your email.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/60 border border-white/5 text-xs text-slate-400 space-y-2 text-left">
              <div className="flex items-center gap-2 text-slate-300 font-semibold">
                <Clock className="w-4 h-4 text-teal-400" />
                <span>Link Expiration Notice</span>
              </div>
              <p>For your security, the recovery link is strictly valid for <strong>20 minutes</strong> and can only be used once.</p>
              <p className="text-[11px] text-slate-500">Didn't receive an email? Check your spam/junk folder or request another link once the cooldown expires.</p>
            </div>

            <div className="space-y-3 pt-2">
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                disabled={cooldown > 0}
                className="w-full py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {cooldown > 0 ? `Resend Available in ${cooldown}s` : 'Resend Recovery Email'}
              </button>

              <button
                type="button"
                onClick={() => navigate(getReturnPath())}
                className="w-full py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" /> Return to Sign In
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6" data-testid="forgot-password-form-container">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center mx-auto text-teal-400 mb-3">
                <Mail className="w-7 h-7" />
              </div>
              <h1 className="text-2xl font-extrabold text-white tracking-tight">Account Recovery</h1>
              <p className="text-sm text-slate-400">
                Enter your registered email address to receive password reset instructions.
              </p>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5 text-xs text-rose-300">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="recovery-role" className="text-xs font-semibold uppercase text-slate-400 ml-1">
                  Account Portal / Role
                </label>
                <select
                  id="recovery-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-slate-900/80 border border-white/10 rounded-xl py-2.5 px-3 text-sm text-white focus:outline-none focus:border-teal-500 transition-colors"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value} className="bg-slate-900 text-white">
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="recovery-email" className="text-xs font-semibold uppercase text-slate-400 ml-1">
                  Registered Email Address <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="recovery-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    autoComplete="email"
                    className="w-full bg-slate-900/80 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white focus:outline-none focus:border-teal-500 transition-colors placeholder:text-slate-500"
                  />
                </div>
              </div>

              <div className="pt-2 space-y-3">
                <button
                  type="submit"
                  disabled={loading || !email || cooldown > 0}
                  className="w-full py-3 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-slate-950 font-bold rounded-xl text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-teal-500/10"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  {loading ? 'Dispatching Instructions...' : cooldown > 0 ? `Please wait ${cooldown}s` : 'Send Recovery Link'}
                </button>

                <button
                  type="button"
                  onClick={() => navigate(getReturnPath())}
                  className="w-full py-2.5 text-xs text-slate-400 hover:text-white transition-colors flex items-center justify-center gap-1.5 font-medium"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </PageTransition>
  );
};

export default ForgotPassword;
