import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserPlus, Mail, Lock, User, Key, Building, Loader2, Calendar, Phone, ChevronRight, ChevronLeft, Check, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import axiosInstance from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import GlassCard from '../../components/common/GlassCard';
import GlassInput from '../../components/common/GlassInput';
import GlassButton from '../../components/common/GlassButton';

const checkPasswordStrength = (pass) => {
  if (!pass) return { score: 0, text: 'Empty', color: 'bg-slate-800' };
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

const Register = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const initialRole = searchParams.get('role') || 'patient';

  const [role, setRole] = useState(initialRole);
  const [step, setStep] = useState(1); // 1 = Credentials, 2 = Profile Metadata

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    nic: '',
    licenseNo: '',
    specialization: '',
    pharmacyId: '60d5ecb8b392d700153ee6b2', // Mock Object ID for testing
    dateOfBirth: '',
    contactInfo: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const getEndpointAndPayload = () => {
    if (role === 'doctor') {
      return {
        url: '/auth/register',
        payload: {
          fullName: formData.fullName,
          email: formData.email,
          password: formData.password,
          licenseNo: formData.licenseNo,
          specialization: formData.specialization
        }
      };
    } else if (role === 'pharmacist') {
      return {
        url: '/auth/register-pharmacy',
        payload: {
          fullName: formData.fullName,
          email: formData.email,
          password: formData.password,
          pharmacyId: formData.pharmacyId,
          role: 'pharmacist'
        }
      };
    } else {
      // Default to patient
      return {
        url: '/auth/register-patient',
        payload: {
          fullName: formData.fullName,
          email: formData.email,
          password: formData.password,
          nic: formData.nic,
          dateOfBirth: formData.dateOfBirth,
          contactInfo: formData.contactInfo
        }
      };
    }
  };

  const validateStep1 = () => {
    if (!formData.fullName.trim()) { toast.error('Full Name is required'); return false; }
    if (!formData.email.trim() || !formData.email.includes('@')) { toast.error('Valid Email Address is required'); return false; }
    if (formData.password.length < 6) { toast.error('Password must be at least 6 characters'); return false; }
    if (formData.password !== formData.confirmPassword) { toast.error('Passwords do not match'); return false; }
    return true;
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    
    setLoading(true);
    setError(null);

    try {
      const { url, payload } = getEndpointAndPayload();
      await axiosInstance.post(url, payload);
      
      toast.success('Registration successful! Please login.');
      navigate(`/${role === 'pharmacist' ? 'pharmacy' : role}/login`);
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Registration failed. Please try again.';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const strength = checkPasswordStrength(formData.password);

  const labelClass = 'text-xs font-semibold uppercase text-slate-500 ml-1 select-none';

  return (
    <div className="min-h-screen bg-[#0b1120] flex items-center justify-center p-4 relative overflow-hidden pt-20 pb-20">
      {/* Background orbs */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-500/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-blue-500/5 blur-[120px] rounded-full pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg z-10 relative"
      >
        <GlassCard className="p-8">
          
          {/* Header */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20 mb-4 shadow-[0_0_15px_rgba(79,70,229,0.1)] select-none">
              <UserPlus className="w-7 h-7 text-indigo-400" />
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Create Account</h2>
            <p className="text-slate-400 text-xs mt-1.5 font-medium">Join the secure MediSync healthcare network</p>
          </div>

          {/* Stepper Progress bar */}
          <div className="flex items-center justify-between mb-8 px-8 select-none">
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black border transition-all ${
                step === 1 
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' 
                  : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-450'
              }`}>
                {step > 1 ? <Check className="w-3.5 h-3.5" /> : '1'}
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${step === 1 ? 'text-white' : 'text-slate-500'}`}>Credentials</span>
            </div>
            <div className="flex-1 h-0.5 mx-4 bg-slate-800" />
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black border transition-all ${
                step === 2 
                  ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' 
                  : 'bg-slate-950/40 border-white/5 text-slate-550'
              }`}>
                2
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${step === 2 ? 'text-white' : 'text-slate-500'}`}>Specifications</span>
            </div>
          </div>

          {/* Role selector tab buttons (Locked once in step 2 to avoid validation issues) */}
          {step === 1 && (
            <div className="flex gap-2 mb-6 bg-slate-950/40 p-1.5 rounded-xl border border-white/5 select-none">
              {['patient', 'doctor', 'pharmacist'].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg capitalize transition-all ${
                    role === r 
                      ? 'bg-indigo-600 text-white shadow-lg border border-indigo-500/30' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-bold text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4">
            
            {/* STEP 1: Account credentials */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Full Name</label>
                  <GlassInput type="text" name="fullName" required icon={User} value={formData.fullName} onChange={handleChange} placeholder="John Doe" />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Email Address</label>
                  <GlassInput type="email" name="email" required icon={Mail} value={formData.email} onChange={handleChange} placeholder="you@example.com" />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className={labelClass}>Password</label>
                  <GlassInput type="password" name="password" required icon={Lock} value={formData.password} onChange={handleChange} placeholder="••••••••" />
                  {/* Password strength meter */}
                  {formData.password && (
                    <div className="pt-1.5 select-none">
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
                  <label className={labelClass}>Confirm Password</label>
                  <GlassInput type="password" name="confirmPassword" required icon={Lock} value={formData.confirmPassword} onChange={handleChange} placeholder="••••••••" />
                  {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                    <p className="text-[10px] text-rose-400 font-bold select-none mt-1">Passwords do not match</p>
                  )}
                </div>

                <GlassButton type="button" onClick={() => { if (validateStep1()) setStep(2); }} className="w-full mt-6 flex justify-center items-center gap-1">Continue <ChevronRight className="w-4 h-4" /></GlassButton>
              </div>
            )}

            {/* STEP 2: Role Profile Metadata details */}
            {step === 2 && (
              <div className="space-y-4">
                {role === 'patient' && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className={labelClass}>National ID (NIC) *</label>
                      <GlassInput type="text" name="nic" required icon={Key} value={formData.nic} onChange={handleChange} placeholder="199012345678" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className={labelClass}>Date of Birth</label>
                        <GlassInput type="date" name="dateOfBirth" required icon={Calendar} value={formData.dateOfBirth} onChange={handleChange} />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className={labelClass}>Contact No</label>
                        <GlassInput type="text" name="contactInfo" required icon={Phone} value={formData.contactInfo} onChange={handleChange} placeholder="+94..." />
                      </div>
                    </div>
                  </>
                )}

                {role === 'doctor' && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className={labelClass}>Medical License No *</label>
                      <GlassInput type="text" name="licenseNo" required icon={Key} value={formData.licenseNo} onChange={handleChange} placeholder="SLMC-12345" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className={labelClass}>Specialization *</label>
                      <GlassInput type="text" name="specialization" required icon={User} value={formData.specialization} onChange={handleChange} placeholder="Cardiologist" />
                    </div>
                  </>
                )}

                {role === 'pharmacist' && (
                  <div className="flex flex-col gap-1.5">
                    <label className={labelClass}>Pharmacy Reference ID *</label>
                    <GlassInput type="text" name="pharmacyId" required icon={Building} value={formData.pharmacyId} onChange={handleChange} />
                    <p className="text-[10px] text-slate-500 select-none ml-1">Contact your pharmacy administrator to obtain your workspace reference ID.</p>
                  </div>
                )}

                <div className="flex gap-3 pt-6 border-t border-white/5">
                  <GlassButton variant="secondary" type="button" onClick={() => setStep(1)} className="flex-1 flex justify-center items-center gap-1"><ChevronLeft className="w-4 h-4" /> Back</GlassButton>
                  <GlassButton type="submit" isLoading={loading} className="flex-1 flex justify-center items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" /> Create Account
                  </GlassButton>
                </div>
              </div>
            )}

            <div className="mt-6 text-center select-none border-t border-white/5 pt-4">
              <button 
                type="button" 
                onClick={() => navigate(`/${role === 'pharmacist' ? 'pharmacy' : role}/login`)} 
                className="text-xs text-slate-400 hover:text-white transition-colors"
              >
                Already have an account? Sign in here
              </button>
            </div>
          </form>

        </GlassCard>
      </motion.div>
    </div>
  );
};

export default Register;
