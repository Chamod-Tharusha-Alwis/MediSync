import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star, User, Building2, Pill, ShieldCheck, Lock } from 'lucide-react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';

const RateConsultationModal = ({ show, onClose, consultation, onRated }) => {
  const [ratings, setRatings] = useState({
    Doctor: { rating: 0, comment: '', isSubmitted: false },
    Hospital: { rating: 0, comment: '', isSubmitted: false },
    Pharmacy: { rating: 0, comment: '', isSubmitted: false }
  });
  
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!consultation) return;

    const existingReviews = consultation.reviews || [];
    const docReview = existingReviews.find(r => r.targetModel === 'Doctor');
    const hospReview = existingReviews.find(r => r.targetModel === 'Hospital');
    const pharmReview = existingReviews.find(r => r.targetModel === 'Pharmacy');

    setRatings({
      Doctor: {
        rating: docReview ? docReview.rating : 0,
        comment: docReview ? docReview.comment : '',
        isSubmitted: !!docReview
      },
      Hospital: {
        rating: hospReview ? hospReview.rating : 0,
        comment: hospReview ? hospReview.comment : '',
        isSubmitted: !!hospReview
      },
      Pharmacy: {
        rating: pharmReview ? pharmReview.rating : 0,
        comment: pharmReview ? pharmReview.comment : '',
        isSubmitted: !!pharmReview
      }
    });
  }, [consultation]);

  if (!show || !consultation) return null;

  const doctor = consultation.doctorId || {};
  
  // Hospital can be either hospitalId or sessionHospitalId or both
  const hospital = consultation.hospitalId || consultation.sessionHospitalId || null;

  // Find pharmacy if prescription was dispensed
  const dispensedPrescription = (consultation.prescriptions || []).find(p => p.status === 'dispensed');
  const pharmacy = dispensedPrescription ? (dispensedPrescription.dispensedBy || { name: dispensedPrescription.pharmacyName }) : null;

  const handleStarClick = (entity, value) => {
    if (ratings[entity].isSubmitted) return;
    setRatings(prev => ({
      ...prev,
      [entity]: { ...prev[entity], rating: value }
    }));
  };

  const handleCommentChange = (entity, value) => {
    if (ratings[entity].isSubmitted) return;
    setRatings(prev => ({
      ...prev,
      [entity]: { ...prev[entity], comment: value }
    }));
  };

  const handleSubmit = async () => {
    // Determine which entities need review submission (rating > 0 and not yet submitted)
    const submissions = [];
    
    if (doctor._id && ratings.Doctor.rating > 0 && !ratings.Doctor.isSubmitted) {
      submissions.push({
        targetId: doctor._id,
        targetModel: 'Doctor',
        rating: ratings.Doctor.rating,
        comment: ratings.Doctor.comment
      });
    }

    if (hospital && hospital._id && ratings.Hospital.rating > 0 && !ratings.Hospital.isSubmitted) {
      submissions.push({
        targetId: hospital._id,
        targetModel: 'Hospital',
        rating: ratings.Hospital.rating,
        comment: ratings.Hospital.comment
      });
    }

    if (pharmacy && pharmacy._id && ratings.Pharmacy.rating > 0 && !ratings.Pharmacy.isSubmitted) {
      submissions.push({
        targetId: pharmacy._id,
        targetModel: 'Pharmacy',
        rating: ratings.Pharmacy.rating,
        comment: ratings.Pharmacy.comment
      });
    }

    if (submissions.length === 0) {
      return toast.warning('Please rate at least one new entity before submitting.');
    }

    setSubmitting(true);
    try {
      // Execute all submissions in parallel
      const promises = submissions.map(sub => 
        api.post('/reviews', {
          ...sub,
          consultationId: consultation._id
        })
      );
      
      const results = await Promise.all(promises);
      toast.success('Your feedback has been submitted successfully.');

      // Extract new reviews from responses
      const newReviews = results.map(res => res.data.data);
      
      if (onRated) {
        onRated(consultation._id, newReviews);
      }
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit reviews');
    } finally {
      setSubmitting(false);
    }
  };

  const hasApprovedOrCompletedLabs = (consultation.labTests || []).some(lt => {
    if (!lt) return false;
    const status = typeof lt === 'string' ? 'Pending' : (lt.status || 'Pending');
    const sl = status.toLowerCase();
    return sl === 'approved' || sl === 'completed' || sl === 'report_ready';
  });

  // Check if everything involved is already submitted
  const hasDoctor = true; // ALWAYS show the Doctor rating section
  const hasHospital = !!hospital && hasApprovedOrCompletedLabs;
  const hasPharmacy = !!dispensedPrescription && !!pharmacy;

  const allSubmitted = 
    (!hasDoctor || ratings.Doctor.isSubmitted) &&
    (!hasHospital || ratings.Hospital.isSubmitted) &&
    (!hasPharmacy || ratings.Pharmacy.isSubmitted);

  const renderRatingSection = (title, entityName, displayName, subtitle, icon, iconColor, themeGlow) => {
    const Icon = icon;
    const { rating, comment, isSubmitted } = ratings[entityName];

    return (
      <div className="relative p-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 overflow-hidden group">
        <div className={`absolute top-0 left-0 w-1 h-full bg-gradient-to-b ${themeGlow}`} />
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-xl bg-slate-800/80 border border-slate-700/30 ${iconColor}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{title}</span>
              {isSubmitted && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                  <Lock className="w-2.5 h-2.5" /> Read-Only
                </span>
              )}
            </div>
            <h4 className="text-base font-bold text-white truncate mt-1">{displayName}</h4>
            <p className="text-xs text-slate-400 truncate">{subtitle}</p>

            {/* Stars */}
            <div className="flex items-center gap-1.5 mt-3">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  type="button"
                  disabled={isSubmitted}
                  onClick={() => handleStarClick(entityName, star)}
                  className={`transition-all duration-200 ${isSubmitted ? 'cursor-default' : 'hover:scale-110'}`}
                >
                  <Star className={`w-6 h-6 ${
                    star <= rating
                      ? 'text-amber-400 fill-amber-400 filter drop-shadow-[0_0_6px_rgba(251,191,36,0.4)]'
                      : 'text-slate-700'
                  }`} />
                </button>
              ))}
            </div>

            {/* Comment */}
            <div className="mt-3">
              <textarea
                rows={2}
                disabled={isSubmitted}
                value={comment}
                onChange={e => handleCommentChange(entityName, e.target.value)}
                placeholder={`Tell us about your experience with this ${title.toLowerCase()}...`}
                className="w-full bg-slate-950/60 border border-slate-800/80 rounded-xl px-4 py-2.5 text-xs text-slate-300 focus:border-blue-500 focus:outline-none resize-none transition-colors disabled:opacity-75 disabled:text-slate-400"
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-[#040814]/75 backdrop-blur-md"
        />

        {/* Modal body */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          className="relative w-full max-w-lg bg-[#0b1329]/90 border border-white/5 rounded-3xl shadow-2xl overflow-hidden z-10 flex flex-col max-h-[90vh]"
        >
          {/* Top colored line indicator */}
          <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 via-purple-500 to-emerald-500" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-6 right-6 p-2 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-full transition-all"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Header */}
          <div className="p-8 pb-4">
            <h3 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              Rate Consultation
            </h3>
            <p className="text-slate-400 text-sm mt-1">
              Provide secure, HIPAA-compliant feedback on your healthcare providers.
            </p>
          </div>

          {/* Roster Items */}
          <div className="p-8 pt-0 overflow-y-auto space-y-4 flex-1 custom-scrollbar">
            {hasDoctor && renderRatingSection(
              'Doctor', 
              'Doctor', 
              doctor.fullName || 'Consulting Doctor', 
              doctor.specialization || 'Medical Specialist', 
              User, 
              'text-blue-400', 
              'from-blue-500 to-cyan-500'
            )}

            {hasHospital && renderRatingSection(
              'Hospital', 
              'Hospital', 
              hospital.name, 
              hospital.district || 'Clinical Facility', 
              Building2, 
              'text-purple-400', 
              'from-purple-500 to-pink-500'
            )}

            {hasPharmacy && renderRatingSection(
              'Pharmacy', 
              'Pharmacy', 
              pharmacy.name, 
              'Dispensed Location', 
              Pill, 
              'text-emerald-400', 
              'from-emerald-500 to-teal-500'
            )}
          </div>

          {/* Footer */}
          <div className="p-8 pt-4 border-t border-slate-900 bg-slate-950/20 flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Feedback is encrypted & confidential</span>
            </div>
            
            {allSubmitted ? (
              <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 text-slate-400 text-xs font-bold border border-slate-700/50">
                <Lock className="w-3.5 h-3.5" /> Reviews Locked
              </span>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-40 shadow-[0_4px_12px_rgba(37,99,235,0.2)]"
              >
                {submitting ? 'Submitting...' : 'Submit Ratings'}
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default RateConsultationModal;
