import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Building2, User, Activity, Clock,
  ChevronRight, Check, LayoutDashboard, Users,
  Pill, Plus, Calendar, ShieldAlert,
  Stethoscope, FileText, TrendingUp, Loader2
} from 'lucide-react';
import { FiUser } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import api from '../../api/axiosInstance';
import ActiveOutbreakBanner from '../../components/common/ActiveOutbreakBanner';
import AppShell from '../../components/ui/AppShell';
import Skeleton from '../../components/ui/Skeleton';
import { usePatientAccess } from '../../context/PatientAccessContext';

// ─── Workspace Selector ──────────────────────────────────────────────────────
const WorkspaceSelector = ({ onSelect }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xl px-4"
  >
    <motion.div
      initial={{ scale: 0.9, y: 24 }}
      animate={{ scale: 1, y: 0 }}
      transition={{ type: 'spring', duration: 0.5 }}
      className="bg-slate-900/90 border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-2xl backdrop-blur-md"
    >
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-blue-500/20 text-blue-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-500/30">
          <Building2 size={32} />
        </div>
        <h2 className="text-2xl font-bold text-white">Select Workspace</h2>
        <p className="text-slate-400 mt-2 text-sm">Choose your current consulting environment</p>
      </div>
      <div className="space-y-4">
        {[
          { label: 'Personal Clinic', desc: 'Private practice dashboard', icon: User, color: 'blue' },
          { label: 'Hospital Consultation', desc: 'Hospital-linked session', icon: Activity, color: 'cyan' },
        ].map(({ label, desc, icon: Icon, color }) => (
          <button
            key={label}
            onClick={() => onSelect(label)}
            className="w-full flex items-center p-4 rounded-2xl border border-white/10 hover:border-blue-500/50 hover:bg-white/5 transition-all group"
          >
            <div className={`p-3 bg-${color}-500/10 text-${color}-400 rounded-xl border border-${color}-500/20 group-hover:bg-${color}-500/20`}>
              <Icon size={22} />
            </div>
            <div className="ml-4 text-left flex-1">
              <h3 className="font-semibold text-white">{label}</h3>
              <p className="text-sm text-slate-400">{desc}</p>
            </div>
            <ChevronRight className="text-slate-500 group-hover:text-blue-400 transition-colors" />
          </button>
        ))}
      </div>
    </motion.div>
  </motion.div>
);

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, icon: Icon, color }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-white/5 border border-white/10 backdrop-blur-md rounded-2xl p-5 flex items-center gap-4"
  >
    <div className={`w-12 h-12 rounded-xl bg-${color}-500/10 border border-${color}-500/20 flex items-center justify-center text-${color}-400`}>
      <Icon size={22} />
    </div>
    <div>
      <p className="text-3xl font-bold text-white">{value ?? '—'}</p>
      <p className="text-sm text-slate-400 mt-0.5">{label}</p>
    </div>
  </motion.div>
);

// ─── Medical Timeline ─────────────────────────────────────────────────────────
const MedicalTimeline = ({ history }) => {
  if (!history || history.length === 0) {
    return <p className="text-slate-500 text-sm text-center py-6">No medical history available.</p>;
  }
  return (
    <div className="relative border-l border-white/10 ml-4 py-2 space-y-6">
      {history.map((item, index) => (
        <motion.div
          key={item._id || index}
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
          className="relative pl-6"
        >
          <span className="absolute -left-[9px] top-1.5 w-4 h-4 rounded-full border-2 border-slate-800 bg-blue-500 ring-4 ring-blue-500/10" />
          <div className="bg-white/5 border border-white/10 p-4 rounded-xl">
            <div className="flex justify-between items-start mb-1">
              <h4 className="font-semibold text-white text-sm">{item.diagnosis}</h4>
              <span className="text-xs text-slate-400 flex items-center gap-1 ml-2 shrink-0">
                <Calendar size={11} />
                {item.date || new Date(item.createdAt).toLocaleDateString()}
              </span>
            </div>
            {item.icdCode && <p className="text-xs text-slate-500">ICD-10: {item.icdCode}</p>}
          </div>
        </motion.div>
      ))}
    </div>
  );
};

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function DoctorDashboard() {
  const { activeSession, clearPatientSession } = usePatientAccess();
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState(() => localStorage.getItem('workspaceMode') || localStorage.getItem('loginType') || 'personal');

  // Real stats from backend
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Doctor name from localStorage
  const doctorName = localStorage.getItem('userName') || 'Doctor';

  useEffect(() => {
    // Navigating back to main dashboard clears patient access session per requirement
    clearPatientSession();

    const fetchStats = async () => {
      try {
        const res = await api.get('/doctor/stats');
        setStats(res.data.data);
      } catch {
        // Stats unavailable — degrade gracefully
      } finally {
        setLoadingStats(false);
      }
    };
    fetchStats();
  }, [clearPatientSession]);

  const _dashWsMode    = workspace === 'hospital' || localStorage.getItem('workspaceMode') === 'hospital' || localStorage.getItem('loginType') === 'hospital' ? 'hospital' : 'personal';
  const _dashIsPersonal = _dashWsMode !== 'hospital';

  const menuItems = [
    { label: 'Dashboard',         path: '/doctor/dashboard',        icon: LayoutDashboard, end: true },
    { label: 'New Consultation',  path: '/doctor/consultation/new', icon: Plus },
    ...(_dashIsPersonal ? [{ label: 'My Profile', path: '/doctor/profile', icon: FiUser }] : []),
  ];


  return (
    <div className="doctor-theme">
      <AppShell
        role="doctor"
        userName={`Dr. ${doctorName}`}
        userRole="Verified Doctor"
        menuItems={menuItems}
      >
        <div className="space-y-8">
        
        {/* ── Dashboard Header ── */}
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-400 tracking-tight">
                Dr. {doctorName}
              </h1>
              {/* Verified Badge */}
              <span className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                <Check className="w-3.5 h-3.5" />
                Verified Medical Professional
              </span>
            </div>
            <p className="text-slate-400 mt-1.5 text-sm flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-slate-500" />
              Current Workspace: <span className="text-slate-200 font-semibold">{workspace}</span>
              <button 
                onClick={() => { setWorkspace(null); localStorage.removeItem('workspaceMode'); }}
                className="ml-2 text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-2 py-0.5 rounded text-slate-300 transition-colors"
              >
                Change Workspace
              </button>
            </p>
          </div>
        </div>

        <ActiveOutbreakBanner />

        {activeSession && (
          <div className="p-4 rounded-2xl bg-teal-500/10 border border-teal-500/30 backdrop-blur-md flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold text-sm">
                ✓
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Active Patient Access Session</p>
                <p className="text-slate-400 text-xs">Viewing Patient: <span className="text-teal-300 font-bold">{activeSession.patientName}</span> (NIC: {activeSession.nic})</p>
              </div>
            </div>
            <button
              onClick={clearPatientSession}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs border border-white/10 transition-all"
            >
              Clear Session
            </button>
          </div>
        )}

        {/* ── Stats Row ──────────────────────────────────────── */}
        {!loadingStats && stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Today's Consultations" value={stats.todayConsultations} icon={Stethoscope} color="blue" />
            <StatCard label="Active Prescriptions" value={stats.activeRx} icon={Pill} color="green" />
            <StatCard label="Total Patients" value={stats.totalPatients} icon={User} color="purple" />
            <StatCard label="Pending Follow-ups" value={stats.pendingFollowUps} icon={Calendar} color="orange" />
          </div>
        )}
        {loadingStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-slate-900/40 border border-white/5 rounded-2xl p-5 h-24 flex flex-col gap-2 justify-center">
                <Skeleton.Line width="w-1/2" height="h-3" />
                <Skeleton.Line width="w-1/3" height="h-4" />
              </div>
            ))}
          </div>
        )}

        {/* ── New Consultation CTA ───────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-blue-600 to-teal-600 rounded-3xl p-1 relative overflow-hidden shadow-2xl shadow-blue-900/20"
        >
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10 mix-blend-overlay"></div>
          <div className="bg-slate-900/90 backdrop-blur-xl rounded-[22px] p-8 lg:p-12 relative z-10 flex flex-col md:flex-row items-center justify-between gap-8 border border-white/10">
            <div className="text-left flex-1">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-xs font-bold uppercase tracking-wider mb-4">
                <ShieldAlert size={14} /> Secure Access
              </div>
              <h2 className="text-3xl font-extrabold text-white mb-3">Start New Consultation</h2>
              <p className="text-slate-400 text-base max-w-xl leading-relaxed">
                Patient records are protected by OTP verification. Begin a new consultation to securely authenticate and access the patient's medical history, AI diagnosis, and e-prescription tools.
              </p>
            </div>
            <div className="shrink-0 w-full md:w-auto flex flex-col gap-3">
              <button
                onClick={() => navigate('/doctor/consultation/new')}
                className="w-full md:w-auto bg-blue-500 hover:bg-blue-400 text-white px-8 py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-500/30 hover:-translate-y-1"
              >
                <Plus size={20} />
                Initialize Session
              </button>
            </div>
          </div>
        </motion.div>

        </div>
      </AppShell>
    </div>
  );
}