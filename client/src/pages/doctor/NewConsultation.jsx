import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../../api/axiosInstance';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { FiUser, FiActivity, FiFileText, FiPlus, FiTrash2, FiSave, FiSearch, FiChevronRight } from 'react-icons/fi';
import Sidebar from '../../components/common/Sidebar';
import PageTransition from '../../components/common/PageTransition';
import SymptomTagInput from '../../components/SymptomTagInput';
import DrugSearchInput from '../../components/DrugSearchInput';
import PatientAccessModal from '../../components/PatientAccessModal';
import { LayoutDashboard, Users, FileText, FlaskConical } from 'lucide-react';

const NewConsultation = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [patientAccessToken, setPatientAccessToken] = useState('');

  // Form State
  const [patientNic, setPatientNic] = useState('');
  const [patientData, setPatientData] = useState(null);
  
  const [symptoms, setSymptoms] = useState([]);
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [diagnosesOptions, setDiagnosesOptions] = useState([]);
  const [selectedDiagnosis, setSelectedDiagnosis] = useState('');
  const [selectedIcd, setSelectedIcd] = useState('');

  const [prescriptions, setPrescriptions] = useState([]);
  
  const [orderedTests, setOrderedTests] = useState([]);
  const [testInput, setTestInput] = useState('');
  
  const [isFollowUpRequired, setIsFollowUpRequired] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');

  const menuItems = [
    { label: 'Dashboard', path: '/doctor/dashboard', icon: LayoutDashboard, end: true },
    { label: 'New Consultation', path: '/doctor/consultation/new', icon: FiPlus },
    { label: 'My Patients', path: '/doctor/patients', icon: Users },
    { label: 'Prescriptions', path: '/doctor/prescriptions', icon: FileText },
  ];

  const searchPatient = async () => {
    if (!patientNic) return toast.error('Enter patient NIC');
    setLoading(true);
    try {
      const res = await axios.get(`/patient/${patientNic}`);
      setPatientData(res.data.data);
      setShowOtpModal(true);
    } catch (err) {
      toast.error('Patient not found');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSuccess = (token) => {
    setPatientAccessToken(token);
    setShowOtpModal(false);
    setStep(2);
  };

  const getDiagnosisSuggestions = async () => {
    if (symptoms.length === 0) return toast.error('Add at least one symptom');
    setLoading(true);
    try {
      const mlEngineUrl = process.env.REACT_APP_ML_ENGINE_URL || 'http://localhost:5001';
      const res = await axios.post(`${mlEngineUrl}/api/ml/predict-disease`, { symptoms });
      setDiagnosesOptions(res.data.predictions || []);
    } catch (err) {
      toast.error('ML service unavailable. Using standard list.');
      setDiagnosesOptions([
        { disease: 'Common Cold', icd_code: 'J00', recommendedSpecialist: 'General Physician', confidence: 85, urgent: false },
        { disease: 'Influenza', icd_code: 'J11.1', recommendedSpecialist: 'General Physician', confidence: 80, urgent: false },
        { disease: 'Acute Bronchitis', icd_code: 'J20.9', recommendedSpecialist: 'Pulmonologist', confidence: 75, urgent: false },
        { disease: 'Essential Hypertension', icd_code: 'I10', recommendedSpecialist: 'Cardiologist', confidence: 90, urgent: false },
        { disease: 'Type 2 Diabetes Mellitus', icd_code: 'E11.9', recommendedSpecialist: 'Endocrinologist', confidence: 88, urgent: false },
        { disease: 'Migraine', icd_code: 'G43.909', recommendedSpecialist: 'Neurologist', confidence: 70, urgent: false },
        { disease: 'Acute Pharyngitis', icd_code: 'J02.9', recommendedSpecialist: 'ENT', confidence: 82, urgent: false },
        { disease: 'Gastroenteritis', icd_code: 'A09', recommendedSpecialist: 'Gastroenterologist', confidence: 78, urgent: false },
        { disease: 'Asthma', icd_code: 'J45.909', recommendedSpecialist: 'Pulmonologist', confidence: 85, urgent: true },
        { disease: 'Urinary Tract Infection', icd_code: 'N39.0', recommendedSpecialist: 'Urologist', confidence: 80, urgent: false }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const addPrescription = (drug) => {
    if (prescriptions.find(p => p.name === drug.name)) return toast.error('Drug already added');
    setPrescriptions([...prescriptions, { 
      name: drug.name, 
      dosage: '1 tab', 
      frequency: 'TDS', 
      duration: '5 days',
      instructions: 'After meals'
    }]);
  };

  const removePrescription = (index) => {
    const newP = [...prescriptions];
    newP.splice(index, 1);
    setPrescriptions(newP);
  };

  const updatePrescription = (index, field, value) => {
    const newP = [...prescriptions];
    newP[index][field] = value;
    setPrescriptions(newP);
  };

  const addTest = () => {
    if (!testInput.trim()) return;
    if (orderedTests.includes(testInput.trim())) return toast.error('Test already added');
    setOrderedTests([...orderedTests, testInput.trim()]);
    setTestInput('');
  };

  const removeTest = (index) => {
    const newT = [...orderedTests];
    newT.splice(index, 1);
    setOrderedTests(newT);
  };

  const handleSubmit = async () => {
    if (!selectedDiagnosis) return toast.error('Select a diagnosis');
    
    setLoading(true);
    try {
      await axios.post('/doctor/consultation', {
        patientNic,
        symptoms,
        diagnosis: selectedDiagnosis,
        icdDescription: selectedDiagnosis,
        icdCode: selectedIcd,
        clinicalNotes,
        prescriptions,
        orderedTests: orderedTests.map(t => ({ testName: t, instructions: '' })),
        isFollowUpRequired,
        followUpDate: isFollowUpRequired ? followUpDate : null,
        loginType: localStorage.getItem('loginType'),
        sessionHospitalId: localStorage.getItem('sessionHospitalId')
      }, {
        headers: { 'x-patient-access': patientAccessToken }
      });
      
      toast.success('Consultation saved successfully');
      navigate('/doctor/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save consultation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex bg-[#0b1120] min-h-screen text-slate-200">
      <Sidebar menuItems={menuItems} title="Doctor Portal" themePrefix="doctor" />
      
      <main className="flex-1 lg:ml-64 p-6 lg:p-10 transition-all duration-300">
        <PageTransition>
          <div className="mb-8 flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-white tracking-tight">New Consultation</h1>
              <p className="text-slate-400 mt-1">Start a new clinical assessment.</p>
            </div>
            {step > 1 && (
              <button 
                onClick={() => setStep(1)} 
                className="text-blue-400 hover:text-blue-300 font-medium text-sm px-4 py-2 bg-blue-500/10 rounded-lg border border-blue-500/20 transition-colors"
              >
                Change Patient
              </button>
            )}
          </div>

          <div className="bg-slate-900/60 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 overflow-hidden">
            {/* Progress Bar */}
            <div className="flex border-b border-white/10 relative">
              <div className="absolute bottom-0 left-0 h-[2px] bg-blue-500 transition-all duration-500" style={{ width: `${(step / 3) * 100}%` }}></div>
              {[1, 2, 3].map(i => (
                <div key={i} className={`flex-1 py-4 text-center text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${step >= i ? 'text-blue-400 bg-blue-500/5' : 'text-slate-500 bg-slate-900/40'}`}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${step >= i ? 'bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'bg-slate-800 text-slate-500 border border-slate-700'}`}>
                    {i}
                  </span>
                  {i === 1 ? 'Identify Patient' : i === 2 ? 'Clinical Assessment' : 'Prescriptions'}
                </div>
              ))}
            </div>

            <div className="p-6 md:p-10">
              {/* STEP 1: Patient Search */}
              <AnimatePresence mode="wait">
                {step === 1 && (
                  <motion.div
                    key="step1"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="max-w-md mx-auto space-y-6 py-8"
                  >
                    <div className="text-center mb-8">
                      <div className="w-20 h-20 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(59,130,246,0.1)]">
                        <FiUser size={36} />
                      </div>
                      <h2 className="text-2xl font-bold text-white tracking-tight">Search Patient</h2>
                      <p className="text-slate-400 mt-2">Enter the patient's NIC to securely retrieve their medical records.</p>
                    </div>

                    <div className="relative group">
                      <input
                        type="text"
                        value={patientNic}
                        onChange={(e) => setPatientNic(e.target.value)}
                        placeholder="e.g. 200312345699"
                        className="w-full pl-5 pr-14 py-4 bg-slate-800/50 border border-slate-700 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-white placeholder-slate-500 transition-all backdrop-blur-md text-lg"
                      />
                      <button 
                        onClick={searchPatient}
                        disabled={loading}
                        className="absolute right-2 top-2 bottom-2 bg-blue-600 hover:bg-blue-500 text-white px-5 rounded-lg transition-colors flex items-center shadow-lg"
                      >
                        {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <FiSearch size={20} />}
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* OTP Modal */}
                {showOtpModal && (
                  <PatientAccessModal
                    patientNic={patientNic}
                    requesterName={localStorage.getItem('userName') || 'Doctor'}
                    requesterRole="doctor"
                    onSuccess={handleOtpSuccess}
                    onClose={() => setShowOtpModal(false)}
                  />
                )}

                {/* STEP 2: Clinical Assessment */}
                {step === 2 && (
                  <motion.div
                    key="step2"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-8"
                  >
                    {/* Patient Context Card */}
                    <div className="bg-slate-800/50 border border-slate-700 backdrop-blur-sm rounded-2xl p-5 flex flex-wrap gap-8 items-center relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Patient</p>
                        <p className="font-bold text-white text-lg">{patientData?.fullName} <span className="text-slate-400 font-normal ml-1">({patientData?.age}y)</span></p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Blood</p>
                        <p className="font-medium text-red-400">{patientData?.bloodGroup || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Allergies</p>
                        <p className="font-medium text-orange-400 bg-orange-400/10 px-3 py-0.5 rounded border border-orange-400/20">{patientData?.allergies.join(', ') || 'None'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">Chronic</p>
                        <p className="font-medium text-purple-400 bg-purple-400/10 px-3 py-0.5 rounded border border-purple-400/20">{patientData?.chronicConditions.join(', ') || 'None'}</p>
                      </div>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-8">
                      {/* Left: Symptoms & Notes */}
                      <div className="space-y-6">
                        <div className="bg-slate-800/30 border border-slate-700/50 p-6 rounded-2xl">
                          <label className="block text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                            <FiActivity className="text-blue-400" /> Presenting Symptoms
                          </label>
                          <SymptomTagInput selectedSymptoms={symptoms} onChange={setSymptoms} />
                        </div>
                        
                        <div className="bg-slate-800/30 border border-slate-700/50 p-6 rounded-2xl">
                          <label className="block text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                            <FiFileText className="text-blue-400" /> Clinical Notes
                          </label>
                          <textarea
                            value={clinicalNotes}
                            onChange={(e) => setClinicalNotes(e.target.value)}
                            rows={4}
                            className="w-full p-4 bg-slate-900/50 border border-slate-700 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-slate-200 placeholder-slate-600 transition-colors"
                            placeholder="Enter detailed observation notes..."
                          />
                        </div>

                        {/* Order Lab Tests */}
                        <div className="bg-slate-800/30 border border-slate-700/50 p-6 rounded-2xl">
                          <label className="block text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                            <FlaskConical className="w-4 h-4 text-purple-400" /> Order Lab Tests
                          </label>
                          <div className="flex gap-2 mb-3">
                            <input
                              type="text"
                              value={testInput}
                              onChange={(e) => setTestInput(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && addTest()}
                              placeholder="e.g. Full Blood Count"
                              className="flex-1 p-3 bg-slate-900/50 border border-slate-700 rounded-xl focus:border-purple-500 outline-none text-white text-sm"
                            />
                            <button
                              onClick={addTest}
                              className="bg-purple-600 hover:bg-purple-500 text-white px-4 rounded-xl transition-colors font-medium text-sm"
                            >
                              Add Test
                            </button>
                          </div>
                          {orderedTests.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {orderedTests.map((test, i) => (
                                <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 border border-purple-500/30 text-purple-300 rounded-lg text-sm">
                                  {test}
                                  <button onClick={() => removeTest(i)} className="hover:text-white transition-colors"><FiTrash2 size={14}/></button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: ML Diagnosis */}
                      <div className="bg-blue-900/10 border border-blue-500/20 p-6 rounded-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                          <FiActivity size={100} />
                        </div>
                        <div className="flex justify-between items-center mb-6 relative z-10">
                          <h3 className="font-bold text-white flex items-center gap-2 text-lg">
                            <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
                              <FiActivity />
                            </div>
                            AI Diagnosis
                          </h3>
                          <button 
                            onClick={getDiagnosisSuggestions}
                            disabled={loading || symptoms.length === 0}
                            className="text-sm bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20 font-medium flex items-center gap-2"
                          >
                            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : 'Analyze Symptoms'}
                          </button>
                        </div>

                        {diagnosesOptions.length > 0 ? (
                          <div className="space-y-3 relative z-10">
                            {diagnosesOptions.map((diag, i) => (
                              <div 
                                key={i}
                                onClick={() => { setSelectedDiagnosis(diag.disease); setSelectedIcd(diag.icd_code); }}
                                className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedDiagnosis === diag.disease ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.15)]' : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'}`}
                              >
                                <div className="flex justify-between items-start">
                                  <div>
                                    <p className="font-bold text-white text-base flex items-center gap-2">
                                      {diag.disease} 
                                      {diag.urgent && <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded border border-red-500/30 uppercase tracking-wider">Urgent</span>}
                                    </p>
                                    <div className="flex gap-3 mt-2">
                                      <span className="text-xs text-slate-400 bg-slate-900/50 px-2 py-1 rounded border border-slate-700">ICD-10: <span className="text-slate-300 font-mono">{diag.icd_code}</span></span>
                                      <span className="text-xs text-slate-400 bg-slate-900/50 px-2 py-1 rounded border border-slate-700">{diag.recommendedSpecialist}</span>
                                    </div>
                                  </div>
                                  <div className={`flex flex-col items-end`}>
                                    <span className={`text-xs font-bold px-2 py-1 rounded-md border ${diag.confidence > 70 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}>
                                      {diag.confidence}% Match
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-12 border-2 border-dashed border-slate-700/50 rounded-xl relative z-10">
                            <FiActivity className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                            <p className="text-sm text-slate-400 max-w-[250px] mx-auto">Run AI analysis to get diagnosis suggestions based on current symptoms.</p>
                          </div>
                        )}

                        <div className="mt-6 pt-6 border-t border-blue-500/20 relative z-10">
                          <label className="block text-sm font-semibold text-slate-300 mb-3">Final Diagnosis Confirmation</label>
                          <div className="flex gap-3">
                            <input
                              type="text"
                              value={selectedDiagnosis}
                              onChange={(e) => setSelectedDiagnosis(e.target.value)}
                              placeholder="Diagnosis Name"
                              className="flex-1 p-3 bg-slate-900/50 border border-slate-700 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-white text-sm transition-colors"
                            />
                            <input
                              type="text"
                              value={selectedIcd}
                              onChange={(e) => setSelectedIcd(e.target.value)}
                              placeholder="ICD Code"
                              className="w-32 p-3 bg-slate-900/50 border border-slate-700 rounded-xl focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none text-white text-sm uppercase transition-colors"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-6 border-t border-white/10">
                      <button 
                        onClick={() => setStep(3)}
                        disabled={!selectedDiagnosis}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3.5 rounded-xl font-bold disabled:opacity-50 flex items-center gap-2 transition-all shadow-lg shadow-blue-500/20 hover:-translate-y-0.5"
                      >
                        Continue to Prescriptions <FiChevronRight />
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* STEP 3: Prescription */}
                {step === 3 && (
                  <motion.div
                    key="step3"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="space-y-8"
                  >
                    <div className="bg-slate-800/30 border border-slate-700/50 p-6 rounded-2xl">
                      <h3 className="font-bold text-white mb-4 flex items-center gap-2 text-lg">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
                          <FiPlus />
                        </div>
                        Add Medication
                      </h3>
                      <DrugSearchInput 
                        onSelect={addPrescription} 
                        currentPrescriptions={prescriptions}
                        patientAllergies={patientData?.allergies}
                      />
                    </div>

                    {prescriptions.length > 0 && (
                      <div className="bg-slate-800/50 border border-slate-700 rounded-2xl overflow-hidden shadow-lg">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-slate-900/80 text-slate-400 border-b border-slate-700">
                              <tr>
                                <th className="p-4 font-semibold uppercase tracking-wider text-xs">Drug Name</th>
                                <th className="p-4 font-semibold uppercase tracking-wider text-xs">Dosage</th>
                                <th className="p-4 font-semibold uppercase tracking-wider text-xs">Frequency</th>
                                <th className="p-4 font-semibold uppercase tracking-wider text-xs">Duration</th>
                                <th className="p-4 font-semibold uppercase tracking-wider text-xs">Instructions</th>
                                <th className="p-4 font-semibold uppercase tracking-wider text-xs text-center">Action</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-700/50">
                              {prescriptions.map((rx, idx) => (
                                <tr key={idx} className="hover:bg-slate-700/30 transition-colors">
                                  <td className="p-4 font-bold text-white">{rx.name}</td>
                                  <td className="p-3">
                                    <input type="text" value={rx.dosage} onChange={(e) => updatePrescription(idx, 'dosage', e.target.value)} className="w-24 p-2 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-200 outline-none focus:border-blue-500 transition-colors" />
                                  </td>
                                  <td className="p-3">
                                    <select value={rx.frequency} onChange={(e) => updatePrescription(idx, 'frequency', e.target.value)} className="w-24 p-2 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-200 outline-none focus:border-blue-500 transition-colors appearance-none">
                                      <option>OD</option><option>BD</option><option>TDS</option><option>QID</option><option>SOS</option>
                                    </select>
                                  </td>
                                  <td className="p-3">
                                    <input type="text" value={rx.duration} onChange={(e) => updatePrescription(idx, 'duration', e.target.value)} className="w-24 p-2 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-200 outline-none focus:border-blue-500 transition-colors" />
                                  </td>
                                  <td className="p-3">
                                    <input type="text" value={rx.instructions} onChange={(e) => updatePrescription(idx, 'instructions', e.target.value)} className="w-full min-w-[150px] p-2 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-200 outline-none focus:border-blue-500 transition-colors" />
                                  </td>
                                  <td className="p-3 text-center">
                                    <button onClick={() => removePrescription(idx)} className="text-red-400 hover:text-white p-2 bg-red-500/10 hover:bg-red-500 border border-red-500/20 hover:border-red-500 rounded-lg transition-all" title="Remove">
                                      <FiTrash2 size={18} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    <div className="bg-slate-800/30 border border-slate-700/50 p-6 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                      <div className="flex items-center space-x-4">
                        <label className="flex items-center space-x-3 cursor-pointer group">
                          <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isFollowUpRequired ? 'bg-blue-500 border-blue-500 text-white' : 'border-slate-500 text-transparent group-hover:border-blue-400'}`}>
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          </div>
                          <input 
                            type="checkbox" 
                            checked={isFollowUpRequired}
                            onChange={(e) => setIsFollowUpRequired(e.target.checked)}
                            className="hidden"
                          />
                          <span className="font-semibold text-slate-300">Require Follow-up Visit</span>
                        </label>
                        {isFollowUpRequired && (
                          <input 
                            type="date" 
                            value={followUpDate}
                            onChange={(e) => setFollowUpDate(e.target.value)}
                            min={new Date().toISOString().split('T')[0]}
                            className="p-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-slate-200 outline-none focus:border-blue-500 transition-colors text-sm"
                          />
                        )}
                      </div>

                      <div className="flex space-x-4">
                        <button 
                          onClick={() => setStep(2)}
                          className="px-6 py-3.5 text-slate-300 font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-xl transition-colors"
                        >
                          Back
                        </button>
                        <button 
                          onClick={handleSubmit}
                          disabled={loading}
                          className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-3.5 rounded-xl font-bold flex items-center transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:-translate-y-0.5"
                        >
                          {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div> : <FiSave className="mr-2" size={18} />}
                          Complete Consultation
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </PageTransition>
      </main>
    </div>
  );
};

export default NewConsultation;
