import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { ShieldBan, ShieldCheck, Clock, AlertTriangle, Search } from 'lucide-react';
import api from '../../api/axiosInstance';
import PageTransition from '../../components/common/PageTransition';
import Modal from '../../components/Modal';

const BanManagement = () => {
  const [bans, setBans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('true'); // 'true' = active, 'false' = lifted, '' = all
  const [showBanModal, setShowBanModal] = useState(false);
  const [users, setUsers] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [banForm, setBanForm] = useState({
    targetId: '', targetModel: 'Doctor', banType: 'temporary',
    reason: '', expiresAt: '', targetName: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchBans = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== '') params.set('isActive', filter);
      const { data } = await api.get(`/admin/bans?${params}`);
      setBans(data.data || []);
    } catch (err) {
      toast.error('Failed to load bans');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data } = await api.get('/admin/users?limit=200');
      setUsers(data.data || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  useEffect(() => { fetchBans(); }, [filter]);
  useEffect(() => { fetchUsers(); }, []);

  const handleBan = async () => {
    if (!banForm.targetId || !banForm.reason) {
      toast.error('Please select a user and provide a reason');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/admin/ban', {
        targetId: banForm.targetId,
        targetModel: banForm.targetModel,
        banType: banForm.banType,
        reason: banForm.reason,
        expiresAt: banForm.banType === 'temporary' ? banForm.expiresAt : undefined,
      });
      toast.success(`${banForm.targetName || 'User'} has been suspended`);
      setShowBanModal(false);
      setBanForm({ targetId: '', targetModel: 'Doctor', banType: 'temporary', reason: '', expiresAt: '', targetName: '' });
      fetchBans();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to ban user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLift = async (banId, name) => {
    if (!window.confirm(`Lift the suspension for ${name}?`)) return;
    try {
      await api.put(`/admin/ban/${banId}/lift`, { liftReason: 'Admin decision' });
      toast.success('Suspension lifted');
      fetchBans();
    } catch (err) {
      toast.error('Failed to lift ban');
    }
  };

  const filteredUsers = users.filter(u =>
    (u.fullName || u.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
    (u.email || '').toLowerCase().includes(searchText.toLowerCase())
  );

  const roleToModel = { doctor: 'Doctor', patient: 'Patient', pharmacist: 'PharmacyStaff', hospital_admin: 'Hospital' };

  return (
    <PageTransition className="p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Ban Management</h1>
          <p className="text-slate-400 mt-1">Manage user suspensions and access control</p>
        </div>
        <button
          onClick={() => setShowBanModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-semibold text-sm transition-colors"
        >
          <ShieldBan className="w-4 h-4" />
          Suspend User
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { value: 'true', label: 'Active' },
          { value: 'false', label: 'Lifted' },
          { value: '', label: 'All' }
        ].map(tab => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              filter === tab.value
                ? 'bg-blue-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Ban records table */}
      <div className="glass-panel rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400">Loading bans…</div>
        ) : bans.length === 0 ? (
          <div className="p-10 text-center">
            <ShieldCheck className="w-12 h-12 text-emerald-500 mx-auto mb-3 opacity-60" />
            <p className="text-slate-400">No {filter === 'true' ? 'active' : filter === 'false' ? 'lifted' : ''} suspensions found</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-slate-800/80 border-b border-slate-700 text-slate-300">
              <tr>
                <th className="px-6 py-4 font-medium">User</th>
                <th className="px-6 py-4 font-medium">Type</th>
                <th className="px-6 py-4 font-medium">Reason</th>
                <th className="px-6 py-4 font-medium">Expires</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {bans.map(ban => (
                <tr key={ban._id} className="border-b border-slate-800 hover:bg-slate-800/30">
                  <td className="px-6 py-4">
                    <p className="text-white font-medium">{ban.targetName || 'Unknown'}</p>
                    <p className="text-slate-500 text-xs">{ban.targetEmail} · {ban.targetModel}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                      ban.banType === 'permanent' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {ban.banType === 'temporary' ? <Clock className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                      {ban.banType}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-300 text-sm max-w-xs">
                    <p className="line-clamp-2">{ban.reason}</p>
                  </td>
                  <td className="px-6 py-4 text-slate-400 text-sm">
                    {ban.expiresAt ? new Date(ban.expiresAt).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                      ban.isActive ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
                    }`}>
                      {ban.isActive ? 'ACTIVE' : 'LIFTED'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {ban.isActive && (
                      <button
                        onClick={() => handleLift(ban._id, ban.targetName)}
                        className="text-sm text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
                      >
                        Lift Suspension
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Ban Modal */}
      {showBanModal && (
        <Modal title="Suspend User Account" onClose={() => setShowBanModal(false)}>
          <div className="space-y-4">
            {/* User Search */}
            <div>
              <label className="text-sm font-medium text-slate-300 mb-1.5 block">Search User</label>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={searchText}
                  onChange={e => setSearchText(e.target.value)}
                  placeholder="Name or email…"
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <select
                value={banForm.targetId}
                onChange={e => {
                  const user = users.find(u => u._id === e.target.value);
                  setBanForm(prev => ({
                    ...prev,
                    targetId: e.target.value,
                    targetModel: roleToModel[user?.role] || 'Doctor',
                    targetName: user?.fullName || user?.name || ''
                  }));
                }}
                className="w-full py-2.5 px-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">Select user…</option>
                {filteredUsers.slice(0, 30).map(u => (
                  <option key={u._id} value={u._id}>
                    {u.fullName || u.name} — {u.role?.replace('_', ' ')} ({u.email || u.nic})
                  </option>
                ))}
              </select>
            </div>

            {/* Ban Type */}
            <div>
              <label className="text-sm font-medium text-slate-300 mb-1.5 block">Suspension Type</label>
              <div className="flex gap-3">
                {['temporary', 'permanent'].map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setBanForm(prev => ({ ...prev, banType: t }))}
                    className={`flex-1 py-2.5 rounded-lg border text-sm font-medium transition-all capitalize ${
                      banForm.banType === t
                        ? t === 'permanent' ? 'border-red-500 bg-red-500/20 text-red-300' : 'border-amber-500 bg-amber-500/20 text-amber-300'
                        : 'border-slate-600 text-slate-400 hover:border-slate-500'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Expiry Date (temporary only) */}
            {banForm.banType === 'temporary' && (
              <div>
                <label className="text-sm font-medium text-slate-300 mb-1.5 block">Suspension Ends On</label>
                <input
                  type="date"
                  value={banForm.expiresAt}
                  min={new Date().toISOString().split('T')[0]}
                  onChange={e => setBanForm(prev => ({ ...prev, expiresAt: e.target.value }))}
                  className="w-full py-2.5 px-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="text-sm font-medium text-slate-300 mb-1.5 block">Reason for Suspension</label>
              <textarea
                rows={3}
                value={banForm.reason}
                onChange={e => setBanForm(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="Describe the violation or reason…"
                className="w-full py-2.5 px-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowBanModal(false)}
                className="flex-1 py-2.5 rounded-lg border border-slate-600 text-slate-400 hover:text-white text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBan}
                disabled={submitting || !banForm.targetId || !banForm.reason}
                className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
              >
                {submitting ? 'Suspending…' : 'Confirm Suspension'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </PageTransition>
  );
};

export default BanManagement;
