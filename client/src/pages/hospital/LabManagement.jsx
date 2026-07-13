import React, { useState, useRef, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';
import { motion } from 'framer-motion';
import {
  FlaskConical, Shield, Clock, CheckCircle, Upload, Search,
  Copy, FileText, User, Loader2, RefreshCw, ArrowRight, Send, Check
} from 'lucide-react';
import api from '../../api/axiosInstance';
import PageTransition from '../../components/common/PageTransition';
import StatusBadge from '../../components/ui/StatusBadge';
import OtpInput from '../../components/ui/OtpInput';
import Modal from '../../components/ui/Modal';
import Skeleton from '../../components/ui/Skeleton';

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

const labelClass = 'block text-xs font-semibold uppercase text-slate-400 mb-1.5';

const fadeIn = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1: Approve Prescribed Tests (OTP Consent + Approval)
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

  const handleSendOtp = async (e) => {
    e?.preventDefault();
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

  const handleVerifyOtpCode = async (code) => {
    setLoading(true);
    try {
      const { data } = await api.post('/lab/hospital/verify-fetch-tests', {
        nic: nic.trim(),
        otp: code,
      });
      setOtp(code);
      setPendingTests(Array.isArray(data) ? data : data.tests || []);
      toast.success('Consent OTP verified successfully!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to verify OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (test) => {
    if (!otp) return toast.error('OTP session not validated');
    setApprovingId(test._id);
    try {
      const { data } = await api.post('/lab/hospital/approve-test', {
        testId: test._id,
        nic: nic.trim(),
        otp: otp,
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
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-2 mb-8 select-none">
        {['Patient NIC', 'Approve Tests', 'Complete'].map((label, i) => {
          const stepMap = ['nic', 'otp', 'success'];
          const currentIdx = stepMap.indexOf(step);
          const isActive = i <= currentIdx;
          return (
            <React.Fragment key={label}>
              {i > 0 && (
                <div className={`h-0.5 w-12 rounded ${isActive ? 'bg-emerald-500' : 'bg-slate-800'} transition-colors`} />
              )}
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
                  ${isActive ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg' : 'bg-slate-900 border-white/5 text-slate-500'}`}
                >
                  {i + 1}
                </div>
                <span className={`text-sm hidden sm:inline ${isActive ? 'text-white font-medium' : 'text-slate-500'}`}>{label}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {step === 'nic' && (
        <motion.div variants={fadeIn} initial="hidden" animate="visible" className="glass-panel p-8 rounded-2xl border border-white/5">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-emerald-600/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-500/20 animate-pulse-subtle">
              <Shield className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold text-white">Patient Consent Verification</h3>
            <p className="text-slate-400 mt-1.5 text-sm">Verify patient identity via National Identity Card (NIC) to send authentication OTP.</p>
          </div>
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Patient NIC Number</label>
              <input
                type="text"
                value={nic}
                onChange={(e) => setNic(e.target.value)}
                className="glass-input text-sm text-center tracking-wider"
                placeholder="e.g. 200012345678"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={loading || !nic.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-40
                bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 shadow-lg"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              {loading ? 'Requesting Consent OTP...' : 'Send Verification OTP'}
            </button>
          </form>
        </motion.div>
      )}

      {step === 'otp' && (
        <motion.div variants={fadeIn} initial="hidden" animate="visible" className="space-y-6">
          {patientInfo && (
            <div className="glass-panel p-4 rounded-xl border border-emerald-500/20 flex items-center gap-3 select-none">
              <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center shrink-0">
                <User className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-white font-bold text-sm truncate">{patientInfo.patientName}</p>
                <p className="text-slate-400 text-xs truncate">Auth OTP routed to {patientInfo.patientEmail?.replace(/(.{3}).+(@.+)/, '$1***$2')}</p>
              </div>
              <Check className="w-5 h-5 text-emerald-400 shrink-0" />
            </div>
          )}

          {!otp ? (
            <div className="glass-panel p-8 rounded-2xl border border-white/5 flex flex-col items-center gap-4 text-center">
              <label className={labelClass}>Enter 6-Digit Consent Code</label>
              <OtpInput
                onSubmit={handleVerifyOtpCode}
                onResend={handleSendOtp}
                initialSeconds={120}
              />
            </div>
          ) : (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider select-none">Prescribed Laboratory Procedures</h4>
              {pendingTests.length === 0 ? (
                <div className="glass-panel p-8 text-center text-slate-500 border border-white/5 rounded-2xl select-none">
                  No pending prescriptions found for this patient.
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {pendingTests.map((test) => (
                    <div key={test._id} className="glass-panel p-5 rounded-xl border border-white/5 flex flex-col justify-between">
                      <div className="mb-4">
                        <div className="flex justify-between items-start gap-2 mb-2">
                          <h5 className="text-white font-bold text-sm truncate">{test.testName}</h5>
                          <UrgencyBadge urgency={test.urgency || 'routine'} />
                        </div>
                        <p className="text-slate-400 text-xs mt-1">Referred: Dr. {test.referredBy?.fullName || 'Practitioner'}</p>
                      </div>
                      <button
                        onClick={() => handleApprove(test)}
                        disabled={approvingId === test._id}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 transition-all disabled:opacity-40"
                      >
                        {approvingId === test._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        {approvingId === test._id ? 'Approving...' : 'Approve Test'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {approvedTests.length > 0 && (
            <div className="glass-panel p-5 rounded-xl border border-emerald-500/20 space-y-3">
              <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 select-none">
                <CheckCircle className="w-4 h-4" /> Approved for processing
              </h4>
              <div className="space-y-2">
                {approvedTests.map((t) => (
                  <div key={t._id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-950/40 border border-white/5">
                    <span className="text-white text-xs font-bold truncate flex-1">{t.testName}</span>
                    <button
                      onClick={() => handleCopy(t.reportId)}
                      className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 hover:text-emerald-300 transition-colors bg-white/5 border border-white/5 px-2 py-1 rounded"
                    >
                      <Copy className="w-3 h-3" /> {t.reportId}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {step === 'success' && (
        <motion.div variants={fadeIn} initial="hidden" animate="visible" className="glass-panel p-8 rounded-2xl border border-emerald-500/25 text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-400/25">
            <CheckCircle className="w-8 h-8 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-2xl font-bold text-white">All Tests Approved!</h3>
            <p className="text-slate-400 text-xs mt-1">Tests have been loaded to the laboratory system roster for active processing.</p>
          </div>

          <div
            onClick={() => handleCopy(lastReportId)}
            className="group cursor-pointer mx-auto max-w-xs p-5 rounded-xl bg-slate-950/40 border-2 border-dashed border-emerald-500/20 hover:border-emerald-500/40 transition-all text-center"
          >
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1 select-none">Latest Report ID</p>
            <p className="text-xl font-mono font-bold text-emerald-400 tracking-wider break-all">{lastReportId}</p>
            <span className="text-[10px] text-slate-400 group-hover:text-emerald-400 transition-colors mt-2 block font-semibold">
              {copied ? 'Copied to clipboard' : 'Click code to copy'}
            </span>
          </div>

          <button
            onClick={handleReset}
            className="glass-button text-xs py-2.5 px-6 mx-auto flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Approve Next Patient
          </button>
        </motion.div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2: Lab Work Queue (Master list of Lab Tests with split-tabs)
// ─────────────────────────────────────────────────────────────────────────────
const LabWorkQueue = ({ onOpenUpload }) => {
  const [tests, setTests] = useState([]);
  const [filterStatus, setFilterStatus] = useState('pending_accept'); // pending_accept | in_progress | completed
  const [searchNic, setSearchNic] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchTests = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/lab/hospital/all');
      setTests(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error('Failed to load work queue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTests();
  }, []);

  // Filter list by selected queue state
  const filteredQueue = tests.filter(t => {
    const matchesStatus = 
      filterStatus === 'pending_accept' ? t.status === 'pending' :
      filterStatus === 'in_progress' ? ['Approved', 'sample_collected', 'processing'].includes(t.status) :
      /* completed */ ['report_ready', 'delivered'].includes(t.status);

    const matchesSearch = searchNic.trim()
      ? t.labTestId.toLowerCase().includes(searchNic.toLowerCase()) ||
        t.testName.toLowerCase().includes(searchNic.toLowerCase()) ||
        t.patientName?.toLowerCase().includes(searchNic.toLowerCase())
      : true;

    return matchesStatus && matchesSearch;
  });

  const handleUpdateStatus = async (labTestId, nextStatus) => {
    try {
      await api.patch(`/lab/${labTestId}/status`, { status: nextStatus, note: `Status updated to ${nextStatus}` });
      toast.success(`Status updated successfully.`);
      fetchTests();
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  return (
    <div className="space-y-6">
      {/* Search & Sub-Tabs */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* State filters */}
        <div className="flex gap-1 bg-slate-950/40 p-1 rounded-xl border border-white/5 w-full md:w-auto select-none">
          {[
            { key: 'pending_accept', label: 'Pending Accept' },
            { key: 'in_progress', label: 'In-Progress' },
            { key: 'completed', label: 'Completed' }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilterStatus(tab.key)}
              className={`flex-1 md:flex-none text-xs font-semibold py-2 px-4 rounded-lg transition-all ${
                filterStatus === tab.key
                  ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Patient Search */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchNic}
            onChange={(e) => setSearchNic(e.target.value)}
            className="glass-input text-xs pl-10"
            placeholder="Search by ID or Test Name..."
          />
        </div>
      </div>

      {/* Grid List */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2"><Skeleton.Card /><Skeleton.Card /></div>
      ) : filteredQueue.length === 0 ? (
        <div className="glass-panel p-12 text-center text-slate-500 border border-white/5 rounded-2xl select-none">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          No matching records found in this queue.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredQueue.map(t => (
            <div key={t._id} className="glass-panel p-5 rounded-2xl border border-white/5 flex flex-col justify-between hover:border-teal-500/20 transition-all">
              <div>
                <div className="flex justify-between items-start gap-2 mb-3">
                  <div className="min-w-0">
                    <h5 className="text-white font-bold text-sm truncate">{t.testName}</h5>
                    <p className="text-[10px] text-slate-500 font-mono mt-1">{t.labTestId}</p>
                  </div>
                  <StatusBadge status={t.status} />
                </div>

                <div className="space-y-2 text-xs text-slate-400 border-t border-white/5 pt-3 mb-4">
                  <div className="flex justify-between">
                    <span>Patient Name:</span>
                    <span className="font-bold text-slate-200">{t.patientName || 'Anonymous'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Referring Doctor:</span>
                    <span className="text-slate-300">Dr. {t.referredBy?.fullName || 'Practitioner'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Date Prescribed:</span>
                    <span className="font-mono">{new Date(t.createdAt).toLocaleDateString()}</span>
                  </div>
                  <UrgencyBadge urgency={t.urgency} />
                </div>
              </div>

              {/* Status lifecycle updates */}
              <div className="space-y-2 border-t border-white/5 pt-3">
                {t.status === 'Approved' && (
                  <button
                    onClick={() => handleUpdateStatus(t.labTestId, 'sample_collected')}
                    className="w-full text-center py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition-colors"
                  >
                    Mark Sample Collected
                  </button>
                )}
                {t.status === 'sample_collected' && (
                  <button
                    onClick={() => handleUpdateStatus(t.labTestId, 'processing')}
                    className="w-full text-center py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-colors"
                  >
                    Begin Processing Diagnostics
                  </button>
                )}
                {t.status === 'processing' && (
                  <button
                    onClick={() => onOpenUpload(t)}
                    className="w-full text-center py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white font-bold text-xs transition-all flex items-center justify-center gap-1.5"
                  >
                    <Upload className="w-4 h-4" /> Upload Report PDF
                  </button>
                )}
                {t.status === 'report_ready' && (
                  <button
                    onClick={() => handleUpdateStatus(t.labTestId, 'delivered')}
                    className="w-full text-center py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs border border-white/5"
                  >
                    Release & Deliver to Patient
                  </button>
                )}
                {['report_ready', 'delivered'].includes(t.status) && (
                  <div className="flex items-center gap-1 text-[11px] text-emerald-400 font-bold justify-center select-none bg-emerald-500/5 py-1.5 rounded-lg border border-emerald-500/10">
                    <CheckCircle className="w-3.5 h-3.5" /> Result Sealed & Released
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3: Lab Report Upload Modal Workflow (Search and dropzone)
// ─────────────────────────────────────────────────────────────────────────────
const LabAssistantUpload = () => {
  const [reportId, setReportId]     = useState('');
  const [testData, setTestData]     = useState(null);
  const [loading, setLoading]       = useState(false);
  const [updating, setUpdating]     = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [newStatus, setNewStatus]   = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef                = useRef(null);

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
      toast.error(err.response?.data?.message || 'Report ID not found in laboratory directory');
    } finally {
      setLoading(false);
    }
  }, [reportId]);

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

  const handleUploadFile = async (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files are accepted');
      return;
    }

    setUploading(true);
    setUploadProgress(10);
    const formData = new FormData();
    formData.append('report', file);

    try {
      await api.post(`/lab/${testData.labTestId}/upload-report`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        }
      });
      toast.success('Report encrypted and signed successfully!');
      handleSearch();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to encrypt/upload report');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Search Bar */}
      <motion.form variants={fadeIn} initial="hidden" animate="visible" onSubmit={handleSearch} className="glass-panel p-6 rounded-2xl border border-white/5">
        <label className={labelClass}>Report Verification ID</label>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={reportId}
              onChange={(e) => setReportId(e.target.value)}
              className="glass-input pl-10 text-sm"
              placeholder="e.g. LAB-2026-a1b2c3d4"
              autoFocus
            />
          </div>
          <button
            type="submit"
            disabled={loading || !reportId.trim()}
            className="glass-button text-xs py-2.5 px-6 shrink-0 flex items-center gap-1 bg-gradient-to-r from-emerald-600 to-teal-500 text-white disabled:opacity-40"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            Retrieve
          </button>
        </div>
      </motion.form>

      {/* Details & Dropzone */}
      {testData && (
        <motion.div variants={fadeIn} initial="hidden" animate="visible" className="glass-panel p-6 rounded-2xl border border-white/5 space-y-6">
          <div className="flex justify-between items-start gap-4">
            <div>
              <h3 className="text-lg font-bold text-white">{testData.testName}</h3>
              <p className="text-xs text-slate-400 mt-1">{testData.testCategory || 'General Diagnostics'} • ID: {testData.labTestId}</p>
            </div>
            <StatusBadge status={testData.status} />
          </div>

          {/* Quick Details Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="p-3.5 rounded-xl bg-slate-950/20 border border-white/5">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Urgency Priority</span>
              <span className="text-white font-bold mt-1 block capitalize text-sm">{testData.urgency || 'routine'}</span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-950/20 border border-white/5">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Date Prescribed</span>
              <span className="text-white font-mono mt-1 block text-sm">{new Date(testData.createdAt).toLocaleDateString()}</span>
            </div>
            {testData.reportUploadedAt && (
              <div className="p-3.5 rounded-xl bg-slate-950/20 border border-white/5">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Encrypted Release</span>
                <span className="text-emerald-400 font-mono mt-1 block text-xs font-semibold">{new Date(testData.reportUploadedAt).toLocaleDateString()}</span>
              </div>
            )}
          </div>

          <div className="h-px bg-white/5" />

          {/* Update Status Selector */}
          <div className="flex items-end gap-3 max-w-md">
            <div className="flex-1 flex flex-col gap-1.5">
              <label className={labelClass}>Operational State</label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="glass-input text-xs"
              >
                <option value="pending">Pending</option>
                <option value="sample_collected">Sample Collected</option>
                <option value="processing">Processing</option>
                <option value="report_ready">Report Ready</option>
                <option value="delivered">Delivered</option>
              </select>
            </div>
            <button
              onClick={handleStatusUpdate}
              disabled={updating || newStatus === testData.status}
              className="glass-button text-xs py-2.5 px-6 shrink-0 disabled:opacity-40"
            >
              {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Update Status
            </button>
          </div>

          {/* Encrypted Report Dropzone */}
          <div className="space-y-2.5">
            <label className={labelClass}>Upload Final Diagnostics Report (PDF)</label>
            {testData.status === 'report_ready' || testData.reportUploadedAt ? (
              <div className="flex items-center gap-2 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 select-none">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-semibold">Lab report successfully encrypted using patient credentials and sealed in cloud storage.</span>
              </div>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => { e.preventDefault(); setIsDragging(false); const file = e.dataTransfer.files[0]; if (file) handleUploadFile(file); }}
                className={`border-2 rounded-2xl p-8 text-center flex flex-col items-center justify-center gap-2 cursor-pointer transition-all duration-300 bg-slate-950/20 min-h-40 ${
                  isDragging ? 'border-dashed border-emerald-400 bg-emerald-500/10 scale-102' : 'border-white/10 hover:border-white/15'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                    <span className="text-xs font-bold text-slate-300">Encrypting & Sealing Report File... ({uploadProgress}%)</span>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 text-slate-500 animate-pulse-subtle" />
                    <span className="text-xs font-bold text-slate-200">Drag & Drop Encrypted Diagnostics PDF here</span>
                    <span className="text-[10px] text-slate-500">Only PDF formats are cryptographically signed</span>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => { const file = e.target.files[0]; if (file) handleUploadFile(file); }}
                  className="hidden"
                />
              </div>
            )}
          </div>
        </motion.div>
      )}

      {!testData && !loading && (
        <div className="text-center py-16 text-slate-500 select-none">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-semibold">Enter a valid Report ID above to upload the encrypted diagnostics file.</p>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MASTER TAB ROUTER
// ─────────────────────────────────────────────────────────────────────────────
const LabManagement = () => {
  const [activeTab, setActiveTab] = useState('register');

  // Modal upload state from work queue
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [modalTest, setModalTest] = useState(null);
  const [uploadingModalFile, setUploadingModalFile] = useState(false);
  const [modalProgress, setModalProgress] = useState(0);
  const fileInputModalRef = useRef(null);

  const tabs = [
    { key: 'register',    label: 'Approve Prescriptions',   icon: FlaskConical },
    { key: 'work_queue',  label: 'Lab Work Queue',          icon: Clock },
    { key: 'assistant',   label: 'Lab Assistant Upload',    icon: Upload },
  ];

  const handleOpenUploadModal = (test) => {
    setModalTest(test);
    setShowUploadModal(true);
  };

  const handleUploadModalFile = async (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.error('Only PDF reports are supported.');
      return;
    }
    setUploadingModalFile(true);
    setModalProgress(10);
    const formData = new FormData();
    formData.append('report', file);

    try {
      await api.post(`/lab/${modalTest.labTestId}/upload-report`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setModalProgress(progress);
        }
      });
      toast.success('Report encrypted and uploaded successfully!');
      setShowUploadModal(false);
    } catch (err) {
      toast.error('Upload failed. Check file content.');
    } finally {
      setUploadingModalFile(false);
      setModalProgress(0);
    }
  };

  return (
    <PageTransition className="space-y-8">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
          <FlaskConical className="w-8 h-8 text-emerald-400" />
          Laboratory Management
        </h1>
        <p className="text-slate-400 mt-1 text-sm font-medium">Verify patient consent codes, manage test queue states, and upload encrypted diagnostics.</p>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 p-1 rounded-xl bg-slate-950/40 border border-white/5 max-w-xl mb-8 select-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all
                ${active
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-500 text-white shadow-lg'
                  : 'text-slate-500 hover:text-slate-300'
                }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'register'   && <RegisterNewTest />}
        {activeTab === 'work_queue' && <LabWorkQueue onOpenUpload={handleOpenUploadModal} />}
        {activeTab === 'assistant'  && <LabAssistantUpload />}
      </div>

      {/* Upload Modal (From work queue) */}
      <Modal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        title="Upload Encrypted Lab Report"
        size="md"
      >
        {modalTest && (
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-slate-950/20 border border-white/5 flex flex-col gap-1 text-xs">
              <span className="font-bold text-white text-sm">{modalTest.testName}</span>
              <span className="text-slate-500 mt-1 font-mono">Test ID: {modalTest.labTestId}</span>
              <span className="text-slate-400">Patient: {modalTest.patientName || 'Anonymous'}</span>
            </div>

            <div className="space-y-2">
              <label className={labelClass}>Select Diagnostics PDF File</label>
              <div
                onClick={() => fileInputModalRef.current?.click()}
                className="border-2 border-dashed border-white/10 hover:border-emerald-500 bg-slate-950/40 p-8 rounded-2xl flex flex-col items-center justify-center gap-2 text-center cursor-pointer transition-all min-h-36"
              >
                {uploadingModalFile ? (
                  <>
                    <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
                    <span className="text-xs font-bold text-slate-300">Encrypting PDF... {modalProgress}%</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-7 h-7 text-slate-500" />
                    <span className="text-xs font-bold text-slate-300">Click to select PDF report</span>
                    <span className="text-[10px] text-slate-500 font-medium">Automatic AES-256 seal will be applied</span>
                  </>
                )}
                <input
                  ref={fileInputModalRef}
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => { const file = e.target.files[0]; if (file) handleUploadModalFile(file); }}
                  className="hidden"
                />
              </div>
            </div>
          </div>
        )}
      </Modal>
    </PageTransition>
  );
};

export default LabManagement;
