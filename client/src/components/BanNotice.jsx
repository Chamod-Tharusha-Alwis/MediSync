import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldBan, AlertTriangle, Clock, Mail } from 'lucide-react';

/**
 * BanNotice — Full-screen ban overlay
 * Listens for the 'medisync:banned' custom event dispatched by axiosInstance.
 * Renders over everything and prevents navigation.
 */
const BanNotice = () => {
  const [banData, setBanData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e) => {
      setBanData(e.detail);
    };
    window.addEventListener('medisync:banned', handler);
    return () => window.removeEventListener('medisync:banned', handler);
  }, []);

  const handleDismiss = () => {
    setBanData(null);
    navigate('/select-role');
  };

  return (
    <AnimatePresence>
      {banData && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-red-950/90 backdrop-blur-sm"
          style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
        >
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 18, stiffness: 200 }}
            className="bg-white rounded-3xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden"
          >
            {/* Header */}
            <div className="bg-red-600 px-8 py-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center">
                <ShieldBan className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-white text-xl font-bold tracking-tight">Account Suspended</h1>
                <p className="text-red-200 text-sm mt-0.5">MediSync Platform</p>
              </div>
            </div>

            {/* Body */}
            <div className="px-8 py-6">
              {banData.banType === 'temporary' ? (
                <div className="flex items-start gap-3 mb-5 p-4 bg-amber-50 rounded-xl border border-amber-200">
                  <Clock className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-amber-800 font-semibold text-sm">Temporary Suspension</p>
                    {banData.expiresAt && (
                      <p className="text-amber-700 text-sm mt-1">
                        Until: {new Date(banData.expiresAt).toLocaleDateString('en-US', {
                          year: 'numeric', month: 'long', day: 'numeric'
                        })}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 mb-5 p-4 bg-red-50 rounded-xl border border-red-200">
                  <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-red-800 font-semibold text-sm">Permanent Suspension</p>
                    <p className="text-red-700 text-sm mt-1">Your account has been permanently disabled.</p>
                  </div>
                </div>
              )}

              <div className="mb-6">
                <p className="text-gray-500 text-xs uppercase font-bold tracking-wider mb-2">Reason</p>
                <p className="text-gray-800 text-base leading-relaxed bg-gray-50 rounded-xl p-4 border border-gray-200">
                  {banData.reason || 'Your account has been suspended due to a violation of MediSync platform policies.'}
                </p>
              </div>

              <div className="flex items-center gap-2 text-gray-500 text-sm mb-6">
                <Mail className="w-4 h-4" />
                <span>Contact support: <a href="mailto:support@medisync.lk" className="text-blue-600 hover:underline">support@medisync.lk</a></span>
              </div>

              <button
                onClick={handleDismiss}
                className="w-full py-3 px-6 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-xl transition-colors text-sm"
              >
                Return to Home
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BanNotice;
