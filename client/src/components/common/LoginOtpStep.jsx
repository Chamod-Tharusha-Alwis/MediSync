import { useTranslation } from '../../i18n/LanguageContext';
import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, RefreshCw, ArrowLeft, Loader2 } from 'lucide-react';

const LoginOtpStep = ({
  email,
  loading = false,
  resending = false,
  onVerify,
  onResend,
  onBack,
  buttonLabel = 'Verify & Sign In',
  initialSeconds = 600,
}) => {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [timeLeft, setTimeLeft] = useState(initialSeconds);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputsRef = useRef([]);
  const { t } = useTranslation();

  useEffect(() => {
    if (inputsRef.current[0]) {
      inputsRef.current[0].focus();
    }
  }, []);

  useEffect(() => {
    if (timeLeft <= 0) return undefined;
    const timer = setInterval(() => {
      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const otpCode = digits.join('');

  const handleDigitChange = (index, rawValue) => {
    const cleaned = String(rawValue || '').replace(/\D/g, '');
    if (!cleaned) {
      const next = [...digits];
      next[index] = '';
      setDigits(next);
      return;
    }

    const char = cleaned.slice(-1);
    const next = [...digits];
    next[index] = char;
    setDigits(next);

    if (index < 5 && inputsRef.current[index + 1]) {
      inputsRef.current[index + 1].focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        const next = [...digits];
        next[index] = '';
        setDigits(next);
      } else if (index > 0 && inputsRef.current[index - 1]) {
        const next = [...digits];
        next[index - 1] = '';
        setDigits(next);
        inputsRef.current[index - 1].focus();
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      inputsRef.current[index + 1]?.focus();
    } else if (e.key === 'Enter' && otpCode.length === 6 && !loading) {
      e.preventDefault();
      onVerify(otpCode);
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const next = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i += 1) {
      next[i] = pasted[i];
    }
    setDigits(next);
    const focusIndex = Math.min(pasted.length, 5);
    inputsRef.current[focusIndex]?.focus();
  };

  const handleResend = async () => {
    if (resending || resendCooldown > 0) return;
    const ok = await onResend();
    if (ok !== false) {
      setDigits(['', '', '', '', '', '']);
      setTimeLeft(initialSeconds);
      setResendCooldown(30);
      inputsRef.current[0]?.focus();
    }
  };

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-5" data-testid="login-otp-step">
      <div className="p-3.5 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 leading-relaxed">
          <p className="font-bold text-white">Two-Step Verification Required</p>
          <p className="text-slate-400 mt-0.5">
            Enter the 6-digit security code sent to{' '}
            <span className="text-slate-200 font-semibold">{email || 'your registered email'}</span>.
          </p>
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5 text-center">
          6-Digit Verification Code
        </label>
        <div
          className="flex items-center justify-center gap-2 sm:gap-2.5"
          onPaste={handlePaste}
          role="group"
          aria-label="6-digit OTP verification code"
        >
          {digits.map((digit, idx) => (
            <input
              key={idx}
              ref={(el) => {
                inputsRef.current[idx] = el;
              }}
              type="text"
              inputMode="numeric"
              autoComplete={idx === 0 ? 'one-time-code' : 'off'}
              maxLength={1}
              aria-label={`OTP Digit ${idx + 1}`}
              value={digit}
              disabled={loading}
              onChange={(e) => handleDigitChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              className="w-10 h-12 sm:w-12 sm:h-14 text-center text-lg sm:text-xl font-bold bg-slate-900/70 border border-white/15 rounded-xl focus:border-teal-400 focus:bg-slate-900 transition-all outline-none text-white shadow-inner focus:ring-2 focus:ring-teal-500/25 disabled:opacity-50"
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between text-xs px-1">
        {timeLeft > 0 ? (
          <span className="text-slate-400">
            {t("auth.codeExpiresIn", "Code expires in")}{' '}
            <span className="font-mono font-bold text-teal-400">{formatTime(timeLeft)}</span>
          </span>
        ) : (
          <span className="text-rose-400 font-semibold">{t("auth.codeExpired", "Code expired")} — please request a new OTP</span>
        )}

        <button
          type="button"
          onClick={handleResend}
          disabled={resending || resendCooldown > 0}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-400 hover:text-teal-300 disabled:text-slate-500 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${resending ? 'animate-spin' : ''}`} />
          {resending
            ? 'Sending...'
            : resendCooldown > 0
              ? `Resend (${resendCooldown}s)`
              : 'Resend OTP'}
        </button>
      </div>

      <button
        type="button"
        disabled={loading || otpCode.length !== 6 || timeLeft === 0}
        onClick={() => onVerify(otpCode)}
        className="w-full flex justify-center items-center py-2.5 px-4 bg-teal-600 hover:bg-teal-500 border border-teal-500/40 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-50 shadow-lg shadow-teal-600/20"
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" />
            Verifying OTP...
          </>
        ) : (
          buttonLabel
        )}
      </button>

      <div className="text-center pt-1">
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Sign In
        </button>
      </div>
    </div>
  );
};

export default LoginOtpStep;
