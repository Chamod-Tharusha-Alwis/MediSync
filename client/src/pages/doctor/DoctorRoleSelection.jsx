import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Stethoscope, Building2, ArrowRight } from 'lucide-react';

/**
 * DoctorRoleSelection — Step 1 of doctor login flow
 * Presents two animated cards: Private Consultation vs Hospital Consultation
 */
const DoctorRoleSelection = () => {
  const navigate = useNavigate();

  const options = [
    {
      key: 'personal',
      title: 'Private Consultation',
      subtitle: 'Personal Practice',
      description: 'Login with your personal credentials to manage your private patients and consultations.',
      icon: Stethoscope,
      gradient: 'from-blue-600 to-indigo-600',
      bg: 'from-blue-950/60 to-indigo-950/60',
      border: 'border-blue-500/30 hover:border-blue-400/60',
      glow: 'hover:shadow-blue-500/20',
    },
    {
      key: 'hospital',
      title: 'Hospital Consultation',
      subtitle: 'Affiliated Hospital',
      description: 'Login through your affiliated hospital account to access institutional workflows.',
      icon: Building2,
      gradient: 'from-teal-600 to-cyan-600',
      bg: 'from-teal-950/60 to-cyan-950/60',
      border: 'border-teal-500/30 hover:border-teal-400/60',
      glow: 'hover:shadow-teal-500/20',
    },
  ];

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center bg-[#0b1120] px-4"
      style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-12"
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/60 border border-slate-700/50 text-slate-400 text-sm mb-6">
          <Stethoscope className="w-4 h-4 text-blue-400" />
          Doctor Portal
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight mb-3">
          Select Login Type
        </h1>
        <p className="text-slate-400 text-lg max-w-md mx-auto">
          Choose how you'd like to access the MediSync platform today.
        </p>
      </motion.div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
        {options.map((opt, index) => {
          const Icon = opt.icon;
          return (
            <motion.button
              key={opt.key}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.15, duration: 0.5, type: 'spring', damping: 20 }}
              whileHover={{ scale: 1.02, y: -4 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(`/doctor/login?type=${opt.key}`)}
              className={`relative text-left p-8 rounded-2xl border bg-gradient-to-br ${opt.bg} ${opt.border} transition-all duration-300 shadow-xl ${opt.glow} hover:shadow-2xl group`}
            >
              {/* Icon */}
              <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${opt.gradient} flex items-center justify-center mb-6 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                <Icon className="w-8 h-8 text-white" />
              </div>

              {/* Badge */}
              <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r ${opt.gradient} text-white text-xs font-semibold mb-3`}>
                {opt.subtitle}
              </div>

              {/* Text */}
              <h2 className="text-2xl font-bold text-white mb-3">{opt.title}</h2>
              <p className="text-slate-400 text-sm leading-relaxed mb-6">{opt.description}</p>

              {/* CTA */}
              <div className="flex items-center gap-2 text-white font-semibold text-sm group-hover:gap-3 transition-all duration-300">
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </div>

              {/* Decorative gradient orb */}
              <div className={`absolute top-4 right-4 w-24 h-24 rounded-full bg-gradient-to-br ${opt.gradient} opacity-10 blur-2xl group-hover:opacity-20 transition-opacity`} />
            </motion.button>
          );
        })}
      </div>

      {/* Back link */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        onClick={() => navigate('/select-role')}
        className="mt-10 text-slate-500 hover:text-slate-300 text-sm transition-colors"
      >
        ← Back to role selection
      </motion.button>
    </div>
  );
};

export default DoctorRoleSelection;
