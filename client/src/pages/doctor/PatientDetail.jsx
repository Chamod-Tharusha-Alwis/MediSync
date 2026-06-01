import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axiosInstance from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Plus, LayoutDashboard, Users, Activity, FlaskConical, Download } from 'lucide-react';
import Sidebar from '../../components/common/Sidebar';
import PageTransition from '../../components/common/PageTransition';
import MedicalTimeline from '../../components/common/MedicalTimeline';
import PatientAccessModal from '../../components/PatientAccessModal';

const DoctorPatientDetail = () => {
  const { nic } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState(null);
  const [events, setEvents] = useState([]);
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState('history'); // history | labs
  
  // OTP State
  const [showOtp, setShowOtp] = useState(true);

  const menuItems = [
    { label: 'Dashboard', path: '/doctor/dashboard', icon: LayoutDashboard, end: true },
    { label: 'New Consultation', path: '/doctor/consultation/new', icon: Plus },
    { label: 'Patient Directory', path: '/doctor/patients', icon: Users },
  ];

  const fetchRecords = async (token) => {
    try {
      setLoading(true);
      const headers = { 'x-patient-access': token };
      
      const [patientRes, timelineRes, testsRes] = await Promise.all([
        axiosInstance.get(`/patient/${nic}`, { headers }),
        axiosInstance.get(`/patient/${nic}/timeline`, { headers }),
        axiosInstance.get(`/tests/patient/${nic}`, { headers })
      ]);
      
      setPatient(patientRes.data.data);
      setEvents(timelineRes.data.data);
      setTests(testsRes.data.data || []);
      
    } catch (err) {
      toast.error('Failed to fetch patient records');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSuccess = (token) => {
    setShowOtp(false);
    fetchRecords(token);
  };

  if (showOtp) {
    return (
      <div className="min-h-screen bg-[#0b1120]">
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

  return (
    <div className="flex bg-[#0b1120] min-h-screen text-slate-200" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <Sidebar menuItems={menuItems} title="Doctor Portal" themePrefix="doctor" />
      
      <main className="flex-1 lg:ml-64 p-6 lg:p-10 transition-all duration-300">
        <PageTransition>
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center text-slate-400 hover:text-white mb-6 transition-colors text-sm font-medium"
          >
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Patients
          </button>

          {loading ? (
            <div className="text-center py-20 text-slate-400">Loading patient records…</div>
          ) : (
            <>
              {/* Patient Header */}
              <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 md:p-8 mb-8 flex flex-col md:flex-row md:items-center justify-between shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3" />
                
                <div className="flex items-center mb-6 md:mb-0 relative z-10">
                  <div className="w-16 h-16 rounded-2xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-2xl mr-6 border border-blue-500/30">
                    {patient?.fullName?.charAt(0)}
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">{patient?.fullName}</h1>
                    <p className="text-slate-400 font-mono text-sm mt-1">NIC: {patient?.nic}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-6 md:gap-8 text-sm relative z-10">
                  <div>
                    <p className="text-slate-500 font-bold uppercase tracking-wider text-[10px] mb-1">Age / Gender</p>
                    <p className="font-semibold text-white">{patient?.age || 'N/A'} / {patient?.gender || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 font-bold uppercase tracking-wider text-[10px] mb-1">Blood</p>
                    <p className="font-semibold text-red-400">{patient?.bloodGroup || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500 font-bold uppercase tracking-wider text-[10px] mb-1">Allergies</p>
                    <p className="font-semibold text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded border border-orange-400/20">
                      {patient?.allergies?.join(', ') || 'None'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-4 mb-6 border-b border-slate-800">
                <button
                  onClick={() => setActiveTab('history')}
                  className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${
                    activeTab === 'history' ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2"><Activity className="w-4 h-4" /> Medical History</div>
                </button>
                <button
                  onClick={() => setActiveTab('labs')}
                  className={`px-4 py-3 font-medium text-sm transition-colors border-b-2 ${
                    activeTab === 'labs' ? 'border-purple-500 text-purple-400' : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-2"><FlaskConical className="w-4 h-4" /> Lab Results</div>
                </button>
              </div>

              {/* Tab Content */}
              <AnimatePresence mode="wait">
                {activeTab === 'history' && (
                  <motion.div key="history" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                    <div className="bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-800 p-6 md:p-8">
                      <div className="flex justify-between items-center mb-8">
                        <h2 className="text-xl font-bold text-white">Consultation Timeline</h2>
                        <button 
                          onClick={() => navigate('/doctor/consultation/new')}
                          className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2"
                        >
                          <Plus className="w-4 h-4" /> New Consultation
                        </button>
                      </div>
                      <MedicalTimeline events={events} />
                    </div>
                  </motion.div>
                )}

                {activeTab === 'labs' && (
                  <motion.div key="labs" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                    <div className="bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-800 p-6 md:p-8">
                      <h2 className="text-xl font-bold text-white mb-6">Laboratory Tests</h2>
                      {tests.length === 0 ? (
                        <div className="text-center py-12 text-slate-500 border border-dashed border-slate-700 rounded-xl">
                          <FlaskConical className="w-10 h-10 mx-auto mb-3 opacity-50" />
                          No lab tests found for this patient.
                        </div>
                      ) : (
                        <div className="grid gap-4 md:grid-cols-2">
                          {tests.map(test => (
                            <div key={test._id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 hover:border-slate-600 transition-colors">
                              <div className="flex justify-between items-start mb-3">
                                <div>
                                  <h3 className="font-bold text-white">{test.testName}</h3>
                                  <p className="text-xs text-slate-400 mt-1">Ordered: {new Date(test.createdAt).toLocaleDateString()}</p>
                                </div>
                                <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                                  test.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                                  test.status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                                  'bg-amber-500/20 text-amber-400'
                                }`}>
                                  {test.status.toUpperCase()}
                                </span>
                              </div>
                              <p className="text-sm text-slate-300 mb-4 line-clamp-2">{test.instructions || 'No special instructions'}</p>
                              
                              {test.status === 'completed' && test.resultFileUrl && (
                                <a 
                                  href={test.resultFileUrl} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 font-medium"
                                >
                                  <Download className="w-4 h-4" /> View Result PDF
                                </a>
                              )}
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
        </PageTransition>
      </main>
    </div>
  );
};

export default DoctorPatientDetail;
