import React, { useState, useEffect, useRef } from 'react';

const OtpInput = ({ onSubmit, onResend, initialSeconds = 600 }) => {
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
    if (val && index < 5) {
      inputsRef.current[index + 1].focus();
    }

    // Submit if complete
    const combined = newCode.join('');
    if (combined.length === 6 && onSubmit) {
      onSubmit(combined);
    }
  };

  const handleKeyDown = (e, index) => {
    // Auto-focus previous input on Backspace
    if (e.key === 'Backspace') {
      if (!code[index] && index > 0) {
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
    inputsRef.current[5].focus();

    if (onSubmit) {
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
    inputsRef.current[0].focus();
    if (onResend) {
      onResend();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-6 p-4">
      <div className="flex gap-3" onPaste={handlePaste}>
        {code.map((digit, idx) => (
          <input
            key={idx}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            ref={(el) => (inputsRef.current[idx] = el)}
            onChange={(e) => handleChange(e, idx)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className="w-12 h-14 text-center text-2xl font-bold bg-slate-900/60 border border-white/10 rounded-xl focus:border-teal-500/50 focus:bg-slate-900/80 transition-all duration-200 outline-none text-slate-100 shadow-md focus:shadow-teal-500/10 focus:ring-2 focus:ring-teal-500/20"
          />
        ))}
      </div>

      <div className="flex flex-col items-center gap-2 text-sm">
        {timeLeft > 0 ? (
          <p className="text-slate-400">
            Expires in <span className="font-semibold text-teal-400 font-mono">{formatTime(timeLeft)}</span>
          </p>
        ) : (
          <div className="flex flex-col items-center gap-1">
            <p className="text-rose-400 font-semibold">OTP expired</p>
            <button
              onClick={handleResendClick}
              className="text-xs text-teal-400 hover:text-teal-300 font-bold underline transition-colors"
            >
              Resend OTP
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default OtpInput;
