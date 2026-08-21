import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Building} from 'lucide-react';
import axiosInstance from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import LoginShell from '../../components/common/LoginShell';
import GlassInput from '../../components/common/GlassInput';
import GlassButton from '../../components/common/GlassButton';

const HospitalLogin = () => {
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
        role: 'hospital_admin'
      });

      const { accessToken, refreshToken, role, name } = response.data.data;
      
      localStorage.setItem('token', accessToken);
      localStorage.setItem('accessToken', accessToken);
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('role', role || 'hospital_admin');
      localStorage.setItem('userRole', role || 'hospital_admin');
      if (name) localStorage.setItem('userName', name);

      toast.success('Login successful!');
      navigate('/hospital/dashboard');
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
      title="Hospital Administration"
      subtitle="Sign in to your hospital administration panel"
      icon={Building}
      error={error}
      onSubmit={handleLogin}
      themeColor="blue"
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase text-slate-500 ml-1">Email Address</label>
          <GlassInput type="email" required icon={Mail} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase text-slate-500 ml-1">Password</label>
          <GlassInput type="password" required icon={Lock} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>

        <GlassButton type="submit" isLoading={loading} className="w-full mt-4">Sign In</GlassButton>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => navigate('/register?role=hospital')}
            className="text-xs text-slate-500 hover:text-white transition-colors"
          >
            Don't have an account? Register here
          </button>
        </div>
      </div>
    </LoginShell>
  );
};

export default HospitalLogin;
