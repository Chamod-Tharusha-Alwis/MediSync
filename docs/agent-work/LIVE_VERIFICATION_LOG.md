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
