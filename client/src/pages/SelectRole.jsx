import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { HeartPulse, Stethoscope, Building2, Pill, ShieldAlert } from 'lucide-react';

const roles = [
  {
    id: 'patient',
    title: 'Patient Portal',
    description: 'Access your medical records, prescriptions, and book appointments.',
    icon: HeartPulse,
    route: '/patient/login',
    gradient: 'from-blue-500/20 to-purple-500/20',
    border: 'border-blue-500/30',
    hoverBorder: 'hover:border-blue-400',
    iconColor: 'text-blue-400'
  },
  {
    id: 'doctor',
    title: 'Doctor Workspace',
    description: 'Manage patients, view history, and issue new prescriptions.',
    icon: Stethoscope,
    route: '/doctor/login',
    gradient: 'from-teal-500/20 to-cyan-500/20',
    border: 'border-teal-500/30',
    hoverBorder: 'hover:border-teal-400',
    iconColor: 'text-teal-400'
  },
  {
    id: 'hospital',
    title: 'Hospital Administration',
    description: 'Oversee hospital operations, doctors, and outbreak alerts.',
    icon: Building2,
    route: '/hospital/login',
    gradient: 'from-indigo-500/20 to-blue-500/20',
    border: 'border-indigo-500/30',
    hoverBorder: 'hover:border-indigo-400',
    iconColor: 'text-indigo-400'
  },
  {
    id: 'pharmacy',
    title: 'Pharmacy Terminal',
    description: 'Dispense medications and verify prescription validity securely.',
    icon: Pill,
    route: '/pharmacy/login',
    gradient: 'from-emerald-500/20 to-green-500/20',
    border: 'border-emerald-500/30',
    hoverBorder: 'hover:border-emerald-400',
    iconColor: 'text-emerald-400'
  },
  {
    id: 'admin',
    title: 'Super Admin',
    description: 'System-wide configuration, audit logs, and global analytics.',
    icon: ShieldAlert,
    route: '/admin/login',
    gradient: 'from-slate-500/20 to-gray-500/20',
    border: 'border-slate-500/30',
    hoverBorder: 'hover:border-slate-400',
    iconColor: 'text-slate-400'
  }
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15
    }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 300, damping: 24 }
  }
};

const SelectRole = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-200 flex flex-col items-center justify-center p-6 sm:p-12">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-96 bg-primary/20 blur-[120px] rounded-full pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center z-10 mb-16"
      >
        <h1 className="text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 mb-4">
          Welcome to MediSync
        </h1>
        <p className="text-lg text-slate-400 max-w-xl mx-auto">
          Please select your portal to continue. Secure, intelligent healthcare management at your fingertips.
        </p>
      </motion.div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-6xl z-10"
      >
        {roles.map((role, index) => {
          const Icon = role.icon;
          // For the last row centering if 5 items (3 cols): the last two items can be centered
          const isLastRow = index >= 3;
          const gridColumnClass = isLastRow && roles.length === 5 
            ? "lg:col-span-1" // Normally we might try to center, but standard grid is fine. Let's just let it flow.
            : "";
          
          // To perfectly center 2 items in a 3 col grid, we can use col-start-something or just flex. 
          // Grid auto-flow will naturally place them on the left. We will keep it simple.

          return (
            <motion.div
              key={role.id}
              variants={itemVariants}
              whileHover={{ scale: 1.03, translateY: -5 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(role.route)}
              className={`
                relative overflow-hidden cursor-pointer rounded-2xl p-6
                bg-slate-900/50 backdrop-blur-md border ${role.border} ${role.hoverBorder}
                transition-colors duration-300 group ${gridColumnClass}
                flex flex-col h-full shadow-lg hover:shadow-${role.iconColor.split('-')[1]}-500/10
              `}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${role.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
              
              <div className="relative z-10 flex flex-col h-full">
                <div className="mb-4 p-3 rounded-xl bg-slate-800/80 w-max border border-slate-700/50 group-hover:border-slate-600/50 transition-colors">
                  <Icon className={`w-8 h-8 ${role.iconColor}`} />
                </div>
                
                <h3 className="text-xl font-semibold text-white mb-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-slate-300 transition-all">
                  {role.title}
                </h3>
                
                <p className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors leading-relaxed flex-grow">
                  {role.description}
                </p>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
};

export default SelectRole;
