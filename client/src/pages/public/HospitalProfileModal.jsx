import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Star, MapPin, MessageSquare, Quote, BookOpen, Phone, Globe, PhoneCall, Building2 } from 'lucide-react';
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

const HospitalProfileModal = ({ hospital: initialHospital, onClose }) => {
  const [hospital, setHospital] = useState(initialHospital);
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
      const res = await api.get(`/reviews/${hospital._id}`);
      setReviews(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch reviews', err);
    } finally {
      setLoadingReviews(false);
    }
  }, [hospital._id]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.post('/reviews', {
        targetId: hospital._id,
        targetModel: 'Hospital',
        rating,
        comment: comment.trim()
      });
      toast.success('Thank you for your feedback!');
      setComment('');
      setRating(5);
      await fetchReviews();
      
      if (res.data.stats) {
        setHospital(prev => ({
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
            <div className="w-20 h-20 rounded-xl overflow-hidden bg-gradient-to-br from-indigo-600 to-blue-500 border border-white/10 flex items-center justify-center text-white text-3xl font-black shadow-lg">
              {hospital.profilePicture ? (
                <img src={hospital.profilePicture} alt={hospital.name} className="w-full h-full object-cover" />
              ) : (
                <Building2 className="w-8 h-8 text-indigo-400" />
              )}
            </div>
            <div className="text-left">
              <h2 className="text-xl font-bold text-white mb-1 leading-tight">{hospital.name}</h2>
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                  hospital.type === 'government' ? 'bg-blue-500/15 border border-blue-500/25 text-blue-400' : 'bg-emerald-500/15 border border-emerald-500/25 text-emerald-400'
                }`}>
                  {hospital.type}
                </span>
                {hospital.averageRating > 0 && (
                  <div className="flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 text-[10px] font-bold text-amber-400">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    <span>{hospital.averageRating}</span>
                    {hospital.ratingCount > 0 && <span className="opacity-60"> ({hospital.ratingCount})</span>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tab Selection Row */}
        <div className="flex border-b border-white/5 bg-slate-950/20 px-6 select-none">
          {[
            { id: 'about', label: 'Facility Profile' },
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
              {hospital.description && (
                <div className="glass-panel p-5 rounded-xl border border-white/5">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2.5 flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-indigo-400" /> Facility Profile
                  </h3>
                  <p className="text-slate-300 text-xs leading-relaxed font-medium whitespace-pre-line">
                    {hospital.description}
                  </p>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="glass-panel p-4 rounded-xl border border-white/5">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-indigo-400" /> Geographic Info
                  </h3>
                  <p className="text-white text-xs font-bold leading-tight">{hospital.address || 'Colombo, Sri Lanka'}</p>
                  <p className="text-[10px] text-slate-500 mt-1">District: {hospital.district || 'Unknown'}</p>
                  
                  {hospital.pickupLocationAddress && (
                    <div className="mt-3 pt-3 border-t border-white/5">
                      <span className="text-[9px] font-black text-emerald-450 block uppercase tracking-wider">Pickup Location</span>
                      <span className="text-slate-300 text-xs mt-0.5 block leading-normal">{hospital.pickupLocationAddress}</span>
                    </div>
                  )}
                </div>

                <div className="glass-panel p-4 rounded-xl border border-white/5 space-y-2">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Contact & Portal Link
                  </h3>
                  {hospital.contactPhone && (
                    <div className="flex items-center gap-2 text-slate-350 text-xs">
                      <Phone className="w-4 h-4 text-slate-500 shrink-0" />
                      <span>{hospital.contactPhone}</span>
                    </div>
                  )}
                  {hospital.emergencyHotline && (
                    <div className="flex items-center gap-2 text-rose-455 text-xs font-bold">
                      <PhoneCall className="w-4 h-4 text-rose-455 shrink-0 animate-pulse" />
                      <span>Emergency Hotline: {hospital.emergencyHotline}</span>
                    </div>
                  )}
                  {hospital.website && (
                    <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold">
                      <Globe className="w-4 h-4 text-slate-500 shrink-0" />
                      <a 
                        href={hospital.website.startsWith('http') ? hospital.website : `https://${hospital.website}`} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="hover:underline"
                      >
                        {hospital.website}
                      </a>
                    </div>
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
                    Rate this Medical Facility
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
                        placeholder="Detail your consulting experience at this hospital..."
                        required
                        className="w-full bg-slate-950/40 border border-white/5 rounded-xl p-3 text-xs text-white placeholder-slate-600 focus:border-indigo-500 focus:outline-none resize-none transition-colors"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submitting || !comment.trim()}
                      className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50"
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
              {hospital.googleMapsUrl ? (
                <div className="w-full h-64 rounded-xl overflow-hidden border border-white/5 shadow-2xl relative bg-slate-950/40">
                  <iframe
                    title="Hospital Location"
                    src={getEmbedMapUrl(hospital.googleMapsUrl)}
                    width="100%"
                    height="100%"
                    style={{ border: 0, filter: 'invert(90%) hue-rotate(180deg) grayscale(10%)' }}
                    allowFullScreen=""
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              ) : (
                <p className="text-slate-500 text-xs italic">No geographic location mapped for this hospital profile.</p>
              )}
            </div>
          )}

        </div>
      </motion.div>
    </div>
  );
};

export default HospitalProfileModal;
