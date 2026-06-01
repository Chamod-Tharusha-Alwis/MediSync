import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserPlus, Mail, Lock, User, Key, Building, Loader2, Calendar, Phone } from 'lucide-react';
import { motion } from 'framer-motion';
import axiosInstance from '../../api/axiosInstance';
import { toast } from 'react-toastify';

const Register = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const initialRole = searchParams.get('role') || 'patient';

  const [role, setRole] = useState(initialRole);
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
      // Navigate to respective login
      navigate(`/${role === 'pharmacist' ? 'pharmacy' : role}/login`);
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Registration failed. Please try again.';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b1120] flex items-center justify-center p-4 relative overflow-hidden pt-20 pb-20">
      {/* Background elements */}
      <motion.div 
        animate={{ scale: [1, 1.2, 1], rotate: [0, 90, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        className="absolute top-0 right-0 -translate-y-1/4 translate-x-1/4 w-[600px] h-[600px] bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" 
      />
      <motion.div 
        animate={{ scale: [1, 1.5, 1], rotate: [0, -90, 0] }}
        transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
        className="absolute bottom-0 left-0 translate-y-1/4 -translate-x-1/4 w-[600px] h-[600px] bg-blue-500/10 blur-[120px] rounded-full pointer-events-none" 
      />

      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg z-10 relative"
      >
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl p-8">
          
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-indigo-600/20 rounded-2xl flex items-center justify-center border border-indigo-500/30 mb-4 shadow-[0_0_15px_rgba(79,70,229,0.2)]">
              <UserPlus className="w-8 h-8 text-indigo-400" />
            </div>
            <h2 className="text-3xl font-bold text-white tracking-tight">Create Account</h2>
            <p className="text-slate-400 text-sm mt-2">Join the MediSync ecosystem</p>
          </div>

          <div className="flex gap-2 mb-6 bg-slate-800/50 p-1.5 rounded-xl border border-slate-700/50">
            {['patient', 'doctor', 'pharmacist'].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`flex-1 py-2 text-sm font-medium rounded-lg capitalize transition-all ${
                  role === r 
                    ? 'bg-indigo-600 text-white shadow-lg' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
              {error}
            </motion.div>
          )}

          <form onSubmit={handleRegister} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-300 ml-1">Full Name</label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
                <input type="text" name="fullName" required value={formData.fullName} onChange={handleChange} className="block w-full pl-10 pr-3 py-3 border border-slate-700 bg-slate-800/50 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" placeholder="John Doe" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-300 ml-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
                <input type="email" name="email" required value={formData.email} onChange={handleChange} className="block w-full pl-10 pr-3 py-3 border border-slate-700 bg-slate-800/50 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all" placeholder="you@example.com" />
              </div>
            </div>

            {role === 'patient' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300 ml-1">National ID (NIC)</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
                    <input type="text" name="nic" required value={formData.nic} onChange={handleChange} className="block w-full pl-10 pr-3 py-3 border border-slate-700 bg-slate-800/50 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="199012345678" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-300 ml-1">Date of Birth</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
                      <input type="date" name="dateOfBirth" required value={formData.dateOfBirth} onChange={handleChange} className="block w-full pl-10 pr-3 py-3 border border-slate-700 bg-slate-800/50 rounded-xl text-white focus:ring-2 focus:ring-indigo-500" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-slate-300 ml-1">Contact No</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
                      <input type="text" name="contactInfo" required value={formData.contactInfo} onChange={handleChange} className="block w-full pl-10 pr-3 py-3 border border-slate-700 bg-slate-800/50 rounded-xl text-white focus:ring-2 focus:ring-indigo-500" placeholder="+94..." />
                    </div>
                  </div>
                </div>
              </>
            )}

            {role === 'doctor' && (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300 ml-1">Medical License No</label>
                  <div className="relative">
                    <Key className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
                    <input type="text" name="licenseNo" required value={formData.licenseNo} onChange={handleChange} className="block w-full pl-10 pr-3 py-3 border border-slate-700 bg-slate-800/50 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="SLMC-12345" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-300 ml-1">Specialization</label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
                    <input type="text" name="specialization" required value={formData.specialization} onChange={handleChange} className="block w-full pl-10 pr-3 py-3 border border-slate-700 bg-slate-800/50 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="Cardiologist" />
                  </div>
                </div>
              </>
            )}

            {role === 'pharmacist' && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-300 ml-1">Pharmacy Reference ID</label>
                <div className="relative">
                  <Building className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
                  <input type="text" name="pharmacyId" required value={formData.pharmacyId} onChange={handleChange} className="block w-full pl-10 pr-3 py-3 border border-slate-700 bg-slate-800/50 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 transition-all" />
                </div>
                <p className="text-xs text-slate-500 ml-1 mt-1">Obtain your Pharmacy ID from your administrator</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-300 ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
                <input type="password" name="password" required value={formData.password} onChange={handleChange} className="block w-full pl-10 pr-3 py-3 border border-slate-700 bg-slate-800/50 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="••••••••" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-300 ml-1">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-slate-500" />
                <input type="password" name="confirmPassword" required value={formData.confirmPassword} onChange={handleChange} className="block w-full pl-10 pr-3 py-3 border border-slate-700 bg-slate-800/50 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="••••••••" />
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full flex justify-center items-center py-3 px-4 border border-indigo-600/50 rounded-xl shadow-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 focus:ring-offset-[#0b1120] transition-all disabled:opacity-70 mt-6">
              {loading ? <><Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5" /> Creating Account...</> : 'Register'}
            </button>
            
            <div className="mt-4 text-center">
              <button type="button" onClick={() => navigate(`/${role === 'pharmacist' ? 'pharmacy' : role}/login`)} className="text-sm text-slate-400 hover:text-white transition-colors">
                Already have an account? Sign in here
              </button>
            </div>
          </form>

        </div>
      </motion.div>
    </div>
  );
};

export default Register;
