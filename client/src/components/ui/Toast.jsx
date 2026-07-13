import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

const Toast = ({ message, type = 'success', isOpen = true, onClose, autoClose = 4000 }) => {
  useEffect(() => {
    if (autoClose && onClose && isOpen) {
      const timer = setTimeout(onClose, autoClose);
      return () => clearTimeout(timer);
    }
  }, [autoClose, onClose, isOpen]);

  const typeConfig = {
    success: {
      classes: 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300 shadow-[0_4px_30px_rgba(16,185,129,0.1)]',
      Icon: CheckCircle
    },
    error: {
      classes: 'bg-rose-500/10 border-rose-500/35 text-rose-300 shadow-[0_4px_30px_rgba(244,63,94,0.1)]',
      Icon: AlertCircle
    },
    info: {
      classes: 'bg-blue-500/10 border-blue-500/35 text-blue-300 shadow-[0_4px_30px_rgba(59,130,246,0.1)]',
      Icon: Info
    }
  };

  const current = typeConfig[type] || typeConfig.success;
  const { Icon } = current;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className={`flex items-center gap-3 p-4 rounded-xl border backdrop-blur-md ${current.classes} max-w-sm w-full`}
        >
          <Icon className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-medium flex-1 leading-relaxed">{message}</p>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 hover:bg-white/5 rounded-lg transition-colors flex-shrink-0 text-slate-400 hover:text-slate-100"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default Toast;
