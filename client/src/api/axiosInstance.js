import { clearLocalSession, sessionGeneration } from '../utils/sessionCleanup';
import axios from 'axios';
import { getDeviceFingerprint, getHardwareModel } from '../utils/deviceFingerprint';
import { resolveClinicalEndpoints } from '../config/clinicalEndpoints';

const isBrowserLocalhost = () =>
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const isQa = process.env.REACT_APP_MEDISYNC_QA === 'true';
if (isQa && typeof window !== 'undefined' &&
    (window.location.hostname !== '127.0.0.1' || window.location.port !== '3100')) {
  throw new Error('MediSync QA frontend must run at http://127.0.0.1:3100.');
}

export const sanitizeRuntimeUrl = (rawUrl, fallbackUrl) => {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return fallbackUrl;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(trimmed)) {
    if (!isBrowserLocalhost()) {
      return fallbackUrl;
    }
    return trimmed.replace(/:5005(\b|\/|$)/, ':5000$1');
  }
  return trimmed;
};

const clinicalEndpoints = process.env.NODE_ENV === 'production' && !isQa
  ? resolveClinicalEndpoints(process.env.REACT_APP_API_URL, process.env.REACT_APP_SERVER_URL)
  : null;

export const API_BASE_URL = clinicalEndpoints?.apiBaseUrl || (isQa ? '/api' : (process.env.REACT_APP_API_URL || '/api'));

export const SOCKET_SERVER_URL = clinicalEndpoints?.socketServerUrl || (isQa ? 'http://127.0.0.1:3100' : sanitizeRuntimeUrl(
  process.env.REACT_APP_SERVER_URL ||
    (process.env.REACT_APP_API_URL ? process.env.REACT_APP_API_URL.replace(/\/api\/?$/, '') : ''),
  typeof window !== 'undefined' ? window.location.origin : ''
));

const assertQaRequest = (config) => {
    for (const value of [config.url, config.baseURL]) {
      if (!value) continue;
      const parsed = new URL(value, 'http://127.0.0.1:3100');
      if (parsed.origin !== 'http://127.0.0.1:3100') {
        throw new Error('External QA API request blocked.');
      }
    }
    return config;
};
if (isQa) {
  axios.interceptors.request.use(assertQaRequest);
}

const api = axios.create({
  baseURL: sanitizeRuntimeUrl(API_BASE_URL, '/api'),
  withCredentials: true,
});
if (isQa) api.interceptors.request.use(assertQaRequest);

// Request interceptor — attach auth + optional patient-access token
api.interceptors.request.use(
  async (config) => {
    const requestGeneration = sessionGeneration();
    const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
    if (token && token !== 'undefined' && token !== 'null') {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    // Support patient-access temp token (stored in component state, passed via config)
    if (config._patientAccessToken) {
      config.headers['x-patient-access'] = config._patientAccessToken;
    }

    const fp = await getDeviceFingerprint();
    if (fp) config.headers['X-Device-Fingerprint'] = fp;

    const hwModel = await getHardwareModel();
    if (hwModel) config.headers['X-Hardware-Model'] = hwModel;

    if (requestGeneration !== sessionGeneration()) throw new Error('Session changed before request dispatch');

    return config;
  },
  (error) => Promise.reject(error)
);

window.addEventListener('medisync:session-cleared', () => {
  delete api.defaults.headers.common.Authorization;
});

// Clear authentication state and redirect to login
let sessionRedirectInProgress = false;
const clearSessionAndRedirect = () => {
  // Concurrent failed requests share one refresh, and must also share one
  // terminal redirect. Repeated hard navigations can abort the login page.
  if (sessionRedirectInProgress) return;
  sessionRedirectInProgress = true;
  clearLocalSession();
  window.location.href = '/select-role';
};

// Shared in-flight refresh promise so concurrent 401s queue behind a single refresh rotation
let refreshTokenPromise = null;

const performTokenRefresh = async () => {
  if (process.env.REACT_APP_UNIVERSITY_RUNTIME === 'true') { clearLocalSession(); throw new Error('Demonstration session expired. Sign in again.'); }
  const startedGeneration = sessionGeneration();
  const storedRefreshToken = localStorage.getItem('refreshToken');
  const headers = {};

  const fp = await getDeviceFingerprint();
  if (fp) headers['X-Device-Fingerprint'] = fp;

  const hwModel = await getHardwareModel();
  if (hwModel) headers['X-Hardware-Model'] = hwModel;

  if (startedGeneration !== sessionGeneration()) throw new Error('Session changed before refresh dispatch');

  const { data } = await axios.post(
    `${sanitizeRuntimeUrl(API_BASE_URL, '/api')}/auth/refresh`,
    { refreshToken: storedRefreshToken },
    { withCredentials: true, headers }
  );

  const newToken = data?.data?.accessToken || data?.accessToken;
  const newRefreshToken = data?.data?.refreshToken || data?.refreshToken;

  if (!newToken) {
    const missingTokenErr = new Error('Refresh response did not include an access token');
    missingTokenErr.isAuthFailure = true;
    throw missingTokenErr;
  }

  if (startedGeneration !== sessionGeneration()) {
    const error = new Error('Session changed during refresh');
    error.isAuthFailure = true;
    throw error;
  }
  localStorage.setItem('token', newToken);
  localStorage.setItem('accessToken', newToken);
  if (newRefreshToken) {
    localStorage.setItem('refreshToken', newRefreshToken);
  }
  api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
  return newToken;
};

// Response interceptor — handle 401 (expired session) and 403 (ban)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};
    const status = error.response?.status;
    const errBody = error.response?.data;

    // ─── BAN DETECTION ───────────────────────────────────────────────────────
    if (status === 403 && errBody?.error === 'Account suspended') {
      // Dispatch custom event so BanNotice component can render
      window.dispatchEvent(new CustomEvent('medisync:banned', {
        detail: {
          banType: errBody.banType,
          reason: errBody.reason,
          expiresAt: errBody.expiresAt,
          message: errBody.message,
        }
      }));
      clearLocalSession();
      return Promise.reject(error);
    }

    // ─── PATIENT ACCESS REQUIRED (not a login error) ─────────────────────────
    if (status === 403 && errBody?.requiresPatientAccess) {
      // Let the calling component handle this — bubble up
      return Promise.reject(error);
    }

    // ─── 403 — FORBIDDEN FLOW (Graceful return) ───────────────────────────────
    if (status === 403) {
      // Return gracefully, let the calling component handle it (e.g. toast notification)
      // WITHOUT clearing session or redirecting
      return Promise.reject(error);
    }

    // ─── 401 — TOKEN REFRESH FLOW ─────────────────────────────────────────────
    // Don't try to refresh on login/refresh/heartbeat endpoints themselves
    const isAuthEndpoint = originalRequest.url?.includes('/auth/login') ||
                           originalRequest.url?.includes('/auth/refresh') ||
                           originalRequest.url?.includes('/auth/heartbeat') ||
                           originalRequest.url?.includes('/auth/send-otp') ||
                           originalRequest.url?.includes('/patient/login') ||
                           originalRequest.url?.includes('/hospital/login') ||
                           originalRequest.url?.includes('/pharmacy/login') ||
                           originalRequest.url?.includes('/verify-access') ||
                           originalRequest.url?.includes('/verify-otp') ||
                           originalRequest.url?.includes('/lab/patient/download') ||
                           originalRequest.url?.includes('/lab/doctor/download');

    // ─── BACKGROUND ALERT REQUESTS — never log out on these ──────────────────
    // The alert banner polls silently; a 401/403 here must not destroy the session.
    const isAlertEndpoint = originalRequest.url?.includes('/alerts');

    if (status === 401) {
      if (isAuthEndpoint) {
        return Promise.reject(error);
      }

      // Fail silently for background alert polling — do NOT log the user out
      if (isAlertEndpoint) {
        return Promise.reject(error);
      }

      if (!originalRequest._retry) {
        originalRequest._retry = true;

        try {
          if (!refreshTokenPromise) {
            refreshTokenPromise = performTokenRefresh().finally(() => {
              refreshTokenPromise = null;
            });
          }

          const newToken = await refreshTokenPromise;
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
          return api(originalRequest);
        } catch (refreshError) {
          const refreshStatus = refreshError?.response?.status;
          const shouldClearSession =
            refreshError?.isAuthFailure ||
            refreshStatus === 401 ||
            refreshStatus === 403 ||
            !localStorage.getItem('refreshToken');

          if (shouldClearSession) {
            clearSessionAndRedirect();
          }
          return Promise.reject(refreshError);
        }
      } else {
        // If retry is true but we still got 401, clear and redirect
        clearSessionAndRedirect();
      }
    }

    return Promise.reject(error);
  }
);

export default api;
