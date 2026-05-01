import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await axiosInstance.post('/auth/login', {
        email,
        password,
        role: 'doctor'
      });

      const { accessToken, role, name } = response.data.data;
      
      localStorage.setItem('token', accessToken);
      localStorage.setItem('role', role || 'doctor');
      localStorage.setItem('userRole', role || 'doctor');
      if (name) localStorage.setItem('userName', name);

      toast.success('Login successful!');
      navigate('/doctor/dashboard');
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to authenticate. Please check your credentials.';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b1120] flex items-center justify-center p-4 relative overflow-hidden">
      <motion.div 
        animate={{ scale: [1, 1.2, 1], rotate: [0, 90, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-teal-500/10 blur-[120px] rounded-full pointer-events-none" 
      />
      
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md z-10 relative"
      >
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl p-8 overflow-hidden">
          
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-teal-500 via-cyan-400 to-teal-500" />

          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-slate-800/80 rounded-2xl flex items-center justify-center border border-slate-700/50 mb-4 shadow-lg">
              <Stethoscope className="w-8 h-8 text-teal-400" />
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">Doctor Workspace</h2>
            <p className="text-slate-400 text-sm mt-2">Sign in to manage your practice</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-300 ml-1">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-700 bg-slate-800/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  placeholder="doctor@medisync.local"
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
                  className="block w-full pl-10 pr-3 py-3 border border-slate-700 bg-slate-800/50 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center py-3 px-4 border border-teal-600/50 rounded-xl shadow-sm text-sm font-medium text-white bg-teal-600/80 hover:bg-teal-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 focus:ring-offset-[#0b1120] transition-colors disabled:opacity-70 disabled:cursor-not-allowed mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" />
                  Signing In...
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
          </form>

        </div>
      </motion.div>
    </div>
  );
};

export default DoctorLogin;
