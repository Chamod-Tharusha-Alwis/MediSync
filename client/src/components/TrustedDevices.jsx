import React, { useEffect, useState, useCallback } from 'react';
import { Smartphone, ShieldCheck, Trash2, Loader2, Clock, Edit2, Check, X } from 'lucide-react';
import api from '../api/axiosInstance';
import { toast } from 'react-toastify';

const TrustedDevices = ({ userId = null, isAdmin = false }) => {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/devices/my');
      setDevices(data.data || []);
    } catch (err) {
      toast.error('Failed to load devices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchDevices(); }, [fetchDevices]);

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

  if (loading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="w-5 h-5 animate-spin text-slate-500 mx-auto" />
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 select-none">
        <Smartphone className="w-10 h-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm font-medium">No trusted devices yet.</p>
        <p className="text-xs text-slate-600 mt-1">Devices become trusted after login with OTP verification.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {devices.map(device => (
        <div
          key={device._id}
          className="flex items-center justify-between p-4 bg-slate-950/40 rounded-xl border border-white/5 hover:border-white/10 transition-colors"
        >
          <div className="flex items-center gap-4 flex-1 mr-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
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
                <span className="text-[10px] text-slate-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Trusted {device.trustedAt ? new Date(device.trustedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown'}
                </span>
                <span className="text-[10px] text-slate-600">
                  Last seen {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Unknown'}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => handleRevoke(device._id, device.deviceModel)}
            className="text-[10px] font-bold px-3 py-1.5 rounded-lg border bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20 transition-colors inline-flex items-center gap-1.5"
          >
            <Trash2 className="w-3 h-3" /> Remove
          </button>
        </div>
      ))}
    </div>
  );
};

export default TrustedDevices;
