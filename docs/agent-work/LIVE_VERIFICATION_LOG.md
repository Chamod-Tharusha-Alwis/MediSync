# Live verification log (append-only)

Created 2026-11-04T05:52:16.227Z. No current-run live observation yet. Every entry must distinguish expected/observed commit, operator-supplied evidence, URL, role, viewport/language, result and screenshot location. Screenshots remain outside repo and OneDrive. Never store auth state, tokens or patient data.

## Q1 captured public GETs — 2026-11-04T05:54:21.819Z

Expected source: f825df4; operator reports ML manual deploy 86d5876. These requests make no direct database connection. Deployment SHA is NOT VERIFIED unless returned below.

```json
[
  {
    "at": "2026-11-04T05:53:44.707Z",
    "service": "backend",
    "url": "https://medisync-wabc.onrender.com/health",
    "status": 200,
    "keys": [
      "status",
      "service"
    ],
    "observedCommit": null
  },
  {
    "at": "2026-11-04T05:53:44.730Z",
    "service": "ml",
    "url": "https://medisync-ml.onrender.com/health",
    "status": 200,
    "keys": [
      "references",
      "status"
    ],
    "observedCommit": null
  },
  {
    "at": "2026-11-04T05:53:44.732Z",
    "service": "public-health",
    "url": "https://medisync-wabc.onrender.com/api/public/health-stats",
    "status": 200,
    "keys": [
      "data",
      "cached"
    ],
    "observedCommit": null,
    "totalCases": 0,
    "isSimulatedDemo": true,
    "cached": false
  }
]
```

## 2026-11-04T05:57:20.155Z — Q1 browser, English desktop, public role

URL https://medisync.chamodtharusha.com.lk/public-health. In-app browser rendered Total Cases0, Top Disease None, 25 districts in minimal tier, 0 clusters, empty disease/trend panels, insufficient-history forecast, and Demonstration Data Active banner. Statistical nonclinical disclaimer remains visible. No login/clinical action, ingest, trigger or cache clear. Vercel deployment list reports production READY f825df4; Render commit remains NOT VERIFIED. Screenshot not saved for this initial DOM-only observation; mobile and SI/TA NOT VERIFIED. Banner removal BLOCKED pending Q2 provenance boundary.

## Q1 public browser capture 2026-11-04T06:13:55.852Z

Six actual Chromium observations: desktop1280x800/mobile375x667, EN/SI/TA. Receipt docs/temp/CODEX_Q1_PUBLIC_BROWSER_20261104_86fb4574.json; screenshots outside repo/OneDrive at C:\Users\chamo\AppData\Local\medisync\evidence\Q1-public-86fb4574. All API/status/layout/console outcomes remain as measured in receipt; Q1 removal still blocked. No role login.

## Q2 actual API 2026-11-04T06:21:49.378Z

Backend /health200 exposes exact873e321f6f017c01d1c6c9adf7668c3db29a559a (deploy receipt docs/temp/CODEX_Q2_BACKEND_DEPLOY_20261104_873e321.json). Public readonly response receipt docs/temp/CODEX_Q2_PUBLIC_API_20261104_873e321.json. No authentication, ingestion, clinical mutation, direct Atlas/Redis, restart or settings operation.

[{"at":"2026-11-04T06:21:48.779Z","path":"/api/public/health-stats","status":503,"error":"PUBLIC_HEALTH_UNAVAILABLE","isSimulatedDemo":false,"dataNull":true},{"at":"2026-11-04T06:21:49.091Z","path":"/api/public/health-stats?mode=simulation","status":400,"error":"INVALID_HEALTH_FILTER","isSimulatedDemo":false,"dataNull":false},{"at":"2026-11-04T06:21:49.376Z","path":"/api/public/health-stats?rangeDays=366","status":400,"error":"INVALID_HEALTH_FILTER","isSimulatedDemo":false,"dataNull":false}]

## Q2 Chromium safe-degraded UI 2026-11-04T06:27:44.699Z

Exact873e321backend/Vercelverified. SixEN/SI/TA desktop1280/mobile375 observations, receipt docs/temp/CODEX_Q2_PUBLIC_BROWSER_20261104_4da806b1.json, screenshots outside repo/OneDrive C:\Users\chamo\AppData\Local\medisync\evidence\Q2-public-4da806b1. API503 is an observed unavailable boundary, not positive data/durability PASS. Measured script/runtime/console outcomes retained; no login, clinical mutation or provider.
