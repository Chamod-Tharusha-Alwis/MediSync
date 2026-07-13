import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, User, ArrowLeft, ShieldCheck, Award, Activity, Loader2 } from 'lucide-react';
import axios from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';

const SPECIALIZATIONS = [
  'General Physician','Cardiologist','Dermatologist','Endocrinologist','Gastroenterologist',
  'General Surgeon','Gynecologist','Hematologist','Neurologist','Nephrologist','Oncologist',
  'Ophthalmologist','Orthopedic Surgeon','Pediatrician','Psychiatrist','Pulmonologist',
  'Radiologist','Rheumatologist','Urologist','ENT Specialist','Anesthesiologist','Pathologist'
];

const checkPasswordStrength = (pass) => {
  if (!pass) return { score: 0, text: 'Empty', color: 'bg-slate-850' };
  let score = 0;
  if (pass.length >= 8) score++;
  if (/[A-Z]/.test(pass)) score++;
  if (/[0-9]/.test(pass)) score++;
  if (/[^A-Za-z0-9]/.test(pass)) score++;

  if (score === 1) return { score: 25, text: 'Weak', color: 'bg-rose-500' };
  if (score === 2) return { score: 50, text: 'Moderate', color: 'bg-amber-500' };
  if (score === 3) return { score: 75, text: 'Good', color: 'bg-blue-500' };
  if (score === 4) return { score: 100, text: 'Strong', color: 'bg-emerald-500' };
  return { score: 10, text: 'Very Weak', color: 'bg-rose-600' };
};

const labelCls = "block text-xs font-semibold text-slate-400 mb-1.5 uppercase select-none";

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

  const strength = checkPasswordStrength(form.password);

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-200 flex flex-col items-center justify-center p-4 relative overflow-hidden pt-20 pb-20">
      {/* Background orbs */}
      <div className="absolute top-0 right-0 w-[550px] h-[550px] bg-teal-500/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[550px] h-[550px] bg-blue-500/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="relative z-10 w-full max-w-lg mx-4">
        {/* Header */}
        <div className="text-center mb-6 select-none">
          <Link to="/doctor/login" className="inline-flex items-center gap-1 text-slate-500 hover:text-white text-xs font-bold uppercase tracking-wider mb-5 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Login
          </Link>
          <div className="w-14 h-14 bg-teal-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-teal-500/20 shadow-[0_0_15px_rgba(20,184,166,0.1)]">
            <Activity className="w-7 h-7 text-teal-400" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">Doctor Registration</h1>
          <p className="text-slate-400 text-xs mt-1.5 font-medium">Join the MediSync healthcare provider network</p>
        </div>

        {/* Step Indicator */}
        {step < 3 && (
          <div className="flex items-center justify-between mb-8 px-8 select-none">
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black border transition-all ${
                step === 1 
                  ? 'bg-teal-600 border-teal-600 text-white shadow-lg' 
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-450'
              }`}>
                {step > 1 ? '✓' : '1'}
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${step === 1 ? 'text-white' : 'text-slate-500'}`}>Credentials</span>
            </div>
            <div className="flex-1 h-0.5 mx-4 bg-slate-800" />
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black border transition-all ${
                step === 2 
                  ? 'bg-teal-600 border-teal-600 text-white shadow-lg' 
                  : 'bg-slate-950/40 border-white/5 text-slate-555'
              }`}>
                2
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${step === 2 ? 'text-white' : 'text-slate-500'}`}>Practitioner Detail</span>
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="step1"
              initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }}
              className="bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-2xl p-8 shadow-2xl space-y-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider select-none border-b border-white/5 pb-2">Login Credentials</h2>
              
              <div className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Email Address *</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4.5 w-4.5 text-slate-550" />
                    <input type="email" value={form.email} onChange={set('email')}
                      className="block w-full pl-10 pr-3 py-2.5 border border-slate-700 bg-slate-800/50 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all" 
                      placeholder="doctor@hospital.com" required />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Password *</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4.5 w-4.5 text-slate-555" />
                    <input type={showPw ? 'text' : 'password'} value={form.password} onChange={set('password')}
                      className="block w-full pl-10 pr-10 py-2.5 border border-slate-700 bg-slate-800/50 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all" 
                      placeholder="Min 8 characters" required />
                    <button type="button" onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-550 hover:text-slate-300">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {form.password && (
                    <div className="pt-1 select-none">
                      <div className="flex justify-between items-center text-[9px] font-bold text-slate-500 uppercase">
                        <span>Strength</span>
                        <span className="text-slate-350">{strength.text}</span>
                      </div>
                      <div className="w-full bg-slate-950 h-1 mt-1 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-350 ${strength.color}`} style={{ width: `${strength.score}%` }} />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelCls}>Confirm Password *</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4.5 w-4.5 text-slate-555" />
                    <input type={showCPw ? 'text' : 'password'} value={form.confirmPassword} onChange={set('confirmPassword')}
                      className="block w-full pl-10 pr-10 py-2.5 border border-slate-700 bg-slate-800/50 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all" 
                      placeholder="Repeat password" required />
                    <button type="button" onClick={() => setShowCPw(!showCPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-555 hover:text-slate-300">
                      {showCPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {form.confirmPassword && form.password !== form.confirmPassword && (
                    <p className="text-[10px] text-rose-455 font-bold select-none mt-1">Passwords do not match</p>
                  )}
                </div>
              </div>

              <button 
                onClick={() => {
                  if (!form.email || !form.password || !form.confirmPassword) { toast.error('All credential fields are required'); return; }
                  if (form.password !== form.confirmPassword) { toast.error('Passwords do not match'); return; }
                  setStep(2);
                }}
                className="w-full mt-6 bg-teal-600 hover:bg-teal-500 text-white py-2.5 rounded-xl text-xs font-bold transition-all shadow-[0_0_15px_rgba(20,184,166,0.15)]"
              >
                Continue Step 2 →
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.form key="step2" onSubmit={handleSubmit}
              initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }}
              className="bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-2xl p-8 shadow-2xl space-y-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider select-none border-b border-white/5 pb-2">Professional details</h2>
              
              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Full Name *</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4.5 w-4.5 text-slate-550" />
                  <input type="text" value={form.fullName} onChange={set('fullName')}
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-700 bg-slate-800/50 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all" 
                    placeholder="Dr. Full Name" required />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>SLMC License Number *</label>
                <div className="relative">
                  <Award className="absolute left-3 top-3 h-4.5 w-4.5 text-slate-555" />
                  <input type="text" value={form.licenseNo} onChange={set('licenseNo')}
                    className="block w-full pl-10 pr-3 py-2.5 border border-slate-700 bg-slate-800/50 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all" 
                    placeholder="e.g. SLMC-12345" required />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className={labelCls}>Specialization *</label>
                <select value={form.specialization} onChange={set('specialization')} required
                  className="block w-full px-3 py-2.5 border border-slate-700 bg-slate-800/50 rounded-xl text-white text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all">
                  <option value="" className="bg-slate-900">Select Specialization</option>
                  {SPECIALIZATIONS.map(s => <option key={s} value={s} className="bg-slate-900">{s}</option>)}
                </select>
              </div>

              <div className="flex gap-3 pt-6 border-t border-white/5">
                <button type="button" onClick={() => setStep(1)}
                  className="flex-1 py-2.5 rounded-xl border border-white/5 text-slate-400 hover:text-white text-xs font-bold transition-all"
                >
                  ← Back
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 bg-teal-600 hover:bg-teal-500 text-white py-2.5 rounded-xl text-xs font-bold flex items-center justify-center shadow-[0_0_15px_rgba(20,184,166,0.15)]"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Register Account'}
                </button>
              </div>
            </motion.form>
          )}

          {step === 3 && (
            <motion.div key="step3"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-2xl p-10 shadow-2xl text-center select-none space-y-5">
              <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/25 mx-auto">
                <ShieldCheck className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gradient-teal tracking-tight">Registration Successful!</h2>
                <p className="text-slate-400 text-xs mt-2 leading-relaxed">
                  Your doctor profile has been submitted. You can now login to your practitioner workspace.
                </p>
              </div>
              <button
                onClick={() => navigate('/doctor/login')}
                className="w-full bg-teal-600 hover:bg-teal-500 text-white py-2.5 rounded-xl text-xs font-bold transition-all shadow-[0_0_15px_rgba(20,184,166,0.15)]"
              >
                Go to Login Portal
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {step < 3 && (
          <p className="text-center text-slate-500 text-xs mt-6 select-none">
            Already registered? <Link to="/doctor/login" className="text-white font-semibold hover:underline">Sign in here</Link>
          </p>
        )}
      </div>
    </div>
  );
}
