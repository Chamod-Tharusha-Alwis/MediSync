# MediSync Phase Changelog

## Phase 7b (Completed)
- **Commit `3a36494`**: `fix(client): resolve react error #31 with shared lab test formatter and history error boundary`
- **Authorized Audit**: Local read-only comparison of pharmacy account candidate passwords against stored bcrypt hash in production database. Verified both Candidate 1 and Candidate 2 match.

## Master Run - Phase A: Live Bugs
- **A1**: `fix(public): resolve public-health 503 with adaptive cold-start timeout and retry degradation` (`7cc6947`)
  - Added adaptive timeout in `server/src/controllers/publicController.js` (60s in production for Render ML cold start, 3s in test).
  - Added retry state and action in `client/src/pages/public/PublicHealth.jsx` with accessible alert banner.
  - Enforced zero fake counts rendering during unavailable states.
  - Added regression test `client/src/__master_offline__/public-health-retry.test.jsx`.
- **A2**: `fix(alerts): prevent unauthenticated broadcast requests without weakening private endpoint auth`
  - Guarded `ActiveOutbreakBanner.jsx` against missing, `'undefined'`, or `'null'` tokens.
  - Preserved private `protect([...])` middleware on `GET /alerts/broadcasts/latest`.
  - Expanded regression suite in `client/src/__master_offline__/phase0-login-banner.test.jsx`.
