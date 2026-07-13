import React, { useEffect, useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { ShieldBan, ShieldCheck, Clock, AlertTriangle, Search, Loader2 } from 'lucide-react';
import api from '../../api/axiosInstance';
import PageTransition from '../../components/common/PageTransition';
import Modal from '../../components/ui/Modal';

const BanManagement = () => {
  const [bans, setBans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('true'); // 'true' = active, 'false' = lifted, '' = all
  
  // Modals state
  const [showBanModal, setShowBanModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const [users, setUsers] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [banForm, setBanForm] = useState({
    targetId: '', targetModel: 'Doctor', banType: 'temporary',
    reason: '', expiresAt: '', targetName: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchBans = useCallback(async () => {
    setLoading(true);
    try {
      let endpoint = '/admin/bans';
      const params = new URLSearchParams();
      
      if (filter === 'true') {
        endpoint = '/admin/bans/active';
      } else if (filter === 'false') {
        params.set('isActive', 'false');
      }
      
      const { data } = await api.get(`${endpoint}${params.toString() ? '?' + params.toString() : ''}`);
      setBans(data.data || []);
    } catch (err) {
      toast.error('Failed to load bans');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  const fetchUsers = async () => {
    try {
      const { data } = await api.get('/admin/users?limit=200');
      setUsers(data.data || []);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  };

  useEffect(() => { fetchBans(); }, [fetchBans]);
  useEffect(() => { fetchUsers(); }, []);

  const initiateBan = () => {
    if (!banForm.targetId || !banForm.reason) {
      toast.error('Please select a user and provide a reason');
      return;
    }
    setShowConfirmModal(true);
  };

  const handleBan = async () => {
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
      setShowConfirmModal(false);
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
      await api.put(`/admin/bans/${banId}/lift`, { liftReason: 'Admin decision' });
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
  const labelClass = 'block text-xs font-semibold uppercase text-slate-400 mb-1.5';

  return (
    <PageTransition className="space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Ban Management</h1>
          <p className="text-slate-400 mt-1 text-sm font-medium">Suspend patient or practitioner accounts violating system compliance guidelines.</p>
        </div>
        <button
          onClick={() => setShowBanModal(true)}
          className="px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shadow-[0_0_15px_rgba(220,38,38,0.2)]"
        >
          <ShieldBan className="w-4 h-4" />
          Suspend User
        </button>
      </div>

      {/* Filter tab buttons */}
      <div className="flex gap-2 select-none">
        {[
          { value: 'true', label: 'Active Suspension' },
          { value: 'false', label: 'Lifted Suspensions' },
          { value: '', label: 'All Records' }
        ].map(tab => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
              filter === tab.value
                ? 'bg-slate-700/80 border-slate-600 text-white'
                : 'bg-slate-950/20 border-white/5 text-slate-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Ban logs table */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
        {loading ? (
          <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" /></div>
        ) : bans.length === 0 ? (
          <div className="p-12 text-center select-none text-slate-500">
            <ShieldCheck className="w-12 h-12 text-emerald-500/80 mx-auto mb-3" />
            <p className="text-sm font-semibold">No suspension records match selected filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-900/60 border-b border-white/5 text-slate-400 text-xs font-bold uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Suspended User</th>
                  <th className="px-6 py-4">Ban Type</th>
                  <th className="px-6 py-4">Reason / Violation Justification</th>
                  <th className="px-6 py-4">Expires On</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm text-slate-200">
                {bans.map(ban => (
                  <tr key={ban._id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-white font-bold">{ban.targetName || 'Unknown'}</p>
                      <p className="text-slate-500 text-xs mt-0.5">{ban.targetEmail} · <span className="font-semibold text-indigo-400">{ban.targetModel}</span></p>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                        ban.banType === 'permanent' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}>
                        {ban.banType === 'temporary' ? <Clock className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                        {ban.banType?.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-300 text-xs max-w-xs leading-normal">
                      <p className="line-clamp-2">{ban.reason}</p>
                    </td>
                    <td className="px-6 py-4 text-slate-400 font-mono text-xs select-none">
                      {ban.expiresAt ? new Date(ban.expiresAt).toLocaleDateString() : 'Permanent'}
                    </td>
                    <td className="px-6 py-4">
                      {ban.isActive ? (
                        <span className="inline-flex px-2.5 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold uppercase select-none">
                          Suspended
                        </span>
                      ) : (
                        <span className="inline-flex px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase select-none">
                          Lifted
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {ban.isActive && (
                        <button
                          onClick={() => handleLift(ban._id, ban.targetName)}
                          className="text-xs text-emerald-400 hover:text-emerald-300 font-bold uppercase tracking-wider select-none"
                        >
                          Lift Suspension
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Main Ban Entry Modal */}
      <Modal
        isOpen={showBanModal}
        onClose={() => setShowBanModal(false)}
        title="Suspend User Account Access"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Search Target User</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 select-none" />
              <input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Type name or email..."
                className="glass-input pl-9 text-xs"
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
              className="glass-input text-xs mt-2"
            >
              <option value="">Select target user...</option>
              {filteredUsers.slice(0, 30).map(u => (
                <option key={u._id} value={u._id}>
                  {u.fullName || u.name} — {u.role?.replace('_', ' ').toUpperCase()} ({u.email || u.nic})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 select-none">
            <label className={labelClass}>Suspension Duration Mode</label>
            <div className="flex gap-2">
              {['temporary', 'permanent'].map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setBanForm(prev => ({ ...prev, banType: t }))}
                  className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-all capitalize ${
                    banForm.banType === t
                      ? t === 'permanent' ? 'border-red-500/35 bg-red-500/10 text-red-400' : 'border-amber-500/35 bg-amber-500/10 text-amber-400'
                      : 'border-white/5 text-slate-400 hover:text-white'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {banForm.banType === 'temporary' && (
            <div className="flex flex-col gap-1.5">
              <label className={labelClass}>Suspension Expiry Date</label>
              <input
                type="date"
                value={banForm.expiresAt}
                min={new Date().toISOString().split('T')[0]}
                onChange={e => setBanForm(prev => ({ ...prev, expiresAt: e.target.value }))}
                className="glass-input text-xs"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className={labelClass}>Suspension Cause / Reason *</label>
            <textarea
              rows={3}
              value={banForm.reason}
              onChange={e => setBanForm(prev => ({ ...prev, reason: e.target.value }))}
              placeholder="State reason for restriction..."
              className="glass-input text-xs resize-none"
              required
            />
          </div>

          <div className="flex gap-3 pt-4 border-t border-white/5">
            <button
              onClick={() => setShowBanModal(false)}
              className="flex-1 py-2 rounded-xl border border-white/5 text-slate-400 hover:text-white text-xs font-bold transition-all"
            >
              Cancel
            </button>
            <button
              onClick={initiateBan}
              disabled={!banForm.targetId || !banForm.reason}
              className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold disabled:opacity-40"
            >
              Initiate Suspense
            </button>
          </div>
        </div>
      </Modal>

      {/* Double Confirmation Modal */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="Double Confirm Suspense Action"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex gap-3 bg-red-500/5 p-4 rounded-xl border border-red-500/10 items-start select-none">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="text-red-400 font-bold">Suspending user profile accounts breaks active sessions!</p>
              <p className="text-slate-400 mt-1 leading-normal">
                This will immediately invalidate the active API authentication tokens and logs for <span className="text-white font-bold">{banForm.targetName}</span>.
              </p>
            </div>
          </div>

          <div className="flex gap-3 pt-3 border-t border-white/5">
            <button
              onClick={() => setShowConfirmModal(false)}
              className="flex-1 py-2 rounded-xl border border-white/5 text-slate-400 hover:text-white text-xs font-bold transition-all"
            >
              Back
            </button>
            <button
              onClick={handleBan}
              disabled={submitting}
              className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold flex items-center justify-center gap-1.5"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Confirm Suspend
            </button>
          </div>
        </div>
      </Modal>
    </PageTransition>
  );
};

export default BanManagement;
