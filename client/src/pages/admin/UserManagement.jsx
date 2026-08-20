import React, { useState } from 'react';
import { Search, User, Shield, Smartphone, Trash2, Mail, Loader2, Link as LinkIcon, AlertCircle } from 'lucide-react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import PageTransition from '../../components/common/PageTransition';

const UserManagement = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [devices, setDevices] = useState([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [sendingRecovery, setSendingRecovery] = useState(false);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setLoading(true);
    setResults([]);
    setSelectedUser(null);
    try {
      const res = await api.get(`/admin/users/search?q=${encodeURIComponent(searchTerm)}`);
      setResults(res.data.data || []);
      if (res.data.data?.length === 0) {
        toast.info('No users found matching that ID or NIC.');
      }
    } catch (err) {
      toast.error('Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectUser = async (user) => {
    setSelectedUser(user);
    setDevicesLoading(true);
    try {
      const res = await api.get(`/admin/users/${user._id}/devices?role=${user.role}`);
      setDevices(res.data.data || []);
    } catch (err) {
      toast.error('Failed to load devices');
    } finally {
      setDevicesLoading(false);
    }
  };

  const handleRemoveDevice = async (deviceId) => {
    if (!window.confirm('Are you sure you want to revoke this device? The user will be notified.')) return;
    try {
      await api.delete(`/admin/users/${selectedUser._id}/devices/${deviceId}?role=${selectedUser.role}`);
      setDevices(prev => prev.filter(d => d._id !== deviceId));
      toast.success('Device revoked successfully');
    } catch (err) {
      toast.error('Failed to revoke device');
    }
  };

  const handleSendRecoveryLink = async () => {
    if (!window.confirm('Send a secure recovery link to this user? They can use this to bypass 2FA once. Ensure you have verified their identity offline.')) return;
    
    setSendingRecovery(true);
    try {
      await api.post(`/admin/users/${selectedUser._id}/recovery?role=${selectedUser.role}`);
      toast.success('Recovery link sent successfully');
    } catch (err) {
      if (err.response?.status === 429) {
        toast.error('Rate limit exceeded. Please wait before sending another link.');
      } else {
        toast.error('Failed to send recovery link');
      }
    } finally {
      setSendingRecovery(false);
    }
  };

  return (
    <PageTransition className="space-y-6">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">User Management</h1>
        <p className="text-slate-400 mt-1 text-sm font-medium">Search users, manage trusted devices, and send secure recovery links.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Search & Results */}
        <div className="lg:col-span-1 space-y-4">
          <form onSubmit={handleSearch} className="glass-panel p-4 rounded-xl flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by NIC or ID..."
                className="w-full bg-slate-900/50 border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500/50"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 px-4 rounded-lg text-sm font-bold disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
            </button>
          </form>

          {results.length > 0 && (
            <div className="glass-panel p-2 rounded-xl flex flex-col gap-1 max-h-[500px] overflow-y-auto">
              {results.map(user => (
                <button
                  key={user._id}
                  onClick={() => handleSelectUser(user)}
                  className={`flex flex-col text-left p-3 rounded-lg border transition-all ${
                    selectedUser?._id === user._id
                      ? 'bg-blue-500/10 border-blue-500/30 text-white'
                      : 'bg-transparent border-transparent text-slate-300 hover:bg-white/5 hover:border-white/10'
                  }`}
                >
                  <span className="font-bold text-sm">{user.fullName || user.name || 'Unknown'}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] font-mono text-slate-500">{user.nic || user._id}</span>
                    <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                      {user.role}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: User Details */}
        <div className="lg:col-span-2">
          {selectedUser ? (
            <div className="space-y-6">
              {/* Profile Card */}
              <div className="glass-panel p-6 rounded-xl border border-white/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16" />
                
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-white/10 flex items-center justify-center shadow-xl">
                      <User className="w-8 h-8 text-slate-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">
                        {selectedUser.fullName || selectedUser.name || 'Unknown'}
                      </h2>
                      <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-slate-500" /> {selectedUser.nic || selectedUser._id}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 uppercase tracking-wider">
                          {selectedUser.role}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleSendRecoveryLink}
                    disabled={sendingRecovery}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-all text-sm font-bold shadow-lg disabled:opacity-50"
                  >
                    {sendingRecovery ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
                    Send Recovery Link
                  </button>
                </div>

                <div className="mt-6 flex items-start gap-2 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10 text-amber-500/80 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>
                    <strong>Recovery Links</strong> allow users to bypass 2FA authentication once. 
                    Only issue these if you have verified the user's identity offline. The link expires in 15 minutes.
                  </p>
                </div>
              </div>

              {/* Devices Card */}
              <div className="glass-panel p-6 rounded-xl border border-white/5">
                <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Smartphone className="w-4 h-4" /> Trusted Devices
                </h3>

                {devicesLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
                  </div>
                ) : devices.length > 0 ? (
                  <div className="space-y-3">
                    {devices.map(device => (
                      <div key={device._id} className="flex items-center justify-between p-4 rounded-lg bg-slate-900/50 border border-white/5 hover:border-white/10 transition-colors">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-white">
                            {device.deviceLabel || device.deviceModel || 'Unknown Device'}
                          </span>
                          <span className="text-xs text-slate-500 mt-1 font-mono">
                            Added: {new Date(device.trustedAt).toLocaleDateString()}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRemoveDevice(device._id)}
                          className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                          title="Revoke Trust"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center p-8 bg-slate-900/30 rounded-lg border border-white/5 border-dashed">
                    <p className="text-sm text-slate-500 font-medium">No trusted devices found for this user.</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="glass-panel rounded-xl h-full min-h-[400px] flex flex-col items-center justify-center text-slate-500 border border-white/5">
              <User className="w-12 h-12 mb-4 opacity-20" />
              <p className="text-sm font-semibold">Select a user to manage their account</p>
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
};

export default UserManagement;
