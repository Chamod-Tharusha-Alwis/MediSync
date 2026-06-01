import React from 'react';
import { motion } from 'framer-motion';
import {
  Stethoscope, Calendar, Clock,
  Building2, User, Pill, FlaskConical, Package
} from 'lucide-react';

/* ─── Stagger variants ────────────────────────────────────────────────────── */
const containerVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};

const itemVariants = {
  hidden:  { opacity: 0, y: 28, scale: 0.96 },
  visible: {
    opacity: 1, y: 0, scale: 1,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

/* ─── Event type colour config ────────────────────────────────────────────── */
const typeConfig = {
  consultation: {
    Icon:      Stethoscope,
    color:     'text-blue-400',
    bg:        'bg-blue-500/10 border-blue-500/20',
    badge:     'bg-blue-500/10 text-blue-400 border-blue-500/20',
    dot:       'from-blue-400 to-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.7)]',
    hover:     'hover:shadow-[0_0_28px_rgba(59,130,246,0.15)]',
    glowColor: 'group-hover:text-blue-300',
  },
  prescription: {
    Icon:      Pill,
    color:     'text-emerald-400',
    bg:        'bg-emerald-500/10 border-emerald-500/20',
    badge:     'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    dot:       'from-emerald-400 to-teal-500 shadow-[0_0_12px_rgba(16,185,129,0.7)]',
    hover:     'hover:shadow-[0_0_28px_rgba(16,185,129,0.15)]',
    glowColor: 'group-hover:text-emerald-300',
  },
  dispensing: {
    Icon:      Package,
    color:     'text-cyan-400',
    bg:        'bg-cyan-500/10 border-cyan-500/20',
    badge:     'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    dot:       'from-cyan-400 to-sky-500 shadow-[0_0_12px_rgba(34,211,238,0.7)]',
    hover:     'hover:shadow-[0_0_28px_rgba(6,182,212,0.15)]',
    glowColor: 'group-hover:text-cyan-300',
  },
  lab_test: {
    Icon:      FlaskConical,
    color:     'text-purple-400',
    bg:        'bg-purple-500/10 border-purple-500/20',
    badge:     'bg-purple-500/10 text-purple-400 border-purple-500/20',
    dot:       'from-purple-400 to-fuchsia-500 shadow-[0_0_12px_rgba(192,132,252,0.7)]',
    hover:     'hover:shadow-[0_0_28px_rgba(139,92,246,0.15)]',
    glowColor: 'group-hover:text-purple-300',
  },
};
const getTC = (type) => typeConfig[type] || typeConfig.consultation;

/* ═══════════════════════════════════════════════════════════════════════════
   MedicalTimeline — alternating left/right layout for doctor view
   ═══════════════════════════════════════════════════════════════════════════ */
const MedicalTimeline = ({ events }) => {
  if (!events || events.length === 0) {
    return (
      <div className="text-center py-14 glass-card rounded-2xl border border-dashed border-slate-700/60">
        <Calendar className="w-10 h-10 mx-auto mb-3 opacity-20 text-slate-400" />
        <p className="text-sm text-slate-500 font-medium">No medical history available for this patient.</p>
      </div>
    );
  }

  return (
    <div className="relative py-6">
      {/* Central vertical line (desktop only) */}
      <div
        className="absolute left-1/2 top-0 bottom-0 w-[2px] hidden md:block -translate-x-1/2"
        style={{
          background: 'linear-gradient(to bottom, rgba(20,184,166,0.5), rgba(99,102,241,0.30), transparent)',
          boxShadow: '0 0 8px rgba(20,184,166,0.15)',
        }}
        aria-hidden="true"
      />

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-10"
      >
        {events.map((event, index) => (
          <TimelineItem
            key={event.data?._id || index}
            event={event}
            index={index}
            isEven={index % 2 === 0}
          />
        ))}
      </motion.div>
    </div>
  );
};

/* ─── Individual timeline item ────────────────────────────────────────────── */
const TimelineItem = ({ event, index, isEven }) => {
  const data = event.data || {};
  const type = event.type || 'consultation';
  const tc   = getTC(type);
  const { Icon } = tc;

  const isConsultation = type === 'consultation';
  const isPrescription = type === 'prescription';

  return (
    <motion.div
      variants={itemVariants}
      className={`relative flex flex-col md:flex-row items-start md:items-center ${isEven ? 'md:flex-row-reverse' : ''}`}
    >
      {/* ── Timeline dot (desktop: centred; mobile: left) ── */}
      <div className="absolute left-4 md:left-1/2 top-6 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 z-10">
        <div className="w-10 h-10 rounded-full bg-slate-950 border-2 border-slate-800 flex items-center justify-center shadow-[0_0_20px_rgba(0,0,0,0.6)]">
          <div className={`w-4 h-4 rounded-full bg-gradient-to-br ${tc.dot}`} />
        </div>
      </div>

      {/* ── Content block ── */}
      <div className={`w-full md:w-[46%] pl-16 md:pl-0 ${isEven ? 'md:pr-12' : 'md:pl-12'}`}>
        <div
          className={`
            glass-card-premium p-6 rounded-2xl border border-white/5
            transition-all duration-300 group ${tc.hover} neumorphic-flat
            relative overflow-hidden
          `}
        >
          {/* Ambient corner glow */}
          <div className="absolute -top-10 -right-10 w-24 h-24 bg-gradient-to-br from-white/5 to-transparent rounded-full blur-xl pointer-events-none" />

          {/* Header row */}
          <div className="flex items-center justify-between mb-4 relative z-10">
            {/* Type badge with SVG icon */}
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest border ${tc.badge}`}>
              <Icon className={`w-3.5 h-3.5 ${tc.color}`} />
              {type.replace('_', ' ')}
            </span>
            <span className="text-xs text-slate-500 font-mono flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {event.date ? new Date(event.date).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—'}
            </span>
          </div>

          {/* Title */}
          <h3 className={`text-base font-bold text-white mb-3 relative z-10 ${tc.glowColor} transition-colors`}>
            {isConsultation
              ? data.symptoms?.join(', ') || 'General Consultation'
              : isPrescription
                ? `Prescription — ${data.medications?.[0]?.name || 'Medication'}`
                : data.testName || 'Medical Event'}
          </h3>

          {/* Body */}
          <div className="space-y-3 relative z-10">
            {isConsultation && (
              <>
                {(data.notes || data.clinicalNotes) && (
                  <p className="text-sm text-slate-400 leading-relaxed italic line-clamp-3 bg-slate-950/20 p-3 rounded-xl border border-white/5">
                    "{data.notes || data.clinicalNotes}"
                  </p>
                )}
                <div className="flex flex-wrap gap-4 pt-2 border-t border-slate-800/30">
                  <span className="flex items-center gap-1.5 text-xs text-slate-400">
                    <User className="w-3.5 h-3.5 text-blue-400" />
                    {data.doctorId?.fullName || 'Doctor'}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-slate-400">
                    <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                    {data.sessionHospitalId?.name || 'Private Clinic'}
                  </span>
                </div>
              </>
            )}

            {isPrescription && (
              <>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {data.medications?.map((med, i) => (
                    <span key={i} className="bg-slate-900/60 text-slate-300 px-3 py-1 rounded-lg text-xs border border-white/5 font-semibold inline-flex items-center gap-1.5">
                      <Pill className="w-3 h-3 text-emerald-400" />
                      {med.name}
                      {med.dosage && <span className="text-slate-500">({med.dosage})</span>}
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/30">
                  <span className="flex items-center gap-1.5 text-xs text-slate-400">
                    <User className="w-3.5 h-3.5 text-emerald-400" />
                    Issued by {data.doctorId?.fullName || 'Doctor'}
                  </span>
                  <span className={`text-[10px] font-black px-2.5 py-0.5 rounded border ${
                    data.status === 'dispensed'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                  }`}>
                    {data.status?.toUpperCase() || 'PENDING'}
                  </span>
                </div>
              </>
            )}

            {/* Dispensing */}
            {type === 'dispensing' && (
              <div className="pt-2 border-t border-slate-800/30">
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Package className="w-3.5 h-3.5 text-cyan-400" />
                  {data.pharmacyId?.name || 'Pharmacy'} — {data.dispensedAt
                    ? new Date(data.dispensedAt).toLocaleDateString()
                    : 'Date unknown'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Spacer for alternating layout */}
      <div className="hidden md:block md:w-[46%]" />
    </motion.div>
  );
};

export default MedicalTimeline;
