import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Lock, Stethoscope, Loader2 } from 'lucide-react';
import axiosInstance from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import LoginShell from '../../components/common/LoginShell';

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
        loginType
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
      
      localStorage.removeItem('token');
      localStorage.removeItem('role');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LoginShell
      title={loginType === 'hospital' ? 'Hospital Workspace Login' : 'Personal Workspace Login'}
      subtitle="Sign in to your practitioner account portal"
      icon={Stethoscope}
      error={error}
      onSubmit={handleLogin}
      themeColor="teal"
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase text-slate-500 ml-1">
            {loginType === 'hospital' ? 'Hospital Org Email' : 'Personal Email'}
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-3 h-4.5 w-4.5 text-slate-500" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="glass-input block w-full pl-10 pr-3 py-2.5 text-xs"
              placeholder={loginType === 'hospital' ? "org.doctor@hospital.lk" : "doctor@medisync.local"}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase text-slate-500 ml-1">Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-3 h-4.5 w-4.5 text-slate-500" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="glass-input block w-full pl-10 pr-3 py-2.5 text-xs"
              placeholder="••••••••"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="glass-button w-full flex justify-center items-center py-2.5 px-4 text-xs font-bold disabled:opacity-70 mt-2"
        >
          {loading ? (
            <><Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" /> Authenticating...</>
          ) : (
            'Sign In'
          )}
        </button>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => navigate('/register?role=doctor')}
            className="text-xs text-slate-500 hover:text-white transition-colors"
          >
            Don't have an account? Register here
          </button>
        </div>
        
        <div className="mt-2 text-center">
          <button
            type="button"
            onClick={() => navigate('/doctor/select-role')}
            className="text-[10px] uppercase font-bold text-slate-500 hover:text-slate-300 transition-colors"
          >
            ← Back to Login Type Selection
          </button>
        </div>
      </div>
    </LoginShell>
  );
};

export default DoctorLogin;
