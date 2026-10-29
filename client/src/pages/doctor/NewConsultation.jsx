import React, { useState, useEffect, useRef } from 'react';
import { requiresWriteReconciliation } from '../../utils/clinicalSaveOutcome';
import { useTranslation } from '../../i18n/LanguageContext';
import { pendingClinicalAttempt, beginClinicalAttempt, finishClinicalAttempt } from '../../utils/pendingClinicalAttempt';
import { useNavigate } from 'react-router-dom';
import axios from '../../api/axiosInstance';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiUser, FiActivity, FiFileText, FiPlus, FiTrash2,
  FiSave, FiSearch, FiChevronRight, FiChevronLeft, FiCheck,
  FiAlertTriangle, FiInfo
} from 'react-icons/fi';
import AppShell from '../../components/ui/AppShell';
import PageTransition from '../../components/common/PageTransition';
import SymptomTagInput from '../../components/SymptomTagInput';
import DrugSearchInput from '../../components/DrugSearchInput';
import PatientAccessModal from '../../components/PatientAccessModal';
import { inferencePredictions } from '../../utils/inferenceResponse';
import usePatientConsent from '../../hooks/usePatientConsent';
import { prescriptionPayload } from '../../utils/prescriptionDuration';
import { LayoutDashboard, FlaskConical } from 'lucide-react';

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
  { id: 1, label: 'Identify Patient', short: 'Patient', icon: FiUser },
  { id: 2, label: 'Medical History',  short: 'History', icon: FiFileText },
  { id: 3, label: 'Symptoms',         short: 'Symptoms',icon: FiActivity },
  { id: 4, label: 'Reference Matches', short: 'Reference', icon: FiActivity },
  { id: 5, label: 'Rx & Labs',        short: 'Rx/Labs', icon: FiFileText },
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step,    setStep]   = useState(1);
  const [dir,     setDir]    = useState(1);   // slide direction: +1 = forward, -1 = back
  const [loading, setLoading] = useState(false);
  const [showOtpModal,       setShowOtpModal]       = useState(false);
  /* ── Form state ── */
  const [patientNic,         setPatientNic]        = useState('');

  const [symptoms,           setSymptoms]          = useState([]);
  const [clinicalNotes,      setClinicalNotes]     = useState('');
  const [diagnosesOptions,   setDiagnosesOptions]  = useState([]);
  const [inferenceStatus, setInferenceStatus] = useState('idle');
  const inferenceRequest = useRef(0), inferenceBusy = useRef(false), inferenceMounted = useRef(true), inferenceRetryTimer = useRef(null);
  useEffect(() => {
    const infMntRef = inferenceMounted;
    const infReqRef = inferenceRequest;
    infMntRef.current = true;
    return () => {
      infMntRef.current = false;
      infReqRef.current++;
      if (inferenceRetryTimer.current) clearTimeout(inferenceRetryTimer.current);
    };
  }, []);
  const [selectedDiagnosis,  setSelectedDiagnosis] = useState('');
  const [selectedIcd,        setSelectedIcd]       = useState('');
  const [selectedIcdVersion, setSelectedIcdVersion] = useState('ICD-10');
  const [icdVersionFilter,   setIcdVersionFilter]   = useState('all');
  const [manualDiagnosis,    setManualDiagnosis]   = useState('');
  const [icdSearchQuery,     setIcdSearchQuery]    = useState('');
  const [icdSuggestions,     setIcdSuggestions]    = useState([]);
  const [isIcdLoading,       setIsIcdLoading]      = useState(false);
  const [icdActiveIndex,     setIcdActiveIndex]    = useState(-1);
  const [isIcdOpen,          setIsIcdOpen]         = useState(false);
  const icdWrapperRef = useRef(null);
  const icdListRef = useRef(null);

  const [prescriptions,      setPrescriptions]     = useState([]);
  const [interactionAnalysis, setInteractionAnalysis] = useState(null);
  const [labTests,           setLabTests]          = useState([]);
  const [labTestInput,       setLabTestInput]      = useState('');

  const [labSuggestions,     setLabSuggestions]    = useState([]);
  const [labActiveIndex,     setLabActiveIndex]    = useState(-1);
  const [isLabOpen,          setIsLabOpen]         = useState(false);
  const labWrapperRef = useRef(null);
  const labListRef = useRef(null);
  const [followUpDate,       setFollowUpDate]      = useState('');

  const draftEpoch = useRef(0);
  const generateConsultIdempotencyKey = () => `consult-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  const initialAttempt = useRef(pendingClinicalAttempt());
  const consultationIdempotencyKey = useRef(initialAttempt.current.key || generateConsultIdempotencyKey());
  const [pendingWriteHold, setPendingWriteHold] = useState(initialAttempt.current.blocked);
  const clearClinicalDraft = () => {
    draftEpoch.current++;
    if (!pendingClinicalAttempt().blocked && !submissionBusy.current && !submissionUncertain.current) consultationIdempotencyKey.current = generateConsultIdempotencyKey();
    if (inferenceRetryTimer.current) clearTimeout(inferenceRetryTimer.current);
    inferenceRequest.current++; inferenceBusy.current = false; setInferenceStatus('idle');
    setShowOtpModal(false); setStep(1); setLoading(false);
    setSymptoms([]); setClinicalNotes(''); setDiagnosesOptions([]); setSelectedDiagnosis('');
    setSelectedIcd(''); setManualDiagnosis(''); setIcdSearchQuery(''); setIcdSuggestions([]);
    setIsIcdOpen(false); setIcdActiveIndex(-1);
    setPrescriptions([]); setInteractionAnalysis(null); setLabTests([]); setLabTestInput('');
    setLabSuggestions([]); setIsLabOpen(false); setLabActiveIndex(-1); setFollowUpDate('');
  };
  const consent = usePatientConsent(axios, patientNic, clearClinicalDraft);
  const patientAccessToken = consent.token, patientData = consent.patient;
  const medicalHistory = consent.history, isHistoryLoading = consent.status === 'loading';
  const submissionBusy = useRef(false);
  const submissionUncertain = useRef(initialAttempt.current.blocked);
  const submissionFailedRef = useRef(false);

  useEffect(() => {
    if (
      submissionFailedRef.current &&
      !pendingClinicalAttempt().blocked &&
      !submissionBusy.current &&
      !submissionUncertain.current
    ) {
      consultationIdempotencyKey.current = generateConsultIdempotencyKey();
      submissionFailedRef.current = false;
    }
  }, [
    symptoms,
    manualDiagnosis,
    selectedDiagnosis,
    selectedIcd,
    selectedIcdVersion,
    clinicalNotes,
    prescriptions,
    labTests,
    followUpDate,
  ]);

  // Re-evaluate medication interactions & ingredient resolution whenever prescriptions change
  useEffect(() => {
    const drugNames = prescriptions.map(p => p.name).filter(Boolean);
    if (drugNames.length === 0) {
      setInteractionAnalysis(null);
      return;
    }
    let cancelled = false;
    const runInteractionCheck = async () => {
      try {
        const res = await axios.post('/drugs/interactions', { drugs: drugNames });
        if (!cancelled) {
          setInteractionAnalysis(res.data?.data || null);
        }
      } catch {
        if (!cancelled) {
          setInteractionAnalysis({
            hasInteraction: false,
            verificationIncomplete: true,
            statusMessage: 'Automated interaction checking is incomplete due to a service error. Do not assume this combination is safe.',
            warnings: [],
            unresolvedDrugs: [],
            unresolvedIngredients: ['<service_unavailable>']
          });
        }
      }
    };
    runInteractionCheck();
    return () => { cancelled = true; };
  }, [prescriptions]);

  // Click-outside listener for ICD Autocomplete
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (icdWrapperRef.current && !icdWrapperRef.current.contains(e.target)) {
        setIsIcdOpen(false);
        setIcdActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Click-outside listener for Lab Test Autocomplete
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (labWrapperRef.current && !labWrapperRef.current.contains(e.target)) {
        setIsLabOpen(false);
        setLabActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Fetch ICD-10 & WHO ICD-11 suggestions debounced
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    if (icdSearchQuery.trim().length < 2) {
      setIcdSuggestions([]);
      setIsIcdOpen(false);
      setIcdActiveIndex(-1);
      return;
    }
    const delayDebounce = setTimeout(async () => {
      setIsIcdLoading(true);
      try {
        const res = await axios.get(`/drugs/icd/search?q=${encodeURIComponent(icdSearchQuery)}&version=${icdVersionFilter}`, { signal: controller.signal });
        if (current) {
          setIcdSuggestions(res.data.data || []);
          setIsIcdOpen(true);
          setIcdActiveIndex(-1);
        }
      } catch (error) {
        if (current) {
          setIcdSuggestions([]);
          setIsIcdOpen(true);
          setIcdActiveIndex(-1);
        }
      } finally {
        if (current) setIsIcdLoading(false);
      }
    }, 300);
    return () => { current = false; controller.abort(); clearTimeout(delayDebounce); };
  }, [icdSearchQuery, icdVersionFilter]);

  const workspaceMode = localStorage.getItem('workspaceMode') || 'personal';
  const isPersonalMode = workspaceMode !== 'hospital';

  const menuItems = [
    { label: 'Dashboard',         path: '/doctor/dashboard',        icon: LayoutDashboard, end: true },
    { label: 'New Consultation',  path: '/doctor/consultation/new', icon: FiPlus },
    
    ...(isPersonalMode ? [{ label: 'My Profile', path: '/doctor/profile', icon: FiUser }] : []),
  ];

  /* ── Navigation helper ── */
  const goTo = (next) => { setDir(next > step ? 1 : -1); setStep(next); };

  /* ── API actions ── */
  const searchPatient = () => {
    if (!patientNic.trim()) return toast.error('Enter patient NIC');
    if (showOtpModal || consent.status === 'loading') return;
    setShowOtpModal(true);
  };

  const handleOtpSuccess = async (token) => {
    setShowOtpModal(false);
    if (await consent.authorize(token)) goTo(2);
  };

  const isColdStartError = (err) => {
    const status = err?.response?.status;
    const code = err?.code;
    const msg = String(err?.message || '');
    return (
      status === 503 ||
      status === 502 ||
      status === 504 ||
      code === 'ECONNABORTED' ||
      code === 'ERR_NETWORK' ||
      msg.includes('timeout') ||
      msg.includes('Network Error')
    );
  };

  const getDiagnosisSuggestions = async () => {
    if (symptoms.length === 0) return toast.error('Add at least one symptom');
    if (inferenceBusy.current) return;
    if (inferenceRetryTimer.current) clearTimeout(inferenceRetryTimer.current);
    const epoch = draftEpoch.current, requestId = ++inferenceRequest.current;
    const current = () => inferenceMounted.current && epoch === draftEpoch.current && requestId === inferenceRequest.current;
    inferenceBusy.current = true;
    setLoading(true); setDiagnosesOptions([]); setInferenceStatus('loading');
    const RETRY_DELAY_MS = process.env.NODE_ENV === 'test' ? 50 : 2500;
    try {
      let res;
      try {
        res = await axios.post('/doctor/predict-disease', { symptoms });
      } catch (firstErr) {
        if (!current()) return;
        if (isColdStartError(firstErr)) {
          setInferenceStatus('waking');
          await new Promise(resolve => {
            inferenceRetryTimer.current = setTimeout(resolve, RETRY_DELAY_MS);
          });
          if (!current()) return;
          res = await axios.post('/doctor/predict-disease', { symptoms });
        } else {
          throw firstErr;
        }
      }
      if (!current()) return;
      const predictions = inferencePredictions(res.data);
      setDiagnosesOptions(predictions);
      setInferenceStatus(predictions.length ? 'available' : 'empty');
    } catch {
      if (!current()) return;
      setDiagnosesOptions([]); setInferenceStatus('unavailable');
      toast.error('AI suggestions unavailable');
    } finally { if (current()) { inferenceBusy.current = false; setLoading(false); } }
  };

  const addPrescription    = (drug) => {
    if (prescriptions.find(p => p.name === drug.name)) return toast.error('Drug already added');
    setPrescriptions(prev => [...prev, { name: drug.name, dosage: '1 tab', frequency: 'TDS', durationDays: 5, instructions: 'After meals' }]);
  };
  const removePrescription = (i)         => setPrescriptions(p => p.filter((_, idx) => idx !== i));
  const updatePrescription = (i, f, val) => setPrescriptions(p => p.map((rx, idx) => idx === i ? { ...rx, [f]: val } : rx));

  /* ── ICD selection & keydown helpers ── */
  const selectIcdItem = (item) => {
    setSelectedDiagnosis(item.description);
    setSelectedIcd(item.code);
    setSelectedIcdVersion(item.version || 'ICD-10');
    setIcdSuggestions([]);
    setIsIcdOpen(false);
    setIcdSearchQuery('');
    setManualDiagnosis('');
    setIcdActiveIndex(-1);
  };

  const handleIcdKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isIcdOpen && icdSuggestions.length > 0) {
        setIsIcdOpen(true);
        setIcdActiveIndex(0);
      } else if (icdSuggestions.length > 0) {
        setIcdActiveIndex(prev => (prev < icdSuggestions.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isIcdOpen && icdSuggestions.length > 0) {
        setIcdActiveIndex(prev => (prev > 0 ? prev - 1 : icdSuggestions.length - 1));
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsIcdOpen(false);
      setIcdActiveIndex(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = (icdSearchQuery || '').trim();
      if (!trimmed) return;

      if (isIcdOpen && icdActiveIndex >= 0 && icdActiveIndex < icdSuggestions.length) {
        selectIcdItem(icdSuggestions[icdActiveIndex]);
        return;
      }

      const exactMatch = icdSuggestions.find(
        s => s.code.toLowerCase() === trimmed.toLowerCase() || s.description.toLowerCase() === trimmed.toLowerCase()
      );
      if (exactMatch) {
        selectIcdItem(exactMatch);
        return;
      }

      // Set as clinician manual diagnosis if unlisted
      setManualDiagnosis(trimmed);
      setSelectedDiagnosis('');
      setSelectedIcd('');
      setSelectedIcdVersion('Custom');
      setIcdSuggestions([]);
      setIsIcdOpen(false);
      setIcdSearchQuery('');
      setIcdActiveIndex(-1);
    }
  };

  /* ── Lab test helpers ── */
  const handleLabInput = (val) => {
    setLabTestInput(val);
    setLabActiveIndex(-1);
    const trimmed = (val || '').trim();
    if (trimmed.length < 2) {
      setLabSuggestions([]);
      setIsLabOpen(false);
      return;
    }
    const q = trimmed.toLowerCase();
    const filtered = LAB_TEST_SUGGESTIONS
      .filter(t => t.toLowerCase().includes(q) && !labTests.includes(t))
      .slice(0, 8);
    setLabSuggestions(filtered);
    setIsLabOpen(true);
  };
  const addLabTest = (name) => {
    const trimmed = (typeof name === 'string' ? name : labTestInput).trim();
    if (!trimmed) return;
    if (labTests.includes(trimmed)) { toast.error('Already added'); return; }
    setLabTests(prev => [...prev, trimmed]);
    setLabTestInput('');
    setLabSuggestions([]);
    setIsLabOpen(false);
    setLabActiveIndex(-1);
  };
  const handleLabKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isLabOpen && labSuggestions.length > 0) {
        setIsLabOpen(true);
        setLabActiveIndex(0);
      } else if (labSuggestions.length > 0) {
        setLabActiveIndex(prev => (prev < labSuggestions.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isLabOpen && labSuggestions.length > 0) {
        setLabActiveIndex(prev => (prev > 0 ? prev - 1 : labSuggestions.length - 1));
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsLabOpen(false);
      setLabActiveIndex(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isLabOpen && labActiveIndex >= 0 && labActiveIndex < labSuggestions.length) {
        addLabTest(labSuggestions[labActiveIndex]);
        return;
      }
      addLabTest();
    }
  };
  const removeLabTest = (i) => setLabTests(t => t.filter((_, idx) => idx !== i));

  // ── Backward-compat aliases ───────────────────────────────────────────────
  // Step 1 JSX still references the pre-migration names: addTest / removeTest /
  // orderedTests. Both Step 1 and Step 3 now share the same labTests state.





  const handleSubmit = async () => {
    if (submissionUncertain.current) return toast.error('Save status is uncertain. Check consultation history with an authorized operator before another submission.');
    if (submissionBusy.current) return;
    if (!patientAccessToken || consent.status !== 'authorized') return toast.error('Verify patient access again');
    if (!selectedDiagnosis && !manualDiagnosis) return toast.error('Select or type a diagnosis');
    submissionBusy.current = true;
    setLoading(true);
    try {
      beginClinicalAttempt(consultationIdempotencyKey.current);
      const response = await axios.post('/doctor/consultation', {
        patientNic, symptoms,
        diagnosis:      manualDiagnosis || selectedDiagnosis,
        icdDescription: selectedIcd ? selectedDiagnosis : '',
        icdCode:        selectedIcd || '',
        icdVersion:     selectedIcdVersion || 'ICD-10',
        clinicalNotes,
        prescriptions: prescriptionPayload(prescriptions),
        orderedTests: labTests.map(t => ({ testName: t, instructions: '' })),
        labTests,
        isFollowUpRequired: !!followUpDate,
        followUpDate:       followUpDate || null,
        loginType:          localStorage.getItem('loginType'),
        sessionHospitalId:  localStorage.getItem('sessionHospitalId'),
      }, { headers: { 'x-patient-access': patientAccessToken, 'Idempotency-Key': consultationIdempotencyKey.current } });
      if (![200, 201].includes(response.status) || !/^[a-f0-9]{24}$/i.test(response.data?.consultationId || '')) throw new Error('CLINICAL_OUTCOME_UNCONFIRMED');
      finishClinicalAttempt(consultationIdempotencyKey.current);
      consultationIdempotencyKey.current = generateConsultIdempotencyKey();
      toast.success('Consultation saved.');
      navigate('/doctor/dashboard');
    } catch (err) {
      const status = err.response?.status;
      const errCode = err.response?.data?.error;
      const errMsg = err.response?.data?.message;

      if ([401, 403].includes(status)) {
        consent.revoke('Authorization ended. Verify patient access again.');
        return;
      }
      if (requiresWriteReconciliation(err)) {
        submissionUncertain.current = true;
        setPendingWriteHold(true);
        return toast.error('Save status is uncertain. Check consultation history with an authorized operator before another submission.');
      }
      try { finishClinicalAttempt(consultationIdempotencyKey.current); }
      catch (_) { submissionUncertain.current = true; setPendingWriteHold(true); return; }

      // Mark failure so subsequent form edits regenerate the key
      submissionFailedRef.current = true;

      if (status === 409) {
        if (errCode === 'CLINICAL_IDEMPOTENCY_CONFLICT') {
          // Immediately regenerate key on collision
          consultationIdempotencyKey.current = generateConsultIdempotencyKey();
          submissionFailedRef.current = false;
          return toast.error('Submission conflict: This consultation key collided. Idempotency key refreshed — please review changes and submit again.', { duration: 6000 });
        }
        if (errCode === 'MEDICATION_REVIEW_REQUIRED') {
          return toast.error('Medication Safety Conflict: Prescribed drugs conflict with patient active medications or safety rules. Review the Medication Safety panel.', { duration: 6000 });
        }
        if (errCode === 'MEDICATION_RECONCILIATION_REQUIRED') {
          return toast.error('Medication Reconciliation Required: Active patient prescriptions must be reconciled before adding new medications.', { duration: 6000 });
        }
        consultationIdempotencyKey.current = generateConsultIdempotencyKey();
        submissionFailedRef.current = false;
        return toast.error('Consultation conflict occurred. Idempotency key refreshed — please review and retry.', { duration: 5000 });
      }

      if (status === 400) {
        return toast.error(errMsg || (errCode ? `Validation error: ${errCode}` : 'Please review prescription durations and entries and retry.'));
      }

      toast.error('Unable to save consultation. Review access and retry.');
    } finally { submissionBusy.current = false; setLoading(false); }
  };

  /* Shared input class */
  const inp = 'glass-input w-full text-sm';

  /* ══════════════════════════════════════════════════════════════════════════ */
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
          {pendingWriteHold && <div role="alert" className="mb-6 rounded-xl border border-amber-500/50 p-4 text-amber-200">
            <p>{t('doctor.pendingSaveHold', 'A previous save is unconfirmed. Check its outcome before another submission.')}</p>
            <button type="button" className="mt-3 underline" disabled={loading} onClick={async () => {
              if (loading) return;
              setLoading(true);
              try {
                const key = consultationIdempotencyKey.current;
                const result = await axios.get(`/doctor/consultation-command/${encodeURIComponent(key)}`);
                if (result.data?.state !== 'committed' || result.data?.operationKey !== key || !/^[a-f0-9]{24}$/i.test(result.data?.consultationId || '')) throw new Error('UNCONFIRMED');
                finishClinicalAttempt(key); submissionUncertain.current = false; setPendingWriteHold(false);
                toast.success('Previous consultation save confirmed.'); navigate('/doctor/dashboard');
              } catch (_) { toast.error('Save outcome remains unconfirmed. Contact an authorized operator before another submission.'); }
              finally { setLoading(false); }
            }}>{t('doctor.checkPreviousSave', 'Check previous save')}</button>
          </div>}
          <fieldset disabled={pendingWriteHold} className="min-w-0 border-0 p-0 m-0">
          {/* ── Page header ── */}
          <div className="mb-8 flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-400 tracking-tight">
                New Consultation
              </h1>
              <p className="text-slate-400 mt-1 text-sm">{t("doctor.newConsultationSubtitle", "Complete the wizard to record a clinical assessment.")}</p>
            </div>
            {step > 1 && (
              <motion.button
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                onClick={() => consent.revoke()}
                disabled={loading}
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
                    {consent.error && <p role="alert" className="text-red-400">{consent.error}</p>}
                    {consent.status === 'loading' && <p role="status">Loading authorized patient records…</p>}
                    {/* Patient search */}
                    <div className="max-w-lg mx-auto space-y-6 py-6">
                      <div className="text-center">
                        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center neumorphic-flat">
                          <FiUser className="w-7 h-7 text-teal-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">{t("doctor.identifyPatient", "Identify Patient")}</h2>
                        <p className="text-slate-400 mt-1.5 text-sm">Enter the patient's NIC number to begin the consultation.</p>
                      </div>

                      <div className="relative">
                        <input
                          type="text"
                          value={patientNic}
                          onChange={e => setPatientNic(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && searchPatient()}
                          aria-label="Patient NIC"
                          placeholder="e.g. 200312345699"
                          className={`${inp} pr-14 py-4 text-lg`}
                        />
                        <motion.button
                          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                          type="button" aria-label="Request patient verification" onClick={searchPatient} disabled={loading || consent.status === 'loading'}
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

                  </motion.div>
                )}

                
                {/* ─────────────── STEP 2: Medical History ─────────────── */}
                {step === 2 && (
                  <motion.div key="s2" custom={dir} variants={slideVariants}
                    initial="enter" animate="center" exit="exit"
                    className="space-y-6"
                  >
                    <div className="glass-card rounded-2xl p-6 border border-white/5">
                      <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <FiFileText className="text-teal-400" /> Patient Clinical Overview
                      </h2>
                      
                      {patientData && (
                        <div className="grid md:grid-cols-2 gap-4 mb-6">
                          <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5">
                            <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">{t("doctor.basicInfo", "Basic Info")}</p>
                            <p className="text-lg font-bold text-white">{patientData.fullName}</p>
                            <p className="text-sm text-slate-400">
                              Age: {patientData.dateOfBirth ? (new Date().getFullYear() - new Date(patientData.dateOfBirth).getFullYear()) : (patientData.age || '—')} yrs | Blood: <span className="text-red-400 font-semibold">{patientData.bloodGroup || 'Unknown'}</span>
                            </p>
                          </div>
                          
                          <div className="bg-orange-500/10 p-4 rounded-xl border border-orange-500/20">
                            <p className="text-xs text-orange-500/70 font-bold uppercase tracking-wider mb-1">{t("patient.knownAllergies", "Known Allergies")}</p>
                            <p className="text-orange-400 font-semibold text-sm">
                              {patientData.allergies?.length > 0 ? patientData.allergies.join(', ') : 'No known allergies'}
                            </p>
                          </div>
                          
                          <div className="bg-purple-500/10 p-4 rounded-xl border border-purple-500/20 md:col-span-2">
                            <p className="text-xs text-purple-500/70 font-bold uppercase tracking-wider mb-1">{t("patient.chronicConditions", "Chronic Conditions")}</p>
                            <p className="text-purple-400 font-semibold text-sm">
                              {patientData.chronicConditions?.length > 0 ? patientData.chronicConditions.join(', ') : 'None reported'}
                            </p>
                          </div>
                        </div>
                      )}

                      {!isHistoryLoading && medicalHistory.length > 0 && (
                        <div className="bg-blue-500/10 p-4 rounded-xl border border-blue-500/20 mb-6">
                          <p className="text-xs text-blue-500/70 font-bold uppercase tracking-wider mb-1">{t("patient.recentMedications", "Recent / Active Medications")}</p>
                          {(() => {
                            const recentMeds = medicalHistory
                              .filter(h => h.type === 'consultation' && h.data?.prescriptions?.length > 0)
                              .flatMap(h => h.data.prescriptions)
                              .slice(0, 8); // Top 8 recent meds
                            
                            if (recentMeds.length === 0) {
                              return <p className="text-blue-400 font-semibold text-sm mt-1">No recent medications found.</p>;
                            }
                            return (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {recentMeds.map((med, i) => (
                                  <span key={i} className="text-xs font-semibold bg-blue-500/20 text-blue-300 px-2.5 py-1 rounded border border-blue-500/30">
                                    {med.name} {med.dosage ? `(${med.dosage})` : ''}
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      <h3 className="text-base font-bold text-white mb-3 mt-6 border-b border-white/10 pb-2">Past Consultations & Labs</h3>

                      {isHistoryLoading ? (
                        <div className="flex flex-col items-center justify-center py-12">
                          <div className="w-8 h-8 border-4 border-teal-500/30 border-t-teal-400 rounded-full animate-spin mb-4" />
                          <p className="text-slate-400 text-sm">{t("doctor.loadingHistory", "Loading historical records...")}</p>
                        </div>
                      ) : medicalHistory.length === 0 ? (
                        <div className="py-12 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/10">
                          <FiFileText className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                          <p className="text-sm text-slate-500 max-w-xs mx-auto">
                            No past medical history found for this patient.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                          {medicalHistory.map((item, i) => (
                            <details key={i} className="group bg-slate-900/50 rounded-xl border border-white/5 overflow-hidden open:bg-slate-900/80 transition-colors">
                              <summary className="cursor-pointer p-4 flex items-center justify-between font-semibold text-slate-200 select-none">
                                <div className="flex items-center gap-3">
                                  <span className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400">
                                    {item.type === 'consultation' ? <FiActivity /> : <FiFileText />}
                                  </span>
                                  <div>
                                    <p className="text-white">{item.type === 'consultation' ? 'Consultation' : 'Lab/Prescription'}</p>
                                    <p className="text-xs text-slate-400 font-normal">{new Date(item.date).toLocaleDateString()} {item.data?.hospitalId?.name ? `• ${item.data.hospitalId.name}` : ''}</p>
                                  </div>
                                </div>
                                <span className="text-slate-500 group-open:rotate-90 transition-transform">
                                  <FiChevronRight />
                                </span>
                              </summary>
                              
                              <div className="p-4 pt-0 text-sm border-t border-white/5 mt-2">
                                {item.type === 'consultation' && (
                                  <div className="space-y-4 pt-4">
                                    {item.data.diagnosis && (
                                      <div>
                                        <p className="text-xs text-slate-500 mb-1">{t("common.diagnosis", "Diagnosis")}</p>
                                        <p className="text-emerald-400 font-semibold">{item.data.diagnosis} {item.data.icdCode ? `(${item.data.icdCode})` : ''}</p>
                                      </div>
                                    )}
                                    {item.data.symptoms?.length > 0 && (
                                      <div>
                                        <p className="text-xs text-slate-500 mb-1">{t("doctor.symptoms", "Symptoms")}</p>
                                        <p className="text-slate-300">{item.data.symptoms.join(', ')}</p>
                                      </div>
                                    )}
                                    {item.data.clinicalNotes && (
                                      <div>
                                        <p className="text-xs text-slate-500 mb-1">{t("doctor.clinicalNotes", "Clinical Notes")}</p>
                                        <p className="text-slate-300 italic">"{item.data.clinicalNotes}"</p>
                                      </div>
                                    )}
                                    {item.data.prescriptions?.length > 0 && (
                                      <div>
                                        <p className="text-xs text-slate-500 mb-1">{t("doctor.prescribedDrugs", "Prescribed Drugs")}</p>
                                        <ul className="list-disc list-inside text-slate-300">
                                          {item.data.prescriptions.map((rx, idx) => (
                                            <li key={idx}>{rx.name} - {rx.dosage} ({rx.frequency})</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                    {item.data.labTests?.length > 0 && (
                                      <div>
                                        <p className="text-xs text-slate-500 mb-1">Lab Tests</p>
                                        <ul className="list-disc list-inside text-slate-300">
                                          {item.data.labTests.map((t, idx) => (
                                            <li key={idx}>{t}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </details>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex justify-between items-center pt-4 border-t border-white/5">
                      <motion.button
                        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                        onClick={() => consent.revoke()}
                        className="glass-button-ghost px-6 py-3 flex items-center gap-2"
                      >
                        <FiChevronLeft /> Change Patient
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                        onClick={() => goTo(3)}
                        className="glass-button px-8 py-3 flex items-center gap-2"
                      >
                        Proceed to Symptoms <FiChevronRight />
                      </motion.button>
                    </div>
                  </motion.div>
                )}

                {/* ─────────────── STEP 3: Symptoms ─────────────── */}
                {step === 3 && (
                  <motion.div key="s3" custom={dir} variants={slideVariants}
                    initial="enter" animate="center" exit="exit"
                    className="space-y-6"
                  >
                    <div className="grid lg:grid-cols-2 gap-6">
                      <div className="glass-card rounded-2xl p-6 border border-white/5">
                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-200 mb-4">
                          <FiActivity className="text-teal-400" /> Presenting Symptoms
                        </label>
                        <SymptomTagInput selectedSymptoms={symptoms} onChange={setSymptoms} />
                      </div>

                      <div className="glass-card rounded-2xl p-6 border border-white/5">
                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-200 mb-4">
                          <FiFileText className="text-teal-400" /> Clinical Notes
                        </label>
                        <textarea
                          value={clinicalNotes || ""}
                          onChange={e => setClinicalNotes(e.target.value)}
                          rows={5}
                          placeholder="Detailed observation notes…"
                          className={`${inp} resize-none`}
                        />
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-4 border-t border-white/5">
                      <motion.button
                        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                        onClick={() => goTo(2)}
                        className="glass-button-ghost px-6 py-3 flex items-center gap-2"
                      >
                        <FiChevronLeft /> Back
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                        onClick={() => goTo(4)}
                        className="glass-button px-8 py-3 flex items-center gap-2"
                      >
                        Continue to Reference Matches <FiChevronRight />
                      </motion.button>
                    </div>
                  </motion.div>
                )}

{/* ─────────────── STEP 4: ML Prediction ─────────────────── */}
                {step === 4 && (
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
                        <p className="label-caps mb-1">{t("doctor.symptoms", "Symptoms")}</p>
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
                          Symptom Reference Matching
                        </h3>
                        <motion.button
                          whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                          onClick={getDiagnosisSuggestions}
                          disabled={loading || symptoms.length === 0}
                          className="glass-button px-5 py-2.5 text-sm flex items-center gap-2 disabled:opacity-50"
                        >
                          {loading
                            ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {inferenceStatus === 'waking' ? 'Waking up…' : 'Analyzing…'}</>
                            : 'Analyze Symptoms'}
                        </motion.button>
                      </div>

                      <p role="note" className="mb-5 text-sm text-amber-200/90 relative z-10">
                        Reference matches require clinician assessment and are not diagnoses or treatment recommendations. Similarity scores are not disease probabilities.
                      </p>

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
                                <span className="flex-shrink-0 text-xs font-semibold px-2.5 py-1 rounded border border-slate-700 text-slate-300">
                                  Similarity score: {diag.confidence}%
                                </span>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      ) : (
                        <div className="relative z-10 py-14 text-center border border-dashed border-slate-800 rounded-xl bg-slate-950/10 min-h-[200px] flex flex-col items-center justify-center">
                          {inferenceStatus === 'waking' ? (
                            <div className="relative w-10 h-10 mx-auto mb-3 flex items-center justify-center">
                              <div className="w-10 h-10 border-2 border-amber-500/20 border-t-amber-400 rounded-full animate-spin absolute" />
                              <FiActivity className="w-5 h-5 text-amber-400 animate-pulse" />
                            </div>
                          ) : inferenceStatus === 'loading' ? (
                            <div className="relative w-10 h-10 mx-auto mb-3 flex items-center justify-center">
                              <div className="w-10 h-10 border-2 border-teal-500/20 border-t-teal-400 rounded-full animate-spin absolute" />
                              <FiActivity className="w-5 h-5 text-teal-400 animate-pulse" />
                            </div>
                          ) : (
                            <FiActivity className={`w-10 h-10 mx-auto mb-3 ${inferenceStatus === 'unavailable' ? 'text-red-400/60' : 'text-slate-700'}`} />
                          )}
                          <p className={`text-sm max-w-md mx-auto ${inferenceStatus === 'waking' ? 'text-amber-300 font-medium' : inferenceStatus === 'unavailable' ? 'text-slate-400' : 'text-slate-500'}`}>
                            {inferenceStatus === 'waking'
                              ? 'Analysis service is waking up, retrying... Existing manual clinician entry remains available.'
                              : inferenceStatus === 'unavailable'
                                ? 'AI suggestions unavailable. Existing manual clinician entry remains available.'
                                : inferenceStatus === 'empty'
                                  ? 'No AI suggestions returned. Existing manual clinician entry remains available.'
                                  : inferenceStatus === 'loading'
                                    ? 'Requesting AI suggestions…'
                                    : 'Click "Analyze Symptoms" to request suggestions. Scores are not calibrated disease probabilities.'}
                          </p>
                        </div>
                      )}

                      {/* Manual confirmation */}
                      <div className="mt-6 pt-5 border-t border-white/5 relative z-10">
                        <label className="block text-sm font-semibold text-slate-300 mb-3">{t("doctor.finalDiagnosisConfirmation", "Final Diagnosis Confirmation")}</label>

                        {/* ICD Search Bar with Version Filters */}
                        <div className="mb-4 relative" ref={icdWrapperRef}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-slate-400 font-semibold">{t("doctor.standardReference", "Standard Reference:")}</span>
                            <div className="flex gap-1.5">
                              {[
                                { id: 'all', label: 'All Standards' },
                                { id: 'icd10', label: 'ICD-10' },
                                { id: 'icd11', label: 'WHO ICD-11' }
                              ].map(f => (
                                <button
                                  key={f.id}
                                  type="button"
                                  onClick={() => setIcdVersionFilter(f.id)}
                                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all border ${
                                    icdVersionFilter === f.id
                                      ? 'bg-teal-500/20 text-teal-300 border-teal-500/40 shadow-sm'
                                      : 'bg-slate-900/40 text-slate-400 border-white/5 hover:text-white'
                                  }`}
                                >
                                  {f.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="relative">
                            <input
                              type="text"
                              role="combobox"
                              aria-autocomplete="list"
                              aria-expanded={isIcdOpen}
                              aria-controls="icd-suggestions-list"
                              aria-activedescendant={icdActiveIndex >= 0 ? `icd-opt-${icdActiveIndex}` : undefined}
                              value={icdSearchQuery || ""}
                              onChange={e => setIcdSearchQuery(e.target.value)}
                              onKeyDown={handleIcdKeyDown}
                              onFocus={() => { if ((icdSearchQuery || '').trim().length >= 2) setIsIcdOpen(true); }}
                              placeholder="Search disease, rare condition, or code (e.g. Dengue, 1D20, A90, Down Syndrome)..."
                              className={`${inp} pl-10 pr-10`}
                              autoComplete="off"
                            />
                            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                            {isIcdLoading && (
                              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                                <div className="w-4 h-4 border-2 border-teal-500/30 border-t-teal-400 rounded-full animate-spin" />
                              </div>
                            )}
                          </div>

                          {/* Autocomplete Suggestions with Keyboard Navigation & Empty State */}
                          {isIcdOpen && (icdSearchQuery || '').trim().length >= 2 && (
                            <div
                              ref={icdListRef}
                              id="icd-suggestions-list"
                              role="listbox"
                              className="absolute z-50 w-full mt-1 bg-slate-900/98 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-2xl max-h-56 overflow-y-auto custom-scrollbar"
                            >
                              {isIcdLoading && (
                                <div className="p-3 text-xs text-slate-400 flex items-center justify-center gap-2" role="status">
                                  <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                                  <span>Searching ICD reference catalog...</span>
                                </div>
                              )}

                              {!isIcdLoading && icdSuggestions.length > 0 && icdSuggestions.map((item, idx) => {
                                const isHighlighted = icdActiveIndex === idx;
                                return (
                                  <div
                                    key={`${item.code}-${idx}`}
                                    id={`icd-opt-${idx}`}
                                    role="option"
                                    aria-selected={isHighlighted}
                                    data-index={idx}
                                    onClick={() => selectIcdItem(item)}
                                    onMouseEnter={() => setIcdActiveIndex(idx)}
                                    className={`px-4 py-2.5 cursor-pointer transition-colors border-b border-white/5 last:border-0 text-sm flex justify-between items-center ${
                                      isHighlighted ? 'bg-teal-500/20 text-white' : 'hover:bg-slate-800/60 text-slate-200'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0 pr-3">
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-black border flex-shrink-0 ${
                                        item.version === 'ICD-11'
                                          ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                          : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                                      }`}>
                                        {item.version || 'ICD-10'}
                                      </span>
                                      <span className="font-medium truncate">{item.description}</span>
                                    </div>
                                    <span className="text-teal-400 font-mono font-bold text-xs bg-slate-950/60 px-2 py-0.5 rounded border border-slate-800 flex-shrink-0">
                                      {item.code}
                                    </span>
                                  </div>
                                );
                              })}

                              {!isIcdLoading && icdSuggestions.length === 0 && (
                                <div className="p-3 text-xs text-slate-400 text-center flex flex-col items-center gap-1.5" role="status">
                                  <span>No matching diagnoses found in catalog for "{icdSearchQuery.trim()}".</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setManualDiagnosis(icdSearchQuery.trim());
                                      setSelectedDiagnosis('');
                                      setSelectedIcd('');
                                      setSelectedIcdVersion('Custom');
                                      setIsIcdOpen(false);
                                      setIcdSearchQuery('');
                                      setIcdSuggestions([]);
                                    }}
                                    className="text-teal-400 hover:text-teal-300 font-semibold underline text-xs"
                                  >
                                    Use "{icdSearchQuery.trim()}" as manual clinician diagnosis (Enter)
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Manual Diagnosis */}
                        <div className="mb-4">
                          <label className="block text-xs font-semibold text-slate-400 mb-2">Manual Clinician Diagnosis (If unlisted / free-text clinical description)</label>
                          <input
                            type="text"
                            value={manualDiagnosis || ""}
                            onChange={e => {
                              setManualDiagnosis(e.target.value);
                              if (e.target.value.trim()) {
                                setSelectedDiagnosis('');
                                setSelectedIcd('');
                                setSelectedIcdVersion('Custom');
                              }
                            }}
                            placeholder={t("doctor.clinicianCondition", "Enter clinician-entered condition description...")}
                            className={inp}
                          />
                        </div>

                        <div className="flex gap-3 items-center">
                          <div className="flex-1 relative">
                            <input
                              type="text" value={selectedDiagnosis || ""}
                              onChange={e => setSelectedDiagnosis(e.target.value)}
                              placeholder="Diagnosis name"
                              className={inp}
                            />
                          </div>
                          <div className="w-36 flex items-center gap-1.5">
                            <span className={`text-[10px] px-1.5 py-1 rounded font-bold border uppercase ${
                              selectedIcdVersion === 'ICD-11'
                                ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                                : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                            }`}>
                              {selectedIcdVersion || 'ICD-10'}
                            </span>
                            <input
                              type="text" value={selectedIcd || ""}
                              onChange={e => setSelectedIcd(e.target.value)}
                              placeholder="Code"
                              className={`${inp} flex-1 uppercase font-mono`}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Navigation */}
                    <div className="flex justify-between items-center pt-4 border-t border-white/5">
                      <motion.button
                        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                        onClick={() => goTo(step - 1)}
                        className="glass-button-ghost px-6 py-3 flex items-center gap-2"
                      >
                        <FiChevronLeft /> Back
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                        onClick={() => goTo(5)}
                        disabled={!selectedDiagnosis && !manualDiagnosis}
                        className="glass-button px-8 py-3 flex items-center gap-2 disabled:opacity-50"
                      >
                        Build Prescription <FiChevronRight />
                      </motion.button>
                    </div>
                  </motion.div>
                )}

                {/* ─────────────── STEP 5: E-Prescription ─────────────────── */}
                {step === 5 && (
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

                    {/* ── Medication Safety & Reference Verification Status ── */}
                    {prescriptions.length > 0 && interactionAnalysis && (
                      <div className="space-y-3" data-testid="medication-safety-panel">
                        {/* 1. Detected Drug-Drug Interactions or Duplicate Active Ingredients */}
                        {interactionAnalysis.hasInteraction && Array.isArray(interactionAnalysis.warnings) && interactionAnalysis.warnings.length > 0 && (
                          <div
                            data-testid="medication-interaction-alert"
                            className="p-4 rounded-2xl bg-red-950/45 border border-red-500/40 text-red-100 space-y-2.5"
                          >
                            <div className="flex items-center gap-2 font-bold text-red-300 text-sm">
                              <FiAlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                              <span>Medication Interaction / Duplicate Active Ingredient Alert ({interactionAnalysis.warnings.length})</span>
                            </div>
                            <ul className="space-y-2 text-xs text-red-100/95">
                              {interactionAnalysis.warnings.map((w, idx) => (
                                <li key={idx} className="p-2.5 rounded-xl bg-red-950/60 border border-red-500/25 flex flex-col gap-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-red-500/25 text-red-200 border border-red-400/30">
                                      {w.type === 'duplicate_ingredient'
                                        ? 'Duplicate Active Ingredient'
                                        : `${(w.severity || 'moderate').toUpperCase()} Interaction`}
                                    </span>
                                    <span className="font-semibold text-white">
                                      {w.drug1} [{w.drug1Strength || 'Unspecified'}, {w.drug1Formulation || 'Unspecified'}]
                                      {' + '}
                                      {w.drug2} [{w.drug2Strength || 'Unspecified'}, {w.drug2Formulation || 'Unspecified'}]
                                    </span>
                                  </div>
                                  <p className="text-red-200/90 leading-relaxed">{w.message || w.description}</p>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* 2. Incomplete Automated Verification Warning (Unresolved Ingredients) */}
                        {interactionAnalysis.verificationIncomplete && Array.isArray(interactionAnalysis.unresolvedIngredients) && interactionAnalysis.unresolvedIngredients.length > 0 && (
                          <div
                            data-testid="medication-verification-incomplete-alert"
                            className="p-4 rounded-2xl bg-amber-950/45 border border-amber-500/40 text-amber-100 space-y-2"
                          >
                            <div className="flex items-center gap-2 font-bold text-amber-300 text-sm">
                              <FiAlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                              <span>Automated Interaction Checking Incomplete</span>
                            </div>
                            <p className="text-xs text-amber-200/95 leading-relaxed">
                              {interactionAnalysis.statusMessage}
                            </p>
                            {Array.isArray(interactionAnalysis.unresolvedDrugs) && interactionAnalysis.unresolvedDrugs.length > 0 && (
                              <ul className="text-xs text-amber-200/85 list-disc list-inside space-y-1">
                                {interactionAnalysis.unresolvedDrugs.map((ud, idx) => (
                                  <li key={idx}>
                                    <span className="font-semibold text-amber-100">{ud.drug}</span>
                                    {' '}
                                    [{ud.strength || 'Unspecified'}, {ud.formulation || 'Unspecified'}] — unresolved ingredient(s):{' '}
                                    <span className="font-mono text-amber-300">{(ud.unresolvedIngredients || []).join(', ')}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}

                        {/* 3. Neutral Reference Dataset Notice (Never displays a green 'Safe' badge) */}
                        {!interactionAnalysis.hasInteraction && !interactionAnalysis.verificationIncomplete && prescriptions.length >= 2 && (
                          <div
                            data-testid="medication-neutral-reference-notice"
                            className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-700/60 text-slate-300 flex items-start gap-2.5 text-xs"
                          >
                            <FiInfo className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="font-semibold text-slate-200">
                                {interactionAnalysis.statusMessage || 'No interaction found in the available reference dataset.'}
                              </p>
                              <p className="text-slate-400 mt-0.5">
                                Automated lookup checked resolved active ingredients against the reference dataset only. Absence of a reference match does not guarantee clinical safety.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

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
                                    <input value={rx.dosage || ""} onChange={e => updatePrescription(idx,'dosage',e.target.value)}
                                      className="w-24 glass-input py-1.5 px-2 text-xs" />
                                  </td>
                                  <td className="px-3 py-3">
                                    <select value={rx.frequency || "OD"} onChange={e => updatePrescription(idx,'frequency',e.target.value)}
                                      className="w-24 glass-input py-1.5 px-2 text-xs appearance-none">
                                      {['OD','BD','TDS','QID','SOS'].map(f => <option key={f}>{f}</option>)}
                                    </select>
                                  </td>
                                  <td className="px-3 py-3">
                                    <input type="number" min="1" step="1" aria-label={`Duration in days for ${rx.name}`} value={rx.durationDays ?? ''} onChange={e => updatePrescription(idx,'durationDays',e.target.value === '' ? '' : e.target.valueAsNumber)}
                                      className="w-24 glass-input py-1.5 px-2 text-xs" />
                                  </td>
                                  <td className="px-3 py-3">
                                    <input value={rx.instructions || ""} onChange={e => updatePrescription(idx,'instructions',e.target.value)}
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
                      <div className="relative" ref={labWrapperRef}>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 w-4 h-4 pointer-events-none" />
                            <input
                              id="lab-test-input"
                              type="text"
                              role="combobox"
                              aria-autocomplete="list"
                              aria-expanded={isLabOpen}
                              aria-controls="lab-suggestions-list"
                              aria-activedescendant={labActiveIndex >= 0 ? `lab-opt-${labActiveIndex}` : undefined}
                              value={labTestInput || ""}
                              onChange={e => handleLabInput(e.target.value)}
                              onKeyDown={handleLabKeyDown}
                              onFocus={() => { if ((labTestInput || '').trim().length >= 2) setIsLabOpen(true); }}
                              placeholder="e.g. Blood, Thyroid, Chest X-Ray…"
                              className={`${inp} pl-10`}
                              autoComplete="off"
                            />
                            {/* Dropdown suggestions */}
                            <AnimatePresence>
                              {isLabOpen && (labTestInput || '').trim().length >= 2 && (
                                <motion.div
                                  ref={labListRef}
                                  id="lab-suggestions-list"
                                  role="listbox"
                                  initial={{ opacity: 0, y: -6 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  exit={{ opacity: 0, y: -6 }}
                                  transition={{ duration: 0.15 }}
                                  className="absolute z-50 w-full mt-1 bg-slate-900/98 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden shadow-2xl max-h-56 overflow-y-auto custom-scrollbar"
                                >
                                  {labSuggestions.length > 0 ? (
                                    labSuggestions.map((s, i) => {
                                      const isHighlighted = labActiveIndex === i;
                                      return (
                                        <button
                                          key={`${s}-${i}`}
                                          id={`lab-opt-${i}`}
                                          type="button"
                                          role="option"
                                          aria-selected={isHighlighted}
                                          data-index={i}
                                          onClick={() => {
                                            addLabTest(s);
                                            setIsLabOpen(false);
                                            setLabActiveIndex(-1);
                                          }}
                                          onMouseEnter={() => setLabActiveIndex(i)}
                                          className={`w-full text-left px-4 py-2.5 text-sm transition-colors border-b border-white/5 last:border-0 flex items-center gap-2 ${
                                            isHighlighted ? 'bg-purple-500/20 text-purple-200' : 'text-slate-200 hover:bg-purple-500/10 hover:text-purple-300'
                                          }`}
                                        >
                                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
                                          {s}
                                        </button>
                                      );
                                    })
                                  ) : (
                                    <div className="p-3 text-xs text-slate-400 flex items-center justify-between" role="status">
                                      <span>No matching standard tests for "{labTestInput.trim()}".</span>
                                      <span className="text-[10px] text-purple-300 bg-purple-500/15 px-2 py-0.5 rounded border border-purple-500/30">
                                        Press Enter or Add to add custom
                                      </span>
                                    </div>
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                          <motion.button
                            whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                            type="button"
                            onClick={() => {
                              addLabTest();
                              setIsLabOpen(false);
                              setLabActiveIndex(-1);
                            }}
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
                          value={followUpDate || ""}
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
                        onClick={() => goTo(4)}
                        className="glass-button-ghost px-6 py-3 flex items-center gap-2"
                      >
                        <FiChevronLeft /> Back
                      </motion.button>
                      <motion.button
                        whileHover={loading ? {} : { scale: 1.03 }}
                        whileTap={loading ? {} : { scale: 0.97 }}
                        onClick={handleSubmit}
                        disabled={loading || pendingWriteHold}
                        aria-busy={loading}
                        className="glass-button px-8 py-3 flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {loading
                          ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          : <FiSave className="w-4 h-4" />}
                        <span>{loading ? 'Saving Consultation…' : 'Complete Consultation'}</span>
                      </motion.button>
                    </div>

                  </motion.div>
                )}

              </AnimatePresence>
            </div>
          </div>
          </fieldset>
        </PageTransition>
      </AppShell>
    </div>
  );
};

export default NewConsultation;
