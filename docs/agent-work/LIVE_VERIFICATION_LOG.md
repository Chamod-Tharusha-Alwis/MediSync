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

## Q1 deployed anonymous-route matrix 2026-11-04T11:15:11.893Z

Exact800d87abackend/Vercelverified. Receipt docs/temp/CODEX_Q1_DEPLOYED_ROUTES_20261104_ac9663c6.json, screenshots outside repo/OneDrive C:\Users\chamo\AppData\Local\medisync\evidence\Q1-routes-ac9663c6. No form submitted/login/provider/clinicalwrite. Matrix includes missing-switcher, overflow and console outcomes; do not equate zero banners with full functional acceptance. Private roles not run.

## Q1 persisted-language fallback 2026-11-04T11:20:19.129Z

Initial96-observation matrix has60rows without a local switcher, not96complete per-route-switch passes. Follow-up uses actual Home selection then navigation to10routes at2widths/3languages; receipt docs/temp/CODEX_Q1_PERSISTED_LANGUAGE_ROUTES_20261104_4d993b3f.json, private screenshots C:\Users\chamo\AppData\Local\medisync\evidence\Q1-language-4d993b3f. No forms/logins submitted. Missing local controls remain Q7 defect, not silently repaired here.

## Q1 one-shot doctor 2026-11-04T11:42:30.933Z

{"role":"doctor","expectedCommit":"800d87abbf1773645fb83bd9efcf6f1b526e9df4","loginStatus":200,"authRequests":1,"passed":false,"category":"ROLE_BROWSER_STEP_FAILED_SANITIZED","observations":0,"clinicalWrites":0,"OTPSubmissions":0,"potentialAuthEmailUpperBound":1,"emailDelivery":"NOT_VERIFIED","receipt":"docs/temp/CODEX_Q1_ROLE_DOCTOR_20261104114230933.json"}

## 2026-11-04T11:53:30.310Z — Q4 exact deployment and scoped verdict

Commit d6c8040e48489c0314552f7607040464dbd808f4 pushed main after clean pull--rebase. Both exact-head CI workflows success:41824022270 clinical,41824022348 security. Backendhealth200exactSHA; VercelaliasREADY dpl_8n36wcvVVtBNBd6fKXpve8Wwszna exactSHA. Actual repaired verifier exit0/PASS, receipt docs/temp/CODEX_C4_READONLY_20261104115201786_71b1f588.json; both health200/ready, no retry. Verdict only READ_ONLY_HEALTH_AND_LOCAL_CONTRACTS; ML deployment identity not exposed, clinical inference/browser acceptance NOT VERIFIED. No login repeated or clinical/provider write.

## 2026-11-04T12:03:54.024Z — Q6 public404 deployment acceptance (partial C7)

Frontend commit b911713a28a85783926c89ad08c623b4251e84a1, pushed2026-11-04T11:58:00.809Z; exact-head clinicalCI41825217683 and securityCI41825217645 bothsuccess. VercelcustomaliasREADY exactSHA dpl_EMXbF4SZweQnNP5wJQDjvjuzDxHo. Backendhealth200 d6c8040e48489c0314552f7607040464dbd808f4; server and ml-engine Git trees exactly equal between that commit and HEAD (diffexit0). Render rootserver excludes frontend/docs-only commits per https://render.com/docs/monorepo-support; effective unchanged backend bytes are verified, a fresh backend SHA/redeploy is not claimed or requested.

Actual anonymousChromium9observations:EN/SI/TA×320/375/1440,localizedheading/focus/2recoverylinks/44pxlinks/nooverflow,keyboardHome recoveryPASS,0pageerrors/0guardviolations. Receipt docs/temp/CODEX_Q6_PUBLIC_404_1793793748541.json; public screenshots outside repo/OneDrive LocalAppData/medisync/evidence/Q6-404-c9840ee4,320SI/TAvisuallyreviewed. VercelSPAHTTP200is recorded; this is recoverycontent404, not HTTP404routing. No auth/provider/clinical write. Public health503/data:null and unapprovedsimulation400 unchanged; receipt CODEX_Q6_PUBLIC_REGRESSION_1793793784802.json. Q6 role forms/loading audit/Lighthouse>=90 remain NOT VERIFIED.

## 2026-11-05T09:02:08.716Z — V2 baseline (anonymous metadata only)

| Time UTC | Expected / observed source | Role | Request | Result | Evidence | Email count after |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-11-05T09:02:08.716Z | 25d29a6 / 25d29a6 | Public | Backend health and Vercel deployment metadata | Backend ready; Vercel READY; both CI success | docs/temp/CODEX_V2_P0_MATRIX_GATE_20261105T090208Z.json; CI127144245231/127144243727; dpl_9MUgoyrKSQs3JxshYXCTzTLAAp7d | 6 last confirmed; no new sends |

No authenticated retest was run under V2. ML live SHA is NOT VERIFIED because its health response does not expose it and no hosting dashboard is connected. A repository commit alone is not proof of an ML deployment.

| 2026-11-05T09:26:07.203Z | c5d21f1 / c5d21f1 | admin | P1 one login/logout; dashboard/status | Protocol PASS; both200/unavailable/bad_response;60004ms;0console/blocked/banner | docs/temp/CODEX_Q1_SESSION_admin_1793870338924.json | 7operator-confirmed |

| 2026-11-05T10:42:12.864Z | e163f40/e163f40 | admin,EN,1440x1000 | P2one login200/logout200;exactly1MLGET200/available | PASS:0console/page/blocked/banner;no repeat | docs/temp/CODEX_Q1_SESSION_admin_1793874642106.json | 8operator-confirmed |
