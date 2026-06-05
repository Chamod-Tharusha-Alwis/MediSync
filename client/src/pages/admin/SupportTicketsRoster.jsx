import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import { MessageSquare, Calendar, Mail, FileText, CheckCircle, Clock, Send, ShieldCheck, HelpCircle } from 'lucide-react';
import api from '../../api/axiosInstance';
import PageTransition from '../../components/common/PageTransition';

const SupportTicketsRoster = () => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All'); // 'All', 'Open', 'Closed'
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);

  const fetchTickets = async () => {
    try {
      const res = await api.get('/support/all-tickets');
      setTickets(res.data.data || []);
    } catch (err) {
      toast.error('Failed to load support tickets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const handleReplySubmit = async (e) => {
    e.preventDefault();
    if (!replyText.trim()) return toast.error('Reply cannot be empty');
    setSubmittingReply(true);
    try {
      await api.post(`/support/ticket/${selectedTicket._id}/reply`, {
        reply: replyText.trim()
      });
      toast.success('Reply submitted and email notification sent!');
      setReplyText('');
      setSelectedTicket(null);
      fetchTickets();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send reply');
    } finally {
      setSubmittingReply(false);
    }
  };

  const filteredTickets = tickets.filter(ticket => {
    if (filter === 'All') return true;
    return ticket.status === filter;
  });

  return (
    <PageTransition className="p-6">
      {/* Header */}
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Support Tickets</h1>
          <p className="text-slate-400 mt-1">Manage and respond to patient inquiries across the platform.</p>
        </div>
        
        {/* Status Filters */}
        <div className="flex gap-2 bg-slate-800/40 border border-slate-700/50 p-1.5 rounded-xl">
          {['All', 'Open', 'Closed'].map(status => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                filter === status
                  ? 'bg-blue-600 text-white shadow-[0_0_10px_rgba(37,99,235,0.3)]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Tickets List */}
        <div className="lg:col-span-2 space-y-4">
          {loading ? (
            <div className="p-12 text-center text-slate-400">Loading support tickets...</div>
          ) : filteredTickets.length > 0 ? (
            <div className="grid grid-cols-1 gap-4">
              {filteredTickets.map(ticket => (
                <motion.div
                  key={ticket._id}
                  layout
                  className={`glass-panel p-6 rounded-2xl border transition-all cursor-pointer ${
                    selectedTicket?._id === ticket._id
                      ? 'border-blue-500/40 bg-blue-500/5'
                      : 'border-white/5 hover:border-white/10'
                  }`}
                  onClick={() => {
                    setSelectedTicket(ticket);
                    setReplyText('');
                  }}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="text-white font-bold text-lg">{ticket.subject}</h3>
                      <p className="text-slate-400 text-xs mt-1 flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5" /> {ticket.patientId?.fullName || 'Anonymous Patient'} ({ticket.patientId?.email || 'N/A'})
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      ticket.status === 'Open'
                        ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}>
                      {ticket.status}
                    </span>
                  </div>
                  
                  <p className="text-slate-300 text-sm line-clamp-2 mt-2">{ticket.message}</p>
                  
                  <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-800/60 text-xs text-slate-500 font-medium">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" /> {new Date(ticket.createdAt).toLocaleString()}
                    </span>
                    {ticket.status === 'Closed' && (
                      <span className="text-emerald-400 font-semibold flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" /> Resolved
                      </span>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="glass-panel p-12 rounded-2xl text-center text-slate-500">
              <HelpCircle className="w-12 h-12 mx-auto opacity-30 mb-3" />
              <p className="text-lg font-bold">No {filter !== 'All' ? filter.toLowerCase() : ''} support tickets found</p>
            </div>
          )}
        </div>

        {/* Selected Ticket Response panel */}
        <div>
          <div className="glass-panel p-6 rounded-2xl sticky top-6">
            {selectedTicket ? (
              <div className="space-y-6">
                <div>
                  <h3 className="text-white font-bold text-xl">{selectedTicket.subject}</h3>
                  <p className="text-slate-400 text-xs mt-2 font-mono">NIC: {selectedTicket.patientId?.nic || 'N/A'}</p>
                  <p className="text-slate-500 text-xs mt-1">Submitted on: {new Date(selectedTicket.createdAt).toLocaleString()}</p>
                </div>
                
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">Message</p>
                  <p className="text-slate-300 text-sm whitespace-pre-line leading-relaxed">{selectedTicket.message}</p>
                </div>

                {selectedTicket.status === 'Open' ? (
                  <form onSubmit={handleReplySubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Respond to Patient</label>
                      <textarea
                        rows={5}
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        placeholder="Type your resolution reply here..."
                        required
                        className="w-full bg-slate-900/80 border border-slate-700/80 rounded-xl p-4 text-white text-sm focus:border-blue-500 outline-none resize-none"
                      />
                    </div>
                    
                    <button
                      type="submit"
                      disabled={submittingReply || !replyText.trim()}
                      className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all shadow-[0_4px_12px_rgba(37,99,235,0.3)] flex items-center justify-center gap-2"
                    >
                      {submittingReply ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="w-4 h-4" />}
                      Send Response & Close Ticket
                    </button>
                  </form>
                ) : (
                  <div className="space-y-4 pt-4 border-t border-slate-800/80">
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                      <div className="text-emerald-400 text-xs font-bold uppercase mb-2 flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5" /> Admin Reply Sent
                      </div>
                      <p className="text-slate-300 text-sm whitespace-pre-line leading-relaxed">{selectedTicket.adminReply}</p>
                      <p className="text-slate-500 text-[10px] mt-3">Resolved on {new Date(selectedTicket.repliedAt).toLocaleString()}</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-600">
                <FileText className="w-12 h-12 mx-auto opacity-30 mb-3" />
                <p className="text-sm font-semibold">Select a support ticket to respond or review details.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
};

export default SupportTicketsRoster;
