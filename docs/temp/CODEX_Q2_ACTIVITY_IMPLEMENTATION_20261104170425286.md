# Public consultation activity implementation

Operator confirmed the separate visit-report scope and added no health-stats load, inline EN/SI/TA visit definition, neutral zero/all-suppressed states and9live language/viewport checks. Authenticated inventory was supplied before implementation and saved at docs/temp/CODEX_Q2_AUTHENTICATED_VIEW_INVENTORY_20261104165051839.md. Private runtime values remain NOT VERIFIED; no login was run.

## Implementation

GET /api/public/consultation-activity reads bounded native Mongo consultation metadata only. No patient/doctor IDs, names, contact data, diagnosis/notes, decryption, clinical-review claim, ML call, DDL, migration, seed or record modification. Excludes flags/batch markers and known CON-SYNTH/CON-DEMO references. Missing optional district remains a recorded visit nationally without invented geography; invalid source types remain unavailable. Completed empty national query may return0visits.

Public /public-health now consumes only the activity endpoint. It labels one saved consultation as one recorded visit, not a unique patient or confirmed case; caption sits in the same summary panel in all3languages. Neutral map/table and UTC visit trend replace public risk tiers, disease ranking and forecast calculations. All3clinical panels remain explicit localized Not available. No prototype/demo/site-wide notice was added. /health-stats and internal surveillance helpers remain unchanged. Clinical-review workflow is deferred in FUTURE_FEATURES.md, not implemented.

## Disclosure repair

Independent critic reproduced a selected-district privacy bypass before release: hiding byDistrict while returning total4/daily4. Fixed with a genuinely suppressed200DTO: totalVisits:null,byDistrict:[],trend:[],disclosure.suppressed:true for selected districts below5, including0. The UI renders Not disclosed(<5), not zero/no visits. Qualifying selected-district totals can display, but daily rows are withheld with disclosure.districtTrendUnavailable:true to avoid smaller daily-cell leakage. National daily trends remain. Cache/controller/client scope checks reject mismatched and old leaking DTOs. All-suppressed national data retains a neutral explanatory state. No database or cache clear was used.

## Actual tests

Final full2760PASS/0FAIL/0SKIP,exit0,sourceFrozen/15pins; scratch/clinical-offline-W89qi8/summary.json. Backend2111/97suites,client511/55,emailPDF31,MLscoring40,Flask27,root40. Final buildexit0,115clinicalmodules,demoImported=false,existingwarnings only. Earlier provisional2751/2758runs precede privacy amendments and remain historical. New verifier11cases; activity59; newclient26 plus36migrated tests. Existing pure forecast/clustering and unrelated privacy/security checks retained. Migrated36is a test count, not a claim of unchanged assertion text: public case/forecast UI assertions were explicitly replaced by the approved activity/unavailability contract.

Independent final reviewer59backend+29clientPASS/exit0, no edits/live calls. Implementation workers hit usage limits; backend left partial modules/route registration and frontend only DTO helper. Lead completed/reviewed implementation and tests; no completed worker signoff is claimed.

## Verification boundary

Readonly live verifier scripts/verify_public_activity_live.cjs installs unchanged read-only fence, no env/credential file input, checks expected backend commit and positive activity DTO, rejects old health-stats calls or console/page/transport/write failures, verifies EN/SI/TA×320/375/1440 and scrolls to clinical unavailability panels. Screenshots are written outside repo/OneDrive under LocalAppData/medisync/evidence. Live execution awaits exact deployment. No role login, OTP, dispense, provider delivery or production data modification authorized/performed. Historical real backend acceptance2/14; no clinical production-ready claim.
