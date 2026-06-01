import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, AlertCircle, X } from 'lucide-react';
import api from '../../api/axiosInstance';


/**
 * ActiveOutbreakBanner
 *
 * Glassmorphic, glowing top-of-page banner shown when there is an active
 * outbreak broadcast ≤ 7 days old. High-risk alerts pulse and glow red.
 */
const ActiveOutbreakBanner = () => {
  const [broadcast, setBroadcast] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    const fetchBroadcast = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const res = await api.get('/alerts/broadcasts/latest');
        if (res.data?.data) {
          const b       = res.data.data;
          const sentAt  = new Date(b.sentAt || b.createdAt);
          const isRecent = (Date.now() - sentAt) / 86_400_000 <= 7;
          if (b.title?.includes('OUTBREAK ALERT') && isRecent) setBroadcast(b);
        }
      } catch { /* silent — never propagate alert errors */ }
      finally  { setLoading(false); }
    };
    fetchBroadcast();
  }, []);

  if (loading || !broadcast || dismissed) return null;

  const msg   = broadcast.message?.toLowerCase() || '';
  const isHigh = msg.includes('high risk') || msg.includes('high-risk');
  const isCrit = msg.includes('critical');

  const palette = (isCrit || isHigh)
    ? {
        wrap:   'bg-red-500/12 border-b border-red-500/25 shadow-[0_4px_30px_rgba(239,68,68,0.12)]',
        bar:    'from-red-500 to-red-600',
        icon:   'text-red-400',
        title:  'text-red-400',
        body:   'text-red-300/90',
        pulse:  true,
        Icon:   AlertTriangle,
      }
    : {
        wrap:   'bg-orange-500/10 border-b border-orange-500/20 shadow-[0_4px_20px_rgba(249,115,22,0.08)]',
        bar:    'from-orange-500 to-orange-600',
        icon:   'text-orange-400',
        title:  'text-orange-400',
        body:   'text-orange-300/90',
        pulse:  false,
        Icon:   AlertCircle,
      };

  return (
    <AnimatePresence>
      <motion.div
        key="outbreak-banner"
        initial={{ opacity: 0, y: -24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -24 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
        className={`relative w-full z-50 backdrop-blur-md ${palette.wrap}`}
      >
        {/* Pulsing left accent bar */}
        <div
          className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${palette.bar} ${palette.pulse ? 'animate-pulse' : ''}`}
          aria-hidden="true"
        />

        <div className="flex items-center gap-4 px-6 py-3 pr-12 max-w-7xl mx-auto relative">
          <div className="flex items-center gap-3 min-w-0">
            {/* Glowing icon with optional pulse */}
            <palette.Icon
              className={`w-5 h-5 ${palette.icon} flex-shrink-0 ${palette.pulse ? 'animate-pulse' : ''}`}
            />

            <p className="text-sm leading-snug min-w-0 truncate">
              <span className={`font-black uppercase tracking-wider text-xs ${palette.title}`}>
                {broadcast.title}:{' '}
              </span>
              <span className={`font-medium ${palette.body}`}>{broadcast.message}</span>
            </p>
          </div>

          {/* Dismiss button */}
          <motion.button
            whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
            onClick={() => setDismissed(true)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0 absolute"
            style={{ right: '1rem', top: '50%', transform: 'translateY(-50%)' }}
            aria-label="Dismiss outbreak alert"
          >
            <X className="w-4 h-4" />
          </motion.button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ActiveOutbreakBanner;
