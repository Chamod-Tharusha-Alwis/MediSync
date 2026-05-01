import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { FiFileText, FiPackage, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { FaStethoscope } from 'react-icons/fa';

const MedicalTimeline = ({ events }) => {
  const [expandedId, setExpandedId] = React.useState(null);

  // Fallback for empty events
  if (!events || events.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-gray-500">No medical history available.</p>
      </div>
    );
  }

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.2 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 100 } }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'consultation': return <FaStethoscope className="w-5 h-5 text-blue-600" />;
      case 'prescription': return <FiFileText className="w-5 h-5 text-green-600" />;
      case 'dispensing': return <FiPackage className="w-5 h-5 text-teal-600" />;
      default: return <FaStethoscope className="w-5 h-5 text-blue-600" />;
    }
  };

  const getColorClass = (type) => {
    switch (type) {
      case 'consultation': return 'bg-blue-100 border-blue-200';
      case 'prescription': return 'bg-green-100 border-green-200';
      case 'dispensing': return 'bg-teal-100 border-teal-200';
      default: return 'bg-blue-100 border-blue-200';
    }
  };

  return (
    <div className="relative py-8">
      {/* Central Line */}
      <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-gray-200 via-primary/20 to-gray-200 transform md:-translate-x-1/2"></div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-100px" }}
        className="space-y-8"
      >
        {events.map((event, index) => {
          const isEven = index % 2 === 0;
          const isExpanded = expandedId === event._id;

          // For the sake of this component, we'll infer 'type' from available data if not explicitly set
          const type = event.type || 'consultation';

          return (
            <motion.div key={event._id} variants={itemVariants} className="relative flex flex-col md:flex-row items-center w-full group">
              
              {/* Date/Time Mobile (Top) */}
              <div className="md:hidden w-full pl-12 mb-2">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  {format(new Date(event.date), 'MMM dd, yyyy')}
                </span>
              </div>

              {/* Left Side (Desktop) */}
              <div className={`hidden md:block w-1/2 ${isEven ? 'pr-12 text-right' : 'pl-12 order-2'}`}>
                <span className="text-sm font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  {format(new Date(event.date), 'MMM dd, yyyy')}
                </span>
                <span className="text-xs text-gray-400">
                  {format(new Date(event.date), 'h:mm a')}
                </span>
              </div>

              {/* Center Dot */}
              <div className="absolute left-4 md:left-1/2 w-8 h-8 bg-white border-4 border-white rounded-full shadow-md transform -translate-x-1/2 flex items-center justify-center z-10 transition-transform group-hover:scale-110">
                <div className={`w-full h-full rounded-full flex items-center justify-center ${getColorClass(type)}`}>
                  {getIcon(type)}
                </div>
              </div>

              {/* Card Content */}
              <div className={`w-full pl-12 md:pl-0 md:w-1/2 ${isEven ? 'md:order-2 md:pl-12' : 'md:pr-12'}`}>
                <div 
                  className="bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer overflow-hidden"
                  onClick={() => setExpandedId(isExpanded ? null : event._id)}
                >
                  <div className="p-5 flex justify-between items-start">
                    <div>
                      <h4 className="text-lg font-bold text-gray-800">{event.diagnosis || 'Medical Event'}</h4>
                      <p className="text-sm text-primary font-medium mt-1">Dr. {event.doctorName}</p>
                      <p className="text-xs text-gray-500 mt-1">{event.hospitalName}</p>
                    </div>
                    <button className="text-gray-400 hover:text-primary transition-colors">
                      {isExpanded ? <FiChevronUp size={20} /> : <FiChevronDown size={20} />}
                    </button>
                  </div>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-gray-50 bg-gray-50/50"
                      >
                        <div className="p-5 space-y-4 text-sm">
                          {event.symptoms && event.symptoms.length > 0 && (
                            <div>
                              <span className="font-semibold text-gray-700 block mb-2">Reported Symptoms:</span>
                              <div className="flex flex-wrap gap-2">
                                {event.symptoms.map(sym => (
                                  <span key={sym} className="px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-600">
                                    {sym}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {event.prescriptions && event.prescriptions.length > 0 && (
                            <div>
                              <span className="font-semibold text-gray-700 block mb-2">Prescriptions:</span>
                              <ul className="space-y-2">
                                {event.prescriptions.map((p, i) => (
                                  <li key={i} className="flex justify-between items-center bg-white p-2 rounded border border-gray-100">
                                    <span className="font-medium text-gray-800">{p.drugName}</span>
                                    <div className="flex items-center space-x-3">
                                      <span className="text-gray-500 text-xs">{p.dosage}</span>
                                      <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${
                                        p.status === 'dispensed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                      }`}>
                                        {p.status}
                                      </span>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
};

export default MedicalTimeline;
