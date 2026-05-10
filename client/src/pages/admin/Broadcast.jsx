import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Send, MessageSquare, Users, MapPin, Loader2, CheckCircle } from 'lucide-react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import PageTransition from '../../components/common/PageTransition';
import { useQuery, useMutation } from '@tanstack/react-query';

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
      refetchBroadcasts(); // refresh the history table
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

  return (
    <PageTransition className="p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight">Broadcast Center</h1>
        <p className="text-slate-400 mt-1">Send targeted alerts and announcements to platform users.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Composer */}
        <div className="lg:col-span-2">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel rounded-xl p-6 border border-slate-700/50">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-indigo-500/20 rounded-lg">
                <MessageSquare className="w-5 h-5 text-indigo-400" />
              </div>
              <h3 className="text-lg font-bold text-white">Compose Message</h3>
            </div>

            <div className="space-y-5">
              {/* Title */}
              <div>
                <label className="text-sm font-medium text-slate-300 mb-2 block">Alert Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Dengue Outbreak Warning"
                  className="w-full p-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent"
                />
              </div>

              {/* Message */}
              <div>
                <label className="text-sm font-medium text-slate-300 mb-2 block">
                  Message Body
                  <span className={`ml-2 text-xs ${message.length > 450 ? 'text-amber-400' : 'text-slate-500'}`}>
                    {message.length}/500
                  </span>
                </label>
                <textarea
                  value={message}
                  onChange={(e) => { if (e.target.value.length <= 500) setMessage(e.target.value); }}
                  placeholder="Write your alert message here..."
                  rows={5}
                  className="w-full p-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-transparent resize-none"
                />
              </div>

              {/* Target Selectors */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-slate-300 mb-2 block flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> Target Role
                  </label>
                  <select
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    className="w-full p-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  >
                    <option value="all">All Users</option>
                    <option value="doctor">Doctors Only</option>
                    <option value="patient">Patients Only</option>
                    <option value="pharmacist">Pharmacists Only</option>
                    <option value="health_officer">Health Officers</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-300 mb-2 block flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" /> Target District
                  </label>
                  <select
                    value={targetDistrict}
                    onChange={(e) => setTargetDistrict(e.target.value)}
                    className="w-full p-3 bg-slate-800/50 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  >
                    <option value="">All Districts (Nationwide)</option>
                    {SRI_LANKA_DISTRICTS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Send Button */}
              <button
                onClick={handleSend}
                disabled={sendMutation.isPending || !title.trim() || !message.trim()}
                className={`w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl text-sm font-bold transition-all ${
                  sendMutation.isSuccess
                    ? 'bg-emerald-600 text-white'
                    : 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white shadow-lg shadow-indigo-500/20'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {sendMutation.isSuccess ? (
                  <><CheckCircle className="w-5 h-5" /> Message Sent!</>
                ) : sendMutation.isPending ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Sending...</>
                ) : (
                  <><Send className="w-5 h-5" /> Send Broadcast</>
                )}
              </button>
            </div>
          </motion.div>

          {/* Broadcast History section */}
          <div className="glass-panel rounded-xl p-6 border border-slate-700/50 mt-6">
            <h3 className="font-bold text-white mb-4">Sent Broadcasts</h3>
            
            {broadcasts.length === 0 ? (
              <p className="text-slate-400 text-center py-6 text-sm">No broadcasts sent yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="bg-slate-800 border-b border-slate-700 text-slate-300">
                    <tr>
                      <th className="px-3 py-2 font-medium text-xs">Title</th>
                      <th className="px-3 py-2 font-medium text-xs">Target Role</th>
                      <th className="px-3 py-2 font-medium text-xs">District</th>
                      <th className="px-3 py-2 font-medium text-xs">Sent At</th>
                      <th className="px-3 py-2 font-medium text-xs">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {broadcasts.map((b, i) => (
                      <tr key={b._id || i} className="border-b border-slate-800 hover:bg-slate-800/30">
                        <td className="px-3 py-2 font-medium text-white">{b.title || 'Untitled Alert'}</td>
                        <td className="px-3 py-2">
                          <span className="bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded text-xs font-bold capitalize">
                            {b.targetRole || 'All'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-400">
                          {b.targetDistrict || b.district || 'Nationwide'}
                        </td>
                        <td className="px-3 py-2 text-slate-400">
                          {b.sentAt || b.createdAt 
                            ? new Date(b.sentAt || b.createdAt).toLocaleString('en-GB')
                            : 'N/A'}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => setViewMessage(b)}
                            className="text-blue-400 hover:text-blue-300 transition-colors text-xs font-medium"
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

        {/* Preview Panel */}
        <div>
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel rounded-xl p-6 border border-slate-700/50 sticky top-6">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Live Preview</h3>

            {title || message ? (
              <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/30">
                <div className="flex items-start gap-3 mb-3">
                  <div className="p-1.5 bg-red-500/20 rounded-lg shrink-0 mt-0.5">
                    <MessageSquare className="w-4 h-4 text-red-400" />
                  </div>
                  <div>
                    <h4 className="text-white font-bold text-sm">{title || 'Alert Title'}</h4>
                    <p className="text-slate-400 text-xs mt-0.5">
                      To: {targetRole === 'all' ? 'All Users' : targetRole} • {targetDistrict || 'Nationwide'}
                    </p>
                  </div>
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">{message || 'Message content...'}</p>
                <p className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-700/50">
                  {new Date().toLocaleString()}
                </p>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-20" />
                <p className="text-sm">Start typing to see preview</p>
              </div>
            )}

            <div className="mt-6 space-y-2 text-xs text-slate-500">
              <p>• Messages are sent via email to registered patients in the target district.</p>
              <p>• Real-time Socket.IO notifications will be pushed to connected clients.</p>
              <p>• All broadcasts are logged in the audit trail.</p>
            </div>
          </motion.div>
        </div>
      </div>
      
      {/* View Message Modal */}
      {viewMessage && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="glass-panel rounded-xl border border-slate-700/50 p-6 max-w-lg w-full mx-4 shadow-2xl">
            <h3 className="font-bold text-lg text-white mb-2">{viewMessage.title || 'Broadcast Alert'}</h3>
            <p className="text-slate-300 text-sm mb-5 leading-relaxed bg-slate-800/50 p-4 rounded-lg">{viewMessage.message}</p>
            <div className="flex gap-4 text-xs text-slate-400 mb-6 border-t border-slate-700/50 pt-4">
              <span>Target: <span className="text-white">{viewMessage.targetRole || 'All'}</span></span>
              <span>District: <span className="text-white">{viewMessage.targetDistrict || viewMessage.district || 'Nationwide'}</span></span>
            </div>
            <button
              onClick={() => setViewMessage(null)}
              className="w-full bg-slate-700 hover:bg-slate-600 text-white px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </PageTransition>
  );
};

export default Broadcast;
