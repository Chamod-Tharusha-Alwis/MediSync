import ReactGA from 'react-ga4';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// ─── Measurement ID ────────────────────────────────────────────────────────────
// Replace "G-XXXXXXXXXX" with your real GA4 Measurement ID before going live.
// Store it in your .env as REACT_APP_GA_MEASUREMENT_ID for security.
const GA_MEASUREMENT_ID =
  process.env.REACT_APP_GA_MEASUREMENT_ID || 'G-XXXXXXXXXX';

// ─── Initialise GA4 ───────────────────────────────────────────────────────────
// Called once from App.js on mount.
// testMode: true prevents data from being sent during local development when
// the placeholder ID is still in use.
export function initGA() {
  const isPlaceholder = GA_MEASUREMENT_ID === 'G-XXXXXXXXXX' || !GA_MEASUREMENT_ID;

  if (isPlaceholder) {
    return;
  }

  ReactGA.initialize(GA_MEASUREMENT_ID, {
    gaOptions: {
      cookieFlags: 'SameSite=None;Secure',
    },
  });
}

// ─── usePageTracking hook ──────────────────────────────────────────────────────
// Drop this hook into any component that lives inside <Router> (e.g., App.js).
// It fires a "pageview" event every time the URL pathname changes, giving you
// automatic telemetry for every role-based dashboard route, e.g.:
//   /doctor/dashboard, /patient/history, /pharmacy/prescriptions …
// It silently skips if GA is not configured or in placeholder mode.
export function usePageTracking() {
  const location = useLocation();

  useEffect(() => {
    const isPlaceholder = GA_MEASUREMENT_ID === 'G-XXXXXXXXXX' || !GA_MEASUREMENT_ID;
    if (isPlaceholder) {
      return;
    }

    ReactGA.send({
      hitType: 'pageview',
      page: location.pathname + location.search,
      title: document.title,
    });
  }, [location.pathname, location.search]);
}
