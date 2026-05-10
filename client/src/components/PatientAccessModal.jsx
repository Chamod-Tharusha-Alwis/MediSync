import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, CheckCircle, X, Loader2, RefreshCw } from 'lucide-react';
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

  const hasRequestedOTP = useRef(false);

  // Send OTP on mount
  useEffect(() => {
    if (!hasRequestedOTP.current) {
      hasRequestedOTP.current = true;
      sendOTP();
    }
  }, []);

  // Countdown timer
  useEffect(() => {
    if (step !== 'otp') return;
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  const sendOTP = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/patient/request-access', {
        patientNic,
        requesterName,
        requesterRole,
      });
      setSessionId(res.data.sessionId);
      setStep('otp');
      setCountdown(600);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
    // Auto-submit when all 6 digits filled
    if (index === 5 && value) {
      const filled = [...newOtp.slice(0, 5), value.slice(-1)];
      if (filled.every(d => d !== '')) verifyOTP(filled.join(''));
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const verifyOTP = async (otpStr) => {
    const code = otpStr || otp.join('');
    if (code.length !== 6) { setError('Enter all 6 digits'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/patient/verify-access', {
        sessionId,
        otp: code,
        patientNic,
      });
      setStep('success');
      setTimeout(() => {
        onSuccess(res.data.accessToken);
      }, 1000);
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid OTP. Please try again.');
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
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
          initial={{ x: 60, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 60, opacity: 0 }}
          transition={{ type: 'spring', damping: 22, stiffness: 260 }}
          className="bg-[#0d1829] border border-slate-700/60 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
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
            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
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
                      maxLength={1}
                      value={digit}
                      onChange={e => handleOtpChange(i, e.target.value)}
                      onKeyDown={e => handleKeyDown(i, e)}
                      className={`w-12 h-14 text-center text-2xl font-bold rounded-xl border bg-slate-800/60 text-white outline-none transition-all
                        ${digit ? 'border-blue-500 bg-blue-500/10' : 'border-slate-700 focus:border-blue-400'}`}
                    />
                  ))}
                </div>

                {error && (
                  <p className="text-red-400 text-sm text-center mb-4">{error}</p>
                )}

                <button
                  onClick={() => verifyOTP()}
                  disabled={loading || otp.some(d => !d)}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Verify Access
                </button>

                {countdown === 0 && (
                  <button
                    onClick={sendOTP}
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
