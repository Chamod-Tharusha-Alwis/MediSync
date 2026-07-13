import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Pill, Loader2 } from 'lucide-react';
import axiosInstance from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import LoginShell from '../../components/common/LoginShell';

const PharmacyLogin = () => {
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
      const response = await axiosInstance.post('/pharmacy/login', { email, password });
      const { accessToken, role, pharmacyName, staffName } = response.data.data;
      
      localStorage.setItem('token', accessToken);
      localStorage.setItem('role', role || 'pharmacist');
      localStorage.setItem('userRole', role || 'pharmacist');
      if (staffName) localStorage.setItem('userName', staffName);
      if (pharmacyName) localStorage.setItem('pharmacyName', pharmacyName);

      toast.success(`Welcome back, ${staffName || 'Pharmacist'}!`);
      navigate('/pharmacy/dashboard');
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
      title="Pharmacy Terminal"
      subtitle="Sign in to dispense medications safely"
      icon={Pill}
      error={error}
      onSubmit={handleLogin}
      themeColor="emerald"
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
            onClick={() => navigate('/register?role=pharmacist')}
            className="text-xs text-slate-500 hover:text-white transition-colors"
          >
            Don't have an account? Register here
          </button>
        </div>
      </div>
    </LoginShell>
  );
};

export default PharmacyLogin;
