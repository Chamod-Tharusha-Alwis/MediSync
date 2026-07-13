import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Star, MapPin, Building2, MessageSquare, Quote, BookOpen } from 'lucide-react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';

const getEmbedMapUrl = (url) => {
  if (!url) return '';
  if (url.includes('/embed') || url.includes('embed?pb=')) {
    return url;
  }
  try {
    if (url.startsWith('http')) {
      const urlObj = new URL(url);
      if (urlObj.hostname.includes('google') && urlObj.pathname.includes('/place/')) {
        const place = urlObj.pathname.split('/place/')[1]?.split('/')[0];
        if (place) {
          return `https://maps.google.com/maps?q=${place}&t=&z=14&ie=UTF8&iwloc=&output=embed`;
        }
      }
      return `https://maps.google.com/maps?q=${encodeURIComponent(url)}&t=&z=14&ie=UTF8&iwloc=&output=embed`;
    }
  } catch (_) {}
  return `https://maps.google.com/maps?q=${encodeURIComponent(url)}&t=&z=14&ie=UTF8&iwloc=&output=embed`;
};

const DoctorProfileModal = ({ doctor: initialDoctor, onClose }) => {
  const [doctor, setDoctor] = useState(initialDoctor);
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('about'); // 'about', 'reviews', 'location'

  const isPatient = localStorage.getItem('role') === 'patient';

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const fetchReviews = useCallback(async () => {
    try {
      const res = await api.get(`/reviews/${doctor._id}`);
      setReviews(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch reviews', err);
    } finally {
      setLoadingReviews(false);
    }
  }, [doctor._id]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.post('/reviews', {
        targetId: doctor._id,
        targetModel: 'Doctor',
        rating,
        comment: comment.trim()
      });
      toast.success('Thank you for your feedback!');
      setComment('');
      setRating(5);
      await fetchReviews();
      
      if (res.data.stats) {
        setDoctor(prev => ({
          ...prev,
          averageRating: res.data.stats.averageRating,
          ratingCount: res.data.stats.ratingCount
        }));
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 select-none">
      {/* Backdrop */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
      />

      {/* Modal Content */}
      <motion.div 
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        transition={{ type: "spring", bounce: 0.15, duration: 0.5 }}
        className="relative w-full max-w-2xl bg-slate-900 border border-white/5 sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Top Header Panel */}
        <div className="bg-slate-950/50 p-6 border-b border-white/5 relative">
          <button 
            onClick={onClose}
            className="absolute top-5 right-5 p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors border border-white/5"
          >
            <X className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-gradient-to-br from-blue-600 to-indigo-500 border border-white/10 flex items-center justify-center text-3xl font-black shadow-lg">
              {doctor.profilePicture ? (
                <img src={doctor.profilePicture} alt={doctor.fullName} className="w-full h-full object-cover" />
              ) : (
                doctor.fullName?.charAt(0).toUpperCase()
              )}
            </div>
            <div className="text-left">
              <h2 className="text-xl font-bold text-white mb-0.5">{doctor.fullName}</h2>
              <p className="text-blue-400 font-bold text-sm">{doctor.specialization || 'General Practitioner'}</p>
              
              <div className="flex items-center gap-2 mt-2">
                <div className="flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 text-[10px] font-bold text-amber-400">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  <span>{doctor.averageRating > 0 ? doctor.averageRating : 'New'}</span>
                  {doctor.ratingCount > 0 && <span className="opacity-60 font-semibold"> ({doctor.ratingCount})</span>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Selection Row */}
        <div className="flex border-b border-white/5 bg-slate-950/20 px-6 select-none">
          {[
            { id: 'about', label: 'About & Practice' },
            { id: 'reviews', label: 'Patient Feedback' },
            { id: 'location', label: 'Map Location' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3.5 px-4 font-bold text-xs border-b-2 transition-all ${
                activeTab === tab.id
                  ? 'border-blue-500 text-white'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable Body Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 bg-slate-900/30 text-left">
          
          {/* TAB: About & Practice */}
          {activeTab === 'about' && (
            <div className="space-y-6">
              {doctor.description && (
                <div className="glass-panel p-5 rounded-xl border border-white/5">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2.5 flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-blue-400" /> Professional Summary
                  </h3>
                  <p className="text-slate-300 text-xs leading-relaxed font-medium whitespace-pre-line">
                    {doctor.description}
                  </p>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="glass-panel p-4 rounded-xl border border-white/5">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-rose-400" /> Private Practice
                  </h3>
                  <p className="text-white text-xs font-bold">{doctor.clinicAddress || 'Clinic details not specified.'}</p>
                  {doctor.contactNumber && (
                    <p className="text-blue-400 font-bold text-xs mt-1.5 font-mono">{doctor.contactNumber}</p>
                  )}
                </div>

                <div className="glass-panel p-4 rounded-xl border border-white/5">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-indigo-450" /> Hospital Affiliations
                  </h3>
                  {doctor.hospitals?.length > 0 ? (
                    <div className="space-y-1.5">
                      {doctor.hospitals.map(h => (
                        <div key={h._id || h} className="text-xs">
                          <p className="text-white font-bold leading-none">{h.name || 'Hospital'}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">{h.district || ''}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 italic text-xs">No affiliated public hospitals listed.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: Reviews */}
          {activeTab === 'reviews' && (
            <div className="space-y-6">
              {isPatient && (
                <div className="glass-panel p-5 rounded-xl border border-white/5">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-1.5">
                    Write a Patient Review
                  </h3>
                  <form onSubmit={handleReviewSubmit} className="space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 text-xs font-bold uppercase">Rating:</span>
                      <div className="flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => setRating(star)}
                            className="hover:scale-105 transition-transform"
                          >
                            <Star className={`w-5 h-5 ${star <= rating ? 'fill-amber-450 text-amber-450' : 'text-slate-700'}`} />
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <textarea
                        rows={3}
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        placeholder="Detail your consulting experience..."
                        required
                        className="w-full bg-slate-950/40 border border-white/5 rounded-xl p-3 text-xs text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none resize-none transition-colors"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submitting || !comment.trim()}
                      className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50"
                    >
                      {submitting ? 'Submitting...' : 'Submit Feedback'}
                    </button>
                  </form>
                </div>
              )}

              <div className="space-y-3">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" /> Recent Reviews List
                </h3>
                
                {loadingReviews ? (
                  <p className="text-slate-500 text-xs py-4">Loading testimonials...</p>
                ) : reviews.length > 0 ? (
                  reviews.map((review) => (
                    <div key={review._id} className="p-4 rounded-xl border border-white/5 bg-slate-950/20 relative">
                      <Quote className="absolute top-4 right-4 w-6 h-6 text-white/[0.02] rotate-180 select-none" />
                      <div className="flex gap-0.5 mb-2">
                        {[...Array(5)].map((_, j) => (
                          <Star key={j} className={`w-3.5 h-3.5 ${j < review.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-800'}`} />
                        ))}
                      </div>
                      <p className="text-slate-300 italic text-xs leading-normal">"{review.comment}"</p>
                      <div className="flex justify-between items-center mt-3 text-[10px] text-slate-550 font-bold">
                        <span>Reviewed by {review.reviewerName || 'Anonymous'}</span>
                        <span className="font-mono">{new Date(review.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-slate-500 text-xs italic">No patient testimonials logged yet.</p>
                )}
              </div>
            </div>
          )}

          {/* TAB: Location Map */}
          {activeTab === 'location' && (
            <div className="space-y-4">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-rose-400" /> Interactive Map Frame
              </h3>
              {doctor.googleMapsUrl ? (
                <div className="w-full h-64 rounded-xl overflow-hidden border border-white/5 shadow-2xl relative bg-slate-950/40">
                  <iframe
                    title="Clinic Location"
                    src={getEmbedMapUrl(doctor.googleMapsUrl)}
                    width="100%"
                    height="100%"
                    style={{ border: 0, filter: 'invert(90%) hue-rotate(180deg) grayscale(10%)' }}
                    allowFullScreen=""
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              ) : (
                <p className="text-slate-500 text-xs italic">No geographic location mapped for this doctor profile.</p>
              )}
            </div>
          )}

        </div>
      </motion.div>
    </div>
  );
};

export default DoctorProfileModal;
