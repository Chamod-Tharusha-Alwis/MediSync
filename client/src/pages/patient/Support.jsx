import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, FileText, CheckCircle, Clock, Loader2, MessageSquare, AlertCircle, LifeBuoy } from 'lucide-react';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';
import PageTransition from '../../components/common/PageTransition';

const PatientSupport = () => {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);

  const fetchTickets = async () => {
    try {
      const res = await api.get('/support/my-tickets');
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      return toast.error('Subject and message are required');
    }
    setSubmitting(true);
    try {
      await api.post('/support/ticket', {
        subject: subject.trim(),
        message: message.trim()
      });
      toast.success('Support ticket created successfully!');
      setSubject('');
      setMessage('');
      fetchTickets();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit ticket');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageTransition className="p-4 md:p-8">
      {/* Page Header */}
      <div className="mb-8 flex items-center gap-3">
        <LifeBuoy className="w-8 h-8 text-pink-500" />
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Help & Support</h1>
          <p className="text-slate-400 mt-1">Submit support requests or view updates on your existing inquiries.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left/Middle Columns: Support Form & Details */}
        <div className="lg:col-span-2 space-y-8">
          {/* New Ticket Form */}
          <div className="glass-panel p-6 rounded-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-[0.03]">
              <MessageSquare className="w-48 h-48 text-pink-500" />
            </div>
            
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <Send className="w-4 h-4 text-pink-400" /> Open a New Support Inquiry
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="What can we help you with?"
                  className="w-full px-4 py-3 bg-slate-900/60 border border-white/10 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-pink-500/60 focus:bg-slate-900/80 transition-all duration-200"
                  required
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Message</label>
                <textarea
                  rows={5}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Explain your issue or question in detail..."
                  className="w-full px-4 py-3 bg-slate-900/60 border border-white/10 rounded-xl text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-pink-500/60 focus:bg-slate-900/80 transition-all duration-200 resize-none"
                  required
                />
              </div>
              
              <button
                type="submit"
                disabled={submitting}
                className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 shadow-[0_4px_20px_rgba(244,63,94,0.30)] transition-all duration-300 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {submitting ? 'Submitting...' : 'Submit Inquiry'}
              </button>
            </form>
          </div>

          {/* Selected Ticket Response Details */}
          {selectedTicket && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-panel p-6 rounded-2xl border border-pink-500/20 bg-pink-500/5 relative"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h4 className="text-white font-bold text-lg">{selectedTicket.subject}</h4>
                  <p className="text-slate-500 text-xs mt-1">Submitted on {new Date(selectedTicket.createdAt).toLocaleString()}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${selectedTicket.status === 'Open' ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30' : 'bg-slate-700/50 text-slate-400 border border-slate-600/30'}`}>
                  {selectedTicket.status}
                </span>
              </div>
              
              <div className="bg-slate-950/60 border border-white/5 rounded-xl p-4 mb-4">
                <p className="text-xs font-bold text-slate-500 uppercase mb-2">Your Inquiry</p>
                <p className="text-slate-300 text-sm whitespace-pre-line leading-relaxed">{selectedTicket.message}</p>
              </div>

              {selectedTicket.adminReply ? (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold uppercase mb-2">
                    <CheckCircle className="w-3.5 h-3.5" /> Support Team Response
                  </div>
                  <p className="text-slate-200 text-sm whitespace-pre-line leading-relaxed">{selectedTicket.adminReply}</p>
                  <p className="text-slate-500 text-[10px] mt-3">Resolved on {new Date(selectedTicket.repliedAt).toLocaleString()}</p>
                </div>
              ) : (
                <div className="bg-slate-800/20 border border-slate-700/30 rounded-xl p-4 flex items-center gap-3 text-slate-400">
                  <Clock className="w-5 h-5 text-pink-400 flex-shrink-0" />
                  <p className="text-sm">Inquiry pending review. Our administrator will email you a response shortly.</p>
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* Right Column: Inquiries List */}
        <div>
          <div className="glass-panel p-6 rounded-2xl h-full flex flex-col">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4 text-pink-400" /> Inquiry History
            </h3>
            
            <div className="space-y-3 overflow-y-auto max-h-[60vh] flex-1 custom-scrollbar">
              {loading ? (
                <div className="text-center py-8 text-slate-500">Loading inquiries...</div>
              ) : tickets.length > 0 ? (
                tickets.map(ticket => (
                  <button
                    key={ticket._id}
                    onClick={() => setSelectedTicket(ticket)}
                    className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                      selectedTicket?._id === ticket._id
                        ? 'bg-pink-500/10 border-pink-500/40 text-white'
                        : 'bg-slate-900/40 border-white/5 hover:border-white/10 text-slate-300'
                    }`}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${ticket.status === 'Open' ? 'bg-pink-500/20 text-pink-400' : 'bg-slate-800 text-slate-500'}`}>
                        {ticket.status}
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">
                        {new Date(ticket.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <h4 className="font-bold text-sm truncate">{ticket.subject}</h4>
                    <p className="text-xs text-slate-500 truncate mt-1">{ticket.message}</p>
                  </button>
                ))
              ) : (
                <div className="text-center py-12 text-slate-600">
                  <AlertCircle className="w-10 h-10 mx-auto opacity-30 mb-3" />
                  <p className="text-sm font-medium">No previous inquiries</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
};

export default PatientSupport;
