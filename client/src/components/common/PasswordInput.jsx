import React, { forwardRef, useState, useId } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { cn } from '../../utils/cn';

/**
 * PasswordInput
 * Fully accessible password input with show/hide toggle.
 * Supports Enter/Space keyboard toggle, dynamic ARIA attributes, and visible focus rings.
 */
const PasswordInput = forwardRef(({
  id: explicitId,
  value = '',
  onChange,
  placeholder = '••••••••',
  label,
  error,
  icon: LeftIcon = Lock,
  className,
  inputClassName,
  describedBy,
  autoComplete = 'current-password',
  required = false,
  disabled = false,
  ...props
}, ref) => {
  const generatedId = useId();
  const inputId = explicitId || `password-input-${generatedId.replace(/:/g, '')}`;
  const [showPassword, setShowPassword] = useState(false);

  const toggleVisibility = () => {
    if (disabled) return;
    setShowPassword((prev) => !prev);
  };

  const handleKeyDown = (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      // Prevent form submission when pressing Space or Enter on the toggle button
      e.preventDefault();
      toggleVisibility();
    }
  };

  return (
    <div className={cn("w-full flex flex-col gap-1.5", className)}>
      {label && (
        <label
          htmlFor={inputId}
          className="text-xs font-semibold uppercase text-slate-300 ml-1 select-none"
        >
          {label}
          {required && <span className="text-rose-400 ml-0.5">*</span>}
        </label>
      )}

      <div className="relative w-full">
        {LeftIcon && (
          <div
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none select-none"
            aria-hidden="true"
          >
            <LeftIcon size={18} />
          </div>
        )}

        <input
          ref={ref}
          id={inputId}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={cn(
            "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-slate-200 placeholder:text-slate-400 text-sm",
            "focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:bg-white/10 focus:border-white/20 transition-all duration-300",
            "shadow-inner",
            LeftIcon && "pl-10",
            "pr-11", // Space for toggle button
            error && "border-red-500/50 focus:ring-red-500/50",
            disabled && "opacity-50 cursor-not-allowed",
            inputClassName
          )}
          {...props}
        />

        <button
          type="button"
          tabIndex={0}
          onClick={toggleVisibility}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          aria-label={showPassword ? "Hide credentials" : "Show credentials"}
          aria-pressed={showPassword}
          aria-controls={inputId}
          className={cn(
            "absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-white",
            "hover:bg-white/5 active:bg-white/10 transition-colors select-none",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-900",
            disabled && "cursor-not-allowed opacity-40"
          )}
        >
          {showPassword ? (
            <EyeOff size={18} aria-hidden="true" />
          ) : (
            <Eye size={18} aria-hidden="true" />
          )}
        </button>
      </div>

      {error && (
        <p className="mt-1 text-xs text-red-400 pl-1" role="alert">
          {error}
        </p>
      )}
    </div>
  );
});

PasswordInput.displayName = 'PasswordInput';

export default PasswordInput;
