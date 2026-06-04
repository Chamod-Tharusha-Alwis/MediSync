import React, { useState, useRef, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FlaskConical, Shield, Clock, CheckCircle, Upload, Search,
  Copy, ClipboardCheck, AlertCircle, FileText, User, Calendar,
  Loader2, RefreshCw, ArrowRight, Send
} from 'lucide-react';
import api from '../../api/axiosInstance';
import PageTransition from '../../components/common/PageTransition';

// ── Status badge colours ─────────────────────────────────────────────────────
const STATUS_CONFIG = {
  pending:          { color: 'amber',   label: 'Pending',          icon: Clock },
  sample_collected: { color: 'blue',    label: 'Sample Collected', icon: ClipboardCheck },
  processing:       { color: 'purple',  label: 'Processing',       icon: Loader2 },
  report_ready:     { color: 'emerald', label: 'Report Ready',     icon: CheckCircle },
  delivered:        { color: 'teal',    label: 'Delivered',         icon: CheckCircle },
};

const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full border
      bg-${cfg.color}-500/10 text-${cfg.color}-400 border-${cfg.color}-500/20`}
    >
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </span>
  );
};

// ── Urgency badge ────────────────────────────────────────────────────────────
const UrgencyBadge = ({ urgency }) => {
  const config = {
    routine: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/20', label: 'Routine' },
    urgent:  { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', label: 'Urgent' },
    stat:    { bg: 'bg-red-500/10',   text: 'text-red-400',   border: 'border-red-500/20',   label: 'STAT' },
  };
  const c = config[urgency] || config.routine;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold rounded-full border ${c.bg} ${c.text} ${c.border}`}>
      <Clock className="w-3 h-3" />
      {c.label}
    </span>
  );
};

// ── Shared input styles ──────────────────────────────────────────────────────
const inputClass = 'w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all';
const labelClass = 'block text-sm font-medium text-slate-300 mb-1.5';

// ── Animation variants ───────────────────────────────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } },
  exit: { opacity: 0, x: -40, scale: 0.95, transition: { duration: 0.25 } },
};

const fadeIn = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1: Approve Prescribed Tests (OTP Consent + Approval Workflow)
// ─────────────────────────────────────────────────────────────────────────────
const RegisterNewTest = () => {
  const [step, setStep]                 = useState('nic');
  const [nic, setNic]                   = useState('');
  const [patientInfo, setPatientInfo]   = useState(null);
  const [otp, setOtp]                   = useState('');
  const [pendingTests, setPendingTests] = useState([]);
  const [approvedTests, setApprovedTests] = useState([]);
  const [lastReportId, setLastReportId] = useState('');
  const [loading, setLoading]           = useState(false);
  const [approvingId, setApprovingId]   = useState(null);
  const [copied, setCopied]             = useState(false);
  const [testsFetched, setTestsFetched] = useState(false);

  // Step 1: Send OTP only
  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!nic.trim()) return toast.error('Please enter the patient NIC');
    setLoading(true);
    try {
      const otpRes = await api.post('/lab/hospital/request-otp', { patientNic: nic.trim() });
      setPatientInfo(otpRes.data);
      toast.success('Consent OTP sent to patient\'s email');
      setStep('otp');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP & Fetch Tests
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp.trim()) return toast.error('Please enter the OTP');
    setLoading(true);
    try {
      const { data } = await api.post('/lab/hospital/verify-fetch-tests', {
        nic: nic.trim(),
        otp: otp.trim(),
      });
      setPendingTests(Array.isArray(data) ? data : data.tests || []);
      setTestsFetched(true);
      toast.success('OTP verified successfully');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to verify OTP');
    } finally {
      setLoading(false);
    }
  };

  // Approve a single pending test
  const handleApprove = async (test) => {
    if (!otp.trim()) return toast.error('Please enter the OTP before approving');
    setApprovingId(test._id);
    try {
      const { data } = await api.post('/lab/hospital/approve-test', {
        testId: test._id,
        nic: nic.trim(),
        otp: otp.trim(),
      });
      toast.success(`Approved! Report ID: ${data.reportId}`);
      setLastReportId(data.reportId);
      setApprovedTests((prev) => [...prev, { ...test, reportId: data.reportId, labTestId: data.labTestId }]);
      const remaining = pendingTests.filter((t) => t._id !== test._id);
      setPendingTests(remaining);
      if (remaining.length === 0) {
        setStep('success');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to approve test');
    } finally {
      setApprovingId(null);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Report ID copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setStep('nic');
    setNic('');
    setPatientInfo(null);
    setOtp('');
    setPendingTests([]);
    setApprovedTests([]);
    setLastReportId('');
    setCopied(false);
    setTestsFetched(false);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {['Patient NIC', 'OTP & Approve', 'Complete'].map((label, i) => {
          const stepMap = ['nic', 'otp', 'success'];
          const currentIdx = stepMap.indexOf(step);
          const isActive = i <= currentIdx;
          return (
            <React.Fragment key={label}>
              {i > 0 && (
                <div className={`h-0.5 w-12 rounded ${isActive ? 'bg-emerald-500' : 'bg-slate-700'} transition-colors`} />
              )}
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
                  ${isActive ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-800 border-slate-600 text-slate-500'}`}
                >
                  {i + 1}
                </div>
                <span className={`text-sm hidden sm:inline ${isActive ? 'text-white font-medium' : 'text-slate-500'}`}>{label}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Step 1: NIC Entry */}
      {step === 'nic' && (
        <motion.div
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          className="glass-panel p-8 rounded-2xl border border-slate-700/50"
        >
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-emerald-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
              <Shield className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold text-white">Patient Consent</h3>
            <p className="text-slate-400 mt-1 text-sm">Enter the patient's NIC to send a consent OTP and fetch prescribed tests.</p>
          </div>
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div>
              <label className={labelClass}>Patient NIC Number</label>
              <input
                id="register-nic-input"
                type="text"
                value={nic}
                onChange={(e) => setNic(e.target.value)}
                className={inputClass}
                placeholder="e.g. 200012345678"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={loading || !nic.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-50
                bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              {loading ? 'Sending OTP...' : 'Send Consent OTP'}
            </button>
          </form>
        </motion.div>
      )}

      {/* Step 2: OTP + Pending Tests Approval */}
      {step === 'otp' && (
        <motion.div
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          {/* Patient info banner */}
          {patientInfo && (
            <div className="glass-panel p-4 rounded-xl border border-emerald-500/20 flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-white font-medium">{patientInfo.patientName}</p>
                <p className="text-emerald-400/70 text-xs">OTP sent to {patientInfo.patientEmail?.replace(/(.{3}).+(@.+)/, '$1***$2')}</p>
              </div>
              <CheckCircle className="w-5 h-5 text-emerald-400 ml-auto shrink-0" />
            </div>
          )}

          {/* OTP Input & Verify Form */}
          {!testsFetched ? (
            <form onSubmit={handleVerifyOtp} className="glass-panel p-6 rounded-2xl border border-slate-700/50">
              <label className={labelClass}>Patient Consent OTP</label>
              <input
                id="register-otp-input"
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className={`${inputClass} text-center text-2xl tracking-[0.5em] font-mono mb-4`}
                placeholder="● ● ● ● ● ●"
                maxLength={6}
                autoFocus
              />
              <button
                type="submit"
                disabled={loading || !otp.trim()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-50
                  bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Shield className="w-5 h-5" />}
                {loading ? 'Verifying...' : 'Verify & View Tests'}
              </button>
              <p className="text-xs text-slate-500 mt-3 text-center">Ask the patient for the 6-digit OTP they received via email.</p>
            </form>
          ) : (
            <div className="glass-panel p-4 rounded-xl border border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-emerald-400" />
                <span className="text-slate-300 font-medium">OTP Verified</span>
              </div>
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            </div>
          )}

          {/* Pending Tests List (Only visible after OTP verified) */}
          {testsFetched && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-white flex items-center gap-2">
                <FlaskConical className="w-5 h-5 text-teal-400" />
                Pending Prescribed Tests
              </h4>
              <span className="text-xs font-medium text-slate-400 bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
                {pendingTests.length} test{pendingTests.length !== 1 ? 's' : ''}
              </span>
            </div>

            {pendingTests.length === 0 ? (
              <div className="glass-panel p-8 rounded-2xl border border-slate-700/50 text-center">
                <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <p className="text-slate-400 font-medium">No pending tests found</p>
                <p className="text-slate-500 text-sm mt-1">This patient has no doctor-prescribed tests awaiting approval.</p>
              </div>
            ) : (
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="grid gap-4 sm:grid-cols-2"
              >
                <AnimatePresence mode="popLayout">
                  {pendingTests.map((test) => (
                    <motion.div
                      key={test._id}
                      variants={cardVariants}
                      layout
                      exit="exit"
                      className="glass-panel p-5 rounded-xl border border-slate-700/50 hover:border-emerald-500/30 transition-colors group"
                    >
                      {/* Card Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <h5 className="text-white font-semibold text-sm truncate">{test.testName}</h5>
                          {test.testCategory && (
                            <span className="inline-block mt-1 text-xs text-teal-400/80 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/15">
                              {test.testCategory}
                            </span>
                          )}
                        </div>
                        <UrgencyBadge urgency={test.urgency || 'routine'} />
                      </div>

                      {/* Card Details */}
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center gap-2 text-sm">
                          <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="text-slate-400 truncate">
                            Dr. {test.referredBy?.fullName || test.referredBy?.name || 'Unknown'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="text-slate-400">{formatDate(test.prescribedDate || test.createdAt)}</span>
                        </div>
                      </div>

                      {/* Approve Button */}
                      <button
                        onClick={() => handleApprove(test)}
                        disabled={approvingId === test._id}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-semibold text-sm text-white transition-all disabled:opacity-50
                          bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/30"
                      >
                        {approvingId === test._id ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Approving...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4" />
                            Approve Test
                          </>
                        )}
                      </button>
                    </motion.div>
                  ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </div>
          )}

          {/* Approved Tests Summary */}
          {approvedTests.length > 0 && (
            <motion.div
              variants={fadeIn}
              initial="hidden"
              animate="visible"
              className="glass-panel p-5 rounded-xl border border-emerald-500/20"
            >
              <h4 className="text-sm font-semibold text-emerald-400 mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" />
                Approved ({approvedTests.length})
              </h4>
              <div className="space-y-2">
                {approvedTests.map((t) => (
                  <div key={t._id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-800/40 border border-slate-700/30">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="text-white text-sm truncate">{t.testName}</span>
                    </div>
                    <button
                      onClick={() => handleCopy(t.reportId)}
                      className="flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 transition-colors ml-2 shrink-0"
                    >
                      <Copy className="w-3 h-3" />
                      {t.reportId}
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Step 3: Success */}
      {step === 'success' && (
        <motion.div
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          className="glass-panel p-8 rounded-2xl border border-emerald-500/20 text-center"
        >
          <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border-2 border-emerald-400/30">
            <CheckCircle className="w-10 h-10 text-emerald-400" />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">All Tests Approved!</h3>
          <p className="text-slate-400 mb-6">
            {approvedTests.length} test{approvedTests.length !== 1 ? 's were' : ' was'} approved successfully. Share the Report ID{approvedTests.length !== 1 ? 's' : ''} with the lab assistant.
          </p>

          {/* Last Report ID highlight */}
          <div
            onClick={() => handleCopy(lastReportId)}
            className="group cursor-pointer mx-auto max-w-sm p-6 rounded-xl bg-slate-800/80 border-2 border-dashed border-emerald-500/30 hover:border-emerald-400 transition-all mb-4"
          >
            <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Latest Report ID</p>
            <p className="text-2xl font-mono font-bold text-emerald-400 tracking-wider break-all">{lastReportId}</p>
            <div className="flex items-center justify-center gap-1.5 mt-3 text-sm text-slate-400 group-hover:text-emerald-400 transition-colors">
              {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Click to copy'}
            </div>
          </div>

          {/* All approved tests */}
          {approvedTests.length > 1 && (
            <div className="mx-auto max-w-sm space-y-2 mb-6">
              {approvedTests.map((t) => (
                <div
                  key={t._id}
                  onClick={() => handleCopy(t.reportId)}
                  className="cursor-pointer flex items-center justify-between py-2.5 px-4 rounded-lg bg-slate-800/50 border border-slate-700/30 hover:border-emerald-500/30 transition-colors"
                >
                  <span className="text-white text-sm truncate">{t.testName}</span>
                  <span className="text-emerald-400 text-xs font-mono ml-2 shrink-0 flex items-center gap-1">
                    <Copy className="w-3 h-3" />
                    {t.reportId}
                  </span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleReset}
            className="mt-4 flex items-center gap-2 mx-auto px-6 py-2.5 rounded-lg text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Approve Another Patient's Tests
          </button>
        </motion.div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2: Lab Assistant Upload (Report ID Search)
// ─────────────────────────────────────────────────────────────────────────────
const LabAssistantUpload = () => {
  const [reportId, setReportId]     = useState('');
  const [testData, setTestData]     = useState(null);
  const [loading, setLoading]       = useState(false);
  const [updating, setUpdating]     = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [newStatus, setNewStatus]   = useState('');
  const fileInputRef                = useRef(null);

  // Fetch test by Report ID
  const handleSearch = useCallback(async (e) => {
    e?.preventDefault();
    if (!reportId.trim()) return toast.error('Enter a Report ID');
    setLoading(true);
    setTestData(null);
    try {
      const { data } = await api.get(`/lab/assistant/test/${reportId.trim()}`);
      setTestData(data);
      setNewStatus(data.status);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Report not found');
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  // Update status
  const handleStatusUpdate = async () => {
    if (!newStatus || newStatus === testData?.status) return;
    setUpdating(true);
    try {
      await api.patch(`/lab/${testData.labTestId}/status`, { status: newStatus, note: `Status updated to ${newStatus}` });
      toast.success(`Status updated to "${newStatus}"`);
      handleSearch();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update status');
    } finally {
      setUpdating(false);
    }
  };

  // Upload PDF report
  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files are accepted');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('report', file);

    try {
      await api.post(`/lab/${testData.labTestId}/upload-report`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success('Report uploaded & encrypted successfully!');
      handleSearch();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to upload report');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      {/* Search Bar */}
      <motion.form
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        onSubmit={handleSearch}
        className="glass-panel p-6 rounded-2xl border border-slate-700/50 mb-6"
      >
        <label className={labelClass}>Report ID</label>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-slate-500" />
            </div>
            <input
              id="assistant-report-id"
              type="text"
              value={reportId}
              onChange={(e) => setReportId(e.target.value)}
              className={`${inputClass} pl-10`}
              placeholder="e.g. LAB-2026-a1b2c3d4"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={loading || !reportId.trim()}
            className="flex items-center gap-2 px-6 rounded-xl font-semibold text-white transition-all disabled:opacity-50
              bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 shadow-lg shadow-emerald-500/20"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
            Fetch
          </button>
        </div>
      </motion.form>

      {/* Test Details Panel */}
      {testData && (
        <motion.div
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          className="glass-panel p-6 rounded-2xl border border-slate-700/50 space-y-6"
        >
          {/* Header */}
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <h3 className="text-xl font-bold text-white">{testData.testName}</h3>
              <p className="text-slate-400 text-sm mt-1">{testData.testCategory} • {testData.labTestId}</p>
            </div>
            <StatusBadge status={testData.status} />
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <p className="text-xs text-slate-500 uppercase tracking-wider">Urgency</p>
              <p className="text-white font-medium mt-1 capitalize">{testData.urgency || 'Routine'}</p>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
              <p className="text-xs text-slate-500 uppercase tracking-wider">Created</p>
              <p className="text-white font-medium mt-1">{new Date(testData.createdAt).toLocaleDateString()}</p>
            </div>
            {testData.reportUploadedAt && (
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
                <p className="text-xs text-slate-500 uppercase tracking-wider">Report Uploaded</p>
                <p className="text-white font-medium mt-1">{new Date(testData.reportUploadedAt).toLocaleDateString()}</p>
              </div>
            )}
          </div>

          {/* Status History */}
          {testData.statusHistory?.length > 0 && (
            <div>
              <p className="text-sm font-medium text-slate-300 mb-3">Status History</p>
              <div className="space-y-2">
                {testData.statusHistory.map((h, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <div className={`w-2 h-2 rounded-full ${i === testData.statusHistory.length - 1 ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    <span className="text-white font-medium capitalize">{h.status.replace('_', ' ')}</span>
                    {h.note && <span className="text-slate-500">— {h.note}</span>}
                    <span className="text-slate-600 ml-auto text-xs">{new Date(h.changedAt || h.timestamp).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="h-px bg-slate-700/50" />

          {/* Status Update */}
          <div>
            <p className="text-sm font-medium text-slate-300 mb-3">Update Status</p>
            <div className="flex gap-3">
              <select
                id="assistant-status-select"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className={`${inputClass} flex-1`}
              >
                <option value="pending">Pending</option>
                <option value="sample_collected">Sample Collected</option>
                <option value="processing">Processing</option>
                <option value="report_ready">Report Ready</option>
                <option value="delivered">Delivered</option>
              </select>
              <button
                onClick={handleStatusUpdate}
                disabled={updating || newStatus === testData.status}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-white transition-all disabled:opacity-50
                  bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400"
              >
                {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Update
              </button>
            </div>
          </div>

          {/* PDF Upload */}
          <div>
            <p className="text-sm font-medium text-slate-300 mb-3">Upload Lab Report (PDF)</p>
            {testData.status === 'report_ready' || testData.reportUploadedAt ? (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                <p className="text-emerald-400 font-medium">Report already uploaded and encrypted</p>
              </div>
            ) : (
              <div className="relative">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handleUpload}
                  className="hidden"
                  id="assistant-upload-input"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full flex flex-col items-center justify-center gap-3 py-8 rounded-xl border-2 border-dashed border-slate-600 hover:border-emerald-500 bg-slate-800/30 hover:bg-slate-800/50 transition-all disabled:opacity-50 cursor-pointer group"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                      <span className="text-slate-300 font-medium">Encrypting & uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                      <span className="text-slate-400 group-hover:text-white font-medium transition-colors">
                        Click to upload PDF report
                      </span>
                      <span className="text-xs text-slate-600">PDF will be encrypted with patient's NIC before storage</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Empty State */}
      {!testData && !loading && (
        <motion.div
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          className="text-center py-16"
        >
          <FileText className="w-16 h-16 text-slate-700 mx-auto mb-4" />
          <p className="text-slate-500 text-lg">Enter a Report ID to view and manage the test</p>
          <p className="text-slate-600 text-sm mt-1">The Report ID is provided after a test is approved in the registration workflow</p>
        </motion.div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const LabManagement = () => {
  const [activeTab, setActiveTab] = useState('register');

  const tabs = [
    { key: 'register',  label: 'Approve Tests',          icon: FlaskConical },
    { key: 'assistant', label: 'Lab Assistant Upload',    icon: Upload },
  ];

  return (
    <PageTransition className="p-6">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
          <FlaskConical className="w-8 h-8 text-emerald-400" />
          Laboratory Management
        </h1>
        <p className="text-slate-400 mt-1">Approve doctor-prescribed lab tests with patient consent or manage existing ones.</p>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 p-1 rounded-xl bg-slate-800/50 border border-slate-700/50 max-w-md mb-8">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all
                ${active
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'register'  && <RegisterNewTest />}
      {activeTab === 'assistant' && <LabAssistantUpload />}
    </PageTransition>
  );
};

export default LabManagement;
