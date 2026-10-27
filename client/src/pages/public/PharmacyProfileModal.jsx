import { trustedMapEmbedUrl as getEmbedMapUrl } from '../../utils/trustedMapEmbed';
import { useTranslation } from '../../i18n/LanguageContext';
import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Star, MapPin, MessageSquare, Quote, BookOpen, Phone, ShieldCheck } from 'lucide-react';
import api from '../../api/axiosInstance';




const PharmacyProfileModal = ({ pharmacy: initialPharmacy, onClose }) => {
  const pharmacy = initialPharmacy;
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [reviewsError, setReviewsError] = useState(false);



  const [activeTab, setActiveTab] = useState('about'); // 'about', 'reviews', 'location'

  const isPatient = process.env.REACT_APP_UNIVERSITY_RUNTIME !== 'true' && localStorage.getItem('role') === 'patient';
  const { t } = useTranslation();

  // Match the other directory dialogs without releasing an existing scroll lock.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = event => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const fetchReviews = useCallback(async () => {
    if (process.env.REACT_APP_UNIVERSITY_RUNTIME === 'true') { setReviewsError(true); setLoadingReviews(false); return; }
    setLoadingReviews(true); setReviewsError(false);
    try {
      const res = await api.get(`/reviews/${pharmacy._id}`);
      setReviews(res.data.data || []);
    } catch (err) {
      setReviewsError(true);
    } finally {
      setLoadingReviews(false);
    }
  }, [pharmacy._id]);

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
        aria-labelledby="pharmacy-modal-title"
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
            <div className="w-20 h-20 rounded-xl overflow-hidden bg-gradient-to-br from-emerald-500 to-teal-400 border border-white/10 flex items-center justify-center text-white text-3xl font-black shadow-lg">
              {pharmacy.profilePicture ? (
                <img src={pharmacy.profilePicture} alt={pharmacy.name} className="w-full h-full object-cover" />
              ) : (
                pharmacy.name?.charAt(0).toUpperCase()
              )}
            </div>
            <div className="text-left">
              <h2 id="pharmacy-modal-title" className="text-xl font-bold text-white mb-1 leading-tight">{pharmacy.name}</h2>
              <div className="flex items-center gap-2">
                {pharmacy.isActive && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-500/15 border border-emerald-500/25 text-emerald-450 rounded-full text-[9px] font-black shadow-sm">
                    <ShieldCheck className="w-3.5 h-3.5" /> E-Prescription Ready
                  </span>
                )}
                {pharmacy.averageRating > 0 && (
                  <div className="flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 text-[10px] font-bold text-amber-450">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    <span>{pharmacy.averageRating}</span>
                    {pharmacy.ratingCount > 0 && <span className="opacity-60"> ({pharmacy.ratingCount})</span>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Tab Selection Row */}
        <div className="flex border-b border-white/5 bg-slate-950/20 px-6 select-none">
          {[
            { id: 'about', label: 'Pharmacy Profile' },
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
              {pharmacy.description && (
                <div className="glass-panel p-5 rounded-xl border border-white/5">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2.5 flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-emerald-450" /> Pharmacy Profile
                  </h3>
                  <p className="text-slate-300 text-xs leading-relaxed font-medium whitespace-pre-line">
                    {pharmacy.description}
                  </p>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="glass-panel p-4 rounded-xl border border-white/5">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-emerald-450" /> Geographic Info
                  </h3>
                  <p className="text-white text-xs font-bold leading-tight">{pharmacy.address || 'Sri Lanka'}</p>
                  <p className="text-[10px] text-slate-500 mt-1">District: {pharmacy.district || 'Unknown'}</p>
                  
                  {pharmacy.pickupLocationAddress && (
                    <div className="mt-3 pt-3 border-t border-white/5">
                      <span className="text-[9px] font-black text-emerald-450 block uppercase tracking-wider">{t("public.pickupLocation", "Pickup Location")}</span>
                      <span className="text-slate-300 text-xs mt-0.5 block leading-normal">{pharmacy.pickupLocationAddress}</span>
                    </div>
                  )}
                </div>

                <div className="glass-panel p-4 rounded-xl border border-white/5 flex flex-col justify-center">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
                    Contact Info
                  </h3>
                  {pharmacy.phone ? (
                    <div className="flex items-center gap-2 text-slate-350 text-xs font-bold">
                      <Phone className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>{pharmacy.phone}</span>
                    </div>
                  ) : (
                    <p className="text-slate-500 italic text-xs">No phone number listed.</p>
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
                    Rate this Pharmacy
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
              {process.env.REACT_APP_UNIVERSITY_RUNTIME !== 'true' && getEmbedMapUrl(pharmacy.googleMapsUrl) ? (
                <div className="w-full h-64 rounded-xl overflow-hidden border border-white/5 shadow-2xl relative bg-slate-950/40">
                  <iframe
                    title="Pharmacy Location"
                    src={getEmbedMapUrl(pharmacy.googleMapsUrl)}
                    width="100%"
                    height="100%"
                    style={{ border: 0, filter: 'invert(90%) hue-rotate(180deg) grayscale(10%)' }}
                    allowFullScreen=""
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              ) : (
                <p className="text-slate-500 text-xs italic">No geographic location mapped for this pharmacy profile.</p>
              )}
            </div>
          )}

        </div>
      </motion.div>
    </div>
  );
};

export default PharmacyProfileModal;
