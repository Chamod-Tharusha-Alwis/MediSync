import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Star, MapPin, Building2, MessageSquare, Quote } from 'lucide-react';

const DoctorProfileModal = ({ doctor, onClose }) => {
  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
      />

      {/* Modal Content */}
      <motion.div 
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        transition={{ type: "spring", bounce: 0.3, duration: 0.6 }}
        className="relative w-full max-w-2xl bg-white sm:rounded-[2rem] rounded-t-[2rem] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 text-white relative">
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center text-4xl font-bold backdrop-blur-md shadow-inner">
              {doctor.fullName?.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-3xl font-bold mb-1">{doctor.fullName}</h2>
              <p className="text-blue-100 font-medium text-lg">{doctor.specialization || 'General Practitioner'}</p>
              
              <div className="flex items-center gap-4 mt-4">
                <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/10">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  <span className="font-bold">{doctor.averageRating > 0 ? doctor.averageRating : 'New'}</span>
                  {doctor.ratingCount > 0 && <span className="text-white/60 text-sm">({doctor.ratingCount})</span>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-8 overflow-y-auto custom-scrollbar flex-1 space-y-8 bg-slate-50">
          
          {/* Practice Info */}
          <section className="grid sm:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Private Practice
              </h3>
              <p className="text-slate-700 font-medium">{doctor.clinicAddress || 'Contact directly for clinic details.'}</p>
              {doctor.contactNumber && (
                <p className="text-blue-600 mt-2 font-medium">{doctor.contactNumber}</p>
              )}
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Hospital Affiliations
              </h3>
              {doctor.hospitals?.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {doctor.hospitals.map(h => (
                    <div key={h._id} className="flex items-start gap-2 p-2 rounded-xl bg-slate-50 border border-slate-100">
                      <div className="mt-0.5"><Building2 className="w-4 h-4 text-indigo-400" /></div>
                      <div>
                        <p className="font-bold text-slate-700 text-sm">{h.name}</p>
                        <p className="text-xs text-slate-500">{h.district}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 italic text-sm">No affiliated public hospitals listed.</p>
              )}
            </div>
          </section>

          {/* Patient Reviews */}
          <section>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Recent Patient Feedback
            </h3>
            
            {doctor.recentReviews && doctor.recentReviews.length > 0 ? (
              <div className="space-y-4">
                {doctor.recentReviews.map((review, i) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    key={review._id} 
                    className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative"
                  >
                    <Quote className="absolute top-4 right-4 w-8 h-8 text-slate-100 rotate-180" />
                    <div className="flex gap-1 mb-2">
                      {[...Array(5)].map((_, j) => (
                        <Star key={j} className={`w-4 h-4 ${j < review.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                      ))}
                    </div>
                    <p className="text-slate-700 italic relative z-10 leading-relaxed">"{review.comment}"</p>
                    <p className="text-xs text-slate-400 mt-3 font-medium">
                      {new Date(review.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                    </p>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-500">
                <Star className="w-10 h-10 mx-auto text-slate-200 mb-3" />
                <p>No text reviews available yet.</p>
              </div>
            )}
          </section>
        </div>
      </motion.div>
    </div>
  );
};

export default DoctorProfileModal;
