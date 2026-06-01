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
import Sidebar from '../../components/common/Sidebar';

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
  const navigate = useNavigate();
  const [workspace, setWorkspace] = useState(() => localStorage.getItem('workspaceMode') || null);
  const [nic, setNic] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [patient, setPatient] = useState(null);
  const [searchError, setSearchError] = useState('');

  // Real stats from backend
  const [stats, setStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);

  // Doctor name from localStorage
  const doctorName = localStorage.getItem('userName') || 'Doctor';

  useEffect(() => {
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
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!nic.trim()) return;
    setIsSearching(true);
    setPatient(null);
    setSearchError('');
    try {
      const res = await api.get(`/patient/${nic.trim()}`);
      const data = res.data.data || res.data;
      if (!data) throw new Error('Not found');
      setPatient(data);
    } catch (err) {
      const msg = err.response?.data?.error || 'No patient record found for this NIC.';
      setSearchError(msg);
      toast.error(msg);
    } finally {
      setIsSearching(false);
    }
  };



  if (!workspace) {
    return <WorkspaceSelector onSelect={(ws) => { 
      setWorkspace(ws); 
      localStorage.setItem('workspaceMode', ws); 
      localStorage.setItem('loginType', ws === 'Personal Clinic' ? 'personal' : 'hospital'); 
    }} />;
  }

  const _dashWsMode    = localStorage.getItem('workspaceMode') || 'personal';
  const _dashIsPersonal = _dashWsMode !== 'hospital';

  const menuItems = [
    { label: 'Dashboard',         path: '/doctor/dashboard',        icon: LayoutDashboard, end: true },
    { label: 'New Consultation',  path: '/doctor/consultation/new', icon: Plus },
    { label: 'Patient Directory', path: '/doctor/patients',          icon: Users },
    ...(_dashIsPersonal ? [{ label: 'My Profile', path: '/doctor/profile', icon: FiUser }] : []),
  ];


  return (
    <div className="flex bg-[#080d1a] min-h-screen text-slate-200 font-sans">
      <Sidebar menuItems={menuItems} title="Doctor Portal" themePrefix="doctor" userName={`Dr. ${doctorName}`} userRole="Verified Doctor" />

      <main className="flex-1 lg:ml-64 p-6 lg:p-10 transition-all duration-300 space-y-8">
        
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
              <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-5 h-24 animate-pulse" />
            ))}
          </div>
        )}

        {/* ── Patient Search ─────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto relative z-20">
          <form onSubmit={handleSearch} className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              {isSearching
                ? <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
                : <Search className="h-5 w-5 text-slate-400 group-focus-within:text-blue-400 transition-colors" />
              }
            </div>
            <input
              type="text"
              placeholder="Search Patient by NIC (e.g., 200312345699)"
              className="block w-full pl-12 pr-36 py-4 rounded-2xl bg-white/5 border border-white/10 text-white placeholder-slate-500 text-base focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 outline-none transition-all backdrop-blur-md"
              value={nic}
              onChange={(e) => { setNic(e.target.value); setSearchError(''); }}
            />
            <button
              type="submit"
              className="absolute inset-y-2 right-2 px-6 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold transition-colors flex items-center gap-2 text-sm"
              disabled={isSearching}
            >
              {isSearching ? 'Scanning...' : 'Find Record'}
            </button>
          </form>
          {searchError && (
            <p className="mt-2 text-sm text-red-400 text-center">{searchError}</p>
          )}
        </motion.div>

        {/* ── Patient Content ────────────────────────────────── */}
        <AnimatePresence>
          {patient && !isSearching && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-6"
            >
              {/* Left: Profile + History */}
              <div className="lg:col-span-4 space-y-5">
                {/* Profile Card */}
                <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-3xl p-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-40 h-40 bg-blue-500/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
                  <div className="flex justify-between items-start mb-5">
                    <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-2xl font-bold text-blue-300">
                      {(patient.fullName || 'P').charAt(0)}
                    </div>
                    <div className={`px-3 py-1.5 rounded-full border flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide ${
                      (patient.riskLevel || 'low') === 'high'
                        ? 'bg-red-500/10 border-red-500/30 text-red-400'
                        : (patient.riskLevel || 'low') === 'medium'
                        ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                        : 'bg-green-500/10 border-green-500/30 text-green-400'
                    }`}>
                      <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                      {patient.riskLevel || 'Low'} Risk
                    </div>
                  </div>
                  <h2 className="text-xl font-bold text-white mb-1">{patient.fullName}</h2>
                  <p className="text-slate-400 text-sm mb-5 flex gap-2 flex-wrap">
                    {patient.gender && <span>{patient.gender}</span>}
                    {patient.bloodGroup && <span>• <span className="text-red-400 font-semibold">{patient.bloodGroup}</span></span>}
                    {patient.dateOfBirth && <span>• {new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear()} yrs</span>}
                  </p>

                  {patient.allergies?.length > 0 && (
                    <div className="bg-orange-500/10 rounded-xl p-4 border border-orange-500/20">
                      <div className="flex items-center gap-2 text-orange-300 font-semibold mb-2 text-sm">
                        <ShieldAlert size={15} /> Known Allergies
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {patient.allergies.map(alg => (
                          <span key={alg} className="bg-orange-500/20 text-orange-200 px-2.5 py-1 rounded-md text-xs font-bold border border-orange-500/30">
                            {alg}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {patient.chronicConditions?.length > 0 && (
                    <div className="mt-3 bg-purple-500/10 rounded-xl p-4 border border-purple-500/20">
                      <div className="flex items-center gap-2 text-purple-300 font-semibold mb-2 text-sm">
                        <Activity size={15} /> Chronic Conditions
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {patient.chronicConditions.map(c => (
                          <span key={c} className="bg-purple-500/20 text-purple-200 px-2.5 py-1 rounded-md text-xs font-bold border border-purple-500/30">
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* History */}
                <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-3xl p-6">
                  <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                    <Clock size={17} className="text-slate-400" /> Medical History
                  </h3>
                  <MedicalTimeline history={patient.consultationHistory || []} />
                </div>
              </div>

              {/* Right: Quick Consultation Start */}
              <div className="lg:col-span-8">
                <div className="bg-white/5 border border-white/10 backdrop-blur-md rounded-3xl p-8 h-full flex flex-col">
                  <div className="flex items-center justify-between mb-8 pb-6 border-b border-white/10">
                    <h2 className="text-xl font-bold text-white">Start New Consultation</h2>
                    <span className="text-sm text-slate-400">
                      {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </span>
                  </div>

                  <div className="flex-1 flex flex-col items-center justify-center gap-6 py-6">
                    <div className="w-20 h-20 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                      <Stethoscope size={36} />
                    </div>
                    <div className="text-center">
                      <h3 className="text-lg font-bold text-white">Patient Found</h3>
                      <p className="text-slate-400 text-sm mt-1">
                        Use the <strong className="text-blue-400">New Consultation</strong> page for a full clinical assessment with symptom AI and e-prescription tools.
                      </p>
                    </div>
                    <div className="flex gap-3 flex-wrap justify-center">
                      <button
                        onClick={() => navigate('/doctor/consultation/new')}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40 hover:-translate-y-0.5"
                      >
                        <Plus size={18} /> New Consultation
                      </button>
                      <button
                        onClick={() => navigate(`/doctor/patients/${patient.nic}`)}
                        className="bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 px-6 py-3 rounded-xl font-semibold flex items-center gap-2 transition-all"
                      >
                        <FileText size={18} /> Full Records
                      </button>
                    </div>
                  </div>

                  {/* Recent Consultations from Stats */}
                  {stats?.recentConsultations?.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-white/10">
                      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <TrendingUp size={14} /> Recent Consultations
                      </h4>
                      <div className="space-y-2">
                        {stats.recentConsultations.slice(0, 3).map((c, i) => (
                          <div key={i} className="flex items-center justify-between text-sm px-3 py-2.5 bg-white/5 rounded-xl border border-white/5">
                            <span className="text-white font-medium">{c.diagnosis || c.icdCode || 'Consultation'}</span>
                            <span className="text-slate-500 text-xs">{new Date(c.createdAt).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty state */}
        {!patient && !isSearching && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 gap-4 text-center"
          >
            <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-500">
              <Search size={36} />
            </div>
            <h3 className="text-xl font-bold text-slate-300">Search for a patient</h3>
            <p className="text-slate-500 max-w-sm text-sm">
              Enter a patient's NIC number above to instantly retrieve their medical history, allergies, and active prescriptions.
            </p>
            <button
              onClick={() => navigate('/doctor/consultation/new')}
              className="mt-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <Plus size={16} /> Or start a new consultation
            </button>
          </motion.div>
        )}

      </main>
    </div>
  );
}