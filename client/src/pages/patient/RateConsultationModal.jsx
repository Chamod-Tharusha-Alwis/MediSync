import React, { useState, useEffect } from 'react';
import { Star, User, Building2, Pill, ShieldCheck, Lock } from 'lucide-react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import Modal from '../../components/ui/Modal';

const RateConsultationModal = ({ show, onClose, consultation, onRated }) => {
  const [ratings, setRatings] = useState({
    Doctor: { rating: 0, comment: '', isSubmitted: false },
    Hospital: { rating: 0, comment: '', isSubmitted: false },
    Pharmacy: { rating: 0, comment: '', isSubmitted: false }
  });
  
  const [hoverRating, setHoverRating] = useState({
    Doctor: 0,
    Hospital: 0,
    Pharmacy: 0
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
  const hospital = consultation.hospitalId || consultation.sessionHospitalId || null;
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
      [entity]: { ...prev[entity], comment: value.slice(0, 500) } // hard limit to 500 chars
    }));
  };

  const handleSubmit = async () => {
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
      const promises = submissions.map(sub => 
        api.post('/reviews', {
          ...sub,
          consultationId: consultation._id
        })
      );
      
      const results = await Promise.all(promises);
      toast.success('Your feedback has been submitted successfully.');

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

  const hasDoctor = true;
  const hasHospital = !!hospital && hasApprovedOrCompletedLabs;
  const hasPharmacy = !!dispensedPrescription && !!pharmacy;

  const allSubmitted = 
    (!hasDoctor || ratings.Doctor.isSubmitted) &&
    (!hasHospital || ratings.Hospital.isSubmitted) &&
    (!hasPharmacy || ratings.Pharmacy.isSubmitted);

  const renderRatingSection = (title, entityName, displayName, subtitle, icon, iconColor, themeGlow) => {
    const Icon = icon;
    const { rating, comment, isSubmitted } = ratings[entityName];
    const currentActiveRating = hoverRating[entityName] || rating;

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
                  onMouseEnter={() => !isSubmitted && setHoverRating(prev => ({ ...prev, [entityName]: star }))}
                  onMouseLeave={() => !isSubmitted && setHoverRating(prev => ({ ...prev, [entityName]: 0 }))}
                  className={`transition-all duration-200 ${isSubmitted ? 'cursor-default' : 'hover:scale-110 active:scale-95'}`}
                >
                  <Star className={`w-6 h-6 transition-colors duration-150 ${
                    star <= currentActiveRating
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
                maxLength={500}
                onChange={e => handleCommentChange(entityName, e.target.value)}
                placeholder={`Tell us about your experience with this ${title.toLowerCase()}...`}
                className="w-full bg-slate-950/60 border border-slate-800/80 rounded-xl px-4 py-2.5 text-xs text-slate-300 focus:border-teal-500/50 focus:ring-2 focus:ring-teal-500/10 focus:outline-none resize-none transition-all disabled:opacity-75 disabled:text-slate-400"
              />
              {!isSubmitted && (
                <div className="flex justify-end text-[10px] text-slate-500 mt-1 select-none font-mono">
                  {comment.length} / 500 characters
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Modal
      isOpen={show}
      onClose={onClose}
      title="Rate Consultation"
      size="md"
    >
      <div className="flex flex-col gap-6">
        <p className="text-slate-400 text-sm leading-relaxed">
          Provide secure, confidential feedback on your recent healthcare experience. Your feedback is helpful in maintaining our clinical quality standards.
        </p>

        <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1 custom-scrollbar">
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

        <div className="pt-4 border-t border-white/5 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium select-none">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>HIPAA Compliant & Encrypted</span>
          </div>
          
          {allSubmitted ? (
            <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800/80 text-slate-400 text-xs font-bold border border-slate-700/50">
              <Lock className="w-3.5 h-3.5" /> Reviews Locked
            </span>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-500 hover:to-teal-400 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-40 shadow-[0_4px_12px_rgba(20,184,166,0.2)]"
            >
              {submitting ? 'Submitting...' : 'Submit Ratings'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default RateConsultationModal;
