import { trustedMapEmbedUrl as getEmbedMapUrl } from '../../utils/trustedMapEmbed';
import { useTranslation } from '../../i18n/LanguageContext';
import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Star, MapPin, MessageSquare, Quote, BookOpen, Phone, Globe, PhoneCall, Building2 } from 'lucide-react';
import api from '../../api/axiosInstance';




const HospitalProfileModal = ({ hospital: initialHospital, onClose }) => {
  const hospital = initialHospital;
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [reviewsError, setReviewsError] = useState(false);



  const [activeTab, setActiveTab] = useState('about'); // 'about', 'reviews', 'location'

  const isPatient = process.env.REACT_APP_UNIVERSITY_RUNTIME !== 'true' && localStorage.getItem('role') === 'patient';
  const { t } = useTranslation();

  // Lock body scroll and handle Escape key dismissal (DEF-A11Y-01)
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const fetchReviews = useCallback(async () => {
    if (process.env.REACT_APP_UNIVERSITY_RUNTIME === 'true') { setReviewsError(true); setLoadingReviews(false); return; }
    setLoadingReviews(true); setReviewsError(false);
    try {
      const res = await api.get(`/reviews/${hospital._id}`);
      setReviews(res.data.data || []);
    } catch (err) {
      setReviewsError(true);
    } finally {
      setLoadingReviews(false);
    }
  }, [hospital._id]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);


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
        role="dialog"
        aria-modal="true"
        aria-labelledby="hospital-modal-title"
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
            type="button"
            onClick={onClose}
            aria-label="Close modal"
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
              <h2 id="hospital-modal-title" className="text-xl font-bold text-white mb-1 leading-tight">{hospital.name}</h2>
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
                      <span className="text-[9px] font-black text-emerald-450 block uppercase tracking-wider">{t("public.pickupLocation", "Pickup Location")}</span>
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
                  <a href="/patient/dashboard/history" className="inline-block text-teal-400 underline">{t('public.reviewViaHistory', 'Review a verified visit from your medical history')}</a>
                </div>
              )}

              <div className="space-y-3">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" /> Recent Reviews List
                </h3>
                
                {loadingReviews ? (
                  <p className="text-slate-500 text-xs py-4">{t("public.loadingTestimonials", "Loading testimonials...")}</p>
                ) : reviewsError ? (<div role="alert">{t('public.reviewsUnavailable', 'Reviews unavailable. Please try again.')} <button type="button" onClick={fetchReviews}>{t('serviceStatus.retry', 'Try again')}</button></div>) : reviews.length > 0 ? (
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
                  <p className="text-slate-500 text-xs italic">{t("public.noTestimonials", "No patient testimonials logged yet.")}</p>
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
              {process.env.REACT_APP_UNIVERSITY_RUNTIME !== 'true' && getEmbedMapUrl(hospital.googleMapsUrl) ? (
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
