import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FiUser, FiLock, FiEye, FiEyeOff, FiPhone, FiCalendar, FiMapPin, FiArrowLeft, FiCheckCircle } from 'react-icons/fi';
import axios from '../../api/axiosInstance';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const DISTRICTS = [
  'Colombo','Gampaha','Kalutara','Kandy','Matale','Nuwara Eliya',
  'Galle','Matara','Hambantota','Jaffna','Kilinochchi','Mannar',
  'Vavuniya','Mullaitivu','Batticaloa','Ampara','Trincomalee',
  'Kurunegala','Puttalam','Anuradhapura','Polonnaruwa','Badulla',
  'Monaragala','Ratnapura','Kegalle'
];

const BLOOD_GROUPS = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];

const inputCls = "w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/40 focus:border-white/40 transition-all backdrop-blur-sm";
const labelCls = "block text-sm font-semibold text-white/90 mb-1";

export default function PatientRegister() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    nic: '', password: '', confirmPassword: '', fullName: '',
    dateOfBirth: '', gender: '', district: '', contactInfo: '',
    bloodGroup: '', allergies: ''
  });

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const [showPw, setShowPw] = useState(false);
  const [showCPw, setShowCPw] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await axios.post('/patient/register', {
        nic: form.nic.toUpperCase(),
        password: form.password,
        fullName: form.fullName,
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender || undefined,
        district: form.district || undefined,
        contactInfo: form.contactInfo || undefined,
        bloodGroup: form.bloodGroup || undefined,
        allergies: form.allergies ? form.allergies.split(',').map(a => a.trim()) : []
      });
      setStep(3);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0a4f6e 0%, #0d7a8a 40%, #1a9e8f 100%)' }}>

      {/* Animated Background Blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(6)].map((_, i) => (
          <motion.div key={i}
            className="absolute rounded-full opacity-10"
            style={{
              width: `${150 + i * 80}px`, height: `${150 + i * 80}px`,
              background: 'white',
              left: `${10 + i * 15}%`, top: `${5 + i * 12}%`,
            }}
            animate={{ y: [0, -20, 0], scale: [1, 1.05, 1] }}
            transition={{ duration: 4 + i, repeat: Infinity, ease: 'easeInOut', delay: i * 0.5 }}
          />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-2xl mx-4 my-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <Link to="/patient/login" className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm mb-6 transition-colors">
            <FiArrowLeft /> Back to Login
          </Link>
          <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl border border-white/30">
            🧑‍⚕️
          </div>
          <h1 className="text-3xl font-bold text-white">Patient Registration</h1>
          <p className="text-white/70 mt-2">Join MediSync for a unified healthcare experience</p>
        </motion.div>

        {/* Step Indicator */}
        {step < 3 && (
          <div className="flex items-center justify-center gap-3 mb-8">
            {[1, 2].map(s => (
              <React.Fragment key={s}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  step >= s ? 'bg-white text-teal-700' : 'bg-white/20 text-white/60'
                }`}>{s}</div>
                {s < 2 && <div className={`w-16 h-0.5 transition-all ${step > s ? 'bg-white' : 'bg-white/20'}`} />}
              </React.Fragment>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1"
              initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl">
              <h2 className="text-xl font-bold text-white mb-6">Account Credentials</h2>
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>NIC Number *</label>
                  <div className="relative">
                    <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
                    <input type="text" value={form.nic} onChange={set('nic')}
                      className={inputCls} placeholder="e.g. 981234567V" required />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Password *</label>
                  <div className="relative">
                    <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
                    <input type={showPw ? 'text' : 'password'} value={form.password} onChange={set('password')}
                      className={`${inputCls} pr-12`} placeholder="Min 8 characters" required />
                    <button type="button" onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80">
                      {showPw ? <FiEyeOff /> : <FiEye />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Confirm Password *</label>
                  <div className="relative">
                    <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
                    <input type={showCPw ? 'text' : 'password'} value={form.confirmPassword} onChange={set('confirmPassword')}
                      className={`${inputCls} pr-12`} placeholder="Repeat password" required />
                    <button type="button" onClick={() => setShowCPw(!showCPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80">
                      {showCPw ? <FiEyeOff /> : <FiEye />}
                    </button>
                  </div>
                </div>
              </div>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={() => {
                  if (!form.nic || !form.password || !form.confirmPassword) { toast.error('Please fill all required fields'); return; }
                  if (form.password !== form.confirmPassword) { toast.error('Passwords do not match'); return; }
                  setStep(2);
                }}
                className="w-full mt-6 bg-white text-teal-700 py-3 rounded-xl font-bold shadow-lg hover:bg-white/90 transition-all">
                Next Step →
              </motion.button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.form key="step2" onSubmit={handleSubmit}
              initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl space-y-4">
              <h2 className="text-xl font-bold text-white mb-2">Personal Information</h2>
              <div>
                <label className={labelCls}>Full Name *</label>
                <div className="relative">
                  <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
                  <input type="text" value={form.fullName} onChange={set('fullName')}
                    className={inputCls} placeholder="Your full legal name" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Date of Birth</label>
                  <div className="relative">
                    <FiCalendar className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
                    <input type="date" value={form.dateOfBirth} onChange={set('dateOfBirth')}
                      className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Gender</label>
                  <select value={form.gender} onChange={set('gender')}
                    className={inputCls.replace('pl-10', 'pl-4')}>
                    <option value="" className="text-gray-800">Select</option>
                    <option value="Male" className="text-gray-800">Male</option>
                    <option value="Female" className="text-gray-800">Female</option>
                    <option value="Other" className="text-gray-800">Other</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>District</label>
                  <div className="relative">
                    <FiMapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50 z-10" />
                    <select value={form.district} onChange={set('district')}
                      className={inputCls}>
                      <option value="" className="text-gray-800">Select</option>
                      {DISTRICTS.map(d => <option key={d} value={d} className="text-gray-800">{d}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Blood Group</label>
                  <select value={form.bloodGroup} onChange={set('bloodGroup')}
                    className={inputCls.replace('pl-10', 'pl-4')}>
                    <option value="" className="text-gray-800">Select</option>
                    {BLOOD_GROUPS.map(b => <option key={b} value={b} className="text-gray-800">{b}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className={labelCls}>Contact Number</label>
                <div className="relative">
                  <FiPhone className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
                  <input type="tel" value={form.contactInfo} onChange={set('contactInfo')}
                    className={inputCls} placeholder="07X XXXXXXX" />
                </div>
              </div>
              <div>
                <label className={labelCls}>Known Allergies <span className="text-white/50 font-normal">(comma-separated)</span></label>
                <input type="text" value={form.allergies} onChange={set('allergies')}
                  className={inputCls.replace('pl-10', 'pl-4')} placeholder="e.g. Penicillin, Aspirin" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setStep(1)}
                  className="flex-1 py-3 rounded-xl font-bold border border-white/30 text-white hover:bg-white/10 transition-all">
                  ← Back
                </button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  type="submit" disabled={loading}
                  className="flex-1 bg-white text-teal-700 py-3 rounded-xl font-bold shadow-lg hover:bg-white/90 transition-all flex items-center justify-center">
                  {loading ? <div className="w-5 h-5 border-2 border-teal-700/30 border-t-teal-700 rounded-full animate-spin" /> : 'Create Account'}
                </motion.button>
              </div>
            </motion.form>
          )}

          {step === 3 && (
            <motion.div key="step3"
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-10 shadow-2xl text-center">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }}>
                <FiCheckCircle className="w-20 h-20 text-white mx-auto mb-6" />
              </motion.div>
              <h2 className="text-3xl font-bold text-white mb-3">Registration Successful!</h2>
              <p className="text-white/70 mb-8">Your patient account has been created. You can now log in with your NIC number and password.</p>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/patient/login')}
                className="bg-white text-teal-700 px-10 py-3 rounded-xl font-bold shadow-lg hover:bg-white/90 transition-all">
                Go to Login
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {step < 3 && (
          <p className="text-center text-white/60 text-sm mt-6">
            Already registered? <Link to="/patient/login" className="text-white font-semibold hover:underline">Sign in here</Link>
          </p>
        )}
      </div>
    </div>
  );
}
