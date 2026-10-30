import React from 'react';
import { evaluatePasswordStrength } from '../../utils/passwordPolicy';
import { cn } from '../../utils/cn';

/**
 * PasswordStrengthMeter
 * 5-level animated strength meter (0: Very Weak to 4: Strong).
 * Respects prefers-reduced-motion via CSS motion-safe and motion-reduce utilities.
 */
const PasswordStrengthMeter = ({
  password = '',
  evaluation: propEval = null,
  id = 'password-strength-meter',
  className
}) => {
  const evalData = propEval || (password ? evaluatePasswordStrength(password) : null);
  if (!evalData && !password) return null;

  const { score, label, textColor } = evalData || evaluatePasswordStrength(password);

  const segmentColors = [
    'bg-rose-600',   // Level 1: Weak
    'bg-amber-500',  // Level 2: Fair
    'bg-teal-500',   // Level 3: Good (meets min policy)
    'bg-emerald-500' // Level 4: Strong
  ];

  return (
    <div
      id={id}
      className={cn("w-full pt-1.5 space-y-1 select-none", className)}
      role="progressbar"
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={4}
      aria-valuetext={label}
    >
      <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider">
        <span className="text-slate-400">Password Strength</span>
        <span className={textColor}>{label}</span>
      </div>

      {/* 4 Segmented Bars representing levels 1 to 4 */}
      <div className="grid grid-cols-4 gap-1.5 h-1.5 w-full bg-slate-900/60 p-0.5 rounded-full overflow-hidden border border-white/5">
        {[0, 1, 2, 3].map((index) => {
          const isFilled = index < score;
          return (
            <div
              key={index}
              className={cn(
                "h-full rounded-full transition-colors",
                // Motion safe smooth transition, motion reduce instant change
                "motion-safe:transition-all motion-safe:duration-300 motion-reduce:transition-none",
                isFilled ? (score >= 3 ? segmentColors[score - 1] : segmentColors[index]) : "bg-slate-800"
              )}
            />
          );
        })}
      </div>
    </div>
  );
};

export default PasswordStrengthMeter;
