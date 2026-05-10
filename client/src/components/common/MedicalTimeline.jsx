import React from 'react';
import { motion } from 'framer-motion';
import { FileText, Clipboard, Stethoscope, Calendar, Clock, MapPin, Building2, User } from 'lucide-react';

const MedicalTimeline = ({ events }) => {
  if (!events || events.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500 border border-dashed border-slate-700 rounded-2xl">
        <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">No medical history available for this patient.</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical Line */}
      <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-blue-500/50 via-slate-700 to-transparent hidden md:block transform -translate-x-1/2" />

      <div className="space-y-12">
        {events.map((event, index) => (
          <TimelineItem 
            key={event.data._id || index} 
            event={event} 
            index={index} 
            isEven={index % 2 === 0}
          />
        ))}
      </div>
    </div>
  );
};

const TimelineItem = ({ event, index, isEven }) => {
  const isConsultation = event.type === 'consultation';
  const data = event.data;
  
  const icon = isConsultation ? <Stethoscope className="w-5 h-5" /> : <Clipboard className="w-5 h-5" />;
  const colorClass = isConsultation ? 'text-blue-400 bg-blue-500/20 border-blue-500/30' : 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30';
  const shadowClass = isConsultation ? 'shadow-[0_0_20px_rgba(59,130,246,0.1)]' : 'shadow-[0_0_20px_rgba(16,185,129,0.1)]';

  return (
    <div className={`relative flex flex-col md:flex-row items-center ${isEven ? 'md:flex-row-reverse' : ''}`}>
      {/* Timeline Dot (Mobile & Desktop) */}
      <div className="absolute left-4 md:left-1/2 top-0 md:top-1/2 w-8 h-8 rounded-full bg-slate-900 border-2 border-slate-700 flex items-center justify-center z-10 md:-translate-x-1/2 md:-translate-y-1/2 shadow-xl">
        <div className={`w-2 h-2 rounded-full ${isConsultation ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]'}`} />
      </div>

      {/* Content Block */}
      <motion.div 
        className={`w-full md:w-[45%] ml-12 md:ml-0 ${isEven ? 'md:pr-12' : 'md:pl-12'}`}
        initial={{ opacity: 0, x: isEven ? 20 : -20 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: "-50px" }}
        transition={{ duration: 0.5, delay: index * 0.1 }}
      >
        <div className={`bg-slate-900/60 backdrop-blur-md p-6 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all group ${shadowClass}`}>
          <div className="flex items-center justify-between mb-4">
            <span className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${colorClass}`}>
              {icon}
              {event.type}
            </span>
            <span className="text-xs text-slate-500 font-mono flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(event.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}
            </span>
          </div>

          <h3 className="text-lg font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">
            {isConsultation ? data.symptoms?.join(', ') || 'General Consultation' : `Prescription for ${data.medications?.[0]?.name || 'Medication'}`}
          </h3>

          <div className="space-y-3">
            {isConsultation ? (
              <>
                <p className="text-sm text-slate-400 leading-relaxed italic line-clamp-3">
                  "{data.notes || data.clinicalNotes || 'No specific clinical notes provided.'}"
                </p>
                <div className="flex flex-wrap gap-4 pt-2">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <User className="w-3 h-3" />
                    <span>{data.doctorId?.fullName || 'Doctor'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Building2 className="w-3 h-3" />
                    <span>{data.sessionHospitalId?.name || 'Private Clinic'}</span>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap gap-2 mb-3">
                  {data.medications?.map((med, i) => (
                    <span key={i} className="bg-slate-800 text-slate-300 px-2 py-1 rounded text-xs border border-slate-700">
                      {med.name} ({med.dosage})
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/50">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <User className="w-3 h-3" />
                    <span>Issued by {data.doctorId?.fullName || 'Doctor'}</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${data.status === 'dispensed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'}`}>
                    {data.status?.toUpperCase()}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </motion.div>

      {/* Spacer for Desktop */}
      <div className="hidden md:block md:w-[45%]" />
    </div>
  );
};

export default MedicalTimeline;
