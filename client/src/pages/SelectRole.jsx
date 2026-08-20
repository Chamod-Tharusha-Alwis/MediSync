import React from 'react';
import { useNavigate } from 'react-router-dom';

import { HeartPulse, Stethoscope, Building2, Pill, ShieldAlert } from 'lucide-react';
import PublicNavbar from '../components/common/PublicNavbar';
import PageTransition from '../components/common/PageTransition';

const roles = [
  {
    id: 'patient',
    title: 'Patient Portal',
    description: 'Access medical records, prescriptions history, check diagnostics, and view notifications.',
    icon: HeartPulse,
    route: '/patient/login',
    color: 'text-rose-400',
    border: 'hover:border-rose-500/30 hover:shadow-rose-500/5',
    glow: 'bg-rose-500/10'
  },
  {
    id: 'doctor',
    title: 'Doctor Workspace',
    description: 'Record patient consultations, view clinical timelines, and issue e-prescriptions.',
    icon: Stethoscope,
    route: '/doctor/select-role',
    color: 'text-teal-400',
    border: 'hover:border-teal-500/30 hover:shadow-teal-500/5',
    glow: 'bg-teal-500/10'
  },
  {
    id: 'hospital',
    title: 'Hospital Administration',
    description: 'Verify affiliation requests, trace diagnostic queues, and overview clinical stats.',
    icon: Building2,
    route: '/hospital/login',
    color: 'text-blue-400',
    border: 'hover:border-blue-500/30 hover:shadow-blue-500/5',
    glow: 'bg-blue-500/10'
  },
  {
    id: 'pharmacy',
    title: 'Pharmacy Terminal',
    description: 'Dispense e-prescriptions, substitute alternative brands, and perform billing checkouts.',
    icon: Pill,
    route: '/pharmacy/login',
    color: 'text-emerald-400',
    border: 'hover:border-emerald-500/30 hover:shadow-emerald-500/5',
    glow: 'bg-emerald-500/10'
  },
  {
    id: 'admin',
    title: 'Super Admin Command Center',
    description: 'Inspect HIPAA audit trails, dispatch broadcasts, and execute surveillance scans.',
    icon: ShieldAlert,
    route: '/admin/login',
    color: 'text-amber-400',
    border: 'hover:border-amber-500/30 hover:shadow-amber-500/5',
    glow: 'bg-amber-500/10'
  }
];

const SelectRole = () => {
  const navigate = useNavigate();

  return (
    <PageTransition className="min-h-screen bg-[#0b1120] text-slate-200 flex flex-col items-center justify-center pt-28 pb-12 px-6 sm:px-12 relative overflow-hidden">
      <PublicNavbar />
      
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl h-96 bg-blue-500/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="text-center z-10 mb-12 max-w-2xl select-none">
        <h1 className="text-4xl md:text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 mb-4">
          Access MediSync Portal
        </h1>
        <p className="text-sm text-slate-400 leading-relaxed">
          Please select your system role below to enter the secure authenticated workspace portal.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-6xl z-10">
        {roles.map((role) => {
          const Icon = role.icon;
          return (
            <div
              key={role.id}
              onClick={() => navigate(role.route)}
              className={`
                relative overflow-hidden cursor-pointer rounded-2xl p-6
                bg-slate-900/40 backdrop-blur-xl border border-white/5 ${role.border}
                transition-all duration-300 group flex flex-col h-full shadow-lg hover:-translate-y-1
              `}
            >
              {/* Background gradient on hover */}
              <div className={`absolute inset-0 bg-gradient-to-br from-transparent to-slate-950/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
              
              <div className="relative z-10 flex flex-col h-full space-y-4">
                <div className="flex justify-between items-start">
                  <div className={`p-3 rounded-xl bg-slate-950/50 border border-white/5 group-hover:border-slate-800 transition-colors`}>
                    <Icon className={`w-6 h-6 ${role.color}`} />
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-widest text-slate-600 group-hover:text-slate-500 select-none">
                    Select
                  </span>
                </div>
                
                <div>
                  <h3 className="text-lg font-bold text-white mb-2 tracking-tight group-hover:text-white transition-colors">
                    {role.title}
                  </h3>
                  <p className="text-xs text-slate-400 group-hover:text-slate-300 transition-colors leading-relaxed">
                    {role.description}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </PageTransition>
  );
};

export default SelectRole;
