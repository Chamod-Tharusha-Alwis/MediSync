import { useTranslation } from '../../i18n/LanguageContext';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Check, CheckCircle, Info, AlertTriangle, Pill, FlaskConical } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { io as socketIO } from 'socket.io-client';
import api, { SOCKET_SERVER_URL } from '../../api/axiosInstance';
import { useNavigate } from 'react-router-dom';
import { clearLocalSession, sessionGeneration } from '../../utils/sessionCleanup';

const NotificationBell = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const active = useRef(false);
  const request = useRef({ id: 0, controller: null });
  const pendingReads = useRef(new Set());
  const navigate = useNavigate();
  const { t } = useTranslation();

  const fetchNotifications = useCallback(async () => {
    const generation = sessionGeneration();
    request.current.controller?.abort();
    const controller = new AbortController(), id = ++request.current.id;
    request.current.controller = controller;
    try {
      const res = await api.get('/notifications', { signal: controller.signal });
      if (!active.current || controller.signal.aborted || generation !== sessionGeneration() || id !== request.current.id) return;
      const rows = res.data?.data, count = res.data?.unreadCount;
      if (!Array.isArray(rows) || !Number.isSafeInteger(count) || count < 0 ||
          rows.some(row => !row || typeof row._id !== 'string' || !/^[a-f0-9]{24}$/i.test(row._id) || typeof row.message !== 'string' || typeof row.read !== 'boolean' || !Number.isFinite(new Date(row.createdAt).getTime())) ||
          new Set(rows.map(row => row._id)).size !== rows.length) throw new Error('Invalid notification response');
      setNotifications(res.data.data);
      setUnreadCount(res.data.unreadCount);
      setLoadError(false);
    } catch (error) {
      if (active.current && !controller.signal.aborted && generation === sessionGeneration() && id === request.current.id) setLoadError(true);
    }
  }, []);

  useEffect(() => {
    active.current = true;
    const reqInstance = request.current;
    const generation = sessionGeneration();
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000); // Poll every 60s

    // Real-time Socket.io listener
    let socket, timer;
    const clear = () => {
      request.current.controller?.abort();
      request.current.id++;
      clearTimeout(timer);
      socket?.disconnect();
      setNotifications([]); setUnreadCount(0); setIsOpen(false); setLoadError(false);
    };
    window.addEventListener('medisync:session-cleared', clear);
    timer = setTimeout(() => {
      if (!active.current || generation !== sessionGeneration()) return;
      const token = localStorage.getItem('token');
      if (token && token !== 'undefined') {
        socket = socketIO(SOCKET_SERVER_URL, {
          auth: { token },
          transports: ['polling', 'websocket'],
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 10000,
          randomizationFactor: 0.5
        });

        socket.on('connect_error', (err) => {
          if (err?.message?.includes('AUTH') || err?.message?.includes('token') || err?.message?.includes('expired')) {
            console.warn('[Socket.IO] Authentication rejected or expired. Halting reconnection.');
            socket.disconnect();
          }
        });

        socket.on('notification', () => {
          if (generation === sessionGeneration()) fetchNotifications();
        });

        socket.on('force_logout', (data) => {
          if (generation !== sessionGeneration()) return;
          alert(data?.message || 'Your session was terminated by an administrator.');
          clearLocalSession();
          window.location.href = '/select-role';
        });
      }
    }, 500);

    return () => {
      active.current = false;
      reqInstance.controller?.abort();
      reqInstance.id++;
      window.removeEventListener('medisync:session-cleared', clear);
      clearInterval(interval);
      clearTimeout(timer);
      if (socket) {
        socket.disconnect();
      }
    };
  }, [fetchNotifications]);

  const markAsRead = async (id, e) => {
    e?.stopPropagation();
    const generation = sessionGeneration(), key = generation + ':' + id;
    if (pendingReads.current.has(key)) return;
    pendingReads.current.add(key);
    try {
      await api.put(`/notifications/${id}/read`);
      if (active.current && generation === sessionGeneration()) await fetchNotifications();
    } catch (err) {
      if (active.current && generation === sessionGeneration()) setLoadError(true);
    } finally { pendingReads.current.delete(key); }
  };

  const markAllRead = async () => {
    const generation = sessionGeneration(), key = generation + ':all';
    if (pendingReads.current.has(key)) return;
    pendingReads.current.add(key);
    try {
      await api.put('/notifications/read-all');
      if (active.current && generation === sessionGeneration()) await fetchNotifications();
    } catch (err) {
      if (active.current && generation === sessionGeneration()) setLoadError(true);
    } finally { pendingReads.current.delete(key); }
  };

  const handleNotificationClick = (notif) => {
    if (!notif.read) markAsRead(notif._id);
    /* eslint-disable-next-line no-control-regex */
    if (typeof notif.actionLink === 'string' && /^\/(?!\/)/.test(notif.actionLink) && !/[\\\u0000-\u001f]/.test(notif.actionLink)) navigate(notif.actionLink);
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
        aria-expanded={isOpen}
        aria-label={t('common.notifications', 'Notifications')}
        title="Notifications"
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
              className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-1rem)] glass-panel border border-slate-700/50 rounded-xl overflow-hidden shadow-2xl"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-slate-800/80">
                <h3 className="text-sm font-bold text-white">{t('common.notifications', 'Notifications')}</h3>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
                    <Check className="w-3 h-3" /> {t('notificationStatus.markAll', 'Mark all read')}
                  </button>
                )}
              </div>
              
              <div className="max-h-96 overflow-y-auto custom-scrollbar bg-slate-900/90">
                {loadError ? <div role="alert" className="p-4 text-sm text-amber-200">
                  <p>{t('notificationStatus.unavailable', 'Notifications unavailable. Please try again.')}</p>
                  <button onClick={fetchNotifications} className="underline mt-2">{t('serviceStatus.retry', 'Try again')}</button>
                </div> : notifications.length === 0 ? (
                  <div className="p-8 text-center text-slate-500">
                    <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-sm">{t('common.noNotifications', 'No notifications')}</p>
                  </div>
                ) : (
                  notifications.map(n => (
                    <div 
                      key={n._id}
                      role="button"
                      tabIndex={0}
                      onKeyDown={event => { if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); handleNotificationClick(n); } }}
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
                          aria-label={t('notificationStatus.markRead', 'Mark notification as read')}
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
