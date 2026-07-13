import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { HeartPulse, Stethoscope, Building2, Pill, ArrowRight, Activity } from 'lucide-react';
import PublicNavbar from '../components/common/PublicNavbar';

const AnimatedTimelineStep = ({ step, index, isEven, currentIcon }) => {
  return (
    <div className={`relative w-full flex flex-col md:flex-row items-center py-12 ${isEven ? 'md:flex-row' : 'md:flex-row-reverse'}`}>
      {/* Central Timeline Line */}
      <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-500/20 via-indigo-500/20 to-transparent hidden md:block -translate-x-1/2 opacity-50" />

      {/* Content Block */}
      <motion.div
        className={`md:w-1/2 w-full flex ${isEven ? 'justify-end md:pr-16' : 'justify-start md:pl-16'}`}
        initial={{ opacity: 0, x: isEven ? -40 : 40 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <div className="glass-panel p-6 rounded-2xl border border-white/5 relative w-full max-w-lg group hover:border-indigo-500/20 transition-all duration-300">
          {/* Floating Desktop Number Badge */}
          <div className={`absolute top-1/2 -translate-y-1/2 w-12 h-12 bg-slate-900 border border-slate-700/50 text-white rounded-full items-center justify-center text-lg font-black shadow-xl hidden md:flex ${isEven ? '-right-6' : '-left-6'}`}>
            {index + 1}
          </div>

          {/* Mobile Number Badge */}
          <div className="w-10 h-10 bg-slate-900 border border-slate-700/50 text-white rounded-full flex items-center justify-center text-base font-bold mb-4 md:hidden shadow-lg select-none">
            {index + 1}
          </div>

          <p className="text-slate-300 text-sm leading-relaxed font-medium">{step}</p>
        </div>
      </motion.div>

      {/* Visual Abstract Icon Block */}
      <motion.div
        className={`md:w-1/2 hidden md:flex w-full items-center ${isEven ? 'justify-start md:pl-16' : 'justify-end md:pr-16'}`}
        initial={{ opacity: 0, scale: 0.8 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6, delay: 0.1 }}
      >
        <div className="w-28 h-28 rounded-2xl bg-slate-950/40 flex items-center justify-center text-4xl shadow-inner border border-white/5 relative overflow-hidden select-none">
          <div className="absolute inset-0 bg-indigo-500/5 blur-xl rounded-full" />
          <span className="relative z-10">{currentIcon}</span>
        </div>
      </motion.div>
    </div>
  );
};

const Home = () => {
  const [activeRole, setActiveRole] = useState('Doctor');
  const navigate = useNavigate();

  const roles = [
    { id: 'Doctor', icon: <Stethoscope className="w-6 h-6" />, label: 'Doctor', path: '/doctor/login', color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20' },
    { id: 'Pharmacist', icon: <Pill className="w-6 h-6" />, label: 'Pharmacist', path: '/pharmacy/login', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    { id: 'Patient', icon: <HeartPulse className="w-6 h-6" />, label: 'Patient', path: '/patient/login', color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
    { id: 'Public Health', icon: <Activity className="w-6 h-6" />, label: 'Public Health', path: '/admin/login', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
    { id: 'Admin', icon: <Building2 className="w-6 h-6" />, label: 'Admin', path: '/admin/login', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' }
  ];

  const roleGuides = {
    'Doctor': {
      title: 'Unified Clinical Workspace',
      steps: [
        'Log in with your universal MediSync Doctor credentials to access all affiliated hospitals seamlessly.',
        'Lookup patient files by entering their National Identity Card (NIC) to review historical records instantly.',
        'Draft and issue e-prescriptions with safety limits, diagnostic annotations, and digital signature records.'
      ]
    },
    'Pharmacist': {
      title: 'Secure Prescription Terminal',
      steps: [
        'Verify patient identity via National Identity Card (NIC) lookup to retrieve active prescriptions.',
        'View complete instruction guides, configure substitute brands, and mark medication as dispensed.',
        'Prevent double-dispensing through global real-time synchronization updates across all pharmacies.'
      ]
    },
    'Patient': {
      title: 'Personal Patient Dashboard',
      steps: [
        'Access your longitudinal health dashboard securely using your National Identity Card (NIC).',
        'Review doctor notes, medical histories, diagnosis records, and lab check statuses.',
        'Retrieve active prescription QR/barcodes and trace dispensation status on the timeline.'
      ]
    },
    'Public Health': {
      title: 'Active Epidemiological Surveillance',
      steps: [
        'Monitor regional health logs and telemetry via automated ML outbreak scanners.',
        'Analyze anomaly signals and compute disease vector Z-Scores compared to baseline averages.',
        'Receive early threat notifications and dispatch regional alerts to notify clinical networks.'
      ]
    },
    'Admin': {
      title: 'Healthcare System Command Center',
      steps: [
        'Add hospital workspaces, manage medical practitioner profiles, and verify affiliations.',
        'Audit complete workspace transactions and query masked patient metadata securely.',
        'Deploy custom target broadcast notifications and manage access suspensions.'
      ]
    }
  };

  const stepIcons = ['🚀', '🔍', '🛡️', '📈', '⚡'];

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-200 flex flex-col pt-18 overflow-x-hidden">
      <PublicNavbar />

      {/* Hero Section */}
      <section className="relative pt-24 pb-36 overflow-hidden flex-shrink-0">
        {/* Dynamic Glow Orbs */}
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-500/10 blur-[130px] rounded-full pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[450px] h-[450px] bg-indigo-500/10 blur-[150px] rounded-full pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-6 text-center z-10 flex flex-col items-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="flex flex-col items-center"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-white/5 mb-8 select-none">
              <span className="flex h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-xs font-semibold text-slate-300 uppercase tracking-widest">Sri Lanka's Next-Gen Digital Healthcare</span>
            </div>
            
            <h1 className="text-5xl md:text-8xl font-black tracking-tight mb-8 leading-[1.1]">
              Synchronizing Care.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-teal-400">
                Saving Lives.
              </span>
            </h1>

            <p className="text-lg md:text-xl font-medium max-w-3xl mx-auto mb-10 text-slate-400 leading-relaxed">
              MediSync connects public healthcare channels, doctors, labs, and pharmacies into one secure, unified medical telemetry network.
            </p>

            <div className="flex flex-wrap justify-center gap-4">
              <button
                onClick={() => navigate('/select-role')}
                className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-full font-bold text-sm shadow-[0_0_20px_rgba(37,99,235,0.2)] transition-all hover:scale-103"
              >
                Access Login Portals
              </button>
              <button
                onClick={() => navigate('/register?role=patient')}
                className="px-8 py-4 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-white/5 rounded-full font-bold text-sm transition-all hover:scale-103"
              >
                Register as Patient
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Role Navigation Portal Cards Grid */}
      <section className="py-16 px-6 max-w-7xl mx-auto w-full z-20">
        <div className="glass-card rounded-[2.5rem] border border-white/5 p-8 md:p-14 space-y-12">
          <div className="text-center space-y-4">
            <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight">Interactive Workflows</h2>
            <p className="text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
              Select your system profile role below to preview integration workflows and enter respective clinical zones.
            </p>
          </div>

          {/* Interactive Role Tabs Selector */}
          <div className="flex flex-wrap justify-center gap-2 bg-slate-950/40 p-2 rounded-2xl border border-white/5 max-w-fit mx-auto select-none">
            {roles.map(r => (
              <button
                key={r.id}
                onClick={() => setActiveRole(r.id)}
                className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-xs transition-all ${
                  activeRole === r.id
                    ? 'bg-slate-800 border border-slate-700/50 text-white shadow-lg'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <span className={activeRole === r.id ? r.color : 'text-slate-500'}>{r.icon}</span>
                <span>{r.label}</span>
              </button>
            ))}
          </div>

          {/* Staggered Workflow Preview */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeRole}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.3 }}
              className="space-y-12"
            >
              <div className="text-center">
                <h3 className="text-2xl font-bold text-white tracking-tight">{roleGuides[activeRole].title}</h3>
              </div>

              <div className="space-y-6">
                {roleGuides[activeRole].steps.map((step, idx) => (
                  <AnimatedTimelineStep
                    key={idx}
                    step={step}
                    index={idx}
                    isEven={idx % 2 === 0}
                    currentIcon={stepIcons[idx % stepIcons.length]}
                  />
                ))}
              </div>

              <div className="flex justify-center pt-6">
                <button
                  onClick={() => navigate(roles.find(r => r.id === activeRole).path)}
                  className="px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl text-sm transition-all shadow-[0_0_20px_rgba(37,99,235,0.15)] flex items-center gap-1.5"
                >
                  Proceed to {activeRole} Portal <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
};

export default Home;