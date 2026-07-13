import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, HeartPulse, Loader2 } from 'lucide-react';
import axiosInstance from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import LoginShell from '../../components/common/LoginShell';

const PatientLogin = () => {
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
        role: 'patient'
      });

      const { accessToken, role, subId, name } = response.data.data;

      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('token', accessToken);
      localStorage.setItem('role', role || 'patient');
      localStorage.setItem('userRole', role || 'patient');
      if (subId) localStorage.setItem('nic', subId);
      if (name) localStorage.setItem('name', name);
      if (name) localStorage.setItem('userName', name);

      toast.success('Login successful!');
      navigate('/patient/dashboard');
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to authenticate. Please check your credentials.';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LoginShell
      title="Patient Portal"
      subtitle="Sign in to access your personal medical records"
      icon={HeartPulse}
      error={error}
      onSubmit={handleLogin}
      themeColor="violet"
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase text-slate-500 ml-1">Email Address</label>
          <div className="relative">
            <Mail className="absolute left-3 top-3 h-4.5 w-4.5 text-slate-500" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="glass-input block w-full pl-10 pr-3 py-2.5 text-xs"
              placeholder="patient@example.com"
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
            <><Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" /> Signing In...</>
          ) : (
            'Sign In'
          )}
        </button>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => navigate('/register?role=patient')}
            className="text-xs text-slate-500 hover:text-white transition-colors"
          >
            Don't have an account? Register here
          </button>
        </div>
      </div>
    </LoginShell>
  );
};

export default PatientLogin;
