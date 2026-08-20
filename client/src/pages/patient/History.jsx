import React, { useEffect, useState } from 'react';
import RateConsultationModal from './RateConsultationModal';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Calendar, Star, ChevronDown, ChevronUp,
  Stethoscope, FileText, Package, FlaskConical,
  User, Building2, Pill, Download, ShoppingBag, Loader2,
} from 'lucide-react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import PageTransition from '../../components/common/PageTransition';
import StatusBadge from '../../components/ui/StatusBadge';
import OtpInput from '../../components/ui/OtpInput';
import Modal from '../../components/ui/Modal';

import LabDetailModal from '../../components/common/LabDetailModal';
import LabReportDownloadButton from '../../components/common/LabReportDownloadButton';

/* ─── Framer Motion stagger variants ─────────────────────────────────────── */
const feedVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.10, delayChildren: 0.05 },
  },
};

const cardVariants = {
  hidden:  { opacity: 0, y: 24, scale: 0.97 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
  },
};

/* ─── Event type config ───────────────────────────────────────────────────── */
const typeConfig = {
  consultation: {
    Icon:       Stethoscope,
    iconColor:  'text-blue-400',
    iconBg:     'bg-blue-500/10 border-blue-500/20',
    badge:      'bg-blue-500/10 text-blue-400 border-blue-500/20',
    dot:        'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.9)]',
    cardBorder: 'border-blue-500/15 hover:border-blue-500/35 hover:shadow-[0_0_28px_rgba(59,130,246,0.12)]',
    labTagBg:   'bg-blue-500/12 border-blue-500/25 text-blue-300',
  },
  prescription: {
    Icon:       Pill,
    iconColor:  'text-emerald-400',
    iconBg:     'bg-emerald-500/10 border-emerald-500/20',
    badge:      'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    dot:        'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]',
    cardBorder: 'border-emerald-500/15 hover:border-emerald-500/35 hover:shadow-[0_0_28px_rgba(16,185,129,0.12)]',
    labTagBg:   'bg-purple-500/12 border-purple-500/25 text-purple-300',
  },
  otc: {
    Icon:       ShoppingBag,
    iconColor:  'text-teal-400',
    iconBg:     'bg-teal-500/10 border-teal-500/20',
    badge:      'bg-teal-500/10 text-teal-400 border-teal-500/20',
    dot:        'bg-teal-400 shadow-[0_0_8px_rgba(20,184,166,0.9)]',
    cardBorder: 'border-teal-500/20 hover:border-teal-500/40 hover:shadow-[0_0_28px_rgba(20,184,166,0.12)]',
    labTagBg:   'bg-teal-500/12 border-teal-500/25 text-teal-300',
  },
  dispensing: {
    Icon:       Package,
    iconColor:  'text-cyan-400',
    iconBg:     'bg-cyan-500/10 border-cyan-500/20',
    badge:      'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    dot:        'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]',
    cardBorder: 'border-cyan-500/15 hover:border-cyan-500/35 hover:shadow-[0_0_28px_rgba(6,182,212,0.12)]',
    labTagBg:   'bg-purple-500/12 border-purple-500/25 text-purple-300',
  },
  lab_test: {
    Icon:       FlaskConical,
    iconColor:  'text-purple-400',
    iconBg:     'bg-purple-500/10 border-purple-500/20',
    badge:      'bg-purple-500/10 text-purple-400 border-purple-500/20',
    dot:        'bg-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.9)]',
    cardBorder: 'border-purple-500/15 hover:border-purple-500/35 hover:shadow-[0_0_28px_rgba(139,92,246,0.12)]',
    labTagBg:   'bg-purple-500/12 border-purple-500/25 text-purple-300',
  },
};
const getTC = (type) => typeConfig[type] || typeConfig.consultation;

/* ─── PDF download helper ─────────────────────────────────────────────────── */
const downloadPdf = async (prescriptionId, setDownloading) => {
  if (!prescriptionId) {
    toast.error('No prescription ID available for this record.');
    return;
  }
  setDownloading(true);
  try {
    const response = await api.get(`/prescription/download/${prescriptionId}`, { responseType: 'blob' });
    const blob = new Blob([response.data], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = `E-Prescription-${prescriptionId}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('E-Prescription downloaded. Check your registered email for your secure PDF password.');
  } catch (err) {
    toast.error(err.response?.data?.error || err.message || 'Download failed');
  } finally {
    setDownloading(false);
  }
};

/* ─── Lab Test Tags — colored pill chips ─────────────────────────────────── */
const LabTestTags = ({ tests, tc, limit = 4, onSelectLab }) => {
  if (!tests || tests.length === 0) return null;
  const visible = tests.slice(0, limit);
  const overflow = tests.length - limit;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {visible.map((t, i) => (
        <button
          key={i}
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelectLab && onSelectLab(t); }}
          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[10px] font-bold tracking-wide cursor-pointer hover:scale-105 transition-all ${tc.labTagBg}`}
        >
          <FlaskConical className="w-2.5 h-2.5 flex-shrink-0" />
          {typeof t === 'string' ? t : (t.testName || t.name || 'Lab Test')}
        </button>
      ))}
      {overflow > 0 && (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full border border-slate-600 bg-slate-800/60 text-slate-400 text-[10px] font-bold">
          +{overflow} more
        </span>
      )}
    </div>
  );
};

/* ─── History feed card ───────────────────────────────────────────────────── */
const HistoryCard = ({ event, onRate }) => {
  const [expanded,    setExpanded]    = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [targetReportId, setTargetReportId] = useState(null);
  const [selectedLabTest, setSelectedLabTest] = useState(null);
  const [isLabModalOpen, setIsLabModalOpen] = useState(false);

  const details = event.data || {};
  const rawType = event.type || 'consultation';

  const handleDownloadLabReport = async (testItem) => {
    const reportId = typeof testItem === 'string'
      ? testItem
      : (testItem?.reportId || testItem?.labTestId || testItem?._id || testItem?.data?.reportId);

    if (!reportId) return toast.error('No report ID found');
    setDownloading(true);
    try {
      const response = await api.get(`/lab/patient/download-report/${reportId}`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `LabReport-${reportId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Lab report downloaded successfully.');
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to download report');
    } finally {
      setDownloading(false);
    }
  };

  const triggerDownloadReport = (reportId) => {
    setTargetReportId(reportId);
    setShowOtpModal(true);
  };

  const handleOtpVerify = async (code) => {
    setShowOtpModal(false);
    setIsDownloading(true);
    setDownloadProgress(10);
    
    const interval = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          handleDownloadLabReport(targetReportId);
          setIsDownloading(false);
          return 0;
        }
        return prev + 15;
      });
    }, 150);
  };

  // Treat OTC prescriptions as their own display type
  const isOTC = rawType === 'prescription' && details.isOTC;
  const isConsultation = rawType === 'consultation';
  const type  = isOTC ? 'otc' : rawType;
  const tc    = getTC(type);
  const { Icon } = tc;

  const dateStr = event.date
    ? new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Unknown date';

  // Merge labTests
  const labTests = [
    ...(details.labTests     || []),
    ...(details.orderedTests || []),
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  // Medications list (for OTC docs)
  const meds = details.medications || [];

  // Primary title
  const cardTitle = isOTC
    ? 'Direct Pharmacy Dispensation'
    : (details.diagnosis || 'Medical Consultation');

  return (
    <motion.div variants={cardVariants} className="relative pl-14">
      {/* Timeline dot */}
      <div className="absolute left-4 top-6 w-5 h-5 rounded-full bg-slate-950 border-2 border-slate-800 flex items-center justify-center z-10">
        <div className={`w-2 h-2 rounded-full ${tc.dot}`} />
      </div>

      {/* Card */}
      <div
        className={`glass-card rounded-2xl border ${tc.cardBorder} cursor-pointer transition-all duration-300 overflow-hidden neumorphic-flat`}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Card header */}
        <div className="p-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {/* Type icon */}
            <div className={`p-3 rounded-xl border flex-shrink-0 ${tc.iconBg}`}>
              <Icon className={`w-5 h-5 ${tc.iconColor}`} />
            </div>

            <div className="flex-1 min-w-0">
              {/* Date + type badge + ID */}
              <div className="flex items-center flex-wrap gap-2 mb-1.5">
                <span className="text-[10px] font-bold text-slate-500 font-mono tracking-wider uppercase">
                  {dateStr}
                </span>
                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border tracking-widest uppercase ${tc.badge}`}>
                  {isOTC ? 'OTC Dispensation' : type.replace('_', ' ')}
                </span>
                {details.consultationId && (
                  <span className="text-[9px] font-bold text-slate-400 border border-slate-700/50 bg-slate-800/30 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                    Ref: {details.consultationId}
                  </span>
                )}
              </div>

              {/* Title */}
              <h4 className="text-base md:text-lg font-bold text-white truncate leading-tight">
                {cardTitle}
              </h4>

              {/* Doctor / pharmacist / hospital */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                {details.doctorId?.fullName && (
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <User className="w-3 h-3" />
                    Dr. {details.doctorId.fullName}
                  </span>
                )}
                {isOTC && details.dispensedByPharmacist && (
                  <span className="flex items-center gap-1 text-xs text-teal-400">
                    <ShoppingBag className="w-3 h-3" />
                    Dispensed by {details.dispensedByPharmacist}
                  </span>
                )}
                {(details.hospitalId?.name || details.sessionHospitalId?.name) && (
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <Building2 className="w-3 h-3" />
                    {details.hospitalId?.name || details.sessionHospitalId?.name}
                  </span>
                )}
              </div>

              {/* Lab Test Tags (always visible) */}
              <LabTestTags
                tests={labTests}
                tc={tc}
                limit={4}
                onSelectLab={(l) => { setSelectedLabTest(l); setIsLabModalOpen(true); }}
              />

              {/* Follow-up indicator */}
              {details.followUpDate && new Date(details.followUpDate) > new Date() && (
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/12 border border-indigo-500/25">
                  <Calendar className="w-3 h-3 text-indigo-400" />
                  <span className="text-indigo-300 text-[10px] font-bold">
                    Follow-up: {new Date(details.followUpDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right: star rating + chevron */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {details.rating && (
              <div className="flex items-center gap-1 bg-amber-500/10 px-2.5 py-1 rounded-lg border border-amber-500/15 text-amber-400">
                <Star className="w-3.5 h-3.5 fill-amber-400" />
                <span className="text-xs font-bold font-mono">{details.rating}</span>
              </div>
            )}
            <div className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 transition-colors">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </div>
        </div>

        {/* Expanded detail */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.28, ease: 'easeInOut' }}
              className="border-t border-white/5 overflow-hidden"
            >
              <div className="p-5 space-y-5">

                {/* ── OTC medication list ── */}
                {isOTC && meds.length > 0 && (
                  <div>
                    <p className="label-caps mb-2">Dispensed Medications</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {meds.map((m, i) => (
                        <div key={i} className="flex justify-between items-center bg-teal-900/20 p-3 rounded-xl border border-teal-500/15">
                          <div className="min-w-0">
                            <div className="text-slate-200 font-bold text-sm truncate">{m.name}</div>
                            <div className="text-slate-400 text-xs mt-0.5">{m.dosage}</div>
                          </div>
                          <span className="text-[10px] font-bold bg-teal-500/10 text-teal-400 px-2 py-0.5 rounded border border-teal-500/20 font-mono ml-2">
                            {m.frequency}
                          </span>
                        </div>
                      ))}
                    </div>
                    {details.instructions && (
                      <p className="text-xs text-slate-400 mt-3 italic bg-slate-950/30 p-2 rounded-lg border border-white/5">
                        Note: {details.instructions}
                      </p>
                    )}
                  </div>
                )}

                {/* ── Doctor consultation expanded view ── */}
                {!isOTC && (
                  <>
                    {/* Symptoms */}
                    {details.symptoms?.length > 0 && (
                      <div>
                        <p className="label-caps mb-2 text-slate-400 text-xs font-bold tracking-wider uppercase">Symptoms Reported</p>
                        <div className="flex flex-wrap gap-1.5">
                          {details.symptoms.map((s, i) => (
                            <span key={i} className="px-2.5 py-1 bg-slate-900 border border-white/5 rounded-lg text-xs text-slate-300 font-semibold">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {details.prescriptions && details.prescriptions.length > 0 && (
                      <div>
                        <p className="label-caps mb-2 text-slate-400 text-xs font-bold tracking-wider uppercase">Prescribed Medications</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {details.prescriptions.map((p, pIdx) => {
                            const rxMeds = p.medications && p.medications.length > 0
                              ? p.medications
                              : [{ name: p.drugName, dosage: p.dosage, frequency: p.frequency }];

                            const isDispensed = p.status === 'dispensed';
                            const statusPill = <StatusBadge status={p.status} className="ml-2" />;

                            return (
                              <div key={pIdx} className="col-span-1 md:col-span-2 space-y-1.5">
                                {rxMeds.map((m, mIdx) => {
                                  if (!m.name) return null;
                                  return (
                                    <div key={`${pIdx}-${mIdx}`} className="flex flex-col bg-slate-900/50 p-3 rounded-xl border border-white/5">
                                      <div className="flex justify-between items-start">
                                        <div className="min-w-0 flex-1">
                                          <div className="text-slate-200 font-bold text-sm truncate flex items-center flex-wrap gap-1">
                                            {m.name}
                                            {statusPill}
                                          </div>
                                          <div className="text-slate-400 text-xs mt-0.5">{m.dosage}</div>
                                          {p.instructions && (
                                            <div className="text-slate-500 text-[10px] mt-0.5 italic">Note: {p.instructions}</div>
                                          )}
                                        </div>
                                        <span className="text-[10px] font-bold bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded border border-blue-500/20 font-mono ml-2 flex-shrink-0">
                                          {m.frequency}
                                        </span>
                                      </div>

                                      {/* ⚠️ Alternative Dispense Warning */}
                                      {p.isAlternativeDispensed && p.alternativeDetails && (
                                        <div className="mt-2 flex items-start gap-2 bg-amber-500/8 border border-amber-500/25 rounded-lg px-3 py-2">
                                          <span className="text-amber-400 text-xs font-black tracking-wide flex-shrink-0">⚠️ ALT DISPENSED:</span>
                                          <span className="text-amber-300/90 text-xs font-medium">{p.alternativeDetails}</span>
                                        </div>
                                      )}

                                      {/* Dispenser attribution (shown once per prescription, on first med row) */}
                                      {mIdx === 0 && isDispensed && p.pharmacyName && (
                                        <div className="mt-1.5 text-[10px] text-slate-500 flex items-center gap-1">
                                          <span className="font-semibold text-slate-400">{p.pharmacyName}</span>
                                          {p.dispensedByPharmacist && (
                                            <span className="text-slate-600">&mdash; Pharmacist: {p.dispensedByPharmacist}</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Clinical notes */}
                    {details.notes && (
                      <div>
                        <p className="label-caps mb-1.5 text-slate-400 text-xs font-bold tracking-wider uppercase">Clinical Notes</p>
                        <p className="text-sm text-slate-300 bg-slate-950/30 p-3 rounded-xl border border-white/5 leading-relaxed italic">
                          "{details.notes}"
                        </p>
                      </div>
                    )}

                    {/* Lab tests */}
                    {labTests.length > 0 && (
                      <div>
                        <p className="label-caps mb-2 text-slate-400 text-xs font-bold tracking-wider uppercase">Recommended Lab Tests</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {labTests.map((labDoc, idx) => {
                            const isString = typeof labDoc === 'string';
                            const name = isString ? labDoc : (labDoc.testName || labDoc.name || 'Lab Test');
                            const status = isString ? 'Pending' : (labDoc.status || 'Pending');
                            const reportId = !isString ? labDoc.reportId : null;

                            return (
                              <div key={idx} className="flex flex-col bg-slate-900/50 p-3 rounded-xl border border-white/5">
                                <div className="flex justify-between items-start mb-2">
                                  <div className="flex items-center gap-2">
                                    <FlaskConical className="w-4 h-4 text-purple-400 flex-shrink-0" />
                                    <span className="text-sm font-semibold text-slate-200">{name}</span>
                                  </div>
                                  <StatusBadge status={status} />
                                </div>
                                
                                {reportId && (
                                  <div className="text-xs text-slate-400 font-mono mb-2">
                                    ID: {reportId}
                                  </div>
                                )}

                                {!isString && (status.toLowerCase() === 'approved' || status.toLowerCase() === 'report_ready' || status.toLowerCase() === 'completed') && reportId && (
                                  <motion.button
                                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                                    onClick={(e) => { e.stopPropagation(); triggerDownloadReport(reportId); }}
                                    disabled={downloading || isDownloading}
                                    className="mt-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-all duration-200 w-full disabled:opacity-50"
                                  >
                                    {downloading || isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                    Download Report
                                  </motion.button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Follow-up details */}
                    {details.followUpDate && (
                      <div>
                        <p className="label-caps mb-1.5 text-slate-400 text-xs font-bold tracking-wider uppercase">Follow-up Scheduled</p>
                        <div className="flex items-center gap-2 bg-indigo-500/8 border border-indigo-500/20 rounded-xl p-3">
                          <Calendar className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                          <div>
                            <p className="text-indigo-200 text-sm font-semibold">
                              {new Date(details.followUpDate).toLocaleDateString('en-US', {
                                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                              })}
                            </p>
                            {details.followUpNotes && (
                              <p className="text-slate-400 text-xs mt-0.5 italic">{details.followUpNotes}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Action row: PDF download + Rate button ── */}
                    <div className="pt-2 border-t border-slate-900/60 flex flex-wrap justify-between items-center gap-3 relative z-30">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* PDF E-Prescription Download */}
                        {((details.prescriptions && details.prescriptions.length > 0) || isConsultation) && (
                          <motion.button
                            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                            onClick={e => { e.stopPropagation(); downloadPdf(details.consultationId || details._id, setDownloading); }}
                            disabled={downloading}
                            className="glass-btn flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-all duration-200 disabled:opacity-50"
                          >
                            {downloading
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Download className="w-3.5 h-3.5" />
                            }
                            {downloading ? 'Downloading…' : 'Download E-Prescription (PDF) 🔒'}
                          </motion.button>
                        )}

                        {/* Lab Report Download Button with zero/single/multiple test conditional logic */}
                        <LabReportDownloadButton
                          labTests={labTests}
                          onSelectTest={(t) => {
                            setSelectedLabTest(t);
                            setIsLabModalOpen(true);
                          }}
                        />
                      </div>

                      {/* Rate/View consultation ratings button */}
                      {(!details.reviews || details.reviews.length === 0) ? (
                        <motion.button
                          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                          onClick={e => { e.stopPropagation(); onRate(details); }}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold hover:bg-amber-500/20 transition-all duration-200"
                        >
                          <Star className="w-3.5 h-3.5 fill-amber-400" />
                          Rate Consultation
                        </motion.button>
                      ) : (
                        <motion.button
                          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                          onClick={e => { e.stopPropagation(); onRate(details); }}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800/50 border border-slate-700/50 text-slate-400 text-xs font-bold hover:bg-slate-800/80 transition-all duration-200"
                        >
                          <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          View Ratings
                        </motion.button>
                      )}
                    </div>
                  </>
                )}

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Lab Details Modal */}
      <LabDetailModal
        isOpen={isLabModalOpen}
        onClose={() => setIsLabModalOpen(false)}
        labTest={selectedLabTest}
        onDownload={(reportId) => handleDownloadLabReport(reportId)}
      />

      {/* OTP Verification Modal */}
      <Modal
        isOpen={showOtpModal}
        onClose={() => setShowOtpModal(false)}
        title="Secure Verification Required"
        size="sm"
      >
        <div className="flex flex-col items-center text-center gap-4">
          <p className="text-sm text-slate-300">
            To download your secure medical report, verify your identity using the 6-digit OTP code sent to your registered contact.
          </p>
          <OtpInput
            onSubmit={handleOtpVerify}
            onResend={() => toast.info('A new OTP code has been generated and sent.')}
            initialSeconds={120}
          />
        </div>
      </Modal>

      {/* Download Progress Indicator */}
      {isDownloading && (
        <div className="fixed bottom-6 right-6 z-50 glass-card p-4 border border-teal-500/30 flex flex-col gap-2 w-64 shadow-2xl">
          <div className="flex justify-between items-center text-xs">
            <span className="font-bold text-slate-200">Downloading Report...</span>
            <span className="font-mono text-teal-400 font-bold">{downloadProgress}%</span>
          </div>
          <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden border border-white/5">
            <div
              className="bg-gradient-to-r from-teal-500 to-emerald-400 h-full transition-all duration-150"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
        </div>
      )}
    </motion.div>
  );
};

/* ─── Summary chips ───────────────────────────────────────────────────────── */
const SummaryChip = ({ icon: Icon, label, count, color }) => (
  <div className={`flex items-center gap-2 px-4 py-2 rounded-xl glass-card border border-white/5 ${color}`}>
    <Icon className="w-4 h-4" />
    <span className="text-xs font-bold">{count}</span>
    <span className="text-xs text-slate-400 font-medium">{label}</span>
  </div>
);

/* ─── Main Page ───────────────────────────────────────────────────────────── */
const PatientHistory = () => {
  const [timeline,    setTimeline]    = useState([]);
  const [ratingModal, setRatingModal] = useState({ show: false, consultation: null });
  const [filter,      setFilter]      = useState('all');

  let nic = localStorage.getItem('nic');
  if (!nic) {
    const u = localStorage.getItem('user');
    if (u) { try { nic = JSON.parse(u).nic; } catch {} }
  }
  const { data, isLoading, isError, error } = useQuery({
    queryKey:  ['patientHistory', nic],
    queryFn:   async () => {
      const r = await api.get(`/patient/${nic}/timeline`);
      return r.data.data || r.data;
    },
    enabled:   !!nic,
    retry:     1,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => { if (data) setTimeline(Array.isArray(data) ? data : []); }, [data]);

  const handleRated = (consultationId, newReviews) =>
    setTimeline(prev => prev.map(item =>
      item.data?._id === consultationId ? { ...item, data: { ...item.data, reviews: [...(item.data.reviews || []), ...newReviews] } } : item
    ));

  /* Filtered feed — OTC filter maps to prescription events, prescription filter maps to consultations with nested prescriptions */
  const filtered = filter === 'all'
    ? timeline
    : filter === 'otc'
      ? timeline.filter(e => e.type === 'prescription' && e.data?.isOTC)
      : filter === 'prescription'
        ? timeline.filter(e => e.type === 'consultation' && e.data?.prescriptions && e.data.prescriptions.length > 0)
        : timeline.filter(e => e.type === filter);

  /* ── Guards ── */
  if (!nic) return (
    <div className="flex h-full items-center justify-center p-20 text-center bg-[#080d1a]">
      <div className="glass-card-premium p-8 rounded-2xl border border-red-500/20 max-w-sm">
        <p className="text-red-400 font-semibold mb-4">Session expired.</p>
        <button onClick={() => window.location.href = '/patient/login'}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl font-bold transition-all duration-200">
          Go to Login
        </button>
      </div>
    </div>
  );

  if (isLoading) return (
    <div className="flex h-full items-center justify-center p-20 bg-[#080d1a]">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 border-4 border-teal-500/20 rounded-full animate-pulse" />
        <div className="absolute inset-0 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </div>
  );

  if (isError) return (
    <div className="flex h-full items-center justify-center p-8 bg-[#080d1a]">
      <div className="glass-card-premium border border-red-500/20 rounded-2xl p-8 max-w-md text-center">
        <p className="text-red-400 font-bold mb-2">Failed to load history</p>
        <p className="text-slate-400 text-sm mb-6">{error?.response?.data?.error || error?.message || 'Unknown error'}</p>
        <button onClick={() => window.location.reload()}
          className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-500 transition-colors">
          Retry
        </button>
      </div>
    </div>
  );

  /* Stats */
  const consultCount    = timeline.filter(e => e.type === 'consultation').length;
  const rxCount         = timeline.reduce((acc, e) => acc + (e.type === 'consultation' && e.data?.prescriptions ? e.data.prescriptions.length : 0), 0);
  const otcCount        = timeline.filter(e => e.type === 'prescription' && e.data?.isOTC).length;
  const dispensingCount = timeline.filter(e => e.type === 'dispensing').length;
  const labTestCount    = timeline.reduce((acc, e) => {
    const d = e.data || {};
    return acc + (d.labTests?.length || 0) + (d.orderedTests?.length || 0);
  }, 0);

  return (
    <PageTransition className="p-4 md:p-8 min-h-screen bg-[#080d1a]">

      {/* ── Page header ── */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-200 to-slate-400 tracking-tight">
          Medical History
        </h1>
        <p className="text-slate-400 mt-1 text-sm">Your complete chronological health and prescription record.</p>
      </div>

      {/* ── Summary chips ── */}
      {timeline.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-8">
          <SummaryChip icon={Stethoscope}   label="Consultations"   count={consultCount}    color="text-blue-400" />
          <SummaryChip icon={Pill}          label="Prescriptions"   count={rxCount}         color="text-emerald-400" />
          {otcCount > 0 && (
            <SummaryChip icon={ShoppingBag} label="OTC Dispensed"   count={otcCount}        color="text-teal-400" />
          )}
          <SummaryChip icon={Package}       label="Dispensings"     count={dispensingCount} color="text-cyan-400" />
          {labTestCount > 0 && (
            <SummaryChip icon={FlaskConical} label="Lab Tests Ordered" count={labTestCount} color="text-purple-400" />
          )}
        </div>
      )}

      {/* ── Filter tabs ── */}
      {timeline.length > 0 && (
        <div className="flex gap-2 mb-8 flex-wrap">
          {['all', 'consultation', 'prescription', 'otc', 'dispensing'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all duration-200 ${
                filter === f
                  ? 'bg-teal-500/15 text-teal-400 border-teal-500/30 shadow-[0_0_12px_rgba(20,184,166,0.10)]'
                  : 'text-slate-500 border-slate-800/60 hover:text-slate-300 hover:border-slate-700'
              }`}
            >
              {f === 'all' ? 'All Events' : f === 'otc' ? 'OTC Dispensed' : f.replace('_', ' ')}
            </button>
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {timeline.length === 0 && (
        <div className="glass-card-premium rounded-2xl p-16 text-center border border-white/5 max-w-lg mx-auto">
          <Calendar className="w-14 h-14 text-slate-600 mx-auto mb-4 opacity-40" />
          <p className="text-slate-300 text-lg font-bold">No medical history available yet</p>
          <p className="text-slate-500 text-sm mt-2">Your consultations and prescriptions will appear here once registered.</p>
        </div>
      )}

      {/* ── Feed ── */}
      {filtered.length > 0 && (
        <div className="relative max-w-3xl">
          {/* Glowing vertical timeline line */}
          <div
            className="absolute left-6 top-4 bottom-4 w-[2px]"
            style={{
              background: 'linear-gradient(to bottom, rgba(20,184,166,0.5), rgba(99,102,241,0.25), transparent)',
              boxShadow: '0 0 8px rgba(20,184,166,0.15)',
            }}
            aria-hidden="true"
          />

          {/* Staggered card list */}
          <motion.div
            variants={feedVariants}
            initial="hidden"
            animate="visible"
            className="space-y-5"
          >
            {filtered.map((event, index) => (
              <HistoryCard
                key={event.data?._id || index}
                event={event}
                index={index}
                onRate={(consultation) => setRatingModal({ show: true, consultation })}
              />
            ))}
          </motion.div>
        </div>
      )}

      {/* Empty filter result */}
      {timeline.length > 0 && filtered.length === 0 && (
        <div className="text-center py-16 text-slate-500">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-semibold">No {filter} records found.</p>
        </div>
      )}

      {/* Rating modal */}
      <RateConsultationModal
        show={ratingModal.show}
        consultation={ratingModal.consultation}
        onClose={() => setRatingModal({ show: false, consultation: null })}
        onRated={handleRated}
      />
    </PageTransition>
  );
};

export default PatientHistory;
