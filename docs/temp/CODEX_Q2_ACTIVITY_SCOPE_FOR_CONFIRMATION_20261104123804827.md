# Q2 consultation-activity scope — confirmation required

Status: AWAITING OPERATOR CONFIRMATION. No implementation of this contract has started. Current source/production is fb4dc0b;2664offlinePASS/bothCIgreen. Operator supplies the fixed Render log at12:29:45UTC: SOURCE_READ_AND_VERIFY / REPORTING_REVIEW_REQUIRED. This maps specifically to absent/non-object/array review metadata on an admitted in-range candidate, not a count or diagnosis of every record.

## Public pages

Only /public-health changes. Its existing summary, map/table, trend, disease ranking, risk legend, cluster cards and forecast sections currently share the confirmed-case DTO (PublicHealth.jsx:142,182,199,375,488,522,662). Replace the principal report with Recorded consultation visits, district visit counts and visits by UTC day. A visit means one saved consultation record, not a unique patient or confirmed disease case. Remove the activity disease selector/ranking rather than imply diagnoses are confirmed. The district map uses neutral activity styling, no risk tiers, hotspots, outbreak clusters or severity labels. Suppressed districts remain undisclosed, never inferred as zero.

Confirmed cases, outbreaks and forecasts show explicit Not available with null values while reviewed surveillance is unavailable. Do not calculate any forecast/cluster/risk from visit counts, and do not show zero/no outbreaks as a substitute for unavailable. The three-language UI will distinguish visits from clinical surveillance. Keep the current /public-health URL and Public Health navigation. No separate public forecast/outbreak route is registered in App.js.

Home / and /doctors, /hospitals, /pharmacies do not consume health-stats and need no changes. Authenticated doctor/patient/pharmacy/hospital/admin pages, internal surveillance, role notifications and shared admin GeographicMap stay out of this public-report scope. PublicHealth has its own map implementation; do not change the shared admin map to achieve neutral public styling.

## Separate API

Add GET /api/public/consultation-activity. Accept only rangeDays1..365 and district=all or an existing district; reject public simulation/batch opt-ins and unknown filters. Do not reinterpret or rename /api/public/health-stats.

New activity fields:

| Field | Meaning |
| --- | --- |
| metric | recorded_consultation_visits |
| source / mode / unit | mongodb / real / visits |
| period.start / end / rangeDays | Validated UTC reporting window |
| totalVisits | Number of admitted saved consultation records; not cases/people |
| byDistrict[].district / visitCount | District activity; publish only counts at least5 |
| trend[].date / visitCount | UTC saved-visit counts; zero-fill only after a complete trusted activity read |
| disclosure.districtMinCount | Existing5-record district suppression boundary |
| surveillance.availability | not_available in this phase |
| surveillance.confirmedCases / outbreakClusters / forecast | null; never computed from activity |

A verified complete empty activity query may show0visits, explicitly as visits. It does not show0confirmed cases/outbreaks/forecast. Unavailable or malformed activity source remains an explicit unavailable response with data:null, not a fabricated success.

Existing /health-stats fields retain their current confirmed-case meaning: totalCases; byDistrict[].district/totalCases/topDisease; byDisease[].disease/totalCases; trend[].date/count; forecast[].date/predicted/lower/upper. Keep its reviewed-data admission unchanged. Public activity UI will not use these fields as visit counts or fall back to them. Current public surveillance panels remain Not available; clinical-review activation is a later separately reviewed phase.

## Durable source and exclusion

Read only native consultation metadata: ID and consultation reference internally, createdAt, district, and existing synthetic/demo/batch markers. No patient identity, NIC, email, name, diagnosis text, notes or decryption. Count saved records once by record identity; do not claim unique persons or episode counts. Retain explicit real-only provenance filtering, add source-confirmed synthetic reference exclusions such as bootstrap CON-SYNTH and outbreak CON-DEMO even if flags are absent, and preserve all batch markers. No public switch to include simulations. Unlabelled historical synthetic records cannot be independently certified clean from source alone; do not claim a whole-database provenance audit or silently include a known synthetic record.

Use a separate versioned activity cache namespace, with optional cache failure isolation. No cache clear, ML SQLite/ingest, new database/collection/index, DDL, schema migration, stored-record edits or backfill. Preserve bounded reads and cursor cleanup.

## Files and tests planned after confirmation

Server public route/controller, new activity aggregation/DTO module, targeted offline tests; client PublicHealth or a dedicated public activity component with neutral map/table, translations and component tests. Keep confirmed-case helpers and private admin behavior intact. Add real/synthetic/mixed/marker-only/known-bootstrap-reference negatives, UTC, true empty vs unavailable, suppression, raw-identity stripping, cache isolation, and no ML/DDL/write dispatch. UI tests must reject activity-to-case/forecast/cluster conversion and any zero fallback for unavailable surveillance. Then full regression/build and read-only public browser acceptance, without login.

Human clinical-review workflow has been added to docs/FUTURE_FEATURES.md as deferred; no workflow is being built. The scope above requires operator confirmation before application code changes.
