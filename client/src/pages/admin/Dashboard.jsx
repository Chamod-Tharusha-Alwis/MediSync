import { formatSriLankaDateTime, formatSriLankaDate } from '../../utils/sriLankaTime';
import LanguagePreferenceCard from '../../components/common/LanguagePreferenceCard';
import ChangePasswordCard from '../../components/common/ChangePasswordCard';
import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  LayoutDashboard, Users, Building2, ClipboardList, ShieldAlert,
  ActivitySquare, MapPin, Radio, ScrollText, Activity, TrendingUp,
  Settings, Loader2, Monitor, Server, Database, ShieldCheck, Mail, Smartphone
} from 'lucide-react';
import { io } from 'socket.io-client';
import { safeDisconnectSocket } from '../../utils/safeSocketDisconnect';
import api, { SOCKET_SERVER_URL } from '../../api/axiosInstance';
import AppShell from '../../components/ui/AppShell';
import StatCard from '../../components/common/StatCard';
import PageTransition from '../../components/common/PageTransition';
import GeographicMap from '../../components/common/GeographicMap';
import { useTranslation } from '../../i18n/LanguageContext';
import { formatDistrictName } from '../../utils/districtAdjacency';

// Import admin pages
import OutbreakMonitor from './OutbreakMonitor';
import Broadcast from './Broadcast';
import SessionMonitor from './SessionMonitor';
import BanManagement from './BanManagement';

import ManageAdmins from './ManageAdmins';
import AnalyticsDashboard from './AnalyticsDashboard';
import SupportTicketsRoster from './SupportTicketsRoster';
import UserAuditProfile from './UserAuditProfile';

const timeAgo = (dateString) => {
  if (!dateString) return '';
  const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: User Audit Modal
// ─────────────────────────────────────────────────────────────────────────────
const UserAuditModal = ({ userId, onClose }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    api.get(`/admin/audit-logs?actorId=${userId}&limit=100`)
      .then(res => setLogs(res.data.data || []))
      .catch(() => toast.error('Failed to load audit logs'))
      .finally(() => setLoading(false));
  }, [userId]);

  if (!userId) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        <div className="p-5 border-b border-white/5 flex justify-between items-center bg-slate-900/80">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ScrollText className="w-5 h-5 text-slate-400" />
            User Audit Trail
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors text-2xl leading-none">&times;</button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" /></div>
          ) : logs.length > 0 ? (
            <div className="space-y-3">
              {logs.map(log => (
                <div key={log._id} className="p-3 bg-slate-950/40 rounded-xl border border-white/5">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded">{log.action}</span>
                    <span className="text-xs text-slate-500 font-mono">{formatSriLankaDateTime(log.timestamp)}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2 font-mono">
                    <span className="text-slate-500">Device:</span> {log.deviceModel || 'Unknown'} <br />
                    <span className="text-slate-500">Target:</span> {log.targetEntity || log.accessedNic || 'System'}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-slate-500 text-sm">No audit logs found for this user.</div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PRIVACY-PRESERVING PII HELPERS (U14)
// ─────────────────────────────────────────────────────────────────────────────
function maskNic(nic) {
  if (!nic) return '—';
  const str = String(nic).trim();
  if (str.length <= 4) return '****' + str;
  return '********' + str.slice(-4);
}

function maskEmail(email) {
  if (!email) return '—';
  const parts = String(email).trim().split('@');
  if (parts.length !== 2) return '***@***.com';
  const [name, domain] = parts;
  const first = name.length > 0 ? name[0] : 'u';
  const domainParts = domain.split('.');
  const ext = domainParts.length > 1 ? domainParts.pop() : 'com';
  return `${first}***@***.${ext}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: User Detail Slide-Over Panel (U14)
// ─────────────────────────────────────────────────────────────────────────────
const UserDetailPanel = ({ user, isOpen, onClose, onUserUpdated, onOpenAudit }) => {
  const [devices, setDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    if (!user?._id) return;
    setLoadingDevices(true);
    api.get(`/admin/users/${user._id}/devices?role=${user.role}`)
      .then(res => setDevices(res.data.data || []))
      .catch(() => setDevices([]))
      .finally(() => setLoadingDevices(false));
  }, [user]);

  if (!isOpen || !user) return null;

  const handleToggleStatus = async () => {
    setToggling(true);
    try {
      await api.put('/admin/users/toggle', { userId: user._id, role: user.role });
      toast.success('User status updated');
      if (onUserUpdated) onUserUpdated();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update user status');
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-black/60 backdrop-blur-sm transition-all" onClick={onClose}>
      <div
        className="w-full max-w-md bg-slate-900 border-l border-white/10 shadow-2xl h-full flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Panel Header */}
        <div className="p-5 border-b border-white/5 bg-slate-900/90 flex justify-between items-center select-none">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold">
              {user.fullName?.charAt(0) || 'U'}
            </div>
            <div>
              <h2 className="text-base font-bold text-white truncate max-w-[220px]">{user.fullName || 'User Profile'}</h2>
              <span className="text-xs text-blue-400 uppercase font-semibold tracking-wider font-mono">
                {user.role?.replace('_', ' ')}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Panel Body */}
        <div className="p-6 flex-1 overflow-y-auto space-y-5 custom-scrollbar text-xs">
          {/* Status & Account Card */}
          <div className="glass-panel p-4 rounded-xl border border-white/5 space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Account Overview</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-slate-500 block">Status</span>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold uppercase mt-1 ${
                  user.isActive !== false
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {user.isActive !== false ? 'Active' : 'Blocked'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">System Role</span>
                <span className="text-white font-semibold capitalize mt-1 block">{user.role?.replace('_', ' ')}</span>
              </div>
            </div>
          </div>

          {/* Privacy-Preserving Protected PII Card (Zero secrets or raw tokens) */}
          <div className="glass-panel p-4 rounded-xl border border-white/5 space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Masked Credentials (Zero Secrets)
            </h3>
            <div className="space-y-2 font-mono">
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-slate-400">National ID (NIC):</span>
                <span className="text-slate-200 font-bold">{maskNic(user.nic)}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-white/5">
                <span className="text-slate-400">Email Address:</span>
                <span className="text-slate-200 font-bold">{maskEmail(user.email)}</span>
              </div>
              {user.regNo && (
                <div className="flex justify-between items-center py-1 border-b border-white/5">
                  <span className="text-slate-400">Reg Number:</span>
                  <span className="text-slate-200 font-bold">{user.regNo}</span>
                </div>
              )}
            </div>
          </div>

          {/* Active Hardware & Session Telemetry */}
          <div className="glass-panel p-4 rounded-xl border border-white/5 space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Monitor className="w-4 h-4 text-blue-400" /> Active Session Telemetry
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Hardware Model:</span>
                <span className="text-slate-200 font-semibold">{user.deviceModel || 'Unknown Hardware'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Last Login:</span>
                <span className="text-slate-300 font-mono">
                  {user.lastLoginAt ? formatSriLankaDateTime(user.lastLoginAt) : 'Never'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Last Sign-Out:</span>
                <span className="text-slate-300 font-mono">
                  {user.lastSignOutAt ? formatSriLankaDateTime(user.lastSignOutAt) : (user.isValid === false ? 'Session Expired' : '—')}
                </span>
              </div>
            </div>
          </div>

          {/* Trusted Devices Registry */}
          <div className="glass-panel p-4 rounded-xl border border-white/5 space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Smartphone className="w-4 h-4 text-purple-400" /> Trusted Devices Roster
            </h3>
            {loadingDevices ? (
              <div className="py-4 text-center"><Loader2 className="w-4 h-4 animate-spin text-slate-500 mx-auto" /></div>
            ) : devices.length > 0 ? (
              <div className="space-y-2">
                {devices.map(d => (
                  <div key={d._id} className="p-2.5 rounded-lg bg-slate-950/40 border border-white/5 flex justify-between items-center">
                    <div>
                      <p className="text-white font-semibold">{d.deviceModel || 'Authorized Device'}</p>
                      <p className="text-xs text-slate-500 font-mono">Enrolled: {formatSriLankaDate(d.createdAt)}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-xs font-bold uppercase bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      Trusted
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-xs py-2 text-center">No secondary hardware devices registered.</p>
            )}
          </div>
        </div>

        {/* Panel Footer Actions */}
        <div className="p-4 border-t border-white/5 bg-slate-900/90 flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              disabled={toggling}
              onClick={handleToggleStatus}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                user.isActive !== false
                  ? 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20'
                  : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/20'
              }`}
            >
              {user.isActive !== false ? 'Block User Access' : 'Unblock User Access'}
            </button>
            {onOpenAudit && (
              <button
                type="button"
                onClick={() => onOpenAudit(user._id)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-white/10 transition-colors"
              >
                Audit
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white bg-slate-800/40 hover:bg-slate-800 transition-colors"
          >
            Close Panel
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: Manage Users (U13 & U14 Modernization)
// ─────────────────────────────────────────────────────────────────────────────
const ManageUsers = () => {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [auditUserId, setAuditUserId] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
      });
      if (roleFilter) params.set('role', roleFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());
      const { data } = await api.get(`/admin/users?${params.toString()}`);
      setUsers(data.data || []);
      if (data.pagination) setPagination(data.pagination);
    } catch (err) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchUsers(); }, [roleFilter, statusFilter, page, searchQuery]);

  const handleToggle = async (userId, role) => {
    try {
      await api.put('/admin/users/toggle', { userId, role });
      toast.success('User status updated');
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update user status');
    }
  };

  return (
    <PageTransition className="space-y-6 w-full max-w-full min-w-0">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">{t('admin.userManagement', 'User Management')}</h1>
          <p className="text-slate-400 mt-1 text-sm font-medium">{t('admin.userManagementDesc', 'Global access control and operational oversight across roles.')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <input
            type="text"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
            placeholder={t('common.searchPlaceholder', 'Search name, email, or NIC...')}
            className="glass-input text-xs flex-1 sm:w-56 min-w-[160px]"
          />
          <select
            value={roleFilter}
            onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
            className="glass-input text-xs w-full sm:w-auto font-semibold"
          >
            <option value="">{t('common.allRoles', 'All Roles')}</option>
            <option value="admin">{t('roles.admin', 'Admin')}</option>
            <option value="doctor">{t('roles.doctor', 'Doctor')}</option>
            <option value="patient">{t('roles.patient', 'Patient')}</option>
            <option value="hospital_admin">{t('roles.hospitalAdmin', 'Hospital Admin')}</option>
            <option value="pharmacy_admin">{t('roles.pharmacyAdmin', 'Pharmacy Admin')}</option>
            <option value="pharmacist">{t('roles.pharmacist', 'Pharmacist')}</option>
          </select>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="glass-input text-xs w-full sm:w-auto font-semibold"
          >
            <option value="">{t('common.all', 'All')}</option>
            <option value="active">{t('common.active', 'Active')}</option>
            <option value="blocked">{t('common.blocked', 'Blocked')}</option>
          </select>
        </div>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden border border-white/5 w-full max-w-full">
        {loading ? (
          <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" /></div>
        ) : users.length > 0 ? (
          <div className="overflow-x-auto w-full custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-900/60 border-b border-white/5 text-slate-400 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap">
                <tr>
                  <th className="px-3 py-3">{t('common.fullName', 'User Name')}</th>
                  <th className="px-3 py-3">{t('common.identifier', 'Credential / ID')}</th>
                  <th className="px-2.5 py-3">{t('common.role', 'Role')}</th>
                  <th className="px-2.5 py-3 hidden xl:table-cell">{t('common.lastActive', 'Last Active')}</th>
                  <th className="px-2.5 py-3 hidden 2xl:table-cell">{t('common.deviceModel', 'Device Model')}</th>
                  <th className="px-2.5 py-3 hidden lg:table-cell">{t('common.lastLogin', 'Last Login')}</th>
                  <th className="px-2.5 py-3 hidden 2xl:table-cell">{t('common.lastSignOut', 'Last Sign-Out')}</th>
                  <th className="px-2.5 py-3">{t('common.status', 'Status')}</th>
                  <th className="px-3 py-3 text-right">{t('common.actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm text-slate-200">
                {users.map(u => (
                  <tr
                    key={u._id}
                    onClick={() => setSelectedUser(u)}
                    className="hover:bg-white/[0.04] cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2.5 font-bold text-white max-w-[160px] sm:max-w-[240px] lg:max-w-[280px] truncate" title={u.fullName}>
                      {u.fullName || 'Unknown'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-400 font-mono text-xs max-w-[130px] sm:max-w-[200px] truncate" title={u.email || u.nic}>
                      {u.email || u.nic}
                    </td>
                    <td className="px-2.5 py-2.5 capitalize font-semibold text-slate-300 text-xs whitespace-nowrap">{u.role?.replace('_', ' ')}</td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap hidden xl:table-cell">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${u.isValid && u.lastAccess && (new Date() - new Date(u.lastAccess)) < 30 * 60 * 1000 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
                        <span className="text-slate-400 text-xs">{timeAgo(u.lastAccess) || 'Never'}</span>
                      </div>
                    </td>
                    <td className="px-2.5 py-2.5 hidden 2xl:table-cell">
                      <div className="text-xs text-slate-300 truncate max-w-[110px]" title={u.deviceInfo}>{u.deviceModel || 'Unknown'}</div>
                    </td>
                    <td className="px-2.5 py-2.5 text-xs text-slate-400 whitespace-nowrap hidden lg:table-cell">
                      {u.lastLoginAt ? formatSriLankaDateTime(u.lastLoginAt, 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-2.5 py-2.5 text-xs text-slate-400 whitespace-nowrap hidden 2xl:table-cell">
                      {u.lastSignOutAt ? formatSriLankaDateTime(u.lastSignOutAt, 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : (u.isValid === false ? 'Session expired' : '—')}
                    </td>
                    <td className="px-2.5 py-2.5 whitespace-nowrap">
                      {u.isActive !== false ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold uppercase select-none">
                          {t('common.active', 'Active')}
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-bold uppercase select-none">
                          {t('common.blocked', 'Blocked')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setSelectedUser(u)}
                          className="text-xs font-bold px-2.5 py-1.5 rounded-lg border bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border-blue-500/20 transition-colors"
                        >
                          Details
                        </button>
                        <button
                          type="button"
                          onClick={() => setAuditUserId(u._id)}
                          className="text-xs font-bold px-2.5 py-1.5 rounded-lg border bg-slate-800 text-slate-300 hover:bg-slate-700 border-white/10 transition-colors"
                        >
                          {t('common.audit', 'Audit')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggle(u._id, u.role)}
                          className={`text-xs font-bold transition-all px-2.5 py-1.5 rounded-lg border ${
                            u.isActive !== false
                              ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border-emerald-500/20'
                          }`}
                        >
                          {u.isActive !== false ? t('common.block', 'Block') : t('common.unblock', 'Unblock')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-white/5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span>
                Showing <strong className="text-slate-200">{users.length}</strong> of <strong className="text-slate-200">{pagination.total || users.length}</strong> users
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-white/10 disabled:opacity-40 hover:bg-slate-700 transition-colors font-semibold"
                >
                  Prev
                </button>
                <span className="font-mono text-xs text-slate-300">
                  Page {pagination.page || page} / {Math.max(1, pagination.pages || 1)}
                </span>
                <button
                  type="button"
                  disabled={page >= (pagination.pages || 1)}
                  onClick={() => setPage(p => p + 1)}
                  className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 border border-white/10 disabled:opacity-40 hover:bg-slate-700 transition-colors font-semibold"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500 select-none">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm font-semibold">No registered users found matching filter.</p>
          </div>
        )}
      </div>

      {auditUserId && <UserAuditModal userId={auditUserId} onClose={() => setAuditUserId(null)} />}
      {selectedUser && (
        <UserDetailPanel
          user={selectedUser}
          isOpen={Boolean(selectedUser)}
          onClose={() => setSelectedUser(null)}
          onUserUpdated={fetchUsers}
          onOpenAudit={(uid) => { setSelectedUser(null); setAuditUserId(uid); }}
        />
      )}
    </PageTransition>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENT: Overview Stats & Geo Maps
// ─────────────────────────────────────────────────────────────────────────────
const Overview = ({ stats, geo, activeAlerts }) => {
  const { t } = useTranslation();
  const [systemHealth, setSystemHealth] = useState(null);

  useEffect(() => {
    let timer = null;
    let count = 0;
    const fetchHealth = () => {
      api.get('/admin/system-health')
        .then(res => {
          const data = res.data?.data || null;
          setSystemHealth(data);
          const isMlWaking = data?.mlEngine?.status === 'waking_up' || data?.mlEngine?.availability === 'waking_up' || data?.mlEngine?.availability === 'waking';
          if (isMlWaking && count < 6) {
            count += 1;
            timer = setTimeout(fetchHealth, 10000);
          }
        })
        .catch(() => setSystemHealth(null));
    };
    fetchHealth();
    return () => { if (timer) clearTimeout(timer); };
  }, []);

  if (!stats) return <section role="alert"><h2>Dashboard metrics unavailable</h2><p>Metrics could not be verified. No counts are shown.</p></section>;
  return (
  <PageTransition className="space-y-6">
    <div className="mb-6">
      <h1 className="text-3xl font-extrabold text-white tracking-tight">{t('admin.commandCenter', 'Administration Dashboard')}</h1>
      <p className="text-slate-400 mt-1 text-sm font-medium">{t('admin.commandSubtitle', 'Platform surveillance logs, operational nodes, and regional health outbreaks map.')}</p>
    </div>

    {/* ML Active Outbreak Alert Header */}
    {activeAlerts && activeAlerts.length > 0 && (
      <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5 flex items-start gap-4 animate-pulse-subtle select-none">
        <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
          <ShieldAlert className="w-5 h-5 text-red-400" />
        </div>
        <div>
          <h3 className="text-red-400 font-bold text-sm uppercase tracking-wider">{t('outbreak.surveillanceTitle', 'Active System Outbreak Alert')}</h3>
          <p className="text-slate-200 text-xs font-semibold mt-1">{activeAlerts[0].message} (Z-Score: {activeAlerts[0].zScore?.toFixed?.(2) || 'N/A'})</p>
            {(activeAlerts[0].isSimulation || activeAlerts[0].isDemoData || activeAlerts[0].isSimulatedDemo) && activeAlerts[0].syntheticLabel && (
              <span className="inline-block mt-1 px-2 py-0.5 rounded text-[11px] bg-amber-500/15 border border-amber-500/30 text-amber-400 font-bold uppercase tracking-wider">
                {activeAlerts[0].syntheticLabel}
              </span>
            )}
        </div>
      </div>
    )}

    {/* Metric Cards Grid with Explanatory Context (U16) */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 select-none">
      <div className="space-y-1.5">
        <StatCard
          icon={Building2}
          title={t('admin.registeredHospitals', 'Registered Hospitals')}
          value={stats?.totalHospitals || 0}
          gradient="from-slate-700/80 to-slate-700/50"
          delay={0.1}
        />
        <p className="text-xs text-slate-500 px-2 font-medium">Verified healthcare institutions registered in the network.</p>
      </div>
      <div className="space-y-1.5">
        <StatCard
          icon={Users}
          title={t('admin.totalPractitioners', 'Total Practitioners')}
          value={stats?.totalDoctors || 0}
          gradient="from-slate-700/80 to-slate-700/50"
          delay={0.2}
        />
        <p className="text-xs text-slate-500 px-2 font-medium">Licensed medical doctors and specialists on platform.</p>
      </div>
      <div className="space-y-1.5">
        <StatCard
          icon={Users}
          title={t('admin.totalPatients', 'Total Registered Patients')}
          value={stats?.totalPatients || 0}
          gradient="from-slate-700/80 to-slate-700/50"
          delay={0.3}
        />
        <p className="text-xs text-slate-500 px-2 font-medium">Registered national health identifier citizen profiles.</p>
      </div>
      <div className="space-y-1.5">
        <StatCard
          icon={ClipboardList}
          title={t('admin.totalFulfillments', 'Total Fulfillments')}
          value={stats?.totalConsultations || 0}
          gradient="from-slate-700/80 to-slate-700/50"
          delay={0.4}
        />
        <p className="text-xs text-slate-500 px-2 font-medium">Recorded consultation visits and clinical encounters across districts.</p>
      </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
      {/* Activity Logs */}
      <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5 select-none">
          <ActivitySquare className="w-4.5 h-4.5 text-slate-400" />
          Recent Platform Audit Feed
        </h3>
        <p className="text-slate-500 text-xs select-none">Live auditing telemetry logs ingested from distributed workspaces.</p>

        <div className="space-y-3.5 h-72 overflow-y-auto pr-2 custom-scrollbar">
          {stats?.recentAuditLogs && stats.recentAuditLogs.length > 0 ? (
            stats.recentAuditLogs.map((log) => {
              const ACTION_MAP = {
                login: 'Logged into the system',
                register: 'Registered a new account',
                create_patient: 'Registered a new patient',
                update_patient: 'Updated patient profile',
                create_consultation: 'Created a new consultation',
                order_test: 'Ordered a new lab test',
                update_test: 'Updated lab test results',
                dispense_medication: 'Dispensed medication',
                trigger_outbreak: 'Triggered an outbreak alert',
                approve_outbreak: 'Approved an outbreak alert',
                resolve_outbreak: 'Resolved an outbreak alert',
                ban_user: 'Suspended a user',
                lift_ban: 'Lifted user suspension'
              };

              const actionLower = (log.action || '').toLowerCase();
              let badgeColor = 'bg-slate-800 text-slate-400 border border-slate-700/50';
              if (actionLower.includes('login')) badgeColor = 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
              if (actionLower.includes('create') || actionLower.includes('register')) badgeColor = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
              if (actionLower.includes('delete') || actionLower.includes('block') || actionLower.includes('ban')) badgeColor = 'bg-red-500/10 text-red-400 border border-red-500/20';

              const humanAction = ACTION_MAP[actionLower] || log.action;
              const actorName = log.actorName || log.actorId;
              const targetEntity = log.targetEntity || log.accessedNic || 'system node';

              return (
                <div key={log._id} className="bg-slate-950/20 p-3 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
                  <div className="flex justify-between items-start mb-2 select-none">
                    <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-full ${badgeColor}`}>
                      {log.action}
                    </span>
                    <span className="text-xs text-slate-500 font-mono">{timeAgo(log.timestamp || log.createdAt)}</span>
                  </div>
                  <p className="text-xs text-slate-300 font-medium">
                    <span className="text-white font-bold">{actorName}</span>
                    <span className="text-slate-500 ml-1 text-[11px] uppercase">({log.actorRole?.replace('_', ' ')})</span>
                    <br/>
                    <span className="text-slate-400 mt-1 inline-block">{humanAction} regarding <span className="text-blue-400 font-semibold">{targetEntity}</span>.</span>
                  </p>
                </div>
              );
            })
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 select-none">
              <ScrollText className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs">No active event logging recorded.</p>
            </div>
          )}
        </div>
      </div>

      {/* Geospatial Map */}
      <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5 select-none">
          <MapPin className="w-4.5 h-4.5 text-slate-400" />
          Surveillance Geospatial Node
        </h3>
        <p className="text-slate-500 text-xs select-none">Geographic mapping overlay of active health anomalies.</p>
        <div className="h-72 w-full rounded-xl overflow-hidden border border-white/5 bg-slate-950/50">
          <GeographicMap hospitals={geo?.hospitals || []} alerts={activeAlerts || []} />
        </div>
      </div>
    </div>

    {/* System Status Indicators (Live Probes U16) */}
    <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h3 className="text-base font-bold text-white flex items-center gap-2">
          <Server className="w-4.5 h-4.5 text-emerald-400" /> Platform Infrastructure Health Probes
        </h3>
        <span className="text-xs text-slate-400 font-mono">
          Probe Status: <span className={systemHealth ? "text-emerald-400 font-bold" : "text-amber-400 font-bold"}>
            {systemHealth ? 'Live Verified' : 'Awaiting Probe'}
          </span>
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-1">
        {[
          {
            label: 'API Server',
            desc: systemHealth?.api?.uptime ? `Uptime: ${Math.round(systemHealth.api.uptime)}s` : 'Core REST API service',
            status: (systemHealth?.api?.status === 'ok' || systemHealth?.api?.status === 'operational') ? 'Operational' : 'Not verified',
            icon: Server
          },
          {
            label: 'MongoDB Replica Set',
            desc: (systemHealth?.database?.status === 'connected' || systemHealth?.mongodb?.status === 'operational') ? 'Atlas replica cluster connected' : 'Database connectivity',
            status: (systemHealth?.database?.status === 'connected' || systemHealth?.mongodb?.status === 'operational') ? 'Connected' : 'Not verified',
            icon: Database
          },
          {
            label: 'ML Engine Intelligence',
            desc: (systemHealth?.mlEngine?.status === 'available' || systemHealth?.mlEngine?.status === 'operational' || systemHealth?.mlEngine?.availability === 'available') ? 'Neural service online' : (systemHealth?.mlEngine?.status === 'waking_up' || systemHealth?.mlEngine?.availability === 'waking_up' || systemHealth?.mlEngine?.availability === 'waking' || systemHealth?.mlEngine?.status === 'waking') ? 'Waking up (cold start)' : 'Analytical outbreak engine',
            status: (systemHealth?.mlEngine?.status === 'available' || systemHealth?.mlEngine?.status === 'operational' || systemHealth?.mlEngine?.availability === 'available') ? 'Available' : (systemHealth?.mlEngine?.status === 'waking_up' || systemHealth?.mlEngine?.availability === 'waking_up' || systemHealth?.mlEngine?.availability === 'waking' || systemHealth?.mlEngine?.status === 'waking') ? 'Starting up...' : 'Not verified',
            icon: ActivitySquare
          },
          {
            label: 'Email & Dispatchers',
            desc: (systemHealth?.email?.configured || systemHealth?.email?.status === 'operational') ? 'HTTPS Resend API configured' : 'Dispatcher configuration',
            status: (systemHealth?.email?.configured || systemHealth?.email?.status === 'operational') ? 'Configured' : 'Not verified',
            icon: Mail
          }
        ].map(sys => {
          const Icon = sys.icon;
          const isVerified = sys.status !== 'Not verified';
          return (
            <div key={sys.label} className="bg-slate-950/30 p-4 rounded-xl border border-white/5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-900 border border-white/5 flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-slate-400" />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-slate-200 truncate">{sys.label}</h4>
                <p className="text-xs text-slate-500 truncate mt-0.5">{sys.desc}</p>
              </div>
              <span className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full select-none ${
                isVerified
                  ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                  : 'text-amber-400 bg-amber-500/10 border border-amber-500/20'
              }`}>
                {sys.status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  </PageTransition>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// ROOT PORTAL ROUTER
// ─────────────────────────────────────────────────────────────────────────────
const AdminSettingsPage = () => {
  const { t } = useTranslation();
  return (
    <PageTransition className="space-y-6">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">{t('nav.settings', 'Admin Settings & Preferences')}</h1>
        <p className="text-slate-400 mt-1 text-sm font-medium">{t('preferences.adminSubtitle', 'Manage administrative localized interfaces, language bindings, and operator preferences.')}</p>
      </div>
      <div className="max-w-4xl space-y-8">
        <LanguagePreferenceCard />
        <ChangePasswordCard />
      </div>
    </PageTransition>
  );
};

const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [geo, setGeo] = useState(null);
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, alertsRes] = await Promise.all([
          api.get('/admin/stats'),
          api.get('/alerts/active')
        ]);
        setStats(statsRes.data.data);
        setGeo(null);
        setActiveAlerts(alertsRes.data.data);
      } catch (err) {
        toast.error('Failed to load system data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Socket.IO real-time integration
  useEffect(() => {
    let socket;
    let active = true;
    const clearSocket = () => {
      active = false;
      clearTimeout(timer);
      if (socket) {
        safeDisconnectSocket(socket);
        socket = undefined;
      }
    };
    const timer = setTimeout(() => {
      if (!active) return;
      const rawToken = localStorage.getItem('token') || localStorage.getItem('accessToken');
      if (!rawToken || rawToken === 'undefined' || rawToken === 'null' || !rawToken.trim()) {
        return;
      }
      const token = rawToken.trim();
      socket = io(SOCKET_SERVER_URL, {
        auth: { token },
        transports: ['polling', 'websocket'],
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        randomizationFactor: 0.5,
      });

      socket.on('connect_error', (err) => {
        if (!active) return;
        if (err?.message?.includes('AUTH') || err?.message?.includes('token') || err?.message?.includes('expired') || err?.data?.code === 'SOCKET_AUTH_DENIED') {
          console.warn('[Socket.IO Admin] Authentication rejected or expired. Halting reconnection.');
          safeDisconnectSocket(socket);
          return;
        }
        // Silent fallback: degrade without console error spam
      });

      socket.on('outbreak_alert', (data) => {
        if (!active) return;
        toast.error(
          <div>
            <p className="font-bold text-sm">🚨 Outbreak Alert</p>
            <p className="text-xs mt-1">{data?.message || 'An outbreak anomaly has been detected.'}</p>
            {data?.district && <p className="text-xs mt-0.5">District: {formatDistrictName(data.district)}</p>}
          </div>,
          { autoClose: 10000, position: 'top-right' }
        );
        setActiveAlerts(prev => [data, ...prev]);
      });

      socket.on('broadcast_message', (data) => {
        if (!active) return;
        toast.info(
          <div>
            <p className="font-bold text-sm">📢 Broadcast</p>
            <p className="text-xs mt-1">{data?.message || 'A new system broadcast has been sent.'}</p>
          </div>,
          { autoClose: 8000, position: 'top-right' }
        );
      });
    }, 500);

    window.addEventListener('medisync:session-cleared', clearSocket);

    return () => {
      window.removeEventListener('medisync:session-cleared', clearSocket);
      clearSocket();
    };
  }, []);

  const menuItems = [
    { label: 'Overview', path: '/admin/dashboard', icon: LayoutDashboard, end: true },
    { label: 'Analytics', path: '/admin/dashboard/analytics', icon: TrendingUp },
    { label: 'Users', path: '/admin/dashboard/users', icon: Users },
    { label: 'Outbreak Monitor', path: '/admin/dashboard/outbreak', icon: Activity },
    { label: 'Broadcast', path: '/admin/dashboard/broadcast', icon: Radio },
    { label: 'Session Monitor', path: '/admin/dashboard/sessions', icon: Monitor },
    { label: 'Ban Management', path: '/admin/dashboard/bans', icon: ShieldAlert },
    { label: 'Support Tickets', path: '/admin/dashboard/support', icon: ClipboardList },
    { label: 'Admin Accounts', path: '/admin/dashboard/admins', icon: Users },
    { label: 'Settings', path: '/admin/dashboard/settings', icon: Settings },
  ];

  const userName = localStorage.getItem('userName') || 'Admin User';
  const rawRole = localStorage.getItem('role') || 'admin';
  const displayRole = rawRole === 'admin' ? 'Administrator' : rawRole.replace('_', ' ').toUpperCase();

  return (
    <div className="admin-theme">
      <AppShell
        role="admin"
        userName={userName}
        userRole={displayRole}
        menuItems={menuItems}
      >
        <div className="mt-4">
          {loading ? (
            <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" /></div>
          ) : (
            <Routes>
              <Route path="/dashboard" element={<Overview stats={stats} geo={geo} activeAlerts={activeAlerts} />} />
              <Route path="/dashboard/analytics" element={<AnalyticsDashboard />} />
              <Route path="/dashboard/users" element={<ManageUsers />} />
              <Route path="/dashboard/identity" element={<Navigate to="/admin/dashboard/users" replace />} />
              <Route path="/dashboard/alerts" element={<Navigate to="/admin/dashboard/outbreak" replace />} />
              <Route path="/dashboard/outbreak" element={<OutbreakMonitor />} />
              <Route path="/dashboard/broadcast" element={<Broadcast />} />
              <Route path="/dashboard/sessions" element={<SessionMonitor />} />
              <Route path="/dashboard/sessions/:userId" element={<UserAuditProfile />} />
              <Route path="/dashboard/bans" element={<BanManagement />} />
              <Route path="/dashboard/support" element={<SupportTicketsRoster />} />
              <Route path="/dashboard/admins" element={<ManageAdmins />} />
              <Route path="/dashboard/settings" element={<AdminSettingsPage />} />
              <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
            </Routes>
          )}
        </div>
      </AppShell>
    </div>
  );
};

export default AdminDashboard;
