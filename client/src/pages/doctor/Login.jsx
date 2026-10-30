import { useTranslation } from '../../i18n/LanguageContext';
import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, Stethoscope } from 'lucide-react';
import axiosInstance from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import LoginShell from '../../components/common/LoginShell';
import GlassInput from '../../components/common/GlassInput';
import GlassButton from '../../components/common/GlassButton';
import LoginOtpStep from '../../components/common/LoginOtpStep';
import PasswordInput from '../../components/common/PasswordInput';
import { selectDoctorWorkspace } from '../../utils/doctorWorkspace';

const DoctorLogin = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendingOtp, setResendingOtp] = useState(false);
  const [error, setError] = useState(null);
  const [pendingAuth, setPendingAuth] = useState(null);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const loginType = searchParams.get('type') || 'personal';

  const completeDoctorSession = (data) => {
    const { accessToken, refreshToken, role, name, orgLogins } = data || {};
    if (!accessToken || accessToken === 'undefined') {
      throw new Error('Authentication token missing from server response.');
    }
    const selectedOrganization = loginType === 'hospital' ? selectDoctorWorkspace(orgLogins, email) : null;

    localStorage.setItem('token', accessToken);
    localStorage.setItem('accessToken', accessToken);
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('role', role || 'doctor');
    localStorage.setItem('userRole', role || 'doctor');
    if (name) localStorage.setItem('userName', name);

    if (loginType === 'hospital') {
      const org = selectedOrganization;

      if (data.isFirstLogin || org?.mustChangePassword || org?.isFirstLogin) {
        localStorage.setItem('loginType', 'hospital');
        localStorage.setItem('workspaceMode', 'hospital');
        if (org?.hospitalId) localStorage.setItem('sessionHospitalId', org.hospitalId);
        if (org?.hospitalName) localStorage.setItem('sessionHospitalName', org.hospitalName);
        navigate(`/doctor/change-org-password?orgLoginId=${org?._id || ''}`);
        return;
      }

      localStorage.setItem('loginType', 'hospital');
      localStorage.setItem('workspaceMode', 'hospital');
      if (org?.hospitalId) {
        localStorage.setItem('sessionHospitalId', org.hospitalId);
      }
      if (org?.hospitalName) {
        localStorage.setItem('sessionHospitalName', org.hospitalName);
      }
    } else {
      localStorage.setItem('loginType', 'personal');
      localStorage.setItem('workspaceMode', 'personal');
      localStorage.removeItem('sessionHospitalId');
      localStorage.removeItem('sessionHospitalName');
    }

    toast.success(`Logged in to ${loginType === 'hospital' ? 'Hospital' : 'Personal'} Workspace`);
    navigate('/doctor/dashboard');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await axiosInstance.post('/auth/login', {
        email,
        password,
        role: 'doctor',
        loginType
      });

      const data = response.data?.data || {};
      if (data.requiresOTP) {
        localStorage.removeItem('token');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        setPendingAuth({
          userId: data.userId,
          email: data.email || email,
          isFirstLogin: Boolean(data.isFirstLogin)
        });
        toast.info(response.data?.message || 'Verification code sent to your email.');
        return;
      }

      completeDoctorSession(data);
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to authenticate. Please check your credentials.';
      setError(errorMsg);
      toast.error(errorMsg);

      localStorage.removeItem('token');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('role');
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
      const data = response.data?.data || {};
      completeDoctorSession({
        ...data,
        isFirstLogin: data.isFirstLogin ?? pendingAuth.isFirstLogin
      });
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
      title={loginType === 'hospital' ? 'Hospital Workspace Login' : 'Personal Workspace Login'}
      subtitle="Sign in to your practitioner account portal"
      icon={Stethoscope}
      error={error}
      onSubmit={pendingAuth ? (e) => e.preventDefault() : handleLogin}
      themeColor="teal"
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
            <label htmlFor="doctor-email" className="text-xs font-semibold uppercase text-slate-300 ml-1">
              {loginType === 'hospital' ? 'Hospital Org Email' : 'Personal Email'}
            </label>
            <GlassInput id="doctor-email" type="email" required icon={Mail} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between ml-1">
              <label htmlFor="doctor-password" className="text-xs font-semibold uppercase text-slate-300">Password</label>
              <button
                type="button"
                onClick={() => navigate('/forgot-password?role=doctor')}
                className="text-[11px] text-teal-400 hover:text-teal-300 transition-colors"
              >
                Forgot credentials?
              </button>
            </div>
            <PasswordInput id="doctor-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>

          <GlassButton type="submit" isLoading={loading} className="w-full mt-4">{t('auth.signInBtn', 'Sign In')}</GlassButton>

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
      )}
    </LoginShell>
  );
};

export default DoctorLogin;

