# OWASP ZAP baseline (passive) scan

- ZAP **2.17.0**, image `ghcr.io/zaproxy/zaproxy:stable` (digest `sha256:9624669db72f…f328af`), `zap-baseline.py`. **Passive only: no active attack.**
- Date: 2026-11-25 (+05:30). Before: 11:19:50 to 11:21:56. After: 11:27:39 to 11:30:22. Code `fd71d33` plus the header change below.
- Raw reports: `before/`, `after/`, `production_front_page_passive/` (HTML, JSON, MD and console text, with the exact command at the top).
- Reproduce: `node scripts/zap/local_scan_stack.cjs`, then `bash scripts/zap/run_local_baseline.sh before|after`.

## What was scanned

| Target | What it is |
|---|---|
| `http://host.docker.internal:3300` | The real client build, served with the headers of `client/vercel.json` |
| `http://host.docker.internal:5300` | The real Express `startServer()` in `NODE_ENV=production`, 13 known GET paths requested through `scripts/zap/api_hook.py` |
| `http://host.docker.internal:5399/health` | The real Flask `ml-engine/app.py` under its local development server |

**Local test differences (disclosed).** The database is an empty in-memory MongoDB, Redis is a throwaway container, and all secrets are
random. `server/src/config/db.js` is replaced in memory only, because the protected `dbGuard.js` accepts Atlas hosts only; no source
file was edited. Rate limits were **not relaxed**. No page behind a login was scanned. The local client server is not Vercel's edge.

## Alerts by risk (number of alert types)

| Target | Run | High | Medium | Low | Informational |
|---|---|---|---|---|---|
| Client | before | 0 | 2 | 1 | 1 |
| Client | **after** | 0 | **1** | 2 | 3 |
| API | before = after | 0 | 0 | 1 | 2 |
| ML engine | before = after | 0 | 1 | 3 | 1 |
| **Total** | before | **0** | **3** | **5** | **4** |
| **Total** | after | **0** | **2** | **6** | **6** |

Low and Informational rose because ZAP raised new types (two cross-origin headers, two cache notes) that were not raised before.

## Every alert

| Target / run | Alert | Risk | URLs | Real? | Fix or decision |
|---|---|---|---|---|---|
| Client before | Content Security Policy Header Not Set | Medium | 2 | Real | **Fixed**: CSP in `client/vercel.json` |
| Client before | Missing Anti-clickjacking Header | Medium | 2 | Real | **Fixed**: `X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self'` |
| Client before | X-Content-Type-Options Missing | Low | 4 | Real | **Fixed**: `nosniff` |
| Client before and after | Modern Web Application | Info | 2 | Information only | None |
| Client after | CSP: style-src unsafe-inline | Medium | 2 | Real, accepted | React, charts and map use inline styles; removing it would break pages. Scripts allow no inline code. |
| Client after | Cross-Origin-Embedder-Policy Missing | Low | 2 | Real, accepted | Adding it would block the Google Maps frame and Cloudinary images |
| Client after | Cross-Origin-Resource-Policy Missing | Low | 5 | Real, accepted | Not set: other sites and emails may load the public logo |
| Client after | Non-Storable Content | Info | 4 | Intended | Pages are `no-store` on purpose |
| Client after | Storable and Cacheable Content | Info | 2 | Intended | Hashed static bundles are immutable |
| API both | Application Error Disclosure | Low | 1 | **False positive** for disclosure; real local 500 | `/api/public/diseases/search?q=dengue` returns only `{"error":"Failed to search diseases"}`, no stack trace. The disease search needs the ML service with a shared key and an allowed origin, which this stack does not set up. The exact cause was not traced, and production was not tested. |
| API both | Non-Storable Content | Info | 4 | Intended | 401 and 503 answers |
| API both | Storable and Cacheable Content | Info | 5 | Real, minor | Add `Cache-Control: no-store` to API answers later; not changed this close to the viva |
| ML both | Content Security Policy Header Not Set | Medium | 3 | Real, low impact | Only 404 pages. Needs `ml-engine/app.py`, **protected, not changed** |
| ML both | Permissions Policy Header Not Set | Low | 3 | Real, low impact | Same protected file |
| ML both | X-Content-Type-Options Missing | Low | 1 | Real | Same protected file |
| ML both | Server header leaks version (`Werkzeug`) | Low | 4 | Local only, for the Werkzeug value | That value comes from the Flask development server used here; the live server header was not checked |
| ML both | Storable and Cacheable Content | Info | 4 | Minor | Same protected file |

**Protected-file conflict:** the ML header fixes need `ml-engine/app.py`. Please decide; nothing was edited.

## What changed
`client/vercel.json` only: Content-Security-Policy, X-Content-Type-Options, X-Frame-Options, Cross-Origin-Opener-Policy,
Referrer-Policy and Permissions-Policy. The CSP allows the live API (`medisync-wabc.onrender.com`, HTTPS and WSS), the ML health
address, Cloudinary images and the Google Maps frame. If `REACT_APP_API_URL` or the ML address ever changes, the CSP must change too.

**Check that the CSP does not break the app** (built client, local stack, built-in browser, final headers, 2026-11-25): 17 public and
sign-in pages and 11 signed-in pages (a fake local session with fake data) gave **0 CSP violations**. Inline script was blocked as intended.
The patient pages were opened in an earlier pass and showed an error message because of the fake data, so they are not covered.
This was a manual check; only its result is recorded here, not a raw output file.
**Real signed-in sessions were not checked under the CSP:** open the Vercel
preview, sign in with each role, and look for CSP errors in the console before merging.

## Rate limiter (a control that works)
Local, limits as shipped, `rate_limit_local.txt` (11:30:22): 12 GETs to `/api/auth/me` gave 7 × 404 and then 5 × 429 (limit 10 per 15
minutes, part of it already used earlier). 65 GETs to `/api/public/doctors` gave 46 × 200 and 19 × 429 (limit 60 per minute, part used).

## Separate run: production front page, passive only (11:30:35 to 11:31:12)
`https://medisync.chamodtharusha.com.lk/`, spider limit 1 minute, 12 URLs, no login, no active scan. This is the code deployed **before**
this change: **0 High, 3 Medium, 4 Low, 6 Informational**.

| Alert | Risk | URLs | Real? | Fix |
|---|---|---|---|---|
| Content Security Policy Header Not Set | Medium | 2 | Real | Fixed by this branch after deployment |
| Missing Anti-clickjacking Header | Medium | 2 | Real | Fixed by this branch after deployment |
| Cross-Domain Misconfiguration (`Access-Control-Allow-Origin: *`) | Medium | 5 | Real header, low impact | Static public files served by Vercel. Could be overridden in `vercel.json`; not changed, because it cannot be tested locally |
| X-Content-Type-Options Missing | Low | 5 | Real | Fixed by this branch after deployment |
| Permissions Policy Header Not Set | Low | 3 | Real | Fixed by this branch after deployment |
| Cross-Origin-Opener-Policy Missing | Low | 2 | Real | Fixed by this branch after deployment |
| Cross-Origin-Embedder-Policy Missing | Low | 2 | Real, accepted | As above |
| Modern Web Application, Non-Storable, Re-examine Cache-control, Retrieved from Cache, Storable and Cacheable, Storable but Non-Cacheable | Info | 2, 5, 1, 5, 2, 1 | Information only | None |

**Do not claim** that ZAP found no issues, that an active scan or penetration test was done, that signed-in pages were scanned, or that the
new headers are live. They are not live until you merge and Vercel deploys.
