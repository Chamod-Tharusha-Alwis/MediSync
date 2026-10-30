import React, { useMemo } from 'react';
import { CheckCircle2, Circle, AlertCircle } from 'lucide-react';
import { evaluatePasswordStrength, MAX_BYTES, MIN_LENGTH } from '../../utils/passwordPolicy';
import { cn } from '../../utils/cn';

/**
 * PasswordCriteriaTips
 * Live requirement checklist with aria-live="polite" and aria-atomic="true".
 * Visually confirms min length, max bytes, and 3+ character categories.
 */
const PasswordCriteriaTips = ({
  password = '',
  evaluation: propEval = null,
  id = 'password-criteria-tips',
  className
}) => {
  const evaluation = useMemo(() => propEval || evaluatePasswordStrength(password), [propEval, password]);
  const { requirements, byteLength, classCount, valid } = evaluation;

  const criteriaItems = [
    {
      id: 'crit-len',
      label: `At least ${MIN_LENGTH} characters`,
      met: requirements.minLength,
    },
    {
      id: 'crit-bytes',
      label: `No more than ${MAX_BYTES} UTF-8 bytes (${byteLength}/${MAX_BYTES})`,
      met: requirements.byteLimit,
      warning: !requirements.byteLimit,
    },
    {
      id: 'crit-classes',
      label: `At least 3 character types (${classCount}/3 fulfilled):`,
      met: classCount >= 3,
      subItems: [
        { id: 'crit-upper', label: 'Uppercase letter (A–Z)', met: requirements.hasUpper },
        { id: 'crit-lower', label: 'Lowercase letter (a–z)', met: requirements.hasLower },
        { id: 'crit-num', label: 'Number (0–9)', met: requirements.hasNumber },
        { id: 'crit-sym', label: 'Special symbol (!@#$%^&*)', met: requirements.hasSpecial },
      ]
    }
  ];

  return (
    <div
      id={id}
      role="region"
      aria-label="Password requirement status"
      aria-live="polite"
      aria-atomic="true"
      className={cn(
        "p-3 rounded-xl bg-slate-900/60 border border-white/5 text-xs text-slate-300 space-y-2 select-none",
        "motion-safe:transition-all motion-safe:duration-300 motion-reduce:transition-none",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-white/5 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
        <span>Password Requirements</span>
        {password && (
          <span className={valid ? "text-emerald-400" : "text-amber-400"}>
            {valid ? "Policy Met" : "Requirements Pending"}
          </span>
        )}
      </div>

      <ul className="space-y-1.5 pt-0.5">
        {criteriaItems.map((item) => (
          <li key={item.id} className="space-y-1">
            <div className="flex items-center gap-2">
              {item.warning ? (
                <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" aria-hidden="true" />
              ) : item.met ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-slate-600 shrink-0" aria-hidden="true" />
              )}
              <span className={cn(
                "transition-colors",
                item.warning ? "text-rose-400 font-semibold" : item.met ? "text-slate-200" : "text-slate-500"
              )}>
                {item.label}
              </span>
            </div>

            {item.subItems && (
              <ul className="grid grid-cols-2 gap-1 pl-5 pt-0.5 text-[11px]">
                {item.subItems.map((sub) => (
                  <li key={sub.id} className="flex items-center gap-1.5">
                    {sub.met ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" aria-hidden="true" />
                    ) : (
                      <Circle className="w-3 h-3 text-slate-600 shrink-0" aria-hidden="true" />
                    )}
                    <span className={sub.met ? "text-slate-300 font-medium" : "text-slate-500"}>
                      {sub.label}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default PasswordCriteriaTips;
