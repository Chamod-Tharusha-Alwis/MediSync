import { useTranslation } from '../../i18n/LanguageContext';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, ShieldAlert, Loader2 } from 'lucide-react';
import axiosInstance from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import LoginShell from '../../components/common/LoginShell';
import GlassInput from '../../components/common/GlassInput';
import LoginOtpStep from '../../components/common/LoginOtpStep';
import PasswordInput from '../../components/common/PasswordInput';

const AdminLogin = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendingOtp, setResendingOtp] = useState(false);
  const [error, setError] = useState(null);
  const [pendingAuth, setPendingAuth] = useState(null);

  const navigate = useNavigate();

  const completeAdminSession = (data) => {
    const { accessToken, refreshToken, role, name } = data || {};
    if (!accessToken || accessToken === 'undefined') {
      throw new Error('Authentication token missing from server response.');
    }

    localStorage.setItem('token', accessToken);
    localStorage.setItem('accessToken', accessToken);
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('role', role || 'admin');
    localStorage.setItem('userRole', role || 'admin');
    if (name) localStorage.setItem('userName', name);

    toast.success('Login successful!');
    navigate('/admin/dashboard');
  };

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

      const data = response.data?.data || {};
      if (data.requiresOTP) {
        localStorage.removeItem('token');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        setPendingAuth({
          userId: data.userId,
          email: data.email || email
        });
        toast.info(response.data?.message || 'Verification code sent to your email.');
        return;
      }

      completeAdminSession(data);
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to authenticate. Please check your credentials.';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (otp) => {
    if (!pendingAuth?.userId) return;
    setLoading(true);
    setError(null);

    try {
      const response = await axiosInstance.post('/auth/verify-otp', {
        userId: pendingAuth.userId,
        otp
      });
      completeAdminSession(response.data?.data || {});
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Invalid or expired OTP.';
      setError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!pendingAuth) return false;
    setResendingOtp(true);
    setError(null);

    try {
      await axiosInstance.post('/auth/send-otp', {
        userId: pendingAuth.userId,
        email: pendingAuth.email,
        purpose: 'login'
      });
      toast.success('A new verification code has been sent to your email.');
      return true;
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to resend OTP.';
      setError(errorMsg);
      toast.error(errorMsg);
      return false;
    } finally {
      setResendingOtp(false);
    }
  };

  return (
    <LoginShell
      title="MediSync Administration"
      subtitle="Authorized personnel access credentials clearance required."
      icon={ShieldAlert}
      bannerText="Restricted Access Area"
      error={error}
      onSubmit={pendingAuth ? (e) => e.preventDefault() : handleLogin}
      themeColor="slate"
    >
      {pendingAuth ? (
        <LoginOtpStep
          email={pendingAuth.email}
          loading={loading}
          resending={resendingOtp}
          onVerify={handleVerifyOtp}
          onResend={handleResendOtp}
          onBack={() => {
            setPendingAuth(null);
            setError(null);
          }}
          buttonLabel="Verify Admin Clearance"
        />
      ) : (
        <>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1 select-none">{t('auth.adminEmail', 'Admin Email')}</label>
            <GlassInput type="email" required icon={Mail} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between ml-1 select-none">
              <label htmlFor="admin-password" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Password Key</label>
              <button
                type="button"
                onClick={() => navigate('/forgot-password?role=admin')}
                className="text-[11px] text-teal-400 hover:text-teal-300 transition-colors"
              >
                Forgot key?
              </button>
            </div>
            <PasswordInput id="admin-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
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
        </>
      )}
    </LoginShell>
  );
};

export default AdminLogin;

