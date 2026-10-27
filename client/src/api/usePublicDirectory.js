import { useCallback, useEffect, useState } from 'react';
import api from './axiosInstance';

export function usePublicDirectory(endpoint) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true); setError(false);
    (async () => {
      try {
        const response = await api.get(endpoint, { signal: controller.signal });
        if (!Array.isArray(response?.data?.data)) throw new Error('INVALID_DIRECTORY_RESPONSE');
        if (active) setRecords(response.data.data);
      } catch (_) {
        if (active) { setRecords([]); setError(true); }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [endpoint, attempt]);
  return { records, loading, error, retry };
}
