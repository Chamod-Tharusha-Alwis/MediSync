import React from 'react';

const StatusBadge = ({ status = 'pending', className = '', customText }) => {
  const s = status.toLowerCase();

  const configMap = {
    pending: {
      text: 'Pending',
      classes: 'bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-[0_0_12px_rgba(245,158,11,0.1)]',
      dot: 'bg-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.8)]'
    },
    approved: {
      text: 'Approved',
      classes: 'bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-[0_0_12px_rgba(59,130,246,0.1)]',
      dot: 'bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.8)]'
    },
    completed: {
      text: 'Completed',
      classes: 'bg-teal-500/10 text-teal-400 border-teal-500/20 shadow-[0_0_12px_rgba(20,184,166,0.1)]',
      dot: 'bg-teal-400 shadow-[0_0_8px_rgba(20,184,166,0.8)]'
    },
    dispensed: {
      text: 'Dispensed',
      classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.1)]',
      dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
    },
    expired: {
      text: 'Expired',
      classes: 'bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_12px_rgba(244,63,94,0.1)]',
      dot: 'bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.8)]'
    },
    banned: {
      text: 'Banned',
      classes: 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_12px_rgba(239,68,68,0.1)]',
      dot: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]'
    },
    suspended: {
      text: 'Suspended',
      classes: 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_12px_rgba(239,68,68,0.1)]',
      dot: 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]'
    },
    report_ready: {
      text: 'Report Ready',
      classes: 'bg-teal-500/10 text-teal-400 border-teal-500/20 shadow-[0_0_12px_rgba(20,184,166,0.1)]',
      dot: 'bg-teal-400 shadow-[0_0_8px_rgba(20,184,166,0.8)]'
    },
    sample_collected: {
      text: 'Sample Collected',
      classes: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20 shadow-[0_0_12px_rgba(99,102,241,0.1)]',
      dot: 'bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.8)]'
    },
    processing: {
      text: 'Processing',
      classes: 'bg-purple-500/10 text-purple-400 border-purple-500/20 shadow-[0_0_12px_rgba(168,85,247,0.1)]',
      dot: 'bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.8)]'
    },
    delivered: {
      text: 'Delivered',
      classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.1)]',
      dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
    },
    ready_for_pickup: {
      text: 'Ready for Pickup',
      classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.1)]',
      dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
    },
    ready: {
      text: 'Ready',
      classes: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.1)]',
      dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]'
    }
  };

  const current = configMap[s] || configMap.pending;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold tracking-wide transition-all ${current.classes} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${current.dot}`} />
      {customText || current.text}
    </span>
  );
};

export default StatusBadge;
