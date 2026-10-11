import React, { useState, useEffect, useRef } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

const OtpInput = ({
  onSubmit,
  onResend,
  initialSeconds = 600,
  loading = false,
  error = null,
}) => {
  const [code, setCode] = useState(new Array(6).fill(''));
  const [timeLeft, setTimeLeft] = useState(initialSeconds);
  const inputsRef = useRef([]);

  // Timer countdown logic
  useEffect(() => {
    if (timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft]);

  const handleChange = (e, index) => {
    const val = e.target.value;
    if (isNaN(Number(val))) return; // Allow numbers only

    const newCode = [...code];
    // Keep only the last character entered
    newCode[index] = val.substring(val.length - 1);
    setCode(newCode);

    // Auto-focus next input
    if (val && index < 5 && inputsRef.current[index + 1]) {
      inputsRef.current[index + 1].focus();
    }

    // Submit if complete
    const combined = newCode.join('');
    if (combined.length === 6 && onSubmit && !loading) {
      onSubmit(combined);
    }
  };

  const handleKeyDown = (e, index) => {
    // Auto-focus previous input on Backspace
    if (e.key === 'Backspace') {
      if (!code[index] && index > 0 && inputsRef.current[index - 1]) {
        inputsRef.current[index - 1].focus();
      }
      const newCode = [...code];
      newCode[index] = '';
      setCode(newCode);
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').trim();
    if (pasteData.length !== 6 || isNaN(Number(pasteData))) return;

    const newCode = pasteData.split('');
    setCode(newCode);
    if (inputsRef.current[5]) inputsRef.current[5].focus();

    if (onSubmit && !loading) {
      onSubmit(pasteData);
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleResendClick = () => {
    setTimeLeft(initialSeconds);
    setCode(new Array(6).fill(''));
    if (inputsRef.current[0]) inputsRef.current[0].focus();
    if (onResend) {
      onResend();
    }
  };

  const combinedCode = code.join('');

  return (
    <div className="flex flex-col items-center justify-center gap-5 p-2 w-full">
      <div className="flex gap-2.5 sm:gap-3" onPaste={handlePaste} role="group" aria-label="6-digit OTP input">
        {code.map((digit, idx) => (
          <input
            key={idx}
            type="text"
            inputMode="numeric"
            maxLength={1}
            aria-label={`OTP Digit ${idx + 1}`}
            value={digit}
            disabled={loading}
            ref={(el) => (inputsRef.current[idx] = el)}
            onChange={(e) => handleChange(e, idx)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className="w-10 h-12 sm:w-12 sm:h-14 text-center text-xl sm:text-2xl font-bold bg-slate-900/60 border border-white/10 rounded-xl focus:border-teal-500/50 focus:bg-slate-900/80 transition-all duration-200 outline-none text-slate-100 shadow-md focus:shadow-teal-500/10 focus:ring-2 focus:ring-teal-500/20 disabled:opacity-50"
          />
        ))}
      </div>

      {error && (
        <div className="w-full p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs font-semibold text-center" role="alert">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between w-full text-xs px-1">
        {timeLeft > 0 ? (
          <p className="text-slate-400">
            Expires in <span className="font-semibold text-teal-400 font-mono">{formatTime(timeLeft)}</span>
          </p>
        ) : (
          <p className="text-rose-400 font-semibold">OTP expired</p>
        )}

        <button
          type="button"
          onClick={handleResendClick}
          disabled={loading}
          className="inline-flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300 font-bold underline transition-colors disabled:opacity-50"
        >
          <RefreshCw className="w-3 h-3" />
          Resend OTP
        </button>
      </div>

      <button
        type="button"
        disabled={loading || combinedCode.length !== 6 || timeLeft <= 0}
        onClick={() => onSubmit && onSubmit(combinedCode)}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold transition-all disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Verifying OTP...
          </>
        ) : (
          'Verify & Download Report'
        )}
      </button>
    </div>
  );
};

export default OtpInput;
