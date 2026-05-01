import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { FiMail, FiLock, FiEye, FiEyeOff, FiUser, FiArrowLeft, FiCheckCircle, FiAward, FiActivity } from 'react-icons/fi';
import axios from '../../api/axiosInstance';
import { toast } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';

const SPECIALIZATIONS = [
  'General Physician','Cardiologist','Dermatologist','Endocrinologist','Gastroenterologist',
  'General Surgeon','Gynecologist','Hematologist','Neurologist','Nephrologist','Oncologist',
  'Ophthalmologist','Orthopedic Surgeon','Pediatrician','Psychiatrist','Pulmonologist',
  'Radiologist','Rheumatologist','Urologist','ENT Specialist','Anesthesiologist','Pathologist'
];

const inputCls = "w-full pl-10 pr-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/40 transition-all backdrop-blur-sm";
const labelCls = "block text-sm font-semibold text-white/90 mb-1";

export default function DoctorRegister() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showCPw, setShowCPw] = useState(false);
  const [form, setForm] = useState({
    email: '', password: '', confirmPassword: '',
    fullName: '', licenseNo: '', specialization: ''
  });

  const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) { toast.error('Passwords do not match'); return; }
    setLoading(true);
    try {
      await axios.post('/auth/register', {
        email: form.email,
        password: form.password,
        fullName: form.fullName,
        licenseNo: form.licenseNo,
        specialization: form.specialization
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
      style={{ background: 'linear-gradient(135deg, #0d1b3e 0%, #1a3a6e 50%, #0a6ea4 100%)' }}>

      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(5)].map((_, i) => (
          <motion.div key={i}
            className="absolute rounded-full opacity-5"
            style={{ width: `${200 + i * 100}px`, height: `${200 + i * 100}px`, background: 'white', left: `${i * 20}%`, top: `${i * 15}%` }}
            animate={{ y: [0, -30, 0], rotate: [0, 10, 0] }}
            transition={{ duration: 6 + i, repeat: Infinity, ease: 'easeInOut', delay: i * 0.7 }}
          />
        ))}
      </div>

      <div className="relative z-10 w-full max-w-2xl mx-4 my-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <Link to="/doctor/login" className="inline-flex items-center gap-2 text-white/60 hover:text-white text-sm mb-6 transition-colors">
            <FiArrowLeft /> Back to Login
          </Link>
          <div className="w-16 h-16 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/20">
            <FiActivity className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Doctor Registration</h1>
          <p className="text-white/60 mt-2">Join the MediSync provider network</p>
        </motion.div>

        {/* Steps */}
        {step < 3 && (
          <div className="flex items-center justify-center gap-3 mb-8">
            {[1, 2].map(s => (
              <React.Fragment key={s}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${step >= s ? 'bg-white text-blue-800' : 'bg-white/15 text-white/50'}`}>{s}</div>
                {s < 2 && <div className={`w-16 h-0.5 ${step > s ? 'bg-white' : 'bg-white/20'}`} />}
              </React.Fragment>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* Step 1 – Credentials */}
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl space-y-5">
              <h2 className="text-xl font-bold text-white">Login Credentials</h2>
              <div>
                <label className={labelCls}>Email Address *</label>
                <div className="relative">
                  <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
                  <input type="email" value={form.email} onChange={set('email')} className={inputCls} placeholder="doctor@hospital.com" required />
                </div>
              </div>
              <div>
                <label className={labelCls}>Password *</label>
                <div className="relative">
                  <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
                  <input type={showPw ? 'text' : 'password'} value={form.password} onChange={set('password')} className={`${inputCls} pr-12`} placeholder="Min 8 chars, 1 uppercase, 1 number" required />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white">
                    {showPw ? <FiEyeOff /> : <FiEye />}
                  </button>
                </div>
              </div>
              <div>
                <label className={labelCls}>Confirm Password *</label>
                <div className="relative">
                  <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
                  <input type={showCPw ? 'text' : 'password'} value={form.confirmPassword} onChange={set('confirmPassword')} className={`${inputCls} pr-12`} placeholder="Repeat password" required />
                  <button type="button" onClick={() => setShowCPw(!showCPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white">
                    {showCPw ? <FiEyeOff /> : <FiEye />}
                  </button>
                </div>
              </div>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={() => {
                  if (!form.email || !form.password || !form.confirmPassword) { toast.error('All credential fields are required'); return; }
                  if (form.password !== form.confirmPassword) { toast.error('Passwords do not match'); return; }
                  setStep(2);
                }}
                className="w-full mt-2 bg-white text-blue-800 py-3 rounded-xl font-bold shadow-lg hover:bg-white/90 transition-all">
                Next →
              </motion.button>
            </motion.div>
          )}

          {/* Step 2 – Professional Info */}
          {step === 2 && (
            <motion.form key="s2" onSubmit={handleSubmit}
              initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl space-y-5">
              <h2 className="text-xl font-bold text-white">Professional Details</h2>
              <div>
                <label className={labelCls}>Full Name *</label>
                <div className="relative">
                  <FiUser className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
                  <input type="text" value={form.fullName} onChange={set('fullName')} className={inputCls} placeholder="Dr. Full Name" required />
                </div>
              </div>
              <div>
                <label className={labelCls}>SLMC License Number *</label>
                <div className="relative">
                  <FiAward className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" />
                  <input type="text" value={form.licenseNo} onChange={set('licenseNo')} className={inputCls} placeholder="e.g. SLMC-12345" required />
                </div>
              </div>
              <div>
                <label className={labelCls}>Specialization *</label>
                <select value={form.specialization} onChange={set('specialization')} required
                  className={inputCls.replace('pl-10', 'pl-4')}>
                  <option value="" className="text-gray-800">Select specialization</option>
                  {SPECIALIZATIONS.map(s => <option key={s} value={s} className="text-gray-800">{s}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setStep(1)}
                  className="flex-1 py-3 rounded-xl font-bold border border-white/30 text-white hover:bg-white/10 transition-all">← Back</button>
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  type="submit" disabled={loading}
                  className="flex-1 bg-white text-blue-800 py-3 rounded-xl font-bold shadow-lg hover:bg-white/90 flex items-center justify-center gap-2 transition-all">
                  {loading ? <div className="w-5 h-5 border-2 border-blue-800/30 border-t-blue-800 rounded-full animate-spin" /> : 'Register Account'}
                </motion.button>
              </div>
            </motion.form>
          )}

          {/* Step 3 – Success */}
          {step === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-10 shadow-2xl text-center">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }}>
                <FiCheckCircle className="w-20 h-20 text-green-400 mx-auto mb-6" />
              </motion.div>
              <h2 className="text-3xl font-bold text-white mb-3">Registration Successful!</h2>
              <p className="text-white/70 mb-8">Your doctor account has been created. You can now sign in with your email and password.</p>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => navigate('/doctor/login')}
                className="bg-white text-blue-800 px-10 py-3 rounded-xl font-bold shadow-lg hover:bg-white/90 transition-all">
                Go to Login
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {step < 3 && (
          <p className="text-center text-white/50 text-sm mt-6">
            Already have an account? <Link to="/doctor/login" className="text-white font-semibold hover:underline">Sign in</Link>
          </p>
        )}
      </div>
    </div>
  );
}
