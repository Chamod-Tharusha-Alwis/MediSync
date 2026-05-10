import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, Stethoscope, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import axiosInstance from '../../api/axiosInstance';
import { toast } from 'react-toastify';

const DoctorLogin = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const loginType = searchParams.get('type') || 'personal';

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Authenticate
      const response = await axiosInstance.post('/auth/login', {
        email,
        password,
        role: 'doctor',
        loginType // backend might use this for verification later
      });

      const data = response.data.data;
      const { accessToken, role, name, orgLogins } = data;
      
      localStorage.setItem('token', accessToken);
      localStorage.setItem('role', role || 'doctor');
      localStorage.setItem('userRole', role || 'doctor');
      if (name) localStorage.setItem('userName', name);

      // 2. Handle routing based on selected type
      if (loginType === 'hospital') {
        const activeOrgs = (orgLogins || []).filter(o => o.isActive);
        if (activeOrgs.length === 0) {
          throw new Error('No active hospital affiliations found for this account.');
        }

        // For simplicity, we auto-select the first affiliated hospital
        // (A more advanced implementation would let them choose if they have multiple)
        const org = activeOrgs[0];
        
        // 3. First login check for hospital accounts
        if (org.isFirstLogin) {
          navigate(`/doctor/change-org-password?orgLoginId=${org._id}`);
          return;
        }

        localStorage.setItem('loginType', 'hospital');
        localStorage.setItem('sessionHospitalId', org.hospitalId);
        if (org.hospitalName) {
          localStorage.setItem('sessionHospitalName', org.hospitalName);
        }
      } else {
        localStorage.setItem('loginType', 'personal');
        localStorage.removeItem('sessionHospitalId');
        localStorage.removeItem('sessionHospitalName');
      }

      toast.success(`Logged in to ${loginType === 'hospital' ? 'Hospital' : 'Personal'} Workspace`);
      navigate('/doctor/dashboard');

    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to authenticate. Please check your credentials.';
      setError(errorMsg);
      toast.error(errorMsg);
      
      // Clean up failed login state
      localStorage.removeItem('token');
      localStorage.removeItem('role');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b1120] flex items-center justify-center p-4 relative overflow-hidden">
      <motion.div 
        animate={{ scale: [1, 1.2, 1], rotate: [0, 90, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] blur-[120px] rounded-full pointer-events-none ${
          loginType === 'hospital' ? 'bg-cyan-500/10' : 'bg-blue-500/10'
        }`} 
      />
      
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md z-10 relative"
      >
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl p-8 overflow-hidden">
          
          <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${
            loginType === 'hospital' ? 'from-teal-500 via-cyan-400 to-teal-500' : 'from-blue-500 via-indigo-400 to-blue-500'
          }`} />

          <div className="flex flex-col items-center mb-8">
            <div className={`w-16 h-16 bg-slate-800/80 rounded-2xl flex items-center justify-center border border-slate-700/50 mb-4 shadow-lg`}>
              <Stethoscope className={`w-8 h-8 ${loginType === 'hospital' ? 'text-cyan-400' : 'text-blue-400'}`} />
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              {loginType === 'hospital' ? 'Hospital Login' : 'Personal Login'}
            </h2>
            <p className="text-slate-400 text-sm mt-2">Sign in to your doctor workspace</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-300 ml-1">
                {loginType === 'hospital' ? 'Hospital Org Email' : 'Personal Email'}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`block w-full pl-10 pr-3 py-3 border border-slate-700 bg-slate-800/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
                    loginType === 'hospital' ? 'focus:ring-cyan-500' : 'focus:ring-blue-500'
                  }`}
                  placeholder={loginType === 'hospital' ? "org.doctor@hospital.lk" : "doctor@medisync.local"}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-300 ml-1">Password</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`block w-full pl-10 pr-3 py-3 border border-slate-700 bg-slate-800/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:border-transparent transition-all ${
                    loginType === 'hospital' ? 'focus:ring-cyan-500' : 'focus:ring-blue-500'
                  }`}
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white transition-colors disabled:opacity-70 disabled:cursor-not-allowed mt-2 ${
                loginType === 'hospital'
                  ? 'bg-cyan-600/80 hover:bg-cyan-600 focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 focus:ring-offset-[#0b1120]'
                  : 'bg-blue-600/80 hover:bg-blue-600 focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-offset-[#0b1120]'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" />
                  Authenticating...
                </>
              ) : (
                'Sign In'
              )}
            </button>

            <div className="mt-4 text-center">
              <button type="button" onClick={() => navigate('/register?role=doctor')} className="text-sm text-slate-400 hover:text-white transition-colors">
                Don't have an account? Register here
              </button>
            </div>
            
            <div className="mt-2 text-center">
              <button type="button" onClick={() => navigate('/doctor/select-role')} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                ← Back to Login Type Selection
              </button>
            </div>
          </form>

        </div>
      </motion.div>
    </div>
  );
};

export default DoctorLogin;
