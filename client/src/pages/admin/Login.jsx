import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, ShieldAlert, Loader2 } from 'lucide-react';
import axiosInstance from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import LoginShell from '../../components/common/LoginShell';
import GlassInput from '../../components/common/GlassInput';

const AdminLogin = () => {
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
        role: 'admin'
      });

      const { accessToken, refreshToken, role, name } = response.data.data;
      
      localStorage.setItem('token', accessToken);
      localStorage.setItem('accessToken', accessToken);
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('role', role || 'admin');
      localStorage.setItem('userRole', role || 'admin');
      if (name) localStorage.setItem('userName', name);

      toast.success('Login successful!');
      navigate('/admin/dashboard');
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
      title="Super Admin command"
      subtitle="Authorized personnel access credentials clearance required."
      icon={ShieldAlert}
      bannerText="Restricted Access Area"
      error={error}
      onSubmit={handleLogin}
      themeColor="slate"
    >
      <div className="space-y-1">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1 select-none">Admin Email</label>
        <GlassInput type="email" required icon={Mail} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1 select-none">Password Key</label>
        <GlassInput type="password" required icon={Lock} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full flex justify-center items-center py-2.5 px-4 bg-slate-700/80 hover:bg-slate-600 border border-slate-600/50 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-50 select-none mt-2"
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" />
            Verifying Clearance...
          </>
        ) : (
          'Establish Admin Connection'
        )}
      </button>
      
      <div className="mt-3 text-center select-none">
        <button
          type="button"
          onClick={() => navigate('/register?role=admin')}
          className="text-xs text-slate-500 hover:text-white transition-colors"
        >
          Request new Administrator account
        </button>
      </div>
    </LoginShell>
  );
};

export default AdminLogin;
