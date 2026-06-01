import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../../api/axiosInstance';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiUser, FiActivity, FiFileText, FiPlus, FiTrash2,
  FiSave, FiSearch, FiChevronRight, FiChevronLeft, FiCheck
} from 'react-icons/fi';
import Sidebar from '../../components/common/Sidebar';
import PageTransition from '../../components/common/PageTransition';
import SymptomTagInput from '../../components/SymptomTagInput';
import DrugSearchInput from '../../components/DrugSearchInput';
import PatientAccessModal from '../../components/PatientAccessModal';
import { LayoutDashboard, Users, FlaskConical } from 'lucide-react';

/* ─── Lab test suggestion catalogue ─────────────────────────────────────────── */
const LAB_TEST_SUGGESTIONS = [
  'Complete Blood Count (CBC)',
  'Fasting Blood Sugar (FBS)',
  'Random Blood Sugar (RBS)',
  'HbA1c (Glycated Haemoglobin)',
  'Lipid Profile',
  'Liver Function Test (LFT)',
  'Renal Function Test (RFT)',
  'Serum Electrolytes',
  'Thyroid Function Test (TFT)',
  'Urine Full Report (UFR)',
  'Urine Culture & Sensitivity',
  'Blood Culture & Sensitivity',
  'C-Reactive Protein (CRP)',
  'Erythrocyte Sedimentation Rate (ESR)',
  'PT / INR (Coagulation)',
  'Serum Creatinine',
  'eGFR',
  'Serum Uric Acid',
  'Serum Calcium',
  'Serum Ferritin',
  'Iron Studies (TIBC)',
  'Vitamin D (25-OH)',
  'Vitamin B12',
  'Dengue NS1 Antigen',
  'Dengue IgM / IgG',
  'Widal Test',
  'Malaria RDT',
  'Hepatitis B Surface Antigen (HBsAg)',
  'Hepatitis C Antibody (Anti-HCV)',
  'HIV Antibody Test',
  'Chest X-Ray (CXR)',
  'ECG (12-Lead)',
  'Echocardiogram',
  'Abdominal Ultrasound',
  'Pelvic Ultrasound',
  'CT Scan — Head',
  'CT Scan — Chest',
  'CT Scan — Abdomen & Pelvis',
  'MRI — Brain',
  'MRI — Spine',
  'Upper GI Endoscopy',
  'Colonoscopy',
  'Pap Smear',
  'Mammogram',
  'Bone Mineral Density (DEXA)',
  'Sputum Culture & Sensitivity',
  'Stool Full Report',
  'Stool Culture & Sensitivity',
  'D-Dimer',
  'Troponin I',
  'BNP / NT-proBNP',
  'Serum Amylase',
  'Serum Lipase',
  'PSA (Prostate-Specific Antigen)',
  'Folic Acid Level',
  'TORCH Panel',
  'ANA (Anti-Nuclear Antibody)',
  'Rheumatoid Factor (RF)',
  'Anti-CCP Antibody',
  'Complement C3 / C4',
];

/* ─── Wizard step metadata ──────────────────────────────────────────────────── */
const STEPS = [
  { id: 1, label: 'Patient & Symptoms', short: 'Patient', icon: FiUser },
  { id: 2, label: 'ML Prediction',      short: 'AI Diag', icon: FiActivity },
  { id: 3, label: 'E-Prescription',     short: 'Rx',      icon: FiFileText },
];

/* ─── Slide animation variants ─────────────────────────────────────────────── */
const slideVariants = {
  enter:  (dir) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] } },
  exit:   (dir) => ({ x: dir > 0 ? -60 : 60, opacity: 0, transition: { duration: 0.28, ease: [0.55, 0, 1, 0.45] } }),
};

/* ─── Step Progress Bar ─────────────────────────────────────────────────────── */
const StepBar = ({ current }) => (
  <div className="flex items-center px-6 md:px-10 py-5 border-b border-white/5 relative bg-slate-950/20">
    {/* Animated progress fill */}
    <div
      className="absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-teal-500 via-cyan-400 to-emerald-400 transition-all duration-500 ease-out"
      style={{ width: `${((current - 1) / (STEPS.length - 1)) * 100}%` }}
    />

    {STEPS.map((step, idx) => {
      const done   = current > step.id;
      const active = current === step.id;
      const Icon   = step.icon;
      return (
        <React.Fragment key={step.id}>
          <div className="flex items-center gap-3 flex-1 justify-center md:justify-start">
            {/* Circle */}
            <motion.div
              animate={{
                scale:           active ? 1.15 : 1,
                backgroundColor: done   ? 'rgba(20,184,166,1)'
                               : active ? 'rgba(20,184,166,0.15)'
                               :          'rgba(30,41,59,0.8)',
                borderColor:     done   ? 'rgba(20,184,166,1)'
                               : active ? 'rgba(20,184,166,0.7)'
                               :          'rgba(71,85,105,0.5)',
              }}
              transition={{ duration: 0.3 }}
              className="w-9 h-9 rounded-full border-2 flex items-center justify-center flex-shrink-0 shadow-sm"
            >
              {done
                ? <FiCheck className="w-4 h-4 text-white" strokeWidth={3} />
                : <Icon className={`w-4 h-4 ${active ? 'text-teal-400' : 'text-slate-600'}`} />}
            </motion.div>

            {/* Desktop label */}
            <span className={`hidden md:inline text-sm font-semibold transition-colors duration-200 ${
              active ? 'text-white' : done ? 'text-teal-400' : 'text-slate-600'
            }`}>
              {step.label}
            </span>
            {/* Mobile label */}
            <span className={`md:hidden text-xs font-semibold transition-colors ${
              active ? 'text-white' : done ? 'text-teal-400' : 'text-slate-600'
            }`}>
              {step.short}
            </span>
          </div>

          {/* Connector line */}
          {idx < STEPS.length - 1 && (
            <div className="hidden md:block h-px flex-1 mx-3 bg-slate-800/60" />
          )}
        </React.Fragment>
      );
    })}
  </div>
);

/* ─── Main Component ────────────────────────────────────────────────────────── */
const NewConsultation = () => {
  const navigate = useNavigate();
  const [step,    setStep]   = useState(1);
  const [dir,     setDir]    = useState(1);   // slide direction: +1 = forward, -1 = back
  const [loading, setLoading] = useState(false);
  const [showOtpModal,       setShowOtpModal]       = useState(false);
  const [patientAccessToken, setPatientAccessToken] = useState('');

  /* ── Form state ── */
  const [patientNic,         setPatientNic]        = useState('');
  const [patientData,        setPatientData]       = useState(null);
  const [symptoms,           setSymptoms]          = useState([]);
  const [clinicalNotes,      setClinicalNotes]     = useState('');
  const [diagnosesOptions,   setDiagnosesOptions]  = useState([]);
  const [selectedDiagnosis,  setSelectedDiagnosis] = useState('');
  const [selectedIcd,        setSelectedIcd]       = useState('');
  const [manualDiagnosis,    setManualDiagnosis]   = useState('');
  const [icdSearchQuery,     setIcdSearchQuery]    = useState('');
  const [icdSuggestions,     setIcdSuggestions]    = useState([]);
  const [isIcdLoading,       setIsIcdLoading]      = useState(false);
  const [prescriptions,      setPrescriptions]     = useState([]);
  const [labTests,           setLabTests]          = useState([]);
  const [labTestInput,       setLabTestInput]      = useState('');
  const [testInput,          setTestInput]         = useState('');   // kept for compat; UI uses labTestInput
  const [labSuggestions,     setLabSuggestions]    = useState([]);
  const [followUpDate,       setFollowUpDate]      = useState('');

  // Fetch ICD-10 suggestions debounced
  useEffect(() => {
    if (icdSearchQuery.trim().length < 2) {
      setIcdSuggestions([]);
      return;
    }
    const delayDebounce = setTimeout(async () => {
      setIsIcdLoading(true);
      try {
        const res = await axios.get(`/drugs/icd/search?q=${encodeURIComponent(icdSearchQuery)}`);
        setIcdSuggestions(res.data.data || []);
      } catch (error) {
        console.error("Error searching ICD codes:", error);
      } finally {
        setIsIcdLoading(false);
      }
    }, 300);
    return () => clearTimeout(delayDebounce);
  }, [icdSearchQuery]);

  const workspaceMode = localStorage.getItem('workspaceMode') || 'personal';
  const isPersonalMode = workspaceMode !== 'hospital';

  const menuItems = [
    { label: 'Dashboard',         path: '/doctor/dashboard',        icon: LayoutDashboard, end: true },
    { label: 'New Consultation',  path: '/doctor/consultation/new', icon: FiPlus },
    { label: 'Patient Directory', path: '/doctor/patients',          icon: Users },
    ...(isPersonalMode ? [{ label: 'My Profile', path: '/doctor/profile', icon: FiUser }] : []),
  ];

  /* ── Navigation helper ── */
  const goTo = (next) => { setDir(next > step ? 1 : -1); setStep(next); };

  /* ── API actions ── */
  const searchPatient = async () => {
    if (!patientNic) return toast.error('Enter patient NIC');
    setLoading(true);
    try {
      const res = await axios.get(`/patient/${patientNic}`);
      setPatientData(res.data.data);
      setShowOtpModal(true);
    } catch { toast.error('Patient not found'); }
    finally   { setLoading(false); }
  };

  const handleOtpSuccess = (token) => {
    setPatientAccessToken(token);
    setShowOtpModal(false);
  };

  const getDiagnosisSuggestions = async () => {
    if (symptoms.length === 0) return toast.error('Add at least one symptom');
    setLoading(true);
    try {
      const res = await axios.post('/doctor/predict-disease', { symptoms });
      setDiagnosesOptions(res.data.predictions || []);
    } catch {
      toast.error('ML service unavailable. Using standard list.');
      setDiagnosesOptions([
        { disease: 'Common Cold',             icd_code: 'J00',     recommendedSpecialist: 'General Physician', confidence: 85, urgent: false },
        { disease: 'Influenza',               icd_code: 'J11.1',   recommendedSpecialist: 'General Physician', confidence: 80, urgent: false },
        { disease: 'Acute Bronchitis',        icd_code: 'J20.9',   recommendedSpecialist: 'Pulmonologist',     confidence: 75, urgent: false },
        { disease: 'Essential Hypertension',  icd_code: 'I10',     recommendedSpecialist: 'Cardiologist',      confidence: 90, urgent: false },
        { disease: 'Type 2 Diabetes',         icd_code: 'E11.9',   recommendedSpecialist: 'Endocrinologist',   confidence: 88, urgent: false },
        { disease: 'Migraine',                icd_code: 'G43.909', recommendedSpecialist: 'Neurologist',       confidence: 70, urgent: false },
        { disease: 'Acute Pharyngitis',       icd_code: 'J02.9',   recommendedSpecialist: 'ENT',               confidence: 82, urgent: false },
        { disease: 'Gastroenteritis',         icd_code: 'A09',     recommendedSpecialist: 'Gastroenterologist',confidence: 78, urgent: false },
        { disease: 'Asthma',                  icd_code: 'J45.909', recommendedSpecialist: 'Pulmonologist',     confidence: 85, urgent: true  },
        { disease: 'Urinary Tract Infection', icd_code: 'N39.0',   recommendedSpecialist: 'Urologist',         confidence: 80, urgent: false },
      ]);
    } finally { setLoading(false); }
  };

  const addPrescription    = (drug) => {
    if (prescriptions.find(p => p.name === drug.name)) return toast.error('Drug already added');
    setPrescriptions(prev => [...prev, { name: drug.name, dosage: '1 tab', frequency: 'TDS', duration: '5 days', instructions: 'After meals' }]);
  };
  const removePrescription = (i)         => setPrescriptions(p => p.filter((_, idx) => idx !== i));
  const updatePrescription = (i, f, val) => setPrescriptions(p => p.map((rx, idx) => idx === i ? { ...rx, [f]: val } : rx));

  /* ── Lab test helpers ── */
  const handleLabInput = (val) => {
    setLabTestInput(val);
    if (val.trim().length < 2) { setLabSuggestions([]); return; }
    const q = val.toLowerCase();
    setLabSuggestions(LAB_TEST_SUGGESTIONS.filter(t => t.toLowerCase().includes(q) && !labTests.includes(t)).slice(0, 8));
  };
  const addLabTest = (name) => {
    const trimmed = (typeof name === 'string' ? name : labTestInput).trim();
    if (!trimmed) return;
    if (labTests.includes(trimmed)) { toast.error('Already added'); return; }
    setLabTests(prev => [...prev, trimmed]);
    setLabTestInput('');
    setTestInput('');
    setLabSuggestions([]);
  };
  const removeLabTest = (i) => setLabTests(t => t.filter((_, idx) => idx !== i));

  // ── Backward-compat aliases ───────────────────────────────────────────────
  // Step 1 JSX still references the pre-migration names: addTest / removeTest /
  // orderedTests. Both Step 1 and Step 3 now share the same labTests state.
  const addTest    = () => addLabTest(testInput);
  const removeTest = (i) => removeLabTest(i);
  const orderedTests = labTests;      // Step 1 panel reads this array for its tags


  const handleSubmit = async () => {
    if (!selectedDiagnosis && !manualDiagnosis) return toast.error('Select or type a diagnosis');
    setLoading(true);
    try {
      await axios.post('/doctor/consultation', {
        patientNic, symptoms,
        diagnosis:      manualDiagnosis || selectedDiagnosis,
        icdDescription: selectedIcd ? selectedDiagnosis : '',
        icdCode:        selectedIcd || '',
        clinicalNotes,
        prescriptions,
        orderedTests: labTests.map(t => ({ testName: t, instructions: '' })),
        labTests,
        isFollowUpRequired: !!followUpDate,
        followUpDate:       followUpDate || null,
        loginType:          localStorage.getItem('loginType'),
        sessionHospitalId:  localStorage.getItem('sessionHospitalId'),
      }, { headers: { 'x-patient-access': patientAccessToken } });
      toast.success('Consultation saved & prescription emailed!');
      navigate('/doctor/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save consultation');
    } finally { setLoading(false); }
  };

  /* Shared input class */
  const inp = 'glass-input w-full text-sm';

  /* ══════════════════════════════════════════════════════════════════════════ */
  return (
    <div className="flex bg-[#080d1a] min-h-screen text-slate-200">
      <Sidebar menuItems={menuItems} title="Doctor Portal" themePrefix="doctor" />

      <main className="flex-1 lg:ml-64 p-6 lg:p-10 transition-all duration-300">
        <PageTransition>
          {/* ── Page header ── */}
          <div className="mb-8 flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-400 tracking-tight">
                New Consultation
              </h1>
              <p className="text-slate-400 mt-1 text-sm">Complete the wizard to record a clinical assessment.</p>
            </div>
            {step > 1 && (
              <motion.button
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                onClick={() => goTo(1)}
                className="text-teal-400 text-sm px-4 py-2 glass-card rounded-xl border border-teal-500/20 hover:border-teal-500/40 transition-all"
              >
                ↩ Change Patient
              </motion.button>
            )}
          </div>

          {/* ── Wizard shell ── */}
          <div className="glass-panel rounded-3xl overflow-hidden shadow-2xl border border-white/5">
            <StepBar current={step} />

            <div className="p-6 md:p-10 overflow-hidden">
              <AnimatePresence mode="wait" custom={dir}>

                {/* ─────────────── STEP 1: Patient & Symptoms ─────────────── */}
                {step === 1 && (
                  <motion.div key="s1" custom={dir} variants={slideVariants}
                    initial="enter" animate="center" exit="exit"
                    className="space-y-8"
                  >
                    {/* Patient search */}
                    <div className="max-w-lg mx-auto space-y-6 py-6">
                      <div className="text-center">
                        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center neumorphic-flat">
                          <FiUser className="w-7 h-7 text-teal-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Identify Patient</h2>
                        <p className="text-slate-400 mt-1.5 text-sm">Enter the patient's NIC number to begin the consultation.</p>
                      </div>

                      <div className="relative">
                        <input
                          type="text"
                          value={patientNic}
                          onChange={e => setPatientNic(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && searchPatient()}
                          placeholder="e.g. 200312345699"
                          className={`${inp} pr-14 py-4 text-lg`}
                        />
                        <motion.button
                          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                          onClick={searchPatient} disabled={loading}
                          className="absolute right-2 top-2 bottom-2 px-4 rounded-lg bg-gradient-to-br from-teal-600 to-cyan-600 text-white flex items-center shadow-lg shadow-teal-500/20 hover:shadow-teal-500/40 transition-shadow"
                        >
                          {loading
                            ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            : <FiSearch className="w-5 h-5" />}
                        </motion.button>
                      </div>

                      {patientData && !patientAccessToken && (
                        <div className="text-center">
                          <button
                            type="button"
                            onClick={() => setShowOtpModal(true)}
                            className="px-4 py-2 bg-teal-500/10 border border-teal-500/20 text-teal-400 hover:bg-teal-500/20 rounded-xl text-sm font-semibold transition-all"
                          >
                            Verify Again
                          </button>
                        </div>
                      )}
                    </div>

                    {/* OTP modal */}
                    {showOtpModal && (
                      <PatientAccessModal
                        patientNic={patientNic}
                        requesterName={localStorage.getItem('userName') || 'Doctor'}
                        requesterRole="doctor"
                        onSuccess={handleOtpSuccess}
                        onClose={() => setShowOtpModal(false)}
                      />
                    )}

                    {/* Symptoms & notes revealed once patient is loaded */}
                    {patientData && (
                      <motion.div
                        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35 }}
                        className="grid lg:grid-cols-2 gap-6"
                      >
                        {/* Patient context banner */}
                        <div className="lg:col-span-2 glass-card rounded-2xl p-5 border border-white/5 flex flex-wrap gap-6 relative overflow-hidden">
                          <div className="absolute -top-8 -right-8 w-32 h-32 bg-teal-500/10 rounded-full blur-2xl" aria-hidden="true" />
                          {[
                            { label: 'Patient',            value: `${patientData.fullName} (${patientData.age ?? '—'}y)`,       color: 'text-white'   },
                            { label: 'Blood Group',        value: patientData.bloodGroup || 'N/A',                               color: 'text-red-400' },
                            { label: 'Allergies',          value: patientData.allergies?.join(', ') || 'None',                  color: 'text-orange-400' },
                            { label: 'Chronic Conditions', value: patientData.chronicConditions?.join(', ') || 'None',          color: 'text-purple-400' },
                          ].map(({ label, value, color }) => (
                            <div key={label}>
                              <p className="label-caps mb-1">{label}</p>
                              <p className={`font-bold ${color}`}>{value}</p>
                            </div>
                          ))}
                        </div>

                        {/* Symptoms */}
                        <div className="glass-card rounded-2xl p-6 border border-white/5">
                          <label className="flex items-center gap-2 text-sm font-semibold text-slate-200 mb-4">
                            <FiActivity className="text-teal-400" /> Presenting Symptoms
                          </label>
                          <SymptomTagInput selectedSymptoms={symptoms} onChange={setSymptoms} />
                        </div>

                        {/* Clinical notes */}
                        <div className="glass-card rounded-2xl p-6 border border-white/5">
                          <label className="flex items-center gap-2 text-sm font-semibold text-slate-200 mb-4">
                            <FiFileText className="text-teal-400" /> Clinical Notes
                          </label>
                          <textarea
                            value={clinicalNotes}
                            onChange={e => setClinicalNotes(e.target.value)}
                            rows={5}
                            placeholder="Detailed observation notes…"
                            className={`${inp} resize-none`}
                          />
                        </div>

                        {/* Lab tests */}
                        <div className="lg:col-span-2 glass-card rounded-2xl p-6 border border-white/5">
                          <label className="flex items-center gap-2 text-sm font-semibold text-slate-200 mb-4">
                            <FlaskConical className="w-4 h-4 text-purple-400" /> Order Lab Tests
                          </label>
                          <div className="flex gap-2 mb-3">
                            <input
                              type="text" value={testInput}
                              onChange={e => setTestInput(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && addTest()}
                              placeholder="e.g. Full Blood Count"
                              className={inp}
                            />
                            <motion.button
                              whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                              onClick={addTest}
                              className="px-5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors"
                            >Add</motion.button>
                          </div>
                          {orderedTests.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {orderedTests.map((t, i) => (
                                <span key={`${t}-${i}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 border border-purple-500/25 text-purple-300 rounded-lg text-xs font-semibold">
                                  {t}
                                  <button onClick={() => removeTest(i)} className="hover:text-red-400 transition-colors"><FiTrash2 size={12} /></button>
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}

                    {/* Continue */}
                    {patientData && (
                      <div className="flex justify-end pt-4 border-t border-white/5">
                        <motion.button
                          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                          onClick={() => goTo(2)}
                          disabled={!patientAccessToken}
                          className="glass-button px-8 py-3 flex items-center gap-2 disabled:opacity-50"
                        >
                          Continue to AI Diagnosis <FiChevronRight />
                        </motion.button>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* ─────────────── STEP 2: ML Prediction ─────────────────── */}
                {step === 2 && (
                  <motion.div key="s2" custom={dir} variants={slideVariants}
                    initial="enter" animate="center" exit="exit"
                    className="space-y-8"
                  >
                    {/* Patient summary */}
                    <div className="glass-card rounded-2xl p-4 border border-white/5 flex flex-wrap gap-6">
                      <div>
                        <p className="label-caps mb-1">Patient</p>
                        <p className="font-bold text-white">{patientData?.fullName}</p>
                      </div>
                      <div>
                        <p className="label-caps mb-1">Symptoms</p>
                        <p className="text-teal-400 font-medium text-sm">{symptoms.length > 0 ? symptoms.join(', ') : '—'}</p>
                      </div>
                    </div>

                    {/* AI Engine */}
                    <div className="glass-card rounded-2xl p-6 border border-teal-500/10 relative overflow-hidden">
                      <div className="absolute -top-16 -right-16 w-40 h-40 bg-teal-500/5 rounded-full blur-3xl" aria-hidden="true" />

                      <div className="flex items-center justify-between mb-6 relative z-10">
                        <h3 className="font-bold text-white text-lg flex items-center gap-2.5">
                          <span className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center">
                            <FiActivity className="text-teal-400 animate-pulse" />
                          </span>
                          AI Diagnosis Engine
                        </h3>
                        <motion.button
                          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                          onClick={getDiagnosisSuggestions}
                          disabled={loading || symptoms.length === 0}
                          className="glass-button px-5 py-2.5 text-sm flex items-center gap-2 disabled:opacity-50"
                        >
                          {loading
                            ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Analyzing…</>
                            : 'Analyze Symptoms'}
                        </motion.button>
                      </div>

                      {diagnosesOptions.length > 0 ? (
                        <div className="space-y-3 relative z-10 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                          {diagnosesOptions.map((diag, i) => (
                            <motion.div
                              key={`${diag.disease}-${i}`}
                              initial={{ opacity: 0, x: 12 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.05 }}
                              onClick={() => { setSelectedDiagnosis(diag.disease); setSelectedIcd(diag.icd_code); }}
                              className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 ${
                                selectedDiagnosis === diag.disease
                                  ? 'border-teal-500/60 bg-teal-500/10 shadow-[0_0_20px_rgba(20,184,166,0.12)]'
                                  : 'border-white/5 bg-slate-900/40 hover:border-white/10'
                              }`}
                            >
                              <div className="flex justify-between items-start gap-3">
                                <div className="min-w-0">
                                  <p className="font-bold text-white flex items-center gap-2">
                                    {diag.disease}
                                    {diag.urgent && (
                                      <span className="text-[9px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded border border-red-500/30 font-black uppercase tracking-wider animate-pulse">
                                        URGENT
                                      </span>
                                    )}
                                  </p>
                                  <div className="flex flex-wrap gap-2 mt-1.5">
                                    <span className="text-[11px] text-slate-400 bg-slate-950/60 px-2 py-0.5 rounded border border-slate-800 font-mono">
                                      ICD-10: {diag.icd_code}
                                    </span>
                                    <span className="text-[11px] text-slate-400 bg-slate-950/60 px-2 py-0.5 rounded border border-slate-800">
                                      {diag.recommendedSpecialist}
                                    </span>
                                  </div>
                                </div>
                                <span className={`flex-shrink-0 text-xs font-extrabold px-2.5 py-1 rounded border ${
                                  diag.confidence > 70
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                                }`}>
                                  {diag.confidence}%
                                </span>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      ) : (
                        <div className="relative z-10 py-14 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/10">
                          <FiActivity className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                          <p className="text-sm text-slate-500 max-w-xs mx-auto">
                            Click "Analyze Symptoms" to get AI-powered diagnosis suggestions.
                          </p>
                        </div>
                      )}

                      {/* Manual confirmation */}
                      <div className="mt-6 pt-5 border-t border-white/5 relative z-10">
                        <label className="block text-sm font-semibold text-slate-300 mb-3">Final Diagnosis Confirmation</label>

                        {/* ICD Search Bar */}
                        <div className="mb-4 relative">
                          <div className="relative">
                            <input
                              type="text"
                              value={icdSearchQuery}
                              onChange={e => setIcdSearchQuery(e.target.value)}
                              placeholder="Search diagnosis or ICD-10 code (e.g. Hypertension)..."
                              className={`${inp} pl-10`}
                            />
                            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                            {isIcdLoading && (
                              <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                                <div className="w-4 h-4 border-2 border-teal-500/30 border-t-teal-400 rounded-full animate-spin" />
                              </div>
                            )}
                          </div>

                          {/* Autocomplete Suggestions */}
                          {icdSuggestions.length > 0 && (
                            <div className="absolute z-50 w-full mt-1 bg-slate-900/95 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-xl max-h-48 overflow-y-auto custom-scrollbar">
                              {icdSuggestions.map((item, idx) => (
                                <div
                                  key={`${item.code}-${idx}`}
                                  onClick={() => {
                                    setSelectedDiagnosis(item.description);
                                    setSelectedIcd(item.code);
                                    setIcdSuggestions([]);
                                    setIcdSearchQuery('');
                                    setManualDiagnosis('');
                                  }}
                                  className="px-4 py-2.5 hover:bg-slate-800/60 cursor-pointer transition-colors border-b border-white/5 last:border-0 text-sm flex justify-between items-center text-slate-200"
                                >
                                  <span className="font-medium">{item.description}</span>
                                  <span className="text-teal-400 font-mono font-bold text-xs bg-slate-950/60 px-2 py-0.5 rounded border border-slate-800">{item.code}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Manual Diagnosis */}
                        <div className="mb-4">
                          <label className="block text-xs font-semibold text-slate-400 mb-2">Manual Diagnosis (If unlisted)</label>
                          <input
                            type="text"
                            value={manualDiagnosis}
                            onChange={e => {
                              setManualDiagnosis(e.target.value);
                              if (e.target.value.trim()) {
                                setSelectedDiagnosis('');
                                setSelectedIcd('');
                              }
                            }}
                            placeholder="Enter custom illness..."
                            className={inp}
                          />
                        </div>

                        <div className="flex gap-3">
                          <input
                            type="text" value={selectedDiagnosis}
                            onChange={e => setSelectedDiagnosis(e.target.value)}
                            placeholder="Diagnosis name"
                            className={`${inp} flex-1`}
                          />
                          <input
                            type="text" value={selectedIcd}
                            onChange={e => setSelectedIcd(e.target.value)}
                            placeholder="ICD Code"
                            className={`${inp} w-32 uppercase`}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Navigation */}
                    <div className="flex justify-between items-center pt-4 border-t border-white/5">
                      <motion.button
                        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                        onClick={() => goTo(1)}
                        className="glass-button-ghost px-6 py-3 flex items-center gap-2"
                      >
                        <FiChevronLeft /> Back
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                        onClick={() => goTo(3)}
                        disabled={!selectedDiagnosis && !manualDiagnosis}
                        className="glass-button px-8 py-3 flex items-center gap-2 disabled:opacity-50"
                      >
                        Build Prescription <FiChevronRight />
                      </motion.button>
                    </div>
                  </motion.div>
                )}

                {/* ─────────────── STEP 3: E-Prescription ─────────────────── */}
                {step === 3 && (
                  <motion.div key="s3" custom={dir} variants={slideVariants}
                    initial="enter" animate="center" exit="exit"
                    className="space-y-6"
                  >
                    {/* Diagnosis banner */}
                    <div className="glass-card rounded-2xl p-5 border border-emerald-500/15 flex flex-wrap gap-6">
                      <div>
                        <p className="label-caps mb-1">Confirmed Diagnosis</p>
                        <p className="font-bold text-emerald-400 text-lg">{manualDiagnosis || selectedDiagnosis}</p>
                      </div>
                      {selectedIcd && (
                        <div>
                          <p className="label-caps mb-1">ICD-10</p>
                          <p className="font-mono font-bold text-white">{selectedIcd}</p>
                        </div>
                      )}
                    </div>

                    {/* ── Drug search ──────────────────────────────────────── */}
                    <div className="glass-card rounded-2xl p-6 border border-white/5">
                      <h3 className="font-bold text-white mb-4 flex items-center gap-2 text-base">
                        <span className="w-8 h-8 rounded-lg bg-teal-500/15 border border-teal-500/25 flex items-center justify-center">
                          <FiPlus className="text-teal-400" />
                        </span>
                        Add Medication
                      </h3>
                      <DrugSearchInput
                        onSelect={addPrescription}
                        currentPrescriptions={prescriptions}
                        patientAllergies={patientData?.allergies}
                      />
                    </div>

                    {/* ── Prescription table ───────────────────────────────── */}
                    {prescriptions.length > 0 && (
                      <div className="glass-card rounded-2xl border border-white/5 overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-slate-950/40 border-b border-white/5 text-slate-400">
                              <tr>
                                {['Drug', 'Dosage', 'Frequency', 'Duration', 'Instructions', ''].map(h => (
                                  <th key={h} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/30">
                              {prescriptions.map((rx, idx) => (
                                <motion.tr
                                  key={rx.name}
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: idx * 0.05 }}
                                  className="hover:bg-slate-900/20 transition-colors"
                                >
                                  <td className="px-4 py-3 font-bold text-white">{rx.name}</td>
                                  <td className="px-3 py-3">
                                    <input value={rx.dosage} onChange={e => updatePrescription(idx,'dosage',e.target.value)}
                                      className="w-24 glass-input py-1.5 px-2 text-xs" />
                                  </td>
                                  <td className="px-3 py-3">
                                    <select value={rx.frequency} onChange={e => updatePrescription(idx,'frequency',e.target.value)}
                                      className="w-24 glass-input py-1.5 px-2 text-xs appearance-none">
                                      {['OD','BD','TDS','QID','SOS'].map(f => <option key={f}>{f}</option>)}
                                    </select>
                                  </td>
                                  <td className="px-3 py-3">
                                    <input value={rx.duration} onChange={e => updatePrescription(idx,'duration',e.target.value)}
                                      className="w-24 glass-input py-1.5 px-2 text-xs" />
                                  </td>
                                  <td className="px-3 py-3">
                                    <input value={rx.instructions} onChange={e => updatePrescription(idx,'instructions',e.target.value)}
                                      className="w-full min-w-[140px] glass-input py-1.5 px-2 text-xs" />
                                  </td>
                                  <td className="px-3 py-3">
                                    <button onClick={() => removePrescription(idx)}
                                      className="glass-button-danger p-2 rounded-lg">
                                      <FiTrash2 size={14} />
                                    </button>
                                  </td>
                                </motion.tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* ── Lab Tests ────────────────────────────────────────── */}
                    <div className="glass-card rounded-2xl p-6 border border-purple-500/10 relative">
                      {/* Section header */}
                      <h3 className="font-bold text-white mb-1 flex items-center gap-2 text-base">
                        <span className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/25 flex items-center justify-center">
                          <FlaskConical className="w-4 h-4 text-purple-400" />
                        </span>
                        Recommended Lab Tests
                        <span className="ml-auto text-xs font-normal text-slate-500">Optional</span>
                      </h3>
                      <p className="text-xs text-slate-500 mb-4 pl-10">Type to search from common tests or enter a custom test name.</p>

                      {/* Auto-suggest input */}
                      <div className="relative">
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4 pointer-events-none" />
                            <input
                              id="lab-test-input"
                              type="text"
                              value={labTestInput}
                              onChange={e => handleLabInput(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') { e.preventDefault(); addLabTest(); }
                                if (e.key === 'Escape') setLabSuggestions([]);
                              }}
                              placeholder="e.g. Blood, Thyroid, Chest X-Ray…"
                              className={`${inp} pl-10`}
                              autoComplete="off"
                            />
                            {/* Dropdown suggestions */}
                            <AnimatePresence>
                              {labSuggestions.length > 0 && (
                                <motion.div
                                  initial={{ opacity: 0, y: -6 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: -6 }}
                                  transition={{ duration: 0.15 }}
                                  className="absolute z-50 w-full mt-1 bg-slate-900/98 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-2xl"
                                >
                                  {labSuggestions.map((s, i) => (
                                    <button
                                      key={`${s}-${i}`}
                                      type="button"
                                      onClick={() => addLabTest(s)}
                                      className="w-full text-left px-4 py-2.5 text-sm text-slate-200 hover:bg-purple-500/10 hover:text-purple-300 transition-colors border-b border-white/5 last:border-0 flex items-center gap-2"
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
                                      {s}
                                    </button>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                          <motion.button
                            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                            type="button"
                            onClick={() => addLabTest()}
                            className="px-5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors flex items-center gap-1.5 flex-shrink-0"
                          >
                            <FiPlus className="w-4 h-4" /> Add
                          </motion.button>
                        </div>
                      </div>

                      {/* Test tags */}
                      {labTests.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-white/5"
                        >
                          {labTests.map((t, i) => (
                            <motion.span
                              key={`${t}-${i}`}
                              initial={{ scale: 0.8, opacity: 0 }}
                              animate={{ scale: 1,   opacity: 1 }}
                              exit={{ scale: 0.7, opacity: 0 }}
                              className="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 bg-purple-500/10 border border-purple-500/25 text-purple-300 rounded-lg text-xs font-semibold"
                            >
                              <FlaskConical className="w-3 h-3 text-purple-400" />
                              {t}
                              <button
                                type="button"
                                onClick={() => removeLabTest(i)}
                                className="ml-0.5 text-purple-400 hover:text-red-400 transition-colors rounded p-0.5"
                              >
                                <FiTrash2 size={11} />
                              </button>
                            </motion.span>
                          ))}
                        </motion.div>
                      )}
                    </div>

                    {/* ── Follow-up Date ───────────────────────────────────── */}
                    <div className="glass-card rounded-2xl p-6 border border-teal-500/10">
                      <h3 className="font-bold text-white mb-1 flex items-center gap-2 text-base">
                        <span className="w-8 h-8 rounded-lg bg-teal-500/15 border border-teal-500/25 flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </span>
                        Next Consultation / Follow-up Date
                        <span className="ml-auto text-xs font-normal text-slate-500">Optional</span>
                      </h3>
                      <p className="text-xs text-slate-500 mb-4 pl-10">If set, this date will be printed on the prescription PDF and sent to the patient.</p>
                      <div className="pl-10">
                        <input
                          type="date"
                          id="follow-up-date"
                          value={followUpDate}
                          onChange={e => setFollowUpDate(e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                          className="glass-input py-2.5 px-4 text-sm w-full max-w-xs"
                        />
                        {followUpDate && (
                          <motion.p
                            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                            className="mt-2 text-xs text-teal-400 font-semibold flex items-center gap-1.5"
                          >
                            <FiCheck className="w-3 h-3" />
                            Follow-up scheduled for {new Date(followUpDate).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
                          </motion.p>
                        )}
                      </div>
                    </div>

                    {/* ── Action bar ───────────────────────────────────────── */}
                    <div className="flex justify-between items-center pt-2">
                      <motion.button
                        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                        onClick={() => goTo(2)}
                        className="glass-button-ghost px-6 py-3 flex items-center gap-2"
                      >
                        <FiChevronLeft /> Back
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                        onClick={handleSubmit} disabled={loading}
                        className="glass-button px-8 py-3 flex items-center gap-2 disabled:opacity-60"
                      >
                        {loading
                          ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          : <FiSave className="w-4 h-4" />}
                        Complete Consultation
                      </motion.button>
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
