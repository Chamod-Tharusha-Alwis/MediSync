import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from '../../i18n/LanguageContext';
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Clock,
  Download,
  Loader2,
  FileText,
  User,
  Building,
  Calendar,
  Lock,
  Unlock,
  ArrowLeft,
  Pill,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Activity,
  RefreshCw,
} from 'lucide-react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import { formatSriLankaDateTime } from '../../utils/sriLankaTime';

export default function VerifyConsultation() {
  const { token } = useParams();
  const { t } = useTranslation();

  // Verification metadata state
  const [loading, setLoading] = useState(true);
  const [record, setRecord] = useState(null);
  const [errorStatus, setErrorStatus] = useState(null); // 'REVOKED' | 'EXPIRED' | 'NOT_FOUND' | 'ERROR'

  // OTP workflow state
  const [otp, setOtp] = useState('');
  const [maskedContact, setMaskedContact] = useState('');
  const [otpRequesting, setOtpRequesting] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState(null);
  const [isLocked, setIsLocked] = useState(false);

  // Unlocked clinical & release state (held purely in-memory)
  const [sessionToken, setSessionToken] = useState(null);
  const [clinicalData, setClinicalData] = useState(null);
  const [releaseData, setReleaseData] = useState(null);
  const [sessionSecondsLeft, setSessionSecondsLeft] = useState(0);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const otpInputRef = useRef(null);
  const initialOtpSentRef = useRef(false);

  // 1. Initial verification token lookup
  useEffect(() => {
    let active = true;

    const fetchVerification = async () => {
      setLoading(true);
      setErrorStatus(null);
      try {
        const res = await api.get(`/verify/${token}`);
        if (active) {
          setRecord(res.data);
          if (res.data.maskedContact) {
            setMaskedContact(res.data.maskedContact);
          }
        }
      } catch (err) {
        if (!active) return;
        const status = err.response?.status;
        const reason = err.response?.data?.reason;

        if (status === 410 || reason === 'TOKEN_REVOKED') {
          setErrorStatus('REVOKED');
        } else if (reason === 'TOKEN_EXPIRED') {
          setErrorStatus('EXPIRED');
        } else if (status === 404 || reason === 'TOKEN_NOT_FOUND') {
          setErrorStatus('NOT_FOUND');
        } else {
          setErrorStatus('ERROR');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    if (token) {
      fetchVerification();
    } else {
      setLoading(false);
      setErrorStatus('NOT_FOUND');
    }

    return () => {
      active = false;
    };
  }, [token]);

  // 2. Automatically request OTP once authentic token is loaded
  useEffect(() => {
    if (record && record.valid && !initialOtpSentRef.current && !sessionToken) {
      initialOtpSentRef.current = true;
      handleRequestOtp(true);
    }
  }, [record, sessionToken]);

  // 3. Cooldown timer countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // 4. In-memory session expiry countdown (10 minutes)
  useEffect(() => {
    if (!sessionToken || sessionSecondsLeft <= 0) return;
    const timer = setInterval(() => {
      setSessionSecondsLeft((prev) => {
        if (prev <= 1) {
          handleLockNow('Session expired. Clinical details locked.');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [sessionToken, sessionSecondsLeft]);

  // Request / Resend OTP
  const handleRequestOtp = async (isAuto = false) => {
    if (cooldown > 0 && !isAuto) return;
    setOtpRequesting(true);
    setIsLocked(false);
    setAttemptsRemaining(null);

    try {
      const res = await api.post(`/verify/${token}/otp/request`);
      if (res.data.maskedContact) {
        setMaskedContact(res.data.maskedContact);
      }
      setCooldown(res.data.cooldownSeconds || 60);
      if (!isAuto) {
        toast.success(t('verification.otpSentHelp', 'Verification code sent to registered contact.'));
      }
      setTimeout(() => otpInputRef.current?.focus(), 100);
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;
      if (status === 429) {
        setCooldown(data?.remainingSeconds || 60);
        toast.info(data?.message || 'Please wait before requesting another code.');
      } else {
        toast.error(data?.message || 'Unable to send verification OTP right now.');
      }
    } finally {
      setOtpRequesting(false);
    }
  };

  // Submit OTP & Unlock Clinical + Release Data
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    const cleanOtp = otp.trim();
    if (!cleanOtp || cleanOtp.length < 6) {
      return toast.error('Please enter the full 6-digit code.');
    }

    setOtpVerifying(true);
    try {
      const res = await api.post(`/verify/${token}/otp/verify`, { otp: cleanOtp });
      if (res.data.success && res.data.clinical) {
        setSessionToken(res.data.sessionToken);
        setClinicalData(res.data.clinical);
        setReleaseData(res.data.release);
        setSessionSecondsLeft(res.data.expiresInSeconds || 600);
        setOtp('');
        toast.success('Identity verified. Clinical records unlocked.');
      }
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;

      if (status === 429 || data?.error === 'OTP_LOCKED') {
        setIsLocked(true);
        toast.error('Maximum verification attempts exceeded. Code has been locked.');
      } else if (data?.attemptsRemaining !== undefined) {
        setAttemptsRemaining(data.attemptsRemaining);
        toast.error(data.message || 'Incorrect verification code.');
        setOtp('');
        otpInputRef.current?.focus();
      } else {
        toast.error(data?.message || 'Verification failed. Please try again.');
      }
    } finally {
      setOtpVerifying(false);
    }
  };

  // Download Medical History PDF using in-memory session token
  const handleDownloadHistory = async () => {
    if (!sessionToken) return;
    setDownloadingPdf(true);

    try {
      const response = await api.post(
        `/verify/${token}/history-pdf`,
        { sessionToken },
        {
          headers: { Authorization: `Bearer ${sessionToken}` },
          responseType: 'blob',
        }
      );

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `MediSync-Clinical-History-${record.consultationRef || 'Record'}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Medical history PDF downloaded successfully.');
    } catch (err) {
      const status = err.response?.status;
      if (status === 503) {
        toast.error('PDF export temporarily unavailable.');
      } else {
        toast.error('Failed to download medical history PDF.');
      }
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Lock Now / Clear in-memory session
  const handleLockNow = (msg) => {
    setSessionToken(null);
    setClinicalData(null);
    setReleaseData(null);
    setSessionSecondsLeft(0);
    setOtp('');
    setAttemptsRemaining(null);
    if (msg) toast.info(msg);
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto w-full space-y-6">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs font-semibold text-teal-400 hover:text-teal-300 transition-colors p-2 -ml-2 rounded-lg"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>MediSync Home</span>
          </Link>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="glass-card rounded-2xl p-8 border border-slate-800 text-center space-y-4">
            <Loader2 className="w-8 h-8 text-teal-400 animate-spin mx-auto" />
            <p className="text-xs text-slate-400">Verifying cryptographic clinical token authenticity…</p>
          </div>
        )}

        {/* Error / Invalid Token States */}
        {!loading && errorStatus && (
          <div
            data-testid="verification-error-card"
            className="glass-card rounded-2xl p-8 border border-rose-500/30 bg-rose-950/20 text-center space-y-4"
          >
            <div className="w-14 h-14 rounded-full bg-rose-500/20 flex items-center justify-center mx-auto text-rose-400">
              {errorStatus === 'REVOKED' ? (
                <ShieldAlert className="w-8 h-8" />
              ) : errorStatus === 'EXPIRED' ? (
                <Clock className="w-8 h-8" />
              ) : (
                <AlertTriangle className="w-8 h-8" />
              )}
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-bold text-white">
                {errorStatus === 'REVOKED'
                  ? t('verification.revoked', 'Consultation Record Revoked')
                  : errorStatus === 'EXPIRED'
                  ? t('verification.expired', 'Verification Link Expired')
                  : t('verification.notFound', 'Record Not Found or Invalid Token')}
              </h2>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                {errorStatus === 'REVOKED'
                  ? 'This clinical consultation verification token has been explicitly revoked by the treating clinician or patient.'
                  : errorStatus === 'EXPIRED'
                  ? 'This verification token has expired. Request a renewed verification link from the consulting physician.'
                  : 'The provided verification token is invalid, malformed, or has been removed from the platform registry.'}
              </p>
            </div>
          </div>
        )}

        {/* Valid Verified Record */}
        {!loading && record && record.valid && (
          <div className="space-y-6" data-testid="verification-view">
            {/* Authenticity Header Card */}
            <div className="glass-card rounded-2xl p-6 border border-teal-500/40 bg-teal-950/20 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400 shrink-0">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-base font-bold text-white">
                    {t('verification.verified', 'Authentic Clinical Consultation Record')}
                  </h1>
                  <p className="text-xs text-teal-300/80">
                    Cryptographically verified against the official MediSync medical register.
                  </p>
                </div>
              </div>

              {/* Verified Metadata Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-teal-400" />
                    {t('verification.consultationRef', 'Consultation Reference')}
                  </span>
                  <div className="font-mono font-bold text-white text-xs">{record.consultationRef}</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-teal-400" />
                    {t('verification.date', 'Encounter Date')}
                  </span>
                  <div className="font-semibold text-white text-xs">
                    {record.consultationDate ? formatSriLankaDateTime(record.consultationDate) : 'Recorded'}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-teal-400" />
                    {t('verification.doctor', 'Consulting Practitioner')}
                  </span>
                  <div className="font-semibold text-white text-xs">{record.doctorName}</div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-teal-400" />
                    {t('verification.facility', 'Medical Facility')}
                  </span>
                  <div className="font-semibold text-white text-xs">{record.hospital}</div>
                </div>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed pt-1">
                {t(
                  'verification.disclaimer',
                  'Automated electronic record verification confirms practitioner authorization and cryptographic token validity. It does not establish clinical outcomes.'
                )}
              </p>
            </div>

            {/* PRE-UNLOCK: OTP Verification Gate (NO NIC INPUT) */}
            {!sessionToken && (
              <div
                data-testid="verification-otp-card"
                className="glass-card rounded-2xl p-6 border border-slate-800 bg-slate-900/50 space-y-5"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 mt-0.5">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-white">
                      {t('verification.otpGateTitle', 'Patient Identity Verification')}
                    </h2>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      {t(
                        'verification.otpSentHelp',
                        "A 6-digit verification code has been sent to the patient's registered contact:"
                      )}{' '}
                      <span className="font-mono text-teal-300 font-semibold">{maskedContact || 'registered contact'}</span>
                    </p>
                  </div>
                </div>

                {/* Locked Banner */}
                {isLocked && (
                  <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Maximum verification attempts exceeded. Code has been locked.</span>
                  </div>
                )}

                {/* Attempt Warning */}
                {!isLocked && attemptsRemaining !== null && attemptsRemaining > 0 && (
                  <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Incorrect verification code. {attemptsRemaining} attempt(s) remaining.</span>
                  </div>
                )}

                {/* OTP Input Form */}
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div>
                    <label htmlFor="otp-input" className="block text-xs font-semibold text-slate-300 mb-1.5">
                      {t('verification.enterOtpLabel', 'Enter 6-Digit Code')}
                    </label>
                    <input
                      ref={otpInputRef}
                      id="otp-input"
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      disabled={otpVerifying || isLocked}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••••"
                      className="w-full text-center text-xl font-mono tracking-widest rounded-xl border border-slate-700 bg-slate-950/90 py-3 text-white placeholder-slate-600 focus:border-teal-400 focus:outline-none focus:ring-1 focus:ring-teal-400 disabled:opacity-50"
                      aria-live="polite"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={otpVerifying || otp.length < 6 || isLocked}
                    className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-teal-900/20"
                  >
                    {otpVerifying ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{t('verification.unlocking', 'Verifying & Unlocking…')}</span>
                      </>
                    ) : (
                      <>
                        <Unlock className="w-4 h-4" />
                        <span>{t('verification.verifyAndUnlockBtn', 'Verify Code & Unlock Record')}</span>
                      </>
                    )}
                  </button>
                </form>

                {/* Resend Action */}
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Didn't receive the code?</span>
                  <button
                    type="button"
                    onClick={() => handleRequestOtp(false)}
                    disabled={cooldown > 0 || otpRequesting}
                    className="min-h-[44px] inline-flex items-center gap-1.5 text-xs font-semibold text-teal-400 hover:text-teal-300 disabled:text-slate-600 transition-colors cursor-pointer"
                  >
                    {otpRequesting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Sending…</span>
                      </>
                    ) : cooldown > 0 ? (
                      <span>
                        {t('verification.resendCountdown', 'Resend available in')} {cooldown}s
                      </span>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>{t('verification.resendOtp', 'Resend Code')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* UNLOCKED VIEW: Full Clinical Data + Medicine Release */}
            {sessionToken && clinicalData && (
              <div
                data-testid="verification-unlocked-section"
                className="space-y-6 animate-fade-in"
              >
                {/* Session Active Top Banner */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900 border border-teal-500/30 text-xs">
                  <div className="flex items-center gap-2 text-teal-300 font-semibold">
                    <Clock className="w-4 h-4 text-teal-400 shrink-0" />
                    <span>
                      {t('verification.sessionExpiresIn', 'View session expires in')}:{' '}
                      <span className="font-mono text-white font-bold">{formatTimer(sessionSecondsLeft)}</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleLockNow('Session closed by user.')}
                    className="min-h-[44px] inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    <span>{t('verification.lockNow', 'Lock Now')}</span>
                  </button>
                </div>

                {/* 1. Patient Demographic Card */}
                <div className="glass-card rounded-2xl p-6 border border-slate-800 bg-slate-900/60 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                    <User className="w-4 h-4 text-teal-400" />
                    <span>{t('verification.patientDetails', 'Patient Details')}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                      <span className="text-xs text-slate-500 block">Name</span>
                      <span className="font-semibold text-white">{clinicalData.patient?.name}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                      <span className="text-xs text-slate-500 block">Gender</span>
                      <span className="font-semibold text-white">{clinicalData.patient?.gender}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                      <span className="text-xs text-slate-500 block">Date of Birth</span>
                      <span className="font-semibold text-white">{clinicalData.patient?.ageOrDob}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                      <span className="text-xs text-slate-500 block">Blood Group</span>
                      <span className="font-semibold text-white">{clinicalData.patient?.bloodGroup}</span>
                    </div>
                  </div>

                  {/* Recorded Allergies */}
                  <div>
                    <span className="text-xs font-semibold text-slate-400 block mb-1.5">Allergies</span>
                    {Array.isArray(clinicalData.patient?.allergies) && clinicalData.patient.allergies.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {clinicalData.patient.allergies.map((alg, i) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium"
                          >
                            {alg}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 italic">No drug allergies recorded.</span>
                    )}
                  </div>
                </div>

                {/* 2. Clinical Encounter Summary (Vitals, Symptoms, Diagnosis) */}
                <div className="glass-card rounded-2xl p-6 border border-slate-800 bg-slate-900/60 space-y-4">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                    <Activity className="w-4 h-4 text-teal-400" />
                    <span>{t('verification.clinicalSummaryTitle', 'Clinical Encounter Summary')}</span>
                  </div>

                  {/* Vital Signs Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                      <span className="text-xs text-slate-500 block">Blood Pressure</span>
                      <span className="font-semibold text-white">{clinicalData.vitals?.bloodPressure || '—'}</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                      <span className="text-xs text-slate-500 block">Pulse Rate</span>
                      <span className="font-semibold text-white">
                        {clinicalData.vitals?.pulseRate ? `${clinicalData.vitals.pulseRate} bpm` : '—'}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                      <span className="text-xs text-slate-500 block">Temperature</span>
                      <span className="font-semibold text-white">
                        {clinicalData.vitals?.temperature ? `${clinicalData.vitals.temperature} °C` : '—'}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                      <span className="text-xs text-slate-500 block">Oxygen Saturation</span>
                      <span className="font-semibold text-white">
                        {clinicalData.vitals?.spO2 ? `${clinicalData.vitals.spO2}%` : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Symptoms */}
                  <div>
                    <span className="text-xs font-semibold text-slate-400 block mb-1.5">
                      {t('verification.symptoms', 'Reported Symptoms')}
                    </span>
                    {Array.isArray(clinicalData.symptoms) && clinicalData.symptoms.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {clinicalData.symptoms.map((sym, i) => (
                          <span
                            key={i}
                            className="px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium"
                          >
                            {sym}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 italic">No symptoms cataloged.</span>
                    )}
                  </div>

                  {/* Diagnosis */}
                  <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-teal-400 block">
                      {t('verification.diagnosis', 'Clinical Diagnosis')}
                    </span>
                    <div className="text-sm font-bold text-white">{clinicalData.diagnosis?.text}</div>
                    {clinicalData.diagnosis?.icdCode && (
                      <div className="text-xs text-slate-400 flex items-center gap-2 pt-0.5">
                        <span className="font-mono text-teal-300 font-semibold bg-teal-950/40 px-1.5 py-0.5 rounded border border-teal-800/40">
                          {clinicalData.diagnosis.icdCode}
                        </span>
                        <span>{clinicalData.diagnosis.icdDescription}</span>
                      </div>
                    )}
                  </div>

                  {/* Clinical Notes */}
                  {clinicalData.notes && (
                    <div className="text-xs text-slate-300 pt-1">
                      <span className="text-xs font-semibold text-slate-400 block mb-1">
                        {t('verification.clinicalNotes', 'Practitioner Notes')}
                      </span>
                      <p className="p-3 rounded-xl bg-slate-950/50 border border-slate-800 leading-relaxed italic">
                        "{clinicalData.notes}"
                      </p>
                    </div>
                  )}

                  {/* Follow-up advice */}
                  {clinicalData.followUp?.isFollowUpRequired && clinicalData.followUp.followUpDate && (
                    <div className="text-xs text-slate-300 pt-1 flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-teal-400 shrink-0" />
                      <span>
                        Follow-up scheduled:{' '}
                        <strong className="text-white">
                          {formatSriLankaDateTime(clinicalData.followUp.followUpDate)}
                        </strong>
                      </span>
                    </div>
                  )}
                </div>

                {/* 3. Prescription & Medicine Release Status */}
                <div className="glass-card rounded-2xl p-6 border border-slate-800 bg-slate-900/60 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                      <Pill className="w-4 h-4 text-teal-400" />
                      <span>{t('verification.prescribedMedicines', 'Prescribed Medicines & Release Status')}</span>
                    </div>
                    {releaseData && (
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
                          releaseData.overallStatus === 'released'
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                            : releaseData.overallStatus === 'partially_released'
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {releaseData.overallStatus === 'released'
                          ? 'All Released'
                          : releaseData.overallStatus === 'partially_released'
                          ? 'Partially Released'
                          : 'Not Released'}
                      </span>
                    )}
                  </div>

                  {/* Medicine List */}
                  {Array.isArray(releaseData?.items) && releaseData.items.length > 0 ? (
                    <div className="space-y-3">
                      {releaseData.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1">
                            <div className="font-bold text-white text-sm flex items-center gap-2">
                              <span>{item.drugName}</span>
                              <span className="text-xs font-normal text-slate-400">({item.dosage})</span>
                            </div>
                            <div className="text-slate-400 text-xs flex flex-wrap gap-x-3 gap-y-1">
                              <span>Schedule: <strong className="text-slate-200">{item.frequency || 'N/A'}</strong></span>
                              {item.durationDays && (
                                <span>Duration: <strong className="text-slate-200">{item.durationDays} days</strong></span>
                              )}
                              {item.instructions && (
                                <span className="italic text-slate-400">({item.instructions})</span>
                              )}
                            </div>
                            {item.isSubstituted && (
                              <div className="text-xs text-amber-300/90 pt-0.5">
                                Substituted: {item.substitutionDetails || 'Generic equivalent dispensed'}
                              </div>
                            )}
                          </div>

                          {/* Released Badge & Metadata */}
                          <div className="sm:text-right shrink-0">
                            {item.released ? (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>{t('verification.statusReleased', 'Released')}</span>
                                </span>
                                {item.pharmacy?.name && (
                                  <div className="text-xs text-slate-400 flex items-center gap-1 sm:justify-end">
                                    <MapPin className="w-3 h-3 text-slate-500" />
                                    <span>{item.pharmacy.name}</span>
                                  </div>
                                )}
                                {item.releasedBy?.name && (
                                  <div className="text-xs text-slate-500">
                                    By: {item.releasedBy.name}
                                  </div>
                                )}
                                {item.releasedAt && (
                                  <div className="text-xs text-slate-500 font-mono">
                                    {formatSriLankaDateTime(item.releasedAt)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-xs font-semibold">
                                <Clock className="w-3.5 h-3.5" />
                                <span>{t('verification.statusPending', 'Not Released')}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 italic p-3 rounded-xl bg-slate-950/40 border border-slate-800">
                      No prescription items recorded for this encounter.
                    </div>
                  )}

                  {/* Dispensings Receipts Timeline */}
                  {Array.isArray(releaseData?.dispensings) && releaseData.dispensings.length > 0 && (
                    <div className="pt-3 border-t border-slate-800/80 space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                        {t('verification.releaseTimeline', 'Medicine Release Timeline')}
                      </span>
                      {releaseData.dispensings.map((disp, i) => (
                        <div
                          key={i}
                          className="p-3 rounded-xl bg-slate-950/40 border border-slate-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div>
                            <span className="font-mono text-teal-400 font-bold block">{disp.receiptNo}</span>
                            <span className="text-slate-400 text-xs">{disp.pharmacy}</span>
                          </div>
                          <div className="sm:text-right text-xs text-slate-400">
                            <div>Pharmacist: <strong className="text-slate-200">{disp.pharmacist}</strong></div>
                            <div className="font-mono text-slate-500">{formatSriLankaDateTime(disp.dispensedAt)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 4. Authorized History PDF Download */}
                <div className="glass-card rounded-2xl p-6 border border-slate-800 bg-slate-900/60 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-white">Download Clinical History</h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Download the comprehensive patient consultation history PDF, authorized by your active verification session.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleDownloadHistory}
                      disabled={downloadingPdf}
                      className="min-h-[44px] shrink-0 py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-teal-900/20"
                    >
                      {downloadingPdf ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Generating PDF…</span>
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          <span>Download History PDF</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">🔒 Encrypted PDF: open with your NIC number (e.g. 199512345678 or 951234567V).</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="max-w-2xl mx-auto w-full text-center text-xs text-slate-500 pt-6">
        MediSync Secure Health Platform &bull; Privacy-Guarded Identity Verification
      </div>
    </div>
  );
}
