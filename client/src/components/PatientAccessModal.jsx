import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, CheckCircle, X, Loader2, RefreshCw } from 'lucide-react';
import useModalFocus from '../hooks/useModalFocus';
import api from '../api/axiosInstance';

/**
 * PatientAccessModal — OTP verification for accessing patient records
 *
 * Props:
 *   patientNic: string — the NIC being accessed
 *   requesterName: string — name of the requesting doctor/pharmacist
 *   requesterRole: string — 'doctor' | 'pharmacist' | 'hospital_admin'
 *   onSuccess: (accessToken: string) => void — called with the temp token
 *   onClose: () => void
 */
const PatientAccessModal = ({ patientNic, requesterName, requesterRole, onSuccess, onClose }) => {
  const [step, setStep] = useState('sending'); // sending | otp | success
  const [sessionId, setSessionId] = useState(null);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(600); // 10 minutes in seconds
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRefs = useRef([]);

  const generation = useRef(0);
  const busy = useRef(false);
  const pending = useRef(null);
  const callbacks = useRef({ onSuccess });
  callbacks.current = { onSuccess };
  const dialogRef = useModalFocus(true, onClose);
  const expiresAt = useRef(0);

  // Defer the initial send one tick so StrictMode's probe cannot send a second OTP.
  useEffect(() => {
    const id = ++generation.current;
    setStep('sending'); setError(''); setOtp(['', '', '', '', '', '']);
    const timer = setTimeout(() => sendOTP(id), 0);
    return () => { clearTimeout(timer); generation.current++; pending.current?.abort(); busy.current = false; };
    // Identity changes retire every response from the previous patient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientNic, requesterName, requesterRole]);

  useEffect(() => {
    if (step !== 'otp') return undefined;
    const tick = () => setCountdown(Math.max(0, Math.ceil((expiresAt.current - Date.now()) / 1000)));
    tick(); const timer = setInterval(tick, 1000);
    inputRefs.current[0]?.focus();
    return () => clearInterval(timer);
  }, [step]);

  const sendOTP = async (id = generation.current) => {
    if (busy.current) return;
    busy.current = true; setLoading(true); setError(''); setStep('sending');
    pending.current = new AbortController();
    try {
      const res = await api.post('/patient/request-access', { patientNic, requesterName, requesterRole }, { signal: pending.current.signal });
      if (id !== generation.current) return;
      if (!res.data.sessionId) throw new Error('Missing verification session');
      setSessionId(res.data.sessionId); setOtp(['', '', '', '', '', '']);
      expiresAt.current = Date.now() + 600000; setCountdown(600); setStep('otp');
    } catch (err) {
      if (id !== generation.current) return;
      setStep('error'); setError('Unable to request verification. Please retry or close this dialog.');
    } finally { if (id === generation.current) { busy.current = false; setLoading(false); } }
  };

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value) || loading) return;
    const next = [...otp];
    value.slice(0, 6 - index).split('').forEach((digit, offset) => { next[index + offset] = digit; });
    if (!value) next[index] = '';
    setOtp(next);
    if (value) inputRefs.current[Math.min(index + value.length, 5)]?.focus();
  };
  const handleKeyDown = (index, event) => {
    if (event.key === 'Backspace' && !otp[index] && index > 0) inputRefs.current[index - 1]?.focus();
  };
  const verifyOTP = async () => {
    if (busy.current) return;
    if (!sessionId || Date.now() >= expiresAt.current) { setCountdown(0); setError('Verification expired. Request a new code.'); return; }
    const code = otp.join('');
    if (!/^\d{6}$/.test(code)) { setError('Enter all 6 digits'); return; }
    const id = generation.current;
    busy.current = true; setLoading(true); setError('');
    pending.current = new AbortController();
    try {
      const res = await api.post('/patient/verify-access', { sessionId, otp: code, patientNic }, { signal: pending.current.signal });
      if (id !== generation.current) return;
      if (!res.data.accessToken) throw new Error('Missing access grant');
      setStep('success');
      callbacks.current.onSuccess(res.data.accessToken);
    } catch (err) {
      if (id !== generation.current) return;
      setError('Verification was not accepted. Check the code or request a new one.');
      setOtp(['', '', '', '', '', '']); inputRefs.current[0]?.focus();
    } finally { if (id === generation.current) { busy.current = false; setLoading(false); } }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const circumference = 2 * Math.PI * 28;
  const timerProgress = (countdown / 600) * circumference;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          ref={dialogRef} role="dialog" aria-modal="true" aria-label="Patient verification" tabIndex={-1}
          initial={{ x: 60, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 60, opacity: 0 }}
          transition={{ type: 'spring', damping: 22, stiffness: 260 }}
          className="glass-modal w-full max-w-md overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/60">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Shield className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h2 className="text-white font-bold text-base">Patient Verification Required</h2>
                <p className="text-slate-400 text-xs">NIC: {patientNic}</p>
              </div>
            </div>
            <button type="button" aria-label="Close verification" onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-6">
            {/* Step: Sending */}
            {step === 'sending' && (
              <div className="text-center py-8">
                <Loader2 className="w-10 h-10 text-blue-400 animate-spin mx-auto mb-4" />
                <p className="text-white font-medium">Sending OTP to patient…</p>
                <p className="text-slate-400 text-sm mt-2">The patient will receive a verification code via email.</p>
              </div>
            )}

            {step === 'error' && <div><p role="alert">{error}</p><button type="button" disabled={loading} onClick={() => sendOTP()}>Retry verification request</button></div>}
            {/* Step: OTP Entry */}
            {step === 'otp' && (
              <>
                <div className="text-center mb-6">
                  <div className="relative inline-flex items-center justify-center mb-3">
                    <svg width="72" height="72" className="-rotate-90">
                      <circle cx="36" cy="36" r="28" fill="none" stroke="#1e293b" strokeWidth="5" />
                      <circle
                        cx="36" cy="36" r="28"
                        fill="none"
                        stroke={countdown > 60 ? '#3b82f6' : '#ef4444'}
                        strokeWidth="5"
                        strokeDasharray={circumference}
                        strokeDashoffset={circumference - timerProgress}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
                      />
                    </svg>
                    <span className={`absolute text-lg font-bold tabular-nums ${countdown > 60 ? 'text-blue-400' : 'text-red-400'}`}>
                      {formatTime(countdown)}
                    </span>
                  </div>
                  <p className="text-white font-medium">Enter the 6-digit code</p>
                  <p className="text-slate-400 text-sm mt-1">
                    Sent to patient's registered email address
                  </p>
                </div>

                {/* OTP Inputs */}
                <div className="flex gap-2 justify-center mb-5">
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      ref={el => inputRefs.current[i] = el}
                      type="text"
                      inputMode="numeric"
                      aria-label={`Verification digit ${i + 1}`}
                      disabled={loading || countdown === 0}
                      value={digit}
                      onChange={e => handleOtpChange(i, e.target.value)}
                      onKeyDown={e => handleKeyDown(i, e)}
                      className={`glass-input w-12 h-14 text-center text-2xl font-bold rounded-xl border outline-none transition-all
                        ${digit ? 'border-blue-500 bg-blue-500/10 glow-teal' : 'border-white/10 focus:border-blue-400'}`}
                    />
                  ))}
                </div>

                {error && (
                  <p role="alert" className="text-red-400 text-sm text-center mb-4">{error}</p>
                )}

                <button
                  onClick={() => verifyOTP()}
                  disabled={loading || countdown === 0 || otp.some(d => !d)}
                  className="glass-button w-full py-3 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Verify Access
                </button>

                {countdown === 0 && (
                  <button
                    onClick={() => sendOTP()}
                    disabled={loading}
                    className="w-full mt-3 py-2.5 text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-xl transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Resend OTP
                  </button>
                )}
              </>
            )}

            {/* Step: Success */}
            {step === 'success' && (
              <div className="text-center py-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 15 }}
                  className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4"
                >
                  <CheckCircle className="w-9 h-9 text-emerald-400" />
                </motion.div>
                <p className="text-white font-bold text-lg">Access Granted!</p>
                <p className="text-slate-400 text-sm mt-2">Loading patient information…</p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PatientAccessModal;
