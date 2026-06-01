import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5005/api',
  withCredentials: true,
});

// Request interceptor — attach auth + optional patient-access token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    // Support patient-access temp token (stored in component state, passed via config)
    if (config._patientAccessToken) {
      config.headers['x-patient-access'] = config._patientAccessToken;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Helper: clear everything and redirect to login
const clearSessionAndRedirect = () => {
  localStorage.clear();
  window.location.href = '/select-role';
};

// Response interceptor — handle 401 (expired session) and 403 (ban)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
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
      localStorage.clear();
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
    // Don't try to refresh on login/refresh endpoints themselves
    const isAuthEndpoint = originalRequest.url?.includes('/auth/login') ||
                           originalRequest.url?.includes('/auth/refresh') ||
                           originalRequest.url?.includes('/patient/login');

    // ─── BACKGROUND ALERT REQUESTS — never log out on these ──────────────────
    // The alert banner polls silently; a 401/403 here must not destroy the session.
    const isAlertEndpoint = originalRequest.url?.includes('/alerts');

    if (status === 401) {
      if (isAuthEndpoint) {
        // If it's a login failure, clear any stale tokens just in case
        localStorage.clear();
        return Promise.reject(error);
      }

      // Fail silently for background alert polling — do NOT log the user out
      if (isAlertEndpoint) {
        return Promise.reject(error);
      }

      if (!originalRequest._retry) {
        originalRequest._retry = true;

        try {
          const { data } = await axios.post(
            'http://localhost:5005/api/auth/refresh',
            {},
            { withCredentials: true }
          );

          const newToken = data?.data?.accessToken || data?.accessToken;

          if (newToken) {
            localStorage.setItem('token', newToken);
            api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
            originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
            return api(originalRequest);
          }
        } catch (refreshError) {
          // Refresh failed — session is gone, force full logout
          console.error('[MediSync] Session expired, clearing and redirecting.');
          clearSessionAndRedirect();
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