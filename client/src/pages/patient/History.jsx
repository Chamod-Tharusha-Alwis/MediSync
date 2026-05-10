import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Star, X, ChevronDown, ChevronUp, Stethoscope, FileText, Package } from 'lucide-react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import PageTransition from '../../components/common/PageTransition';

const RatingModal = ({ show, onClose, consultationId, onRated }) => {
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  if (!show) return null;

  const handleSubmit = async () => {
    if (rating === 0) {
      toast.error('Please select a rating');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/patient/consultation/${consultationId}/rate`, { rating });
      toast.success('Thank you for your feedback!');
      onRated(consultationId, rating);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit rating');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="relative w-full max-w-sm bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl p-8 z-10"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 rounded-t-2xl" />

          <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>

          <div className="text-center mb-6">
            <h3 className="text-xl font-bold text-white">Rate Your Visit</h3>
            <p className="text-slate-400 text-sm mt-2">How was your consultation experience?</p>
          </div>

          <div className="flex justify-center gap-2 mb-8">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onMouseEnter={() => setHoveredStar(star)}
                onMouseLeave={() => setHoveredStar(0)}
                onClick={() => setRating(star)}
                className="transition-transform hover:scale-110"
              >
                <Star
                  className={`w-10 h-10 transition-colors ${
                    star <= (hoveredStar || rating)
                      ? 'text-amber-400 fill-amber-400'
                      : 'text-slate-600'
                  }`}
                />
              </button>
            ))}
          </div>

          {rating > 0 && (
            <p className="text-center text-sm text-slate-400 mb-6">
              {['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][rating]}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={rating === 0 || submitting}
            className="w-full py-3 px-4 rounded-xl text-sm font-medium text-white bg-amber-600/80 hover:bg-amber-600 border border-amber-600/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting...' : 'Submit Rating'}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

const PatientHistory = () => {
  const [timeline, setTimeline] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [ratingModal, setRatingModal] = useState({ show: false, consultationId: null });
  let nic = localStorage.getItem('nic');
  if (!nic) {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try { nic = JSON.parse(userStr).nic; } catch(e) {}
    }
  }

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['patientHistory', nic],
    queryFn: async () => {
      const res = await api.get(`/patient/${nic}/timeline`);
      return res.data.data || res.data;
    },
    enabled: !!nic,
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (data) {
      setTimeline(Array.isArray(data) ? data : []);
    }
  }, [data]);

  const handleRated = (consultationId, rating) => {
    setTimeline(prev => prev.map(item =>
      (item.data?._id === consultationId) ? { ...item, data: { ...item.data, rating } } : item
    ));
  };

  const getIcon = (type) => {
    switch (type) {
      case 'prescription': return <FileText className="w-5 h-5 text-emerald-400" />;
      case 'dispensing': return <Package className="w-5 h-5 text-cyan-400" />;
      default: return <Stethoscope className="w-5 h-5 text-blue-400" />;
    }
  };

  const getAccentColor = (type) => {
    switch (type) {
      case 'prescription': return 'border-emerald-500/30 bg-emerald-500/5';
      case 'dispensing': return 'border-cyan-500/30 bg-cyan-500/5';
      default: return 'border-blue-500/30 bg-blue-500/5';
    }
  };

  if (!nic) return (
    <div className="flex h-full items-center justify-center p-20 text-center">
      <div>
        <p className="text-red-500 font-semibold mb-2">Session expired.</p>
        <button onClick={() => window.location.href = '/patient/login'} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl">Go to Login</button>
      </div>
    </div>
  );

  if (isLoading) return (
    <div className="flex h-full items-center justify-center p-20">
      <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  if (isError) return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 m-4 text-center">
      <p className="text-red-400 font-semibold mb-2">Failed to load history</p>
      <p className="text-red-500/70 text-sm mb-4">
        {error?.response?.data?.error || error?.message || 'Unknown error'}
      </p>
      <button onClick={() => window.location.reload()} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded text-sm">
        Retry
      </button>
    </div>
  );

  return (
    <PageTransition className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">Medical History</h1>
        <p className="text-slate-400 mt-1">Your complete chronological health record.</p>
      </div>

      {timeline.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center">
          <Calendar className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-lg">No medical history available yet.</p>
          <p className="text-slate-500 text-sm mt-2">Your consultations and prescriptions will appear here.</p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline Line */}
          <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-blue-500/30 via-purple-500/20 to-transparent"></div>

          <div className="space-y-6">
            {timeline.map((event, index) => {
              const details = event.data || {};
              const eventId = details._id || index;
              const isExpanded = expandedId === eventId;
              const type = event.type || 'consultation';

              return (
                <motion.div
                  key={eventId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="relative pl-16"
                >
                  {/* Timeline Dot */}
                  <div className="absolute left-4 w-5 h-5 rounded-full bg-slate-900 border-2 border-blue-500/50 flex items-center justify-center z-10">
                    <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                  </div>

                  {/* Card */}
                  <div
                    className={`glass-panel rounded-xl border ${getAccentColor(type)} cursor-pointer hover:border-slate-600 transition-all overflow-hidden`}
                    onClick={() => setExpandedId(isExpanded ? null : eventId)}
                  >
                    <div className="p-5 flex items-start justify-between">
                      <div className="flex items-start gap-4 flex-1">
                        <div className="p-2 bg-slate-800/60 rounded-lg shrink-0">
                          {getIcon(type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                              {event.date ? new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown date'}
                            </p>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 capitalize">{type}</span>
                          </div>
                          <h4 className="text-lg font-bold text-white truncate">{details.diagnosis || details.testName || 'Medical Event'}</h4>
                          <p className="text-sm text-teal-400 font-medium mt-0.5">
                            {type === 'prescription' ? `Dr. ${details.doctorId?.fullName || 'Doctor'}` : `Dr. ${details.doctorId?.fullName || 'Unknown'}`}
                          </p>
                          {(details.hospitalId?.name || details.sessionHospitalId?.name) && (
                            <p className="text-xs text-slate-500 mt-0.5">{details.hospitalId?.name || details.sessionHospitalId?.name}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {details.rating && (
                          <div className="flex items-center gap-1 text-amber-400">
                            <Star className="w-4 h-4 fill-amber-400" />
                            <span className="text-sm font-bold">{details.rating}</span>
                          </div>
                        )}
                        {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                      </div>
                    </div>

                    {/* Expanded Content */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-slate-700/50 bg-slate-800/20"
                        >
                          <div className="p-5 space-y-4">
                            {details.symptoms && details.symptoms.length > 0 && (
                              <div>
                                <p className="text-xs font-bold text-slate-500 uppercase mb-2">Symptoms</p>
                                <div className="flex flex-wrap gap-2">
                                  {details.symptoms.map((sym, i) => (
                                    <span key={i} className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-slate-300">{sym}</span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {type === 'prescription' && details.medications && details.medications.length > 0 && (
                              <div>
                                <p className="text-xs font-bold text-slate-500 uppercase mb-2">Medications</p>
                                <div className="space-y-2">
                                  {details.medications.map((m, i) => (
                                    <div key={i} className="flex justify-between items-center bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                                      <div>
                                        <span className="text-white font-medium">{m.name}</span>
                                        <span className="text-slate-500 text-xs ml-2">{m.dosage} — {m.frequency}</span>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {details.notes && (
                              <div>
                                <p className="text-xs font-bold text-slate-500 uppercase mb-1">Clinical Notes</p>
                                <p className="text-sm text-slate-300">{details.notes}</p>
                              </div>
                            )}

                            {/* Rate Button */}
                            {type === 'consultation' && !details.rating && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRatingModal({ show: true, consultationId: details._id });
                                }}
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm font-medium hover:bg-amber-500/20 transition-colors"
                              >
                                <Star className="w-4 h-4" />
                                Rate this visit
                              </button>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Rating Modal */}
      <RatingModal
        show={ratingModal.show}
        consultationId={ratingModal.consultationId}
        onClose={() => setRatingModal({ show: false, consultationId: null })}
        onRated={handleRated}
      />
    </PageTransition>
  );
};

export default PatientHistory;
