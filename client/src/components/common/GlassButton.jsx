import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../utils/cn';

const GlassButton = ({ 
  children, 
  className, 
  variant = 'primary', 
  type = 'button',
  icon: Icon,
  isLoading = false,
  ...props 
}) => {
  const baseClasses = "relative overflow-hidden rounded-xl px-6 py-2.5 font-medium transition-all duration-300 flex items-center justify-center gap-2 group";
  
  const variants = {
    primary: "bg-teal-500/80 text-white shadow-[0_0_15px_rgba(20,184,166,0.3)] border border-teal-400/30",
    secondary: "bg-white/5 text-slate-200 border border-white/10 hover:bg-white/10",
    danger: "bg-rose-500/80 text-white shadow-[0_0_15px_rgba(244,63,94,0.3)] border border-rose-400/30",
    ghost: "bg-transparent text-slate-300 hover:text-white hover:bg-white/5"
  };

  return (
    <motion.button
      type={type}
      className={cn(baseClasses, variants[variant], className)}
      whileHover={{ y: -2, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      disabled={isLoading}
      {...props}
    >
      {/* Subtle overlay gradient on hover for primary/danger */}
      {(variant === 'primary' || variant === 'danger') && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
      )}
      
      {isLoading ? (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      ) : Icon ? (
        <Icon size={18} className="group-hover:scale-110 transition-transform duration-300" />
      ) : null}
      
      <span className="relative z-10">{children}</span>
    </motion.button>
  );
};

export default GlassButton;
