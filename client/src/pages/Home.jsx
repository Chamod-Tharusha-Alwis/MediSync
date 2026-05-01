import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { FiArrowRight } from 'react-icons/fi';

// Reusable Animated Timeline Step using Framer Motion's whileInView
const AnimatedTimelineStep = ({ step, index, isEven, currentIcon }) => {
  return (
    <div className={`relative w-full flex flex-col md:flex-row items-center py-16 ${isEven ? 'md:flex-row' : 'md:flex-row-reverse'}`}>
      
      {/* Central Timeline Line */}
      <div className="absolute left-1/2 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-100 via-cyan-100 to-transparent hidden md:block -translate-x-1/2 rounded-full opacity-50"></div>

      {/* Content Block */}
      <motion.div 
        className={`md:w-1/2 w-full flex ${isEven ? 'justify-end md:pr-20' : 'justify-start md:pl-20'}`}
        initial={{ opacity: 0, x: isEven ? -50 : 50, rotate: isEven ? -2 : 2 }}
        whileInView={{ opacity: 1, x: 0, rotate: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 0.8, type: "spring", bounce: 0.3 }}
      >
        <div className="bg-white p-8 rounded-[2rem] shadow-[0_20px_50px_rgb(0,0,0,0.07)] border border-slate-50 relative w-full max-w-lg group hover:shadow-2xl transition-shadow duration-500 z-10">
          
          {/* Floating Desktop Number Badge */}
          <motion.div 
            className={`absolute top-1/2 -translate-y-1/2 w-16 h-16 bg-gradient-to-br from-blue-600 to-cyan-400 text-white rounded-full items-center justify-center text-2xl font-black shadow-xl hidden md:flex ${isEven ? '-right-8' : '-left-8'}`}
            whileHover={{ scale: 1.1, rotate: 360 }}
            transition={{ duration: 0.6 }}
          >
            {index + 1}
          </motion.div>

          {/* Mobile Number Badge */}
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-cyan-400 text-white rounded-full flex items-center justify-center text-xl font-bold mb-6 md:hidden shadow-lg">
            {index + 1}
          </div>

          <p className="text-slate-700 text-lg leading-relaxed font-medium">{step}</p>
        </div>
      </motion.div>

      {/* Visual Abstract Block */}
      <motion.div 
        className={`md:w-1/2 hidden md:flex w-full items-center ${isEven ? 'justify-start md:pl-20' : 'justify-end md:pr-20'}`}
        initial={{ opacity: 0, scale: 0.5, y: 50 }}
        whileInView={{ opacity: 1, scale: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        transition={{ duration: 1, delay: 0.2, type: "spring" }}
      >
        <motion.div 
          className="w-48 h-48 rounded-[3rem] bg-gradient-to-tr from-blue-50 to-cyan-50 flex items-center justify-center text-7xl shadow-inner border-2 border-white relative overflow-hidden"
          animate={{ y: [0, -15, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        >
          {/* Decorative background glow */}
          <div className="absolute inset-0 bg-blue-400/10 blur-2xl rounded-full"></div>
          <span className="relative z-10 drop-shadow-md">{currentIcon}</span>
        </motion.div>
      </motion.div>

    </div>
  );
};

const Home = () => {
  const [activeRole, setActiveRole] = useState('Doctor');
  const navigate = useNavigate();

  const roles = [
    { id: 'Doctor', icon: '🩺', path: '/doctor/login' },
    { id: 'Pharmacist', icon: '💊', path: '/pharmacy/login' },
    { id: 'Patient', icon: '👤', path: '/patient/login' },
    { id: 'Public Health', icon: '📊', path: '/admin/login' },
    { id: 'Admin', icon: '🏥', path: '/admin/login' }
  ];

  const roleGuides = {
    'Doctor': {
      title: 'Unified Clinical Access',
      steps: [
        'Log in with your universal MediSync Doctor ID at any affiliated hospital seamlessly.',
        'Query a patient using their National Identity Card (NIC) to instantly access their complete longitudinal health record.',
        'Issue e-prescriptions with mandatory dosage fields and automatic drug-allergy cross-referencing to ensure patient safety.'
      ]
    },
    'Pharmacist': {
      title: 'Secure Dispensing Validation',
      steps: [
        'Search via the patient NIC to retrieve all pending, unexpired prescriptions securely.',
        'Review the medication details and mark line items as dispensed in real-time.',
        'The central database updates immediately, locking the record to prevent duplicate dispensing across any other pharmacy.'
      ]
    },
    'Patient': {
      title: 'Your Health, In Your Hands',
      steps: [
        'Securely log into your read-only web dashboard using your National Identity Card (NIC).',
        'View your complete medical timeline, including past diagnoses and consultation history.',
        'Track your active prescriptions and medication instructions from a single, unified interface.'
      ]
    },
    'Public Health': {
      title: 'AI-Driven Outbreak Surveillance',
      steps: [
        'Access the real-time outbreak monitoring dashboard displaying geographic heat maps.',
        'The Python AI engine continuously analyses anonymised prescription data against historical baselines.',
        'Receive immediate WebSocket push notifications when a statistically significant anomaly (e.g., a localized dengue spike) is detected.'
      ]
    },
    'Admin': {
      title: 'Institutional Management',
      steps: [
        'Register your healthcare facility and efficiently manage doctor-to-hospital affiliations.',
        'Access high-level, anonymised analytics on facility-level consultation volumes.',
        'Monitor e-prescription issuance rates and system audit logs for absolute compliance.'
      ]
    }
  };

  const stepIcons = ['🚀', '🔍', '🛡️', '📈', '⚡'];

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 selection:bg-cyan-200 selection:text-cyan-900 overflow-x-hidden">
      
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-[#020617] via-[#0f172a] to-[#1e3a8a] text-white pt-32 pb-40 overflow-hidden">
        {/* Animated Background Orbs */}
        <motion.div 
          className="absolute top-[-10%] left-[-10%] w-[40rem] h-[40rem] rounded-full bg-blue-600/20 blur-[120px]"
          animate={{ x: [0, 100, 0], y: [0, 50, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div 
          className="absolute bottom-[-20%] right-[-10%] w-[30rem] h-[30rem] rounded-full bg-cyan-400/20 blur-[100px]"
          animate={{ x: [0, -100, 0], y: [0, -50, 0] }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="relative max-w-7xl mx-auto px-6 flex flex-col items-center text-center z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-8 shadow-lg">
              <span className="flex h-2.5 w-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.8)]"></span>
              <span className="text-sm font-semibold tracking-wide text-cyan-50">Sri Lanka's Next-Gen Healthcare Ecosystem</span>
            </div>
            <h1 className="text-5xl md:text-8xl font-black tracking-tight mb-8 leading-[1.1]">
              Synchronizing Care.<br/>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400">
                Saving Lives.
              </span>
            </h1>
            <p className="text-xl md:text-2xl font-light max-w-3xl mx-auto mb-12 text-slate-300 leading-relaxed">
              MediSync connects public and private hospitals, empowering doctors, protecting patients, and predicting outbreaks before they happen.
            </p>
            <div className="flex justify-center mb-12">
              <button
                onClick={() => navigate('/select-role')}
                className="px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full font-bold shadow-lg hover:shadow-cyan-500/20 transition-all hover:scale-105"
              >
                Access Login Portals
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Interactive Flow Section */}
      <section className="py-20 px-6 max-w-7xl mx-auto -mt-32 relative z-20">
        <motion.div 
          className="bg-white/90 backdrop-blur-xl rounded-[3rem] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] border border-white/50 p-6 md:p-16"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-extrabold mb-6 text-slate-900 tracking-tight">How MediSync Works</h2>
            <p className="text-xl text-slate-500 max-w-2xl mx-auto">
              Select your role below to discover your tailored workflow experience.
            </p>
          </div>

          {/* Framer Motion Shared Layout Pills */}
          <div className="flex flex-wrap justify-center gap-3 md:gap-4 mb-24 bg-slate-100/50 p-2 rounded-[2rem] max-w-fit mx-auto border border-slate-200/50">
            {roles.map((role) => (
              <button
                key={role.id}
                onClick={() => setActiveRole(role.id)}
                className={`relative flex items-center gap-3 px-6 py-3.5 md:px-8 md:py-4 rounded-full font-bold transition-colors duration-300 text-lg z-10 ${
                  activeRole === role.id ? 'text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {activeRole === role.id && (
                  <motion.div
                    layoutId="active-pill"
                    className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full shadow-lg shadow-blue-500/30"
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                  />
                )}
                <span className="relative z-10 text-2xl">{role.icon}</span>
                <span className="relative z-10">{role.id}</span>
              </button>
            ))}
          </div>

          {/* Dynamic Content Area with AnimatePresence */}
          <AnimatePresence mode="wait">
            <motion.div
              key={activeRole}
              initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -20, filter: "blur(10px)" }}
              transition={{ duration: 0.4, ease: "easeInOut" }}
              className="relative max-w-6xl mx-auto"
            >
              {/* Title for the selected role */}
              <div className="text-center mb-20">
                <motion.div 
                  className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-blue-50 text-blue-600 text-5xl mb-6 shadow-inner"
                  whileHover={{ scale: 1.05, rotate: 5 }}
                >
                  {roles.find(r => r.id === activeRole)?.icon}
                </motion.div>
                <h3 className="text-4xl font-extrabold text-slate-800 tracking-tight">
                  {roleGuides[activeRole].title}
                </h3>
              </div>

              {/* Staggered Timeline Steps */}
              <div className="relative mb-16">
                {roleGuides[activeRole].steps.map((step, index) => (
                  <AnimatedTimelineStep 
                    key={index} 
                    step={step} 
                    index={index} 
                    isEven={index % 2 === 0}
                    currentIcon={stepIcons[index % stepIcons.length]}
                  />
                ))}
              </div>

              {/* Login Button */}
              <div className="flex justify-center pb-12">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => navigate(roles.find(r => r.id === activeRole)?.path || '/')}
                  className="group relative flex items-center gap-3 px-10 py-5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full font-bold text-xl shadow-[0_10px_40px_-10px_rgba(79,70,229,0.5)] hover:shadow-[0_20px_50px_-10px_rgba(79,70,229,0.7)] transition-all duration-300 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-in-out rounded-full"></div>
                  <span className="relative z-10">Proceed to {activeRole} Portal</span>
                  <FiArrowRight className="relative z-10 group-hover:translate-x-1 transition-transform" />
                </motion.button>
              </div>

            </motion.div>
          </AnimatePresence>
          
        </motion.div>
      </section>

    </div>
  );
};

export default Home;