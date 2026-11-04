# Q2 public consultation activity: final live acceptance

Captured 2026-11-04T17:23:48.5260357Z. Accepted application source: 7e0d9c0c29b99fae985f878698ccf671adce0eac.

Approved public activity scope: LIVE VERIFIED. This replaces the former public consultation/case conflation; it does not establish confirmed cases or clinical production readiness.

- Actual anonymous Chromium: 9 PASS, 0 FAIL across EN/SI/TA and 320/375/1440 pixels. API HTTP 200; captured 7 recorded consultation visits. The caption defines a visit as one saved consultation, not a unique patient or confirmed case.
- All nine views: no old health-stats call, console/page/transport error, write request, guard violation, horizontal overflow, heading overlap or overflowing district table. Scrolled clinical panels explicitly show localized Not available. Representative Tamil/Sinhala screenshots inspected; screenshot bytes stay outside the repository and OneDrive.
- Exact backend commit verified through health. Vercel deployment dpl_9CGApQh2RLHw11KY6KTmpb3yRsnr READY for the same source. Both exact-head CI workflows succeeded: clinical 41876097710; security 41876097701.
- Latest offline gate: 2,760 PASS / 0 FAIL / 0 SKIP, exit 0, source frozen. Backend 2,111; client 511; email/PDF 31; ML scoring 40; actual Flask 27; root 40. Client build exit 0, existing warnings only. Local test runtime was Node v26.4.0; this does not replace the deployment Node 24 contract.
- Protected source pins rechecked: 15/15. No application changes after this accepted source. District totals below five and all selected-district daily counts remain withheld. Prior selected-district and simulation-filter probe passed; no privacy certification is implied.

Evidence: docs/temp/CODEX_Q2_ACTIVITY_LIVE_1793812757413.json, its digest in the companion JSON; scratch/clinical-offline-Mo0GWA/summary.json; prior selected-district probe docs/temp/CODEX_Q2_ACTIVITY_LIVE_FILTERS_1793812213343.json. Earlier functional pass and geometry failure receipts are preserved as historical evidence, not silently replaced.

No login, OTP, email, direct Atlas/Redis session, record change, backfill, ingest, seed, surveillance trigger or cache clear was performed in this verification. The deployed read-only endpoint reads consultation metadata through the application's existing connection. Authenticated views were inventoried before implementation and left unchanged.

Confirmed-case, outbreak and forecast reporting remain unavailable pending reviewed data. Human clinical review is deferred in FUTURE_FEATURES.md. ML restart resilience was not exercised. Historical accepted real backend groups remain 2/14; five-role live acceptance and full clinical production readiness are not claimed.
