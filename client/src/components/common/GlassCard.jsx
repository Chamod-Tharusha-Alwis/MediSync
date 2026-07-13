import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../utils/cn';

const GlassCard = ({ children, className, animate = true, delay = 0, ...props }) => {
  const baseClasses = "bg-white/5 backdrop-blur-md border border-white/10 shadow-xl rounded-2xl p-6 relative overflow-hidden";
  
  if (animate) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay, ease: 'easeOut' }}
        className={cn(baseClasses, className)}
        {...props}
      >
        {/* Subtle top highlight for glass edge */}
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
        {children}
      </motion.div>
    );
  }

  return (
    <div className={cn(baseClasses, className)} {...props}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none" />
      {children}
    </div>
  );
};

export default GlassCard;
