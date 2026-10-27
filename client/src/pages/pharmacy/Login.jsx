import { useTranslation } from '../../i18n/LanguageContext';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Pill } from 'lucide-react';
import axiosInstance from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import LoginShell from '../../components/common/LoginShell';
import GlassInput from '../../components/common/GlassInput';
import GlassButton from '../../components/common/GlassButton';
import LoginOtpStep from '../../components/common/LoginOtpStep';

const PharmacyLogin = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendingOtp, setResendingOtp] = useState(false);
  const [error, setError] = useState(null);
  const [pendingAuth, setPendingAuth] = useState(null);

  const navigate = useNavigate();

  const completePharmacySession = (data) => {
    const { accessToken, refreshToken, role, pharmacyName, staffName, name } = data || {};
    if (!accessToken || accessToken === 'undefined') {
      throw new Error('Authentication token missing from server response.');
    }

    const displayName = staffName || name || 'Pharmacist';
    localStorage.setItem('token', accessToken);
    localStorage.setItem('accessToken', accessToken);
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('role', role || 'pharmacist');
    localStorage.setItem('userRole', role || 'pharmacist');
    if (displayName) localStorage.setItem('userName', displayName);
    if (pharmacyName) localStorage.setItem('pharmacyName', pharmacyName);

    toast.success(`Welcome back, ${displayName}!`);
    navigate('/pharmacy/dashboard');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await axiosInstance.post('/pharmacy/login', { email, password });
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

      completePharmacySession(data);
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
      completePharmacySession(response.data?.data || {});
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
      title="Pharmacy Terminal"
      subtitle="Sign in to dispense medications safely"
      icon={Pill}
      error={error}
      onSubmit={pendingAuth ? (e) => e.preventDefault() : handleLogin}
      themeColor="emerald"
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
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold uppercase text-slate-500 ml-1">{t("auth.emailAddress", "Email Address")}</label>
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
      )}
    </LoginShell>
  );
};

export default PharmacyLogin;

