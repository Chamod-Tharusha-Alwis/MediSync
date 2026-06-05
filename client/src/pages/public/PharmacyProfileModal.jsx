import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Star, MapPin, MessageSquare, Quote, BookOpen, Phone, ShieldCheck } from 'lucide-react';
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

const PharmacyProfileModal = ({ pharmacy: initialPharmacy, onClose }) => {
  const [pharmacy, setPharmacy] = useState(initialPharmacy);
  const [reviews, setReviews] = useState([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
      const res = await api.get(`/reviews/${pharmacy._id}`);
      setReviews(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch reviews', err);
    } finally {
      setLoadingReviews(false);
    }
  }, [pharmacy._id]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  const handleReviewSubmit = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.post('/reviews', {
        targetId: pharmacy._id,
        targetModel: 'Pharmacy',
        rating,
        comment: comment.trim()
      });
      toast.success('Thank you for your feedback!');
      setComment('');
      setRating(5);
      await fetchReviews();
      
      // Update local pharmacy average rating & count
      if (res.data.stats) {
        setPharmacy(prev => ({
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
        <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-8 text-white relative">
          <button 
            onClick={onClose}
            className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-2xl overflow-hidden bg-white/20 border-2 border-white/40 flex items-center justify-center text-4xl font-bold backdrop-blur-md shadow-inner">
              {pharmacy.profilePicture ? (
                <img src={pharmacy.profilePicture} alt={pharmacy.name} className="w-full h-full object-cover" />
              ) : (
                pharmacy.name?.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <h2 className="text-3xl font-bold mb-1">{pharmacy.name}</h2>
              {pharmacy.isActive && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-white/15 text-white rounded-full text-xs font-bold shadow-sm">
                  <ShieldCheck className="w-3.5 h-3.5" /> E-Prescription Ready
                </span>
              )}
              
              <div className="flex items-center gap-4 mt-3">
                <div className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/10">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  <span className="font-bold">{pharmacy.averageRating > 0 ? pharmacy.averageRating : 'New'}</span>
                  {pharmacy.ratingCount > 0 && <span className="text-white/60 text-sm">({pharmacy.ratingCount})</span>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="p-8 overflow-y-auto custom-scrollbar flex-1 space-y-8 bg-slate-50">
          
          {/* Biography/Description */}
          {pharmacy.description && (
            <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-amber-500" /> Pharmacy Profile
              </h3>
              <p className="text-slate-700 leading-relaxed font-medium whitespace-pre-line">{pharmacy.description}</p>
            </section>
          )}

          {/* Location Map */}
          {pharmacy.googleMapsUrl && (
            <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-rose-500" /> Location Map
              </h3>
              <div className="w-full h-64 rounded-2xl overflow-hidden border border-slate-200">
                <iframe
                  title="Pharmacy Location"
                  src={getEmbedMapUrl(pharmacy.googleMapsUrl)}
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  allowFullScreen=""
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </section>
          )}

          {/* Contact Details */}
          <section className="grid sm:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4" /> Location
              </h3>
              <p className="text-slate-700 font-medium">{pharmacy.address || 'Sri Lanka'}</p>
              <p className="text-slate-500 text-xs mt-1">District: {pharmacy.district || 'Unknown'}</p>
              {pharmacy.pickupLocationAddress && (
                <div className="mt-4 pt-4 border-t border-slate-100 flex items-start gap-2.5">
                  <MapPin className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-xs font-bold text-emerald-600 block uppercase tracking-wider">Prescription Pickup Location</span>
                    <span className="text-sm text-slate-700 font-medium">{pharmacy.pickupLocationAddress}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-center">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                Contact Phone
              </h3>
              {pharmacy.phone ? (
                <div className="flex items-center gap-2 text-slate-700 text-sm font-medium">
                  <Phone className="w-4 h-4 text-amber-500" />
                  <span>{pharmacy.phone}</span>
                </div>
              ) : (
                <p className="text-slate-500 italic text-sm">No phone number listed.</p>
              )}
            </div>
          </section>

          {/* Write a Review Section */}
          {isPatient && (
            <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" /> Rate this Pharmacy
              </h3>
              <form onSubmit={handleReviewSubmit} className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-slate-600 text-sm font-semibold">Your Rating:</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        className="hover:scale-110 transition-transform"
                      >
                        <Star className={`w-6 h-6 ${star <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <textarea
                    rows={3}
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="Share your experience at this pharmacy..."
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-800 focus:border-amber-500 focus:outline-none resize-none transition-colors"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting || !comment.trim()}
                  className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold transition-all disabled:opacity-50 text-sm flex items-center gap-2 shadow-[0_4px_12px_rgba(245,158,11,0.2)]"
                >
                  {submitting ? 'Submitting...' : 'Submit Review'}
                </button>
              </form>
            </section>
          )}

          {/* Patient Reviews List */}
          <section>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Patient Feedback
            </h3>
            
            {loadingReviews ? (
              <div className="text-center py-6 text-slate-400 text-sm">Loading reviews...</div>
            ) : reviews.length > 0 ? (
              <div className="space-y-4">
                {reviews.map((review, i) => (
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    key={review._id} 
                    className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative"
                  >
                    <Quote className="absolute top-4 right-4 w-8 h-8 text-slate-100 rotate-180" />
                    <div className="flex gap-1 mb-2">
                      {[...Array(5)].map((_, j) => (
                        <Star key={j} className={`w-4 h-4 ${j < review.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                      ))}
                    </div>
                    <p className="text-slate-700 italic relative z-10 leading-relaxed text-sm">"{review.comment}"</p>
                    <div className="flex justify-between items-center mt-3 text-xs text-slate-400 font-medium">
                      <span>Reviewed by {review.reviewerName || 'Anonymous'}</span>
                      <span>{new Date(review.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center text-slate-500">
                <Star className="w-10 h-10 mx-auto text-slate-200 mb-3" />
                <p className="text-sm">No reviews available yet.</p>
              </div>
            )}
          </section>
        </div>
      </motion.div>
    </div>
  );
};

export default PharmacyProfileModal;
