import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { UserCog, Plus, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import api from '../../api/axiosInstance';
import PageTransition from '../../components/common/PageTransition';
import Modal from '../../components/Modal';

const ManageAdmins = () => {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);

  const fetchAdmins = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/admin/users?role=admin');
      setAdmins(data.data || []);
    } catch (err) {
      toast.error('Failed to load admin users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAdmins(); }, []);

  const handleCreate = async () => {
    if (!form.fullName || !form.email || !form.password) {
      toast.error('All fields are required');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/admin/admins', form);
      toast.success(`Admin account created for ${form.fullName}`);
      setShowModal(false);
      setForm({ fullName: '', email: '', password: '' });
      fetchAdmins();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create admin');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageTransition className="p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Admin Management</h1>
          <p className="text-slate-400 mt-1">Super admin: Manage platform administrator accounts</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Admin
        </button>
      </div>

      {/* Admin table */}
      <div className="glass-panel rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-400">Loading admins…</div>
        ) : admins.length === 0 ? (
          <div className="p-10 text-center">
            <ShieldCheck className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No admin accounts found</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-slate-800/80 border-b border-slate-700 text-slate-300">
              <tr>
                <th className="px-6 py-4 font-medium">Admin Name</th>
                <th className="px-6 py-4 font-medium">Email</th>
                <th className="px-6 py-4 font-medium">Role</th>
                <th className="px-6 py-4 font-medium">Created</th>
                <th className="px-6 py-4 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {admins.map(admin => (
                <tr key={admin._id} className="border-b border-slate-800 hover:bg-slate-800/30">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-blue-500/20 flex items-center justify-center">
                        <UserCog className="w-5 h-5 text-blue-400" />
                      </div>
                      <span className="text-white font-medium">{admin.fullName}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-400 text-sm">{admin.email}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      admin.role === 'super_admin'
                        ? 'bg-purple-500/20 text-purple-400'
                        : 'bg-blue-500/20 text-blue-400'
                    }`}>
                      {admin.role === 'super_admin' ? '⭐ Super Admin' : 'Admin'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-400 text-sm">
                    {new Date(admin.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                      admin.isActive !== false ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {admin.isActive !== false ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Admin Modal */}
      {showModal && (
        <Modal title="Create New Admin Account" onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-300 mb-1.5 block">Full Name</label>
              <input
                type="text"
                value={form.fullName}
                onChange={e => setForm(prev => ({ ...prev, fullName: e.target.value }))}
                placeholder="Admin Name"
                className="w-full py-2.5 px-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 mb-1.5 block">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="admin@medisync.lk"
                className="w-full py-2.5 px-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300 mb-1.5 block">Temporary Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Strong password"
                  className="w-full py-2.5 px-3 pr-10 bg-slate-700/50 border border-slate-600 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">Admin will be prompted to change this on first login.</p>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 py-2.5 rounded-lg border border-slate-600 text-slate-400 hover:text-white text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={submitting || !form.fullName || !form.email || !form.password}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
              >
                {submitting ? 'Creating…' : 'Create Admin'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </PageTransition>
  );
};

export default ManageAdmins;
