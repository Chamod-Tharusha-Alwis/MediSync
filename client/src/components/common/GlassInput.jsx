import React, { forwardRef } from 'react';
import { cn } from '../../utils/cn';

const GlassInput = forwardRef(({ className, icon: Icon, error, ...props }, ref) => {
  return (
    <div className="relative w-full">
      {Icon && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
          <Icon size={18} />
        </div>
      )}
      <input
        ref={ref}
        className={cn(
          "w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-slate-200 placeholder:text-slate-400",
          "focus:outline-none focus:ring-2 focus:ring-teal-500/50 focus:bg-white/10 focus:border-white/20 transition-all duration-300",
          "shadow-inner",
          Icon && "pl-10",
          error && "border-red-500/50 focus:ring-red-500/50",
          className
        )}
        {...props}
      />
      {error && (
        <p className="mt-1 text-xs text-red-400 pl-1">{error}</p>
      )}
    </div>
  );
});

GlassInput.displayName = 'GlassInput';

export default GlassInput;
