# Offline notification transport, admin ML status and Q3 review

Scope: no login, email, Atlas/Redis connection, production clinical write, ML ingestion/data change or manual hosting operation. Historical real backend acceptance remains 2/14. Email accounting closed at 7; no new sends. A combined live sweep requires new explicit approval and fresh provider totals.

## Notification boundary

The existing universally read-only verifiers remain unchanged. Only the separately opted-in authenticated-session runner can admit TLS GET and text/plain polling POST to the exact API `/socket.io/` path, EIO=4, an allowlisted query and bounded frames. WSS is the corresponding GET upgrade on that same path; it is not a second application API allowlist. Outbound frames permit only root-namespace connection using the privately validated login token, heartbeat/probe/upgrade and close. Arbitrary application events, binary frames, alternate namespaces, clinical/OTP/ingest/seed/trigger/cache-clear/dispense operations are denied. Default transport remains denied. Token/body/query values never enter receipts. Server authorization remains authoritative; a formatted sid alone is not proof of session ownership. Refresh-rotated socket credentials and real transport timing remain live boundaries not exercised here. Source receipts now bind the transport policy too.

## Admin ML status

The operator found no endpoint-specific log line in the supplied window. Cold start, upstream auth, DNS, TLS, timeout, route mismatch and malformed response remain possible categories, not diagnosed live causes. No additional login or upstream production probe was used.

Actual source defects: the page read `r.data.data` although the backend response was top-level; it displayed an invented 15,420 fallback and browser-computed six-hour countdown. The backend leaked raw error messages and mapped disparate dependency failures to HTTP503 without a diagnostic. The repair emits one fixed `[AdminMlStatus] category=...` line and an explicit HTTP200 status resource with available:false/null counts for dependency failures. Local route authentication/authorization is unchanged and can still return401/403. A bounded 10-second authenticated upstream GET, no redirects or application retries, accepts only the known reference-status contract. A success is reference-profile service availability, never clinical certification or outbreak/forecast availability. Unknown upstream schema fails unavailable. The existing ML route explicitly reports outbreak forecasting unavailable. No ML source or data changed.

The admin page consumes the top-level contract, preserves a verified zero, labels reference disease profiles, displays unavailable in EN/SI/TA and removes the invented schedule. Failed alert reads no longer claim a successful empty log. Existing manual scan/approval actions remain unchanged and were not invoked. Offline React absence of console calls does not prove a live browser has no network errors; the new HTTP200 unavailable contract avoids the known dependency503 resource error after deployment.

## Identifier masking: P1 OPEN

`server/src/utils/emailService.js:98` provides email masking for logs, not the login-alert body. Its login template inserts idField directly at line1712. `authController.js:491` and734 select doctor ID, NIC, registration number or email; `pharmacyController.js:271` sends the staff identifier. National-ID and email fallback masking in the rendered login alert is NOT IMPLEMENTED. Provider recipient routing is distinct from body masking. No identifier samples or values were inspected or recorded. This task records the gap without silently changing the requested email policy.

## Authenticated Phase5 UI inventory

| Feature | Existing authenticated UI | Current source behavior / boundary |
| --- | --- | --- |
| District map | Admin dashboard, `client/src/pages/admin/Dashboard.jsx:563` | GeographicMap uses Mongo-backed active alerts and facilities; rendered DOM was observed historically, data truth not accepted. Not a 14-day forecast. |
| Outbreak review / scan | Admin OutbreakMonitor | Existing manual scan and alert review; status repair describes reference service honestly. No scan invoked. |
| Broadcast banner | Doctor/patient/hospital/pharmacy dashboards | ActiveOutbreakBanner; `server/src/controllers/alertController.js:43` deliberately returns no legacy broadcast, so banner is hidden. |
| 14-day forecast | None found in authenticated pages | No authenticated forecast widget to verify. Public page explicitly says unavailable. |
| Non-admin outbreak maps | None found | Broadcast banner is not a map. |
| Human confirmed-case review | None | Already deferred in FUTURE_FEATURES; not implemented here. |

Empty ML SQLite does not imply an empty Mongo alert map. Live map truth and forecast availability must not be inferred from a rendered component or reference-profile health.

## Q3 doctor bugs: offline reproduction boundaries

| Reported issue | Real source/tests exercised | Current conclusion |
| --- | --- | --- |
| Symptom analysis503 | b1-ml-503-resilience: actual NewConsultation, injected503/504 and manual fallback | Existing resilience behavior; fake API and consent, no clinical E2E claim. |
| Empty medication suggestions | b2-drug-suggestions-trilingual: actual DrugSearchInput against empty injected API | Existing catalog fallback EN/SI/TA and ranking; not proof of live drug/interaction coverage. |
| Save409 | consultation-409-resilience: actual wizard, duplicate-submit lock, conflict/reconciliation/unknown outcome | Existing response behavior exercised; do not suppress genuine consent/idempotency409. No real save. |
| Lab dropdown overlap | new-consultation-stress: actual wizard, injected viewport rectangles and keyboard selection | New placement-branch tests; jsdom CSS/geometry does not prove visual overlap resolved. Old overbroad displacement test title corrected. Real browser visual check remains NOT VERIFIED. |
| Duplicate doctor prefix | phase4-ui-polish / server doctorNameOffline | Actual formatting helpers normalize repeated prefixes. Authenticated render coverage still pending. |

No new app-level doctor defect was established by these passing offline cases. Do not re-open completed clinical patches based only on old reports.

## C4 / C5 / C7 definitions found

- `docs/WORK_TRACKING.md:52`: C4 Doctor AI Resilience: explicit non-diagnostic disclaimer, timeout/fallback and verifier truthfulness. Historical false-positive live PASS stays rejected. Offline source behavior and genuine live clinical acceptance are separate.
- `docs/WORK_TRACKING.md:64`: C5 Disease/Drug Coverage: actual reference counts, drug search and interaction warning UI. Reference counts are not clinical validation. Live role coverage remains pending.
- `docs/WORK_TRACKING.md:72`: C7 Release Hardening:404, ErrorBoundary, form locks, loading/empty states and Lighthouse accessibility>=90. Public404 evidence exists; remaining role/forms/Lighthouse not verified.

## Test evidence caveats

Initial focused backend controller import failed because the narrow Jest configuration could not load the unused ESM uuid dependency; the test now mocks that unrelated ID factory while executing the real status service/controller. Initial master-config Q3 run had33PASS/2FAIL from an unsupported MemoryRouter stub in two unrelated phase4 cases; combined CRA profile is authoritative. First combined receipt `scratch/clinical-offline-BPkK29` retained2233 backendPASS and534 clientPASS/2FAIL. Three combined attempts retained two new lab-test failures (BPkK29, i5mHng, J88xaO). Waiting for options alone did not fix them. The final tests re-query the current animated input between events and wait for the selected option. The inert targeted CRA rerun passed9/9; final combined profile passed536/536 client tests. No application keyboard code was changed. No production assertion was weakened or implementation modified to make those tests pass. Final current-source counts and hashes are recorded in the unique JSON successor.

## Final offline gate

`node scripts/run_offline_tests.js`: exit0, 2,908PASS /0FAIL /0SKIP, sourceFrozen=true,15protected expectations intact. Backend2234 (102suites), client536 (57suites), email/PDF31, ML scoring40, actual isolated Flask27, root lifecycle40. Receipt: `scratch/clinical-offline-9fPaOF/summary.json`. Compared with2848baseline: +50backend and+10client; no retired tests. Final focused backend/session gate118PASS; rendered admin status8PASS. All35 existing/new Q3 client cases in the five reviewed suites passed in the final CRA profile. A deliberately incomplete direct child invocation was rejected by the offline contract before testing; it was not a network attempt. Local Nodev26.4.0; Node24 remains the CI/runtime gate.

`npm run build` (client): exit0;116clinical modules, demoImported=false. Existing warnings: unused Activity on Home, CheckCircle on three registration pages, and two unused setters on patient Profile. No new warnings. `node --check` on affected CJS/backend source and `git diff --check`: exit0. Build log `scratch/CODEX_NOTIFICATION_ML_BUILD_20261105.log`.

No live PASS is granted by this source gate. Endpoint failure category, authenticated no-console acceptance, actual notification transport, lab visual overlap, role forecast/map data truth, C5 live search/interaction and C7 Lighthouse remain NOT VERIFIED. A fresh combined-sweep approval and provider count are required; no clinical save/OTP/dispensing is implied. Login-alert identifier masking remains P1 OPEN. Clinical production readiness is not established; historical real E2E remains2/14.
