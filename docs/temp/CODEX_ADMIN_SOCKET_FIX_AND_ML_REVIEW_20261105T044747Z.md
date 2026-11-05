# Admin socket cleanup fix and ML status review

## Confirmed operator evidence

On5November2026 the operator confirmed the received login-alert identifier is masked for admin,patient,doctor,hospital,pharmacy, and each timestamp uses Sri Lanka time with its zone label. Record booleans only; identifier examples are deliberately omitted. P1body-masking live confirmation is complete. Recipient/stored/logmask behavior remains unchanged.

Final provider totals are NOT VERIFIED: repeated responses contain placeholders, not numeric values. Do not infer5dailyResend sends from an excerpt or from five received-role confirmations. The actual AdminMlStatus log category is likewise NOT VERIFIED: the response still contains a category/not-found placeholder. The historical authenticated API receipt did report200/unavailable/bad_response; that is separate evidence. Backend ML URL equality is NOT VERIFIED. Operator-reported ML log window shows no new boot line; no new authenticated upstream request was made to diagnose it.

There is no dedicated Render/Resend/Brevo connector. Read-only browser inventory exposed only IAB/MCP-app surfaces, with0matching Render/Resend/Brevo tabs. No service login, new dashboard tab, private-env read, cookie/profile access or settings change was attempted. The requested dashboard counters and04:00–04:10UTC(09:30–09:40SriLanka) log search remain access-blocked. No further numerical/category question is repeated in this run.

## Actual source fix

`client/src/pages/admin/Dashboard.jsx:646–715`: the admin's own Socket.IO effect had a delayed connection and unmount cleanup, but no listener for `medisync:session-cleared`. NotificationBell already handles that event. Thus the admin socket could remain active while the harness marks the session closed and denies subsequent polling. The fix adds an idempotent own-socket cleanup listener, cancels the500msinitializer, safely disconnects once, ignores queued alert callbacks after cleanup, and removes the listener on unmount. Existing token requirement, transport choices, reconnection options, server authorization and HTTP/session allowlist are unchanged. No backend-runtime/ML/storage/encryption/protected-file source changed.

The historical admin receipt still FAILS with3blockedGET/socket.io. It has no recorded transport state/reason, so the exact historic sequence cannot be independently proven. Do not rewrite that receipt or reclassify it PASS. The offline replay establishes a real source gap that can reproduce the same denial pattern; a separately approved admin-only live retest is still necessary.

## Measured offline browser reproduction

`node --test --test-reporter=tap scripts/adminSocketCleanupOffline.test.cjs`:3PASS/0FAIL/0SKIP,exit0. It compiles and executes the actual production admin effect, frozen pre-fix effect and actual safeDisconnectSocket helper, using real installed Socket.IO client/server libraries in Chromium. React alert-rendering closures are inert; this is not a full app/clinical UI test. Three concurrent polling clients stress the lifecycle. Every browserHTTP request is locally fulfilled or proxied to the owned127.0.0.1server on a random port; actual TCP relay peer/port is checked for every relay. All WebSocket attempts are denied in this polling-only profile and measured0. No production login, provider request or external API transport is executed.

| Case | Connected clients | Verified loopback relays | Blocked socketGETs | Result |
| --- | ---: | ---: | ---: | --- |
| Frozen pre-fix production effect |3|17/17|3(CLOSED_SESSION)| Reproduced failure |
| Corrected production effect |3|20/20|0| PASS |
| Forbidden-operation negatives |3|19/19| No extra acceptance claim |8POSTs blocked;0server application events |

The negative case exercises ingest,seed,trigger,cache-clear,OTP,clinical save,dispense and an actual encoded Socket.IO application event. These remain denied before the inert server receives them. The test does not widen the allowlist to eliminate console errors. Owned browser/server resources close; no existing service/container is touched. WSS remains covered by existing policy tests, not falsely claimed by this polling rehearsal. Latest peer-verified browser receipt: `docs/temp/CODEX_ADMIN_SOCKET_INERT_BROWSER_20261105T044225005Z.json`. Initial rehearsal receipt043806728Z remains historical; the044225005Zreceipt adds measured peer checks rather than an unmeasured zero counter.

`admin-dashboard-socket.test.jsx`:8PASS,exit0,including4new lifecycle cases:clear-before-timer,clear-after-connect/idempotent unmount,queued callbacks ignored,listener removed. New model-status classification matrix adds24checks. Focused backend/boundary100PASS,exit0. Complete final regression2987PASS/0FAIL/0SKIP,exit0,sourceFrozen=true,15pins; `scratch/clinical-offline-6HvzXD/summary.json`. Baseline2959 gains24backend+4client checks. The3localChromium cases are separate from that aggregate and are not part of CI's browser-free root profile. Client production buildexit0,116modules/demoImported=false,existingwarnings only. Source binding `docs/temp/CODEX_ADMIN_SOCKET_FIX_AND_ML_REVIEW_20261105T044747Z.json`.

## Exactly what bad_response means

Runtime source is unchanged: `server/src/services/adminMlStatusService.js:3–12,20–38`; controller baseURL `server/src/controllers/adminController.js:20`.

| Source condition | Fixed category |
| --- | --- |
| Upstream401/403; or HMAC-token generation fails before request | auth |
| Upstream404 | not_found |
| ECONNABORTED/ETIMEDOUT (unless401/403/404 already matched) | timeout |
| ENOTFOUND/EAI_AGAIN | dns |
| Listed connection/reset/pipe/certificate/hostname-verification codes | connection |
| Any other error after the above checks | bad_response |

Therefore ordinary Axios rejections for400,405,408,413,429,500,502,503,504 and rejected301/302/307/308 redirects map tobad_response when they do not carry one of the earlier transport codes. `maxRedirects:0` is intentional. Configuration/invalidURL/cancellation/unmapped errors also fall through. A503 category is not proof of a cold start.

Successful HTTP200 also becomesbad_response when the JSON is missing/incompatible: status must beactive; dataPoints a non-negative safe integer; unit exactlyreference disease profiles; clinicalValidation exactlynot established; prediction model one ofthetwoacceptedreference methods; models.outbreakForecasting exactlyunavailable. HTML/SPA content, unrelatedhealthJSON, wrappeddata envelopes, string counts or changed/missing fields all fail closed. Raw responses/exceptions never enter the fixed log or public status envelope.

Yes,a wrong URL can causebad_response: anotherfrontend may returnHTML200; another service may return incompatibleJSON orHTTP5xx; a redirect is rejected. A plain404 instead maps tonot_found and an unresolvedhost maps todns. The current constructor appends `/model-status` directly: a trailing slash produces `//model-status`; a server redirect308 then maps tobad_response. App dependencyhealth independently strips one trailing slash at `app.js:386`, sohealth success would not by itself prove status-path equivalence. Tests reproduce this with inert values; no live URL value was read or corrected.

The locally available historicalMLcommit86d5876 `/model-status` source already contains the expected contract, matching currentprotectedapp.py:1207–1224. A source schema incompatibility in that particular commit is not established. That does not prove which service/revision the live request reached. WrongURL,wrongreply,proxyHTTPfailure andotherunmappederror remain possibilities, not findings about production. Do not relax validation or change environment/ML data to obtaingreen.

## Stop state

No new live login,email,OTP,clinical save,dispense,Atlas/Redis connection,migration or provider operation in this task. Existing historical clinical acceptance remains2/14. Operator masking/time confirmation is now recorded; final dashboard totals/log word/liveURL confirmation remain missing. Admin-only live retest is held for explicit approval and actual fresh numeric email totals; do not reuse the consumed combined-sweep marker. No automatic retest.
