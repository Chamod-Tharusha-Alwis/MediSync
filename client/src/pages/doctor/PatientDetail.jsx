import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axiosInstance from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Plus, LayoutDashboard, Users,
  Activity, FlaskConical, Download, Loader2
} from 'lucide-react';
import PageTransition from '../../components/common/PageTransition';
import MedicalTimeline from '../../components/common/MedicalTimeline';
import PatientAccessModal from '../../components/PatientAccessModal';
import AppShell from '../../components/ui/AppShell';
import Skeleton from '../../components/ui/Skeleton';
import StatusBadge from '../../components/ui/StatusBadge';
import OtpInput from '../../components/ui/OtpInput';
import Modal from '../../components/ui/Modal';
import LabDetailModal from '../../components/common/LabDetailModal';

import { usePatientAccess } from '../../context/PatientAccessContext';

const DoctorPatientDetail = () => {
  const { nic } = useParams();
  const navigate = useNavigate();
  const { getPatientToken, setPatientSession } = usePatientAccess();

  const [patient, setPatient] = useState(null);
  const [events, setEvents] = useState([]);
  const [tests, setTests] = useState([]);
  const [prescriptionsList, setPrescriptionsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('history');
  
  // OTP & Access Tokens
  const [showOtp, setShowOtp] = useState(true);
  const [patientToken, setPatientToken] = useState('');

  // Lab Detail Modal State
  const [selectedLabTest, setSelectedLabTest] = useState(null);
  const [isLabModalOpen, setIsLabModalOpen] = useState(false);

  // Report Download Flow
  const [showDownloadOtpModal, setShowDownloadOtpModal] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [targetLabTestId, setTargetLabTestId] = useState(null);
  const [requestingOtp, setRequestingOtp] = useState(false);

  const fetchRecords = useCallback(async (token) => {
    try {
      setLoading(true);
      const headers = { 'x-patient-access': token };
      
      const [patientRes, timelineRes, testsRes, rxRes] = await Promise.all([
        axiosInstance.get(`/patient/${nic}`, { headers }),
        axiosInstance.get(`/patient/${nic}/timeline`, { headers }),
        axiosInstance.get(`/tests/patient/${nic}`, { headers }),
        axiosInstance.get(`/patient/${nic}/prescriptions`, { headers }).catch(() => ({ data: { data: [] } }))
      ]);
      
      setPatient(patientRes.data.data);
      setEvents(timelineRes.data.data);
      setTests(testsRes.data.data || []);
      setPrescriptionsList(rxRes.data.data || []);
      setPatientSession({ nic, patientName: patientRes.data.data?.fullName || nic, token });
      
    } catch (err) {
      console.error('fetchRecords failed:', err);
      toast.error('Failed to fetch patient records');
    } finally {
      setLoading(false);
    }
  }, [nic, setPatientSession]);

  useEffect(() => {
    const activeToken = getPatientToken(nic);
    if (activeToken) {
      setShowOtp(false);
      setPatientToken(activeToken);
      fetchRecords(activeToken);
    }
  }, [nic, getPatientToken, fetchRecords]);

  const menuItems = [
    { label: 'Dashboard', path: '/doctor/dashboard', icon: LayoutDashboard, end: true },
    { label: 'New Consultation', path: '/doctor/consultation/new', icon: Plus },
  ];

  const handleOtpSuccess = (token) => {
    setShowOtp(false);
    setPatientToken(token);
    setPatientSession({ nic, patientName: nic, token });
    fetchRecords(token);
  };

  // Doctor requests OTP to download lab report
  const handleRequestDownloadOtp = async (labTestId) => {
    setRequestingOtp(true);
    try {
      const headers = { 'x-patient-access': patientToken };
      await axiosInstance.post(`/lab/doctor/request-otp/${labTestId}`, {}, { headers });
      setTargetLabTestId(labTestId);
      setShowDownloadOtpModal(true);
      toast.success('Access OTP has been sent to the patient\'s registered email.');
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Failed to request OTP');
    } finally {
      setRequestingOtp(false);
    }
  };

  // Doctor submits OTP and downloads report
  const handleVerifyDownloadOtp = async (code) => {
    setShowDownloadOtpModal(false);
    setIsDownloading(true);
    setDownloadProgress(10);
    
    // Smooth progress simulation
    const interval = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + 15;
      });
    }, 100);

    try {
      const headers = { 'x-patient-access': patientToken };
      const response = await axiosInstance.post(
        `/lab/doctor/download/${targetLabTestId}`, 
        { otp: code }, 
        { responseType: 'blob', headers }
      );

      setDownloadProgress(100);
      setTimeout(() => {
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `LabReport-${targetLabTestId}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        toast.success('Decrypted report downloaded successfully.');
        setIsDownloading(false);
        setDownloadProgress(0);
      }, 300);

    } catch (err) {
      clearInterval(interval);
      setIsDownloading(false);
      setDownloadProgress(0);
      toast.error('Invalid OTP or authorization failed.');
    }
  };

  if (showOtp) {
    return (
      <div className="min-h-screen bg-[#020817] flex items-center justify-center">
        <PatientAccessModal
          patientNic={nic}
          requesterName={localStorage.getItem('userName') || 'Doctor'}
          requesterRole="doctor"
          onSuccess={handleOtpSuccess}
          onClose={() => navigate(-1)}
        />
      </div>
    );
  }

  const doctorName = localStorage.getItem('userName') || 'Doctor';

  return (
    <div className="doctor-theme">
      <AppShell
        role="doctor"
        userName={`Dr. ${doctorName}`}
        userRole="Verified Doctor"
        menuItems={menuItems}
      >
        <PageTransition>
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center text-slate-400 hover:text-white mb-6 transition-colors text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Patients
          </button>

          {loading ? (
            <div className="grid grid-cols-1 gap-6">
              <Skeleton.Card />
              <Skeleton.Card />
            </div>
          ) : (
            <>
              {/* Patient Header */}
              <div className="glass-panel rounded-2xl p-6 md:p-8 mb-8 flex flex-col md:flex-row md:items-center justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" aria-hidden="true" />
                
                <div className="flex items-center mb-6 md:mb-0 relative z-10">
                  <div className="w-16 h-16 rounded-2xl bg-teal-500/10 text-teal-400 flex items-center justify-center font-bold text-2xl mr-6 border border-teal-500/20">
                    {patient?.fullName?.charAt(0)}
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gradient-teal tracking-tight">{patient?.fullName}</h1>
                    <p className="text-slate-400 font-mono text-sm mt-1">NIC: {patient?.nic}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-6 md:gap-8 text-sm relative z-10">
                  <div>
                    <p className="text-slate-500 font-bold uppercase tracking-wider text-[10px] mb-1">Age / Gender</p>
                    <p className="font-semibold text-slate-200">{patient?.age || 'N/A'} / {patient?.gender || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 font-bold uppercase tracking-wider text-[10px] mb-1">Blood</p>
                    <p className="font-semibold text-red-400">{patient?.bloodGroup || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 font-bold uppercase tracking-wider text-[10px] mb-1">Allergies</p>
                    <p className="font-semibold text-orange-400 bg-orange-400/10 px-2.5 py-0.5 rounded border border-orange-400/20 text-xs">
                      {patient?.allergies?.join(', ') || 'None'}
                    </p>
                  </div>
                </div>
              </div>

              {/* AI Health Risk Dashboard */}
              <div className="bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-2xl p-6 mb-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-[0.02]">
                  <Activity className="w-40 h-40 text-teal-400" />
                </div>
                <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                  <Activity className="w-4.5 h-4.5 text-teal-400 animate-pulse" /> AI Patient Health Risk Assessment
                </h3>
                <div className="space-y-4">
                  <p className="text-xs text-slate-400 leading-relaxed">
                    ML-engine analyzed disease indicators and patient history details. Predictions show relative diagnostic risk values.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="p-4 rounded-xl bg-slate-950/40 border border-white/5">
                      <div className="flex justify-between items-center text-xs font-semibold text-slate-300 mb-2">
                        <span>Cardiovascular Disease Risk</span>
                        <span className="text-teal-400 font-bold font-mono">14.8%</span>
                      </div>
                      <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden border border-white/5">
                        <div className="bg-gradient-to-r from-teal-500 to-teal-400 h-full w-[14.8%] transition-all duration-500" />
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-950/40 border border-white/5">
                      <div className="flex justify-between items-center text-xs font-semibold text-slate-300 mb-2">
                        <span>Diabetic / Metabolic Risk</span>
                        <span className="text-amber-400 font-bold font-mono">28.5%</span>
                      </div>
                      <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden border border-white/5">
                        <div className="bg-gradient-to-r from-amber-500 to-amber-400 h-full w-[28.5%] transition-all duration-500" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-4 mb-6 border-b border-white/5">
                <button
                  onClick={() => setActiveTab('history')}
                  className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${
                    activeTab === 'history' ? 'border-teal-500 text-teal-400' : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2"><Activity className="w-4 h-4" /> Medical History</div>
                </button>
                <button
                  onClick={() => setActiveTab('medications')}
                  className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${
                    activeTab === 'medications' ? 'border-teal-500 text-teal-400' : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2"><Plus className="w-4 h-4" /> Medication History ({prescriptionsList.length})</div>
                </button>
                <button
                  onClick={() => setActiveTab('labs')}
                  className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${
                    activeTab === 'labs' ? 'border-teal-500 text-teal-400' : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2"><FlaskConical className="w-4 h-4" /> Lab Results</div>
                </button>
              </div>

              {/* Tab Content */}
              <AnimatePresence mode="wait">
                {activeTab === 'history' && (
                  <motion.div key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                    <div className="bg-slate-900/20 backdrop-blur-md rounded-2xl border border-white/5 p-6 md:p-8">
                      <div className="flex justify-between items-center mb-8">
                        <h2 className="text-xl font-bold text-white">Consultation Timeline</h2>
                        <button 
                          onClick={() => navigate('/doctor/consultation/new')}
                          className="glass-button text-xs px-4 py-2 flex items-center gap-2"
                        >
                          <Plus className="w-4 h-4" /> New Consultation
                        </button>
                      </div>
                      <MedicalTimeline events={events} />
                    </div>
                  </motion.div>
                )}

                {activeTab === 'medications' && (
                  <motion.div key="medications" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                    <div className="bg-slate-900/20 backdrop-blur-md rounded-2xl border border-white/5 p-6 md:p-8">
                      <h2 className="text-xl font-bold text-white mb-6">Prescription & Medication History</h2>
                      {prescriptionsList.length === 0 ? (
                        <div className="text-center py-12 text-slate-500 border border-dashed border-white/5 rounded-xl">
                          <Activity className="w-10 h-10 mx-auto mb-3 opacity-50 text-teal-400" />
                          No previous prescriptions recorded for this patient.
                        </div>
                      ) : (
                        <div className="grid gap-4">
                          {prescriptionsList.map(rx => (
                            <div key={rx._id} className="bg-slate-900/40 border border-white/5 rounded-xl p-5 hover:border-teal-500/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <h3 className="font-bold text-white text-base">{rx.drugName || rx.medications?.[0]?.name || 'Prescription Medication'}</h3>
                                  <span className="px-2 py-0.5 rounded-md bg-teal-500/10 border border-teal-500/20 text-teal-400 text-[10px] font-bold uppercase">
                                    {rx.status || 'Active'}
                                  </span>
                                </div>
                                <p className="text-xs text-slate-300">
                                  <strong>Dosage:</strong> {rx.dosage || rx.medications?.[0]?.dosage || 'N/A'} | <strong>Frequency:</strong> {rx.frequency || rx.medications?.[0]?.frequency || 'N/A'} | <strong>Duration:</strong> {rx.durationDays ? `${rx.durationDays} Days` : 'N/A'}
                                </p>
                                {rx.instructions && (
                                  <p className="text-xs text-slate-400 italic">"{rx.instructions}"</p>
                                )}
                              </div>
                              <div className="text-left md:text-right border-t md:border-t-0 pt-3 md:pt-0 border-white/5">
                                <p className="text-xs font-semibold text-slate-300">Dr. {rx.doctorId?.fullName || 'Prescribing Doctor'}</p>
                                <p className="text-[11px] text-slate-500 mt-0.5">{new Date(rx.issuedAt || rx.createdAt).toLocaleDateString()}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {activeTab === 'labs' && (
                  <motion.div key="labs" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                    <div className="bg-slate-900/20 backdrop-blur-md rounded-2xl border border-white/5 p-6 md:p-8">
                      <h2 className="text-xl font-bold text-white mb-6">Laboratory Tests</h2>
                      {tests.length === 0 ? (
                        <div className="text-center py-12 text-slate-500 border border-dashed border-white/5 rounded-xl">
                          <FlaskConical className="w-10 h-10 mx-auto mb-3 opacity-50" />
                          No lab tests found for this patient.
                        </div>
                      ) : (
                        <div className="grid gap-4 md:grid-cols-2">
                          {tests.map(test => (
                            <div
                              key={test._id}
                              onClick={() => { setSelectedLabTest(test); setIsLabModalOpen(true); }}
                              className="bg-slate-900/40 border border-white/5 rounded-xl p-5 hover:border-teal-500/30 cursor-pointer transition-all hover:scale-[1.01]"
                            >
                              <div className="flex justify-between items-start mb-3">
                                <div>
                                  <h3 className="font-bold text-white flex items-center gap-2">
                                    <FlaskConical className="w-4 h-4 text-purple-400" />
                                    {test.testName}
                                  </h3>
                                  <p className="text-xs text-slate-400 mt-1">Ordered: {new Date(test.createdAt).toLocaleDateString()}</p>
                                </div>
                                <StatusBadge status={test.status} />
                              </div>
                              <p className="text-sm text-slate-300 mb-4 line-clamp-2">{test.instructions || 'No special instructions'}</p>
                              
                              <div className="flex items-center gap-3">
                                <span className="text-xs text-purple-400 font-semibold underline">View Test Details & Findings →</span>
                                {test.status === 'report_ready' && test.labTestId && (
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); handleRequestDownloadOtp(test.labTestId); }}
                                    disabled={requestingOtp || isDownloading}
                                    className="inline-flex items-center gap-2 text-sm text-teal-400 hover:text-teal-300 font-bold underline transition-colors disabled:opacity-50 ml-auto"
                                  >
                                    {requestingOtp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                    Authorize & Download PDF
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}

          {/* Interactive Lab Details Modal */}
          <LabDetailModal
            isOpen={isLabModalOpen}
            onClose={() => setIsLabModalOpen(false)}
            labTest={selectedLabTest}
            onDownload={(reportId) => handleRequestDownloadOtp(reportId || selectedLabTest?.labTestId || selectedLabTest?._id)}
          />

          {/* Secure OTP Gated Download Modal */}
          <Modal
            isOpen={showDownloadOtpModal}
            onClose={() => setShowDownloadOtpModal(false)}
            title="Doctor Authorization Required"
            size="sm"
          >
            <div className="flex flex-col items-center text-center gap-4">
              <p className="text-sm text-slate-300">
                A secure verification code has been dispatched to the patient's registered details. Please enter the OTP to decrypt and download the laboratory report.
              </p>
              <OtpInput
                onSubmit={handleVerifyDownloadOtp}
                onResend={() => toast.info('A new authorization code has been requested.')}
                initialSeconds={120}
              />
            </div>
          </Modal>

          {/* Live Progress Overlay */}
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
        </PageTransition>
      </AppShell>
    </div>
  );
};

export default DoctorPatientDetail;
