import React, { useEffect, useState, useCallback } from 'react';
import { Smartphone, ShieldCheck, ShieldAlert, Trash2, Loader2, Clock, Edit2, Check, X, KeyRound, Lock } from 'lucide-react';
import api from '../api/axiosInstance';
import { toast } from 'react-toastify';

const TrustedDevices = ({ userId = null, isAdmin = false }) => {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [verifyingDeviceId, setVerifyingDeviceId] = useState(null);
  const [otpValue, setOtpValue] = useState('');
  const [sendingOtpId, setSendingOtpId] = useState(null);
  const [submittingTrustId, setSubmittingTrustId] = useState(null);

  // Two-Factor Authentication (Email OTP) state
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorStep, setTwoFactorStep] = useState('idle'); // 'idle' | 'enable-password' | 'enable-otp' | 'disable-password'
  const [twoFactorPassword, setTwoFactorPassword] = useState('');
  const [twoFactorOtp, setTwoFactorOtp] = useState('');
  const [twoFactorEmailHint, setTwoFactorEmailHint] = useState('');
  const [twoFactorSubmitting, setTwoFactorSubmitting] = useState(false);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const requests = [api.get('/devices/my')];
      if (!isAdmin) {
        requests.push(api.get('/auth/2fa').catch(() => ({ data: { data: { twoFactorEnabled: false } } })));
      }
      const [devRes, twoFaRes] = await Promise.all(requests);
      setDevices(devRes?.data?.data || []);
      if (!isAdmin && twoFaRes?.data?.data) {
        setTwoFactorEnabled(Boolean(twoFaRes.data.data.twoFactorEnabled));
      }
    } catch (err) {
      toast.error('Failed to load devices');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

  const handleRequestEnable2FA = async (e) => {
    if (e) e.preventDefault();
    if (!twoFactorPassword) {
      toast.warning('Please enter your current password to continue');
      return;
    }
    setTwoFactorSubmitting(true);
    try {
      const res = await api.post('/auth/enable-2fa', { password: twoFactorPassword });
      setTwoFactorEmailHint(res.data?.data?.emailHint || 'your registered email');
      setTwoFactorOtp('');
      setTwoFactorStep('enable-otp');
      toast.info(res.data?.message || 'Verification OTP sent to your email');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to initiate 2FA setup');
    } finally {
      setTwoFactorSubmitting(false);
    }
  };

  const handleConfirmEnable2FA = async (e) => {
    if (e) e.preventDefault();
    if (!twoFactorOtp || twoFactorOtp.trim().length < 6) {
      toast.warning('Please enter the 6-digit verification OTP sent to your email');
      return;
    }
    setTwoFactorSubmitting(true);
    try {
      const res = await api.post('/auth/verify-2fa', { otp: twoFactorOtp.trim() });
      setTwoFactorEnabled(Boolean(res.data?.data?.twoFactorEnabled ?? true));
      setTwoFactorStep('idle');
      setTwoFactorPassword('');
      setTwoFactorOtp('');
      toast.success(res.data?.message || 'Two-factor authentication enabled');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to verify 2FA code');
    } finally {
      setTwoFactorSubmitting(false);
    }
  };

  const handleConfirmDisable2FA = async (e) => {
    if (e) e.preventDefault();
    if (!twoFactorPassword) {
      toast.warning('Please enter your current password to disable 2FA');
      return;
    }
    setTwoFactorSubmitting(true);
    try {
      const res = await api.put('/auth/2fa', { enabled: false, password: twoFactorPassword });
      setTwoFactorEnabled(Boolean(res.data?.data?.twoFactorEnabled ?? false));
      setTwoFactorStep('idle');
      setTwoFactorPassword('');
      toast.success(res.data?.message || 'Two-factor authentication disabled');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to disable 2FA');
    } finally {
      setTwoFactorSubmitting(false);
    }
  };

  const handleRevoke = async (deviceId, deviceModel) => {
    try {
      if (isAdmin) {
        await api.delete(`/admin/users/${userId}/devices/${deviceId}?role=patient`); // or pass role dynamically if needed, but admin endpoint works best this way
      } else {
        await api.delete(`/devices/my/${deviceId}`);
      }
      toast.success(`Removed "${deviceModel || 'device'}"`);
      setDevices(prev => prev.filter(d => d._id !== deviceId));
    } catch (err) {
      toast.error('Failed to remove device');
    }
  };

  const handleUpdateLabel = async (deviceId) => {
    try {
      const res = await api.put(`/devices/my/${deviceId}`, { deviceLabel: editValue });
      setDevices(prev => prev.map(d => d._id === deviceId ? { ...d, deviceLabel: res.data.data.deviceLabel } : d));
      setEditingId(null);
      toast.success('Device label updated');
    } catch (err) {
      toast.error('Failed to update label');
    }
  };

  const handleRequestTrustOtp = async (deviceId) => {
    setSendingOtpId(deviceId);
    try {
      const res = await api.post(`/devices/my/${deviceId}/request-trust-otp`);
      setVerifyingDeviceId(deviceId);
      setOtpValue('');
      toast.info(res.data?.message || 'Verification OTP sent to your registered email');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send verification OTP');
    } finally {
      setSendingOtpId(null);
    }
  };

  const handleConfirmTrust = async (deviceId) => {
    if (!otpValue || otpValue.trim().length < 6) {
      toast.warning('Please enter the 6-digit verification OTP sent to your email');
      return;
    }
    setSubmittingTrustId(deviceId);
    try {
      const res = await api.post(`/devices/my/${deviceId}/trust`, { otp: otpValue.trim() });
      const updated = res.data?.data;
      setDevices(prev => prev.map(d => d._id === deviceId ? {
        ...d,
        isTrusted: true,
        trustedAt: updated?.trustedAt || new Date().toISOString(),
        isRevoked: false
      } : d));
      setVerifyingDeviceId(null);
      setOtpValue('');
      toast.success(res.data?.message || 'Device permanently trusted');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to verify OTP for device trust');
    } finally {
      setSubmittingTrustId(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="w-5 h-5 animate-spin text-slate-500 mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!isAdmin && (
        <div
          data-testid="two-factor-settings-card"
          className="p-4 bg-slate-950/50 rounded-xl border border-white/10 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                twoFactorEnabled
                  ? 'bg-emerald-500/10 border border-emerald-500/20'
                  : 'bg-slate-800/80 border border-white/10'
              }`}>
                <Lock className={`w-5 h-5 ${twoFactorEnabled ? 'text-emerald-400' : 'text-slate-400'}`} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-white">Two-Factor Authentication (Email OTP)</p>
                  <span
                    data-testid="two-factor-status-badge"
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      twoFactorEnabled
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-slate-800 text-slate-400 border-white/10'
                    }`}
                  >
                    {twoFactorEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Require a 6-digit verification code sent to your email every time you sign in.
                </p>
              </div>
            </div>

            {twoFactorStep === 'idle' && (
              <div>
                {twoFactorEnabled ? (
                  <button
                    type="button"
                    data-testid="2fa-start-disable-btn"
                    onClick={() => { setTwoFactorStep('disable-password'); setTwoFactorPassword(''); }}
                    className="text-xs font-bold px-3.5 py-2 rounded-lg border bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20 transition-colors"
                  >
                    Disable 2FA
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid="2fa-start-enable-btn"
                    onClick={() => { setTwoFactorStep('enable-password'); setTwoFactorPassword(''); setTwoFactorOtp(''); }}
                    className="text-xs font-bold px-3.5 py-2 rounded-lg border bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/20 transition-colors"
                  >
                    Enable 2FA
                  </button>
                )}
              </div>
            )}
          </div>

          {twoFactorStep === 'enable-password' && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
              <input
                type="password"
                data-testid="2fa-password-input"
                value={twoFactorPassword}
                onChange={(e) => setTwoFactorPassword(e.target.value)}
                placeholder="Confirm current password"
                className="bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 w-52"
              />
              <button
                type="button"
                data-testid="2fa-send-otp-btn"
                onClick={handleRequestEnable2FA}
                disabled={twoFactorSubmitting}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {twoFactorSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <KeyRound className="w-3.5 h-3.5" />}
                Send Verification OTP
              </button>
              <button
                type="button"
                onClick={() => { setTwoFactorStep('idle'); setTwoFactorPassword(''); }}
                className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white border border-white/5 transition"
              >
                Cancel
              </button>
            </div>
          )}

          {twoFactorStep === 'enable-otp' && (
            <div className="space-y-2 pt-2 border-t border-white/5">
              <p className="text-xs text-slate-400">
                Enter the 6-digit verification code sent to <span className="text-white font-semibold">{twoFactorEmailHint}</span>:
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  maxLength={6}
                  data-testid="2fa-otp-input"
                  value={twoFactorOtp}
                  onChange={(e) => setTwoFactorOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 6-digit email OTP"
                  className="bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 w-48 tracking-widest font-mono"
                />
                <button
                  type="button"
                  data-testid="2fa-verify-enable-btn"
                  onClick={handleConfirmEnable2FA}
                  disabled={twoFactorSubmitting}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {twoFactorSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Verify & Enable 2FA
                </button>
                <button
                  type="button"
                  onClick={handleRequestEnable2FA}
                  disabled={twoFactorSubmitting}
                  className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white border border-white/5 transition"
                >
                  Resend OTP
                </button>
                <button
                  type="button"
                  onClick={() => { setTwoFactorStep('idle'); setTwoFactorPassword(''); setTwoFactorOtp(''); }}
                  className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white border border-white/5 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {twoFactorStep === 'disable-password' && (
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
              <input
                type="password"
                data-testid="2fa-disable-password-input"
                value={twoFactorPassword}
                onChange={(e) => setTwoFactorPassword(e.target.value)}
                placeholder="Confirm current password to disable"
                className="bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-red-500 w-56"
              />
              <button
                type="button"
                data-testid="2fa-confirm-disable-btn"
                onClick={handleConfirmDisable2FA}
                disabled={twoFactorSubmitting}
                className="text-xs font-bold px-3 py-1.5 rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 border border-red-500/30 transition inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {twoFactorSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Confirm Disable 2FA
              </button>
              <button
                type="button"
                onClick={() => { setTwoFactorStep('idle'); setTwoFactorPassword(''); }}
                className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white border border-white/5 transition"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {devices.length === 0 ? (
        <div className="p-8 text-center text-slate-500 select-none">
          <Smartphone className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">No recognized devices yet.</p>
          <p className="text-xs text-slate-600 mt-1">Devices can be verified for permanent trust using step-up OTP verification.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {devices.map(device => {
        const isDeviceTrusted = Boolean(device.isTrusted && !device.isRevoked);
        return (
          <div
            key={device._id}
            className="flex flex-col gap-3 p-4 bg-slate-950/40 rounded-xl border border-white/5 hover:border-white/10 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 flex-1 mr-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  isDeviceTrusted
                    ? 'bg-emerald-500/10 border border-emerald-500/20'
                    : 'bg-amber-500/10 border border-amber-500/20'
                }`}>
                  {isDeviceTrusted ? (
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  ) : (
                    <ShieldAlert className="w-5 h-5 text-amber-400" />
                  )}
                </div>
                <div className="flex-1">
                  {editingId === device._id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="bg-slate-900 border border-white/10 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500 w-full max-w-[200px]"
                        placeholder="Enter label (e.g. My Phone)"
                        autoFocus
                      />
                      <button onClick={() => handleUpdateLabel(device._id)} className="p-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="p-1 rounded bg-slate-800 text-slate-400 hover:text-white transition">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group cursor-pointer" onClick={() => !isAdmin && (setEditingId(device._id), setEditValue(device.deviceLabel || ''))}>
                      <p className="text-sm font-bold text-white">
                        {device.deviceLabel ? `${device.deviceLabel} (${device.deviceModel || 'Unknown Device'})` : (device.deviceModel || 'Unknown Device')}
                      </p>
                      {!isAdmin && <Edit2 className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    {isDeviceTrusted ? (
                      <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-medium">
                        <Clock className="w-3 h-3" />
                        Trusted {device.trustedAt ? new Date(device.trustedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Verified'}
                      </span>
                    ) : (
                      <span className="text-[10px] text-amber-400 flex items-center gap-1 font-medium">
                        <Clock className="w-3 h-3" />
                        Unverified (Step-up OTP required for trust)
                      </span>
                    )}
                    <span className="text-[10px] text-slate-600">
                      Last seen {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Unknown'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!isAdmin && !isDeviceTrusted && verifyingDeviceId !== device._id && (
                  <button
                    onClick={() => handleRequestTrustOtp(device._id)}
                    disabled={sendingOtpId === device._id}
                    className="text-[10px] font-bold px-3 py-1.5 rounded-lg border bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/20 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {sendingOtpId === device._id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <KeyRound className="w-3 h-3" />
                    )}
                    Verify & Trust
                  </button>
                )}
                <button
                  onClick={() => handleRevoke(device._id, device.deviceModel)}
                  className="text-[10px] font-bold px-3 py-1.5 rounded-lg border bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20 transition-colors inline-flex items-center gap-1.5"
                >
                  <Trash2 className="w-3 h-3" /> Remove
                </button>
              </div>
            </div>

            {!isAdmin && !isDeviceTrusted && verifyingDeviceId === device._id && (
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
                <input
                  type="text"
                  maxLength={6}
                  value={otpValue}
                  onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, ''))}
                  placeholder="Enter 6-digit email OTP"
                  className="bg-slate-900 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500 w-44 tracking-widest font-mono"
                />
                <button
                  onClick={() => handleConfirmTrust(device._id)}
                  disabled={submittingTrustId === device._id}
                  className="text-[10px] font-bold px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30 transition inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {submittingTrustId === device._id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Confirm Trust
                </button>
                <button
                  onClick={() => handleRequestTrustOtp(device._id)}
                  disabled={sendingOtpId === device._id}
                  className="text-[10px] font-medium px-2.5 py-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white border border-white/5 transition"
                >
                  Resend OTP
                </button>
                <button
                  onClick={() => { setVerifyingDeviceId(null); setOtpValue(''); }}
                  className="text-[10px] font-medium px-2.5 py-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white border border-white/5 transition"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        );
      })}
        </div>
      )}
    </div>
  );
};

export default TrustedDevices;
