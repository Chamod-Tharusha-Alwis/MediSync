import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, FlaskConical, ChevronDown } from 'lucide-react';

const LabReportDownloadButton = ({ labTests = [], onSelectTest }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // 1. Zero Tests: Hide button completely
  if (!labTests || labTests.length === 0) return null;

  // Helper to extract test name
  const getTestName = (t) => {
    if (typeof t === 'string') return t;
    return t.testName || t.name || t.data?.testName || 'Lab Report';
  };

  // 2. Exactly One Test: Direct download/view action
  if (labTests.length === 1) {
    const singleTest = labTests[0];
    return (
      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelectTest(singleTest);
        }}
        className="glass-btn inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-bold hover:bg-purple-500/20 transition-all duration-200"
      >
        <Download className="w-3.5 h-3.5 text-purple-400" />
        Download Lab Report
      </motion.button>
    );
  }

  // 3. Multiple Tests (>= 2): Anchored Dropdown Menu
  return (
    <div className="relative inline-block z-30" ref={dropdownRef}>
      <motion.button
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        className="glass-btn inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-bold hover:bg-purple-500/20 transition-all duration-200"
      >
        <Download className="w-3.5 h-3.5 text-purple-400" />
        Download Lab Report ({labTests.length})
        <ChevronDown className={`w-3.5 h-3.5 text-purple-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 5 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 bottom-full mb-2 z-[9999] w-64 bg-[#0f172a] border border-purple-500/40 rounded-xl shadow-[0_10px_38px_rgba(0,0,0,0.8)] overflow-hidden p-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 border-b border-white/10 mb-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                <FlaskConical className="w-3 h-3" />
                Select Lab Report to Download
              </p>
            </div>

            <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-0.5">
              {labTests.map((t, idx) => {
                const name = getTestName(t);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsOpen(false);
                      onSelectTest(t);
                    }}
                    className="w-full text-left flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-slate-200 hover:bg-purple-500/20 hover:text-purple-300 transition-colors group"
                  >
                    <span className="truncate flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
                      {name}
                    </span>
                    <Download className="w-3.5 h-3.5 text-purple-400 opacity-60 group-hover:opacity-100 flex-shrink-0 ml-2" />
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LabReportDownloadButton;
