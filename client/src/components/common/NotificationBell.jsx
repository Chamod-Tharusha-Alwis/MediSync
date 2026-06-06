import React, { useState, useEffect } from 'react';
import { Bell, Check, X, CheckCircle, Info, AlertTriangle, Pill, FlaskConical } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { io as socketIO } from 'socket.io-client';
import api from '../../api/axiosInstance';
import { useNavigate } from 'react-router-dom';

const NotificationBell = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.data);
      setUnreadCount(res.data.unreadCount);
    } catch (error) {
      console.error('Failed to fetch notifications', error);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000); // Poll every 60s

    // Real-time Socket.io listener
    let socket;
    const timer = setTimeout(() => {
      const serverUrl = process.env.REACT_APP_SERVER_URL || 'http://localhost:5005';
      const token = localStorage.getItem('token');
      if (token) {
        socket = socketIO(serverUrl, {
          auth: { token },
          transports: ['websocket', 'polling'],
          reconnectionAttempts: 5,
          reconnectionDelay: 3000,
        });

        socket.on('notification', (notification) => {
          setNotifications((prev) => [notification, ...prev]);
          setUnreadCount((prev) => prev + 1);
        });
      }
    }, 500);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  const markAsRead = async (id, e) => {
    e?.stopPropagation();
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {}
  };

  const markAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (err) {}
  };

  const handleNotificationClick = (notif) => {
    if (!notif.read) markAsRead(notif._id);
    if (notif.actionLink) navigate(notif.actionLink);
    setIsOpen(false);
  };

  const getIcon = (type) => {
    switch(type) {
      case 'prescription_ready': return <Pill className="w-4 h-4 text-emerald-400" />;
      case 'appointment_confirmed': return <CheckCircle className="w-4 h-4 text-blue-400" />;
      case 'outbreak_alert': return <AlertTriangle className="w-4 h-4 text-rose-400" />;
      case 'low_stock': return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case 'lab_test_approved': return <CheckCircle className="w-4 h-4 text-teal-400" />;
      case 'lab_report_ready': return <FlaskConical className="w-4 h-4 text-emerald-400" />;
      default: return <Info className="w-4 h-4 text-slate-400" />;
    }
  };

  const timeAgo = (date) => {
    const s = Math.floor((new Date() - new Date(date)) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s/60)}m ago`;
    if (s < 86400) return `${Math.floor(s/3600)}h ago`;
    return `${Math.floor(s/86400)}d ago`;
  };

  return (
    <div className="relative z-50">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-full hover:bg-slate-800/50 transition-colors"
      >
        <Bell className="w-5 h-5 text-slate-300" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-slate-900" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0" onClick={() => setIsOpen(false)} />
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="absolute right-0 mt-2 w-80 glass-panel border border-slate-700/50 rounded-xl overflow-hidden shadow-2xl"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-slate-800/80">
                <h3 className="text-sm font-bold text-white">Notifications</h3>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Mark all read
                  </button>
                )}
              </div>
              
              <div className="max-h-96 overflow-y-auto custom-scrollbar bg-slate-900/90">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">No notifications</p>
                  </div>
                ) : (
                  notifications.map(n => (
                    <div 
                      key={n._id}
                      onClick={() => handleNotificationClick(n)}
                      className={`p-3 border-b border-slate-800 flex gap-3 cursor-pointer hover:bg-slate-800/50 transition-colors ${!n.read ? 'bg-blue-500/5' : ''}`}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {getIcon(n.type)}
                      </div>
                      <div className="flex-1">
                        <p className={`text-sm ${!n.read ? 'text-slate-200 font-semibold' : 'text-slate-400'}`}>
                          {n.message}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">{timeAgo(n.createdAt)}</p>
                      </div>
                      {!n.read && (
                        <button 
                          onClick={(e) => markAsRead(n._id, e)}
                          className="flex-shrink-0 text-slate-500 hover:text-slate-300"
                        >
                          <div className="w-2 h-2 bg-blue-500 rounded-full" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBell;
