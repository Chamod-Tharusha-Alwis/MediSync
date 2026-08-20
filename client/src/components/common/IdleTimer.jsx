import { useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../../api/axiosInstance';
import { toast } from 'react-toastify';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

const IdleTimer = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const idleTimerRef = useRef(null);
  const lastHeartbeatRef = useRef(Date.now());
  const isAuthPage = location.pathname === '/login' || location.pathname === '/select-role';

  const performLogout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      console.error('Logout error on idle', e);
    } finally {
      localStorage.clear();
      toast.warning('Session expired due to inactivity');
      navigate('/select-role');
    }
  }, [navigate]);

  const resetIdleTimer = useCallback(() => {
    if (isAuthPage) return;

    // Reset local idle timeout
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(performLogout, IDLE_TIMEOUT_MS);

    // Debounce heartbeat ping
    const now = Date.now();
    if (now - lastHeartbeatRef.current > HEARTBEAT_INTERVAL_MS) {
      lastHeartbeatRef.current = now;
      api.post('/auth/heartbeat').catch(() => {
        // Silent fail on heartbeat, if 401 the interceptor will handle it
      });
    }
  }, [isAuthPage, performLogout]);

  useEffect(() => {
    if (isAuthPage) {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      return;
    }

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, resetIdleTimer));

    // Initial setup
    resetIdleTimer();

    return () => {
      events.forEach(event => window.removeEventListener(event, resetIdleTimer));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [isAuthPage, resetIdleTimer]);

  return null;
};

export default IdleTimer;
