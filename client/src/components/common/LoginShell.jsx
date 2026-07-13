import React from 'react';
import { motion } from 'framer-motion';
import ActiveOutbreakBanner from './ActiveOutbreakBanner';
import GlassCard from './GlassCard';

const LoginShell = ({
  title,
  subtitle,
  icon: Icon,
  bannerText,
  error,
  onSubmit,
  themeColor = 'teal', // 'teal', 'blue', 'emerald', 'violet', 'slate'
  children
}) => {
  const themeStyles = {
    teal: {
      glow: 'bg-teal-500/10',
      border: 'from-teal-600 via-teal-400 to-teal-600',
      iconBg: 'bg-teal-500/10 border-teal-500/20 text-teal-400'
    },
    blue: {
      glow: 'bg-blue-500/10',
      border: 'from-blue-600 via-blue-400 to-blue-600',
      iconBg: 'bg-blue-500/10 border-blue-500/20 text-blue-400'
    },
    emerald: {
      glow: 'bg-emerald-500/10',
      border: 'from-emerald-600 via-emerald-400 to-emerald-600',
      iconBg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
    },
    violet: {
      glow: 'bg-violet-500/10',
      border: 'from-violet-600 via-violet-400 to-violet-600',
      iconBg: 'bg-violet-500/10 border-violet-500/20 text-violet-400'
    },
    slate: {
      glow: 'bg-slate-500/10',
      border: 'from-slate-600 via-gray-400 to-slate-600',
      iconBg: 'bg-slate-800 border-slate-700/50 text-slate-300'
    }
  };

  const style = themeStyles[themeColor] || themeStyles.teal;

  return (
    <div className="min-h-screen bg-transparent flex flex-col justify-between p-4 relative overflow-hidden">
      <ActiveOutbreakBanner />
      
      <div className="flex-1 flex items-center justify-center relative">
        {/* Background glow matching theme */}
        <motion.div 
          animate={{ scale: [1, 1.15, 1], rotate: [0, 60, 0] }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] ${style.glow} blur-[120px] rounded-full pointer-events-none`} 
        />
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md z-10 relative"
        >
          {bannerText && (
            <div className="mb-4 text-center select-none animate-pulse-subtle">
              <span className="inline-flex px-3 py-1 rounded-full bg-red-500/15 border border-red-500/35 text-red-400 text-[10px] font-bold uppercase tracking-widest">
                {bannerText}
              </span>
            </div>
          )}

          <GlassCard className="p-8">
            {/* Top border highlight */}
            <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${style.border}`} />

            <div className="flex flex-col items-center mb-6">
              {Icon && (
                <div className={`w-14 h-14 ${style.iconBg} rounded-2xl flex items-center justify-center border mb-3.5 shadow-lg select-none`}>
                  <Icon className="w-7 h-7" />
                </div>
              )}
              <h2 className="text-xl font-bold text-white tracking-tight">{title}</h2>
              <p className="text-slate-400 text-xs mt-1.5 font-medium">{subtitle}</p>
            </div>

            {error && (
              <div className="mb-5 p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-semibold text-center select-none">
                {error}
              </div>
            )}

            <form onSubmit={onSubmit} className="space-y-5">
              {children}
            </form>
          </GlassCard>
        </motion.div>
      </div>

      <div className="text-center py-4 select-none">
        <p className="text-[10px] uppercase font-bold tracking-wider text-slate-600">
          MediSync Healthcare Network • Secure Node Connection
        </p>
      </div>
    </div>
  );
};

export default LoginShell;
