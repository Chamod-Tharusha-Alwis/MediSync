import React, { useState } from 'react';
import { Send, MessageSquare, Users, MapPin, Loader2, CheckCircle, Bell, Info, Pill, FlaskConical, AlertTriangle } from 'lucide-react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import PageTransition from '../../components/common/PageTransition';
import { useQuery, useMutation } from '@tanstack/react-query';
import Modal from '../../components/ui/Modal';

const SRI_LANKA_DISTRICTS = [
  'Colombo', 'Gampaha', 'Kalutara', 'Kandy', 'Matale', 'Nuwara Eliya',
  'Galle', 'Matara', 'Hambantota', 'Jaffna', 'Kilinochchi', 'Mannar',
  'Mullaitivu', 'Vavuniya', 'Trincomalee', 'Batticaloa', 'Ampara',
  'Kurunegala', 'Puttalam', 'Anuradhapura', 'Polonnaruwa', 'Badulla',
  'Monaragala', 'Ratnapura', 'Kegalle'
];

const Broadcast = () => {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetRole, setTargetRole] = useState('all');
  const [targetDistrict, setTargetDistrict] = useState('');
  const [viewMessage, setViewMessage] = useState(null);

  // Fetch broadcast history
  const { data: broadcasts = [], refetch: refetchBroadcasts } = useQuery({
    queryKey: ['broadcasts'],
    queryFn: () => api.get('/admin/broadcasts').then(r => {
      return Array.isArray(r.data) ? r.data : (r.data.broadcasts || r.data.messages || []);
    }),
  });

  const sendMutation = useMutation({
    mutationFn: (data) => api.post('/alerts/broadcast', data).then(r => r.data),
    onSuccess: () => {
      toast.success('Broadcast sent successfully');
      setTitle('');
      setMessage('');
      setTargetRole('all');
      setTargetDistrict('');
      refetchBroadcasts();
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Failed to send')
  });

  const handleSend = () => {
    if (!title.trim()) { toast.error('Title is required'); return; }
    if (!message.trim()) { toast.error('Message body is required'); return; }

    sendMutation.mutate({
      district: targetDistrict || 'Nationwide',
      message: `[${title}] ${message}`,
      zScore: 0,
      targetRole,
      title: title,
      targetDistrict: targetDistrict || 'All Districts'
    });
  };

  const getPreviewIcon = () => {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('outbreak') || lowerTitle.includes('dengue') || lowerTitle.includes('alert')) {
      return <AlertTriangle className="w-4 h-4 text-rose-400" />;
    }
    if (lowerTitle.includes('medicine') || lowerTitle.includes('pill') || lowerTitle.includes('pharmacy')) {
      return <Pill className="w-4 h-4 text-emerald-400" />;
    }
    if (lowerTitle.includes('lab') || lowerTitle.includes('test') || lowerTitle.includes('report')) {
      return <FlaskConical className="w-4 h-4 text-teal-400" />;
    }
    return <Info className="w-4 h-4 text-slate-400" />;
  };

  const roles = [
    { value: 'all', label: 'All Users' },
    { value: 'doctor', label: 'Doctors' },
    { value: 'patient', label: 'Patients' },
    { value: 'pharmacist', label: 'Pharmacists' },
    { value: 'health_officer', label: 'Health Officers' }
  ];

  return (
    <PageTransition className="space-y-6">
      <div className="mb-6">
        <h1 className="text-3xl font-extrabold text-white tracking-tight">Broadcast Center</h1>
        <p className="text-slate-400 mt-1 text-sm font-medium">Dispatch targeted alerts and real-time announcements to connected users.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Composer Form Area */}
        <div className="lg:col-span-2 space-y-6">
          <div className="glass-card p-6 rounded-2xl border border-white/5 space-y-5">
            <div className="flex items-center gap-2 pb-3 border-b border-white/5 select-none">
              <MessageSquare className="w-4.5 h-4.5 text-indigo-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Compose Announcement</h3>
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase text-slate-500 select-none">Alert Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Dengue Outbreak Surveillance"
                  className="glass-input text-xs"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between select-none">
                  <label className="text-xs font-semibold uppercase text-slate-500">Message Body</label>
                  <span className={`text-[10px] font-mono font-bold ${message.length > 450 ? 'text-rose-400 animate-pulse' : 'text-slate-600'}`}>
                    {message.length} / 500
                  </span>
                </div>
                <textarea
                  value={message}
                  onChange={(e) => { if (e.target.value.length <= 500) setMessage(e.target.value); }}
                  placeholder="Write outbreak alert message detail..."
                  rows={4}
                  className="glass-input text-xs resize-none"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {/* District Selector */}
                <div className="flex flex-col gap-1.5 select-none">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" /> Target District
                  </span>
                  <select
                    value={targetDistrict}
                    onChange={(e) => setTargetDistrict(e.target.value)}
                    className="glass-input text-xs"
                  >
                    <option value="">All Districts (Nationwide)</option>
                    {SRI_LANKA_DISTRICTS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                {/* Role selection chips */}
                <div className="flex flex-col gap-1.5 select-none">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" /> Target Audience
                  </span>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {roles.map(r => (
                      <button
                        key={r.value}
                        type="button"
                        onClick={() => setTargetRole(r.value)}
                        className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                          targetRole === r.value
                            ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                            : 'bg-slate-950/20 border-white/5 text-slate-400 hover:text-white'
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={handleSend}
                disabled={sendMutation.isPending || !title.trim() || !message.trim()}
                className={`w-full py-3 mt-4 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 text-white ${
                  sendMutation.isSuccess
                    ? 'bg-emerald-600'
                    : 'bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40'
                }`}
              >
                {sendMutation.isSuccess ? (
                  <><CheckCircle className="w-4 h-4" /> Broadcast Dispatched!</>
                ) : sendMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Distributing...</>
                ) : (
                  <><Send className="w-4 h-4" /> Dispatch Broadcast</>
                )}
              </button>
            </div>
          </div>

          {/* Sent Broadcasts History list */}
          <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
            <div className="p-4 bg-slate-900/60 border-b border-white/5 select-none">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Broadcast History</h3>
            </div>
            {broadcasts.length === 0 ? (
              <p className="text-slate-500 text-xs text-center py-6 select-none font-semibold">No announcements sent yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-950/40 border-b border-white/5 text-slate-400 text-xs font-bold uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-3">Title</th>
                      <th className="px-5 py-3">Target</th>
                      <th className="px-5 py-3">Location</th>
                      <th className="px-5 py-3">Sent At</th>
                      <th className="px-5 py-3 text-right">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-xs text-slate-200">
                    {broadcasts.map((b, i) => (
                      <tr key={b._id || i} className="hover:bg-white/[0.01] transition-colors">
                        <td className="px-5 py-3 font-bold text-white">{b.title || 'Untitled'}</td>
                        <td className="px-5 py-3">
                          <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded text-[10px] font-bold capitalize select-none">
                            {b.targetRole || 'All'}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-slate-400 font-semibold">{b.targetDistrict || b.district || 'Nationwide'}</td>
                        <td className="px-5 py-3 text-slate-500 font-mono text-[10px]">
                          {b.sentAt || b.createdAt 
                            ? new Date(b.sentAt || b.createdAt).toLocaleString('en-GB')
                            : 'N/A'}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => setViewMessage(b)}
                            className="text-indigo-400 hover:text-indigo-300 font-bold uppercase tracking-wider text-[10px] select-none"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Live Preview Panel (NotificationBell Popup styling) */}
        <div>
          <div className="glass-card p-6 rounded-2xl border border-white/5 sticky top-6 space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider select-none border-b border-white/5 pb-2">
              NotificationBell Preview
            </h3>

            {title || message ? (
              <div className="w-80 mx-auto glass-panel border border-slate-700/50 rounded-xl overflow-hidden shadow-2xl bg-slate-900/90 text-left">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/50 bg-slate-800/80 select-none">
                  <h4 className="text-[11px] font-black text-white uppercase tracking-wider">Notifications (Live)</h4>
                  <span className="text-[10px] text-indigo-400 font-bold">1 unread</span>
                </div>
                <div className="p-3.5 flex gap-3 bg-blue-500/5">
                  <div className="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700/50 flex items-center justify-center shrink-0 select-none">
                    {getPreviewIcon()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-200 font-bold text-xs truncate">{title || 'Broadcast Title'}</p>
                    <p className="text-slate-400 text-[11px] mt-1 leading-normal break-words">{message || 'Announcement message content body...'}</p>
                    <p className="text-[9px] text-slate-500 mt-2 font-mono select-none">To: {targetRole.toUpperCase()} • {targetDistrict || 'NATIONWIDE'}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-10 text-slate-500 select-none">
                <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-xs font-medium">Compose an announcement to populate live notification bell simulation.</p>
              </div>
            )}

            <div className="text-[10px] text-slate-500 leading-normal space-y-1.5 select-none pt-4 border-t border-white/5">
              <p>• Dispatched signals write records to patient databases.</p>
              <p>• Live push relays will transmit to active socket connections.</p>
            </div>
          </div>
        </div>
      </div>
      
      {/* View Message Modal */}
      <Modal
        isOpen={!!viewMessage}
        onClose={() => setViewMessage(null)}
        title={viewMessage?.title || 'Broadcast Details'}
        size="sm"
      >
        {viewMessage && (
          <div className="space-y-4 select-none">
            <p className="text-slate-300 text-xs leading-relaxed bg-slate-950/40 p-4 rounded-xl border border-white/5 font-medium">
              {viewMessage.message}
            </p>
            <div className="flex gap-4 text-[10px] font-bold text-slate-500 border-t border-white/5 pt-3">
              <span>Audience: <span className="text-slate-300 uppercase">{viewMessage.targetRole || 'All'}</span></span>
              <span>District: <span className="text-slate-300">{viewMessage.targetDistrict || viewMessage.district || 'Nationwide'}</span></span>
            </div>
            <button
              onClick={() => setViewMessage(null)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl border border-white/5"
            >
              Close
            </button>
          </div>
        )}
      </Modal>
    </PageTransition>
  );
};

export default Broadcast;
