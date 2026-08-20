import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FlaskConical, X, Download, Calendar, User, Building2, FileText } from 'lucide-react';
import StatusBadge from '../ui/StatusBadge';

const LabDetailModal = ({ isOpen, onClose, labTest, onDownload }) => {
  if (!isOpen || !labTest) return null;

  const testName = typeof labTest === 'string'
    ? labTest
    : (labTest.testName || labTest.name || labTest.data?.testName || 'Lab Test Record');

  const status = typeof labTest === 'string'
    ? 'Pending'
    : (labTest.status || labTest.data?.status || 'Pending');

  const reportId = labTest.reportId || labTest._id || labTest.data?.reportId || 'LAB-' + Date.now().toString().slice(-6);
  const orderedDate = labTest.createdAt || labTest.date || labTest.data?.createdAt || new Date().toISOString();
  const doctorName = labTest.doctorName || labTest.doctorId?.fullName || labTest.data?.doctorId?.fullName || 'Attending Physician';
  const hospitalName = labTest.hospitalName || labTest.hospitalId?.name || labTest.data?.hospitalId?.name || 'MediSync Central Laboratory';
  const notes = labTest.notes || labTest.remarks || labTest.data?.notes || 'Sample processed under standard clinical protocol.';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative w-full max-w-lg glass-card-premium rounded-2xl border border-purple-500/20 shadow-2xl overflow-hidden p-6 text-slate-100"
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-white/10 pb-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <FlaskConical className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white leading-tight">{testName}</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">Report Reference: {reportId}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="space-y-4">
            {/* Status Banner */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900/60 border border-white/5">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Test Status</span>
              <StatusBadge status={status} />
            </div>

            {/* Information Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-900/40 border border-white/5 flex items-center gap-2.5">
                <Calendar className="w-4 h-4 text-purple-400 flex-shrink-0" />
                <div>
                  <p className="text-slate-500 font-semibold uppercase text-[9px]">Requested Date</p>
                  <p className="text-slate-200 font-medium">
                    {new Date(orderedDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/40 border border-white/5 flex items-center gap-2.5">
                <User className="w-4 h-4 text-blue-400 flex-shrink-0" />
                <div>
                  <p className="text-slate-500 font-semibold uppercase text-[9px]">Prescribed By</p>
                  <p className="text-slate-200 font-medium truncate">{doctorName}</p>
                </div>
              </div>

              <div className="col-span-2 p-3 rounded-xl bg-slate-900/40 border border-white/5 flex items-center gap-2.5">
                <Building2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <div>
                  <p className="text-slate-500 font-semibold uppercase text-[9px]">Testing Facility / Hospital</p>
                  <p className="text-slate-200 font-medium">{hospitalName}</p>
                </div>
              </div>
            </div>

            {/* Clinical Remarks / Findings */}
            <div className="p-3.5 rounded-xl bg-slate-950/50 border border-white/5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-purple-400" />
                Clinical Remarks & Findings
              </p>
              <p className="text-xs text-slate-300 italic leading-relaxed">{notes}</p>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              Close
            </button>
            <motion.button
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              onClick={() => onDownload ? onDownload(reportId) : null}
              className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all duration-200 flex items-center gap-2 shadow-lg shadow-purple-600/20"
            >
              <Download className="w-4 h-4" />
              Download Lab Report (PDF)
            </motion.button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default LabDetailModal;
