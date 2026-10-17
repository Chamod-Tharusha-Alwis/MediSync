import { useCallback, useEffect, useRef, useState } from 'react';

// JWT expiry is a UI timer only. Every read still requires server authorization.
export const grantExpiry = token => {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const exp = JSON.parse(atob(part)).exp;
    return Number.isFinite(exp) ? exp * 1000 : 0;
  } catch { return 0; }
};

export default function usePatientConsent(api, nic, onRevoke) {
  const [state, setState] = useState({ status: 'idle', patient: null, history: [], token: '', error: '' });
  const run = useRef(0), request = useRef(null), timer = useRef(null), busy = useRef(false);
  const currentNic = useRef(nic); currentNic.current = nic;
  const revokeCallback = useRef(onRevoke); revokeCallback.current = onRevoke;
  const revoke = useCallback((error = '') => {
    run.current++; request.current?.abort(); clearTimeout(timer.current); busy.current = false;
    setState({ status: error ? 'error' : 'idle', patient: null, history: [], token: '', error });
    revokeCallback.current?.();
  }, []);
  useEffect(() => { revoke(); return () => { run.current++; request.current?.abort(); clearTimeout(timer.current); }; }, [nic, revoke]);
  useEffect(() => {
    const clear = () => revoke('Your session ended. Sign in again.');
    window.addEventListener('medisync:session-cleared', clear);
    return () => window.removeEventListener('medisync:session-cleared', clear);
  }, [revoke]);
  const authorize = async token => {
    if (busy.current) return false;
    const expiry = grantExpiry(token);
    if (expiry <= Date.now()) { revoke('Patient access expired. Request verification again.'); return false; }
    const identifier = nic.trim().toUpperCase(), id = ++run.current;
    busy.current = true; request.current = new AbortController();
    timer.current = setTimeout(() => revoke('Patient access expired. Request verification again.'), Math.min(expiry - Date.now(), 2147483647));
    setState({ status: 'loading', patient: null, history: [], token: '', error: '' });
    const options = { signal: request.current.signal, headers: { 'x-patient-access': token } };
    try {
      const profile = await api.get(`/patient/${encodeURIComponent(identifier)}`, options);
      if (id !== run.current || currentNic.current !== nic) return false;
      const history = await api.get(`/patient/${encodeURIComponent(identifier)}/timeline`, options);
      if (id !== run.current || currentNic.current !== nic || Date.now() >= expiry) return false;
      if (!profile.data?.data) throw new Error('Missing authorized profile');
      setState({ status: 'authorized', patient: profile.data.data, history: history.data?.data || [], token, error: '' });
      return true;
    } catch (error) {
      if (id !== run.current) return false;
      const status = error.response?.status;
      revoke(status === 401 ? 'Your session ended. Sign in again.' : status === 403 ? 'Patient access was denied. Request verification again.' : status === 404 ? 'No patient was found for this authorized request.' : 'Unable to load authorized patient records. Retry verification.');
      return false;
    } finally { if (id === run.current) busy.current = false; }
  };
  return { ...state, authorize, revoke };
}
