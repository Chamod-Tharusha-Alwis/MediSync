# MediSync — Page Change Proposals

Stage A planning document. No product code changes until `APPROVE PLAN`.  
Created: 2026-11-05 (Antigravity no-network, branch `antigravity/stage-a`)

Each section: current state → proposed change → wireframe → acceptance criteria → risks.

---

## U1 — Medication search dropdown overlapping table (Doctor → New Consultation → Rx step)

**Current state:** The drug-search `<input>` renders its suggestion dropdown with default
stacking. The dropdown clips behind or over the consultation table rows below it.

**Proposed change:**
- Render the suggestion list in a React portal (`ReactDOM.createPortal`) appended to
  `document.body`, positioned with `getBoundingClientRect` of the input.
- Z-index: `z-50` or higher, never competing with table rows.
- Keyboard navigation: ArrowUp/Down to move selection, Enter to pick, Escape to close.
- Touch/mobile: same portal, full-width on 375 px viewports.

**Wireframe (Rx step, desktop):**
```
[ Medication search ________________________ ] ← input
  ┌─────────────────────────────────────────────┐  ← portal, floats above all
  │  Paracetamol 500 mg tab             [+ Add] │
  │  Paracetamol 650 mg cap             [+ Add] │
  │  ...                                        │
  └─────────────────────────────────────────────┘
  ─────────────────────────────────────────────
  Medication table rows (never obscured)
```

**Acceptance:** dropdown visible above table; keyboard navigable; closes on outside click;
mobile 375 px fully usable; zero CSS overlap with any adjacent element.  
**Risk:** portal needs cleanup on unmount (useEffect return). Low effort (S).

---

## U2 — Medication safety alert deduplication and soap/non-medicine filter

**Current state:**
1. Duplicate active-ingredient warning compares a product against itself.
2. The same warning appears in three places (red alert box, amber box, expanded panel).
3. Non-medicine products (soaps, cosmetics) appear as prescribable with dosage like "1 tab TDS".

**Proposed change:**
1. **Duplicate fix:** compare `drugA.id !== drugB.id` before flagging. Never emit
   `"Duplicate active ingredient … present in both X and X"`.
2. **Deduplication of warning UI:** one consolidated warning section showing a deduplicated
   ingredient list. Collapse the "unresolved ingredients" note behind a toggle.
3. **Non-medicine filter:** add a boolean field `isPrescribable` to the Drug catalog
   (default `true`; set `false` for OTC wellness/cosmetic items). The medication search
   endpoint filters `isPrescribable: true`. Show a small badge `Non-prescribable` on
   items that appear in a free-text search but are excluded from the Rx picker.

**Acceptance:** no self-comparison warning; each ingredient listed once; soap/cosmetic
excluded from Rx suggestions; one clear warning box; "0 warnings" state shown cleanly.  
**Risk:** `isPrescribable` migration needed on Drug model; false negatives if cosmetics
not tagged. Mark cosmetics in seed. Effort M.

---

## U3 — Password strength bar fill

**Current state:** `PasswordStrengthMeter.jsx` renders the label (WEAK/FAIR/STRONG) but
the coloured fill bar has no visible fill — the bar element exists but the width/height
style is not applied, or the CSS class is undefined (possibly `slate-550` — see U23).

**Proposed change:** fix the fill bar to show a coloured percentage bar:
- WEAK (1 criterion): `w-1/4 bg-red-500`
- FAIR (2–3): `w-1/2 bg-amber-400`
- STRONG (4): `w-3/4 bg-green-500`
- VERY STRONG (all): `w-full bg-emerald-500`
Apply to all five role login/settings screens.

**Wireframe:**
```
Strength: STRONG
[ ████████████████░░░░ ]  ← green fill to 75%
```

**Acceptance:** bar visible and coloured at all roles and viewports; screen reader text
(`aria-label`) reads the strength level.  
**Risk:** low. Effort S.

---

## U4 — PDF export (consultation and lab reports)

Covered in full in `PDF_EXPORT_DESIGN.md`. Summary:
- Currently shows "PDF export temporarily unavailable" (SECURITY_HOLD from V1).
- Proposed: secure download with ownership check, encryption, Sinhala/Tamil fonts.
- Needs `APPROVE PDF-DESIGN` before implementation.

---

## U5 — Hospital lab: button prints raw `{t("common.verify", "Send Verification OTP")}`

**Current state:** The verify button text is the raw i18n call expression, not the resolved
string. This is a React render bug — the prop passed to the button is a string literal
containing the JSX expression, not evaluated.

**Proposed change:** fix the button to call the `t()` function:
```jsx
// Before (broken):
<button>{`{t("common.verify", "Send Verification OTP")}`}</button>

// After:
<button>{t("common.verify", "Send Verification OTP")}</button>
```
Check all i18n keys used in lab pages for similar template-string escaping bugs.

**Acceptance:** button shows "Send Verification OTP" (EN), Sinhala, Tamil at all viewports.  
**Risk:** low. Effort S.

---

## U6 — POST /api/lab/hospital/request-otp HTTP 429 five times from one action

Root cause and fix details in `OTP_WORKFLOW_AUDIT.md`. Summary:

**Current state:** a UI component calls the OTP endpoint automatically on mount or on
each prop change, firing 5+ requests before the user clicks. The throttle (Redis) blocks
after the first few, returning 429.

**Proposed change:**
1. Guard: button disabled after first click until cooldown expires (countdown timer).
2. Fire OTP request **only** on explicit user click, never on mount or prop change.
3. Clear 429 message in the UI: "Please wait {n} seconds before requesting another OTP."
4. Cooldown: match the backend throttle window (read from the 429 `retryAfterSeconds`).
5. Add a single guard test that asserts the endpoint is called at most once per button click.

**Acceptance:** exactly one OTP email per user action; 429 shown clearly; button disabled
during cooldown; email cost per flow ≤ 1 per test run.  
**Risk:** need to identify exact component that fires on mount. Effort S-M.

---

## U7 — Pharmacy: GET /api/pharmacy/prescriptions/pending/<NIC> returns 403 in console while list appears

Root cause in `OTP_WORKFLOW_AUDIT.md`. Summary:

**Current state:** a 403 appears in the console. The list still renders because a fallback
or cached response is used. The 403 likely means the pharmacy staff token does not carry the
right role claim on that specific endpoint, or the NIC lookup is using the wrong path/param.

**Proposed change:**
1. Confirm whether `/pending/<NIC>` requires the patient's consent token. If yes, the
   pharmacy flow must have obtained consent before calling this route.
2. If the route should be accessible without consent (pharmacist looking up by NIC),
   ensure the RBAC check allows `pharmacyStaff` role.
3. Remove the console error. Add a test for the 403 path.

**Acceptance:** no 403 in console during normal pharmacy dispense flow; prescriptions list
loads correctly with 200.  
**Risk:** may be a consent-token ordering issue. Effort S.

---

## U8 — Notification dropdown clipped at left edge

**Current state:** the notification bell dropdown renders with a right-aligned absolute
position that extends beyond the left viewport edge on small screens.

**Proposed change:**
- Mobile (< 640 px): render dropdown full-width, anchored to `left: 0; right: 0` of the
  parent container, not the bell button.
- Desktop: right-align with `right-0`, max-width `w-80` or `w-96`.
- Ensure text wraps within the box — no clipping.

**Wireframe (mobile 375 px):**
```
┌──────────────────────────────────────┐
│ Notifications                     ✕  │
│────────────────────────────────────  │
│ Outbreak alert: Dengue rise in...    │
│ 2 min ago                            │
└──────────────────────────────────────┘
← 0px                              375px →
```

**Acceptance:** notification text fully visible at 320 px and 375 px; no overflow; no clip.  
**Risk:** low. Effort S.

---

## U9 — Pharmacy: group prescriptions by consultation

**Current state:** each medication appears as its own card, with no grouping context.

**Proposed change:**
- Create a shared component `<PrescriptionConsultationGroup>` that receives one consultation
  and its medication list.
- Header row: consultation reference number, doctor name, date.
- Body rows: each medication — name, dosage, frequency, substitution flag, dispense status.
- Action: "Dispense all" button at the group level (opens confirmation modal).
- OTC walk-in: a separate section with no consultation reference.

**Wireframe:**
```
┌─ REF-20261101-001 · Dr. Perera · 2026-11-01 ──────────────────┐
│  Paracetamol 500 mg     3×/day     Dispensed ✓                  │
│  Ibuprofen 400 mg       2×/day     Pending   [Dispense]         │
└────────────────────────────────────────────────────────────────┘
┌─ REF-20261101-002 · Dr. Silva · 2026-11-01 ───────────────────┐
│  Amoxicillin 250 mg     3×/day     Pending   [Dispense]        │
└────────────────────────────────────────────────────────────────┘
```

**Acceptance:** one group header per consultation; medications listed under it; no
individual medication cards; OTC section separate; mobile 375 px readable.  
**Risk:** grouped query/model change. Effort M.

---

## U10 — Remove medication inventory entirely

**Files to remove or modify** (full audit required before implementation):

| File | Action |
|------|--------|
| `server/src/models/Pharmacy.js` | Remove `inventory` array field from schema |
| `server/src/controllers/pharmacyController.js` | Remove `getInventory`, `updateInventoryItem`, `predictRestock`, `getDistrictRestockAlerts`, `getRestockAnalytics` |
| `server/src/routes/pharmacyRoutes.js` | Remove inventory, analytics/restock, predict-restock, restock-alerts, seed-restock routes |
| `server/src/services/dispensingService.js` | Remove `inventoryItemId` lookup; dispensing is a record only |
| `server/src/models/Dispensing.js` | Remove `inventoryItemId` from items array |
| `client/src/pages/pharmacy/Dashboard.jsx` | Remove inventory and restock nav items; remove inventory section |
| `client/src/i18n/translations/en.js`, `si.js`, `ta.js` | Remove inventory-related keys |
| `server/tests/*.test.js` | Remove inventory tests |
| `scripts/seedRestockData.js` | Delete file |
| Docs | Remove inventory references |

**Dispensing record after removal:** `prescriptionId`, `pharmacyId`, `staffId`, `patientNic`,
`items[{ drugName, dosage, quantityDispensed, substitutionFlag, status }]`, `notes`,
`idempotencyKey`, `seedBatchId`.

**Acceptance:** no inventory UI, route, model field, or test; dispense still works; no
crash on dispense page; "Select inventory" modal gone.  
**Risk:** high — many files. List every file in the plan; one commit. Effort L.

---

## U11 — Pharmacy /restock → district demand + most-sold page

**Current state:** `/pharmacy/dashboard/restock` shows a restock analytics page backed by
the ML service and inventory model (both being removed).

**Proposed change:** Replace entirely with a **District Health Demand** page:
- Top section: district map widget showing disease burden (from seeded Mongo data).
- District names: capitalized (U19).
- Bottom section: "Most sold medications in [this pharmacy's district]" — a ranked table
  of drug names with count of dispenses in the last 30 days (configurable).
- Data source: `Dispensing` collection grouped by `items.drugName`, filtered by
  `pharmacyId` or `pharmacyId.district`.
- Empty state: "No dispensing data yet for this district."

**Wireframe:**
```
District: Kandy
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Disease Burden (last 30 days)
  Dengue          ████████  48 cases
  Upper Resp. Inf ██████    36 cases
  Hypertension    █████     30 cases

Most Sold Medications (Kandy, last 30 days)
  #  Medication            Dispenses
  1  Paracetamol 500 mg    124
  2  Amoxicillin 250 mg     87
  3  Salbutamol Inhaler      54
```

**Acceptance:** page loads with seeded data; district capitalized; no inventory reference;
empty state shown when no data; mobile 375 px readable.  
**Risk:** depends on seeded data (Stage C). Effort M.

---

## U12 — Pharmacy analytics: sold medications by time range

**Current state:** `/pharmacy/dashboard/analytics` shows an existing analytics view.
Operator request: show this pharmacy's sold medications for time ranges.

**Proposed change:** a time-range selector with aggregation from `Dispensing` collection:

| Range | Label |
|-------|-------|
| 24 h | Last 24 hours (operator wrote "23h" — treating as 24 h; stated assumption) |
| 48 h | Last 48 hours |
| 72 h | Last 72 hours |
| 7 d | Last 7 days |
| 14 d | Last 14 days |
| 30 d | Last 30 days |
| Month | This calendar month (Sri Lanka time) |
| Custom | Date range picker (Sri Lanka time, start/end) |

**Wireframe:**
```
Pharmacy Analytics — Sold Medications
[ 24h | 48h | 72h | 7d | 14d | 30d | Month | Custom ]

Top Medications  (Last 7 days, Asia/Colombo)
  #  Medication           Qty Dispensed
  1  Paracetamol 500 mg        312
  2  Amoxicillin 250 mg        189
  ...

Chart: bar chart of top 10 by quantity
```

**Note on "23h":** operator wrote "23h" — this plan treats it as 24 hours (a standard
business-day window). If 23 hours is intentional, operator should confirm.

**Acceptance:** all 8 ranges selectable; counts correct (from Dispensing records for this
pharmacy); Sri Lanka timezone for "this month" and custom range; empty state.  
**Risk:** custom date range needs careful timezone handling. Effort M.

---

## U13 — Admin users: remove Users/Hospitals toggle, add role filter

**Current state:** `/admin/dashboard/users` has a tab-toggle between Users and Hospitals.

**Proposed change:** single unified list with a role filter dropdown:
- Roles in filter: All, Admin, Doctor, Patient, Hospital, Pharmacy.
- Hospitals appear in the same list with role = "Hospital".
- Each row: name, role badge, status, last login, action menu.
- Clicking a row opens the user detail panel (see U14).

**Wireframe:**
```
Users  [Filter: All ▾]  [Search…]           [+ Invite]
─────────────────────────────────────────────────────
Name               Role        Status    Last login
Dr. Perera         Doctor      Active    2026-11-04
City Hospital      Hospital    Active    2026-11-03
...
```

**Acceptance:** toggle gone; role filter works; hospitals visible; redirect from old toggle
URLs to new page; mobile 375 px readable.  
**Risk:** low if the data model already has role. Effort S-M.

---

## U14 — Admin identity page → user detail panel

**Current state:** `/admin/dashboard/identity` is a separate page for identity, trusted
devices, sessions and recovery links.

**Proposed change:**
1. Remove the identity page and its nav item.
2. Add a slide-over or modal panel opened from the Users list (U13) when a user row is
   clicked.
3. Panel tabs: **Overview** (name, role, status, contact), **Sessions** (active sessions
   with device and IP — masked), **Trusted Devices** (list with revoke), **Security Events**
   (last 20 audit events), **Recovery** (active recovery links, expiry).
4. Add redirect: `GET /admin/dashboard/identity` → `/admin/dashboard/users`.

**Wireframe:**
```
[ User List ]  → click row → [ Slide-over panel ]
                                ┌──────────────────────────┐
                                │  Dr. Perera              │
                                │  Doctor · Active         │
                                │──────────────────────────│
                                │  Overview Sessions Dev…  │
                                │                          │
                                │  Last login: 2026-11-04  │
                                │  Email: dr.p***@…        │
                                └──────────────────────────┘
```

**Acceptance:** identity page removed; redirect works; panel opens from user row; all data
sections present; no leaked PII (masked); mobile bottom-sheet on 375 px.  
**Risk:** session/device data fetch may need a new admin endpoint. Effort M-L.

---

## U15 — Remove admin ML Alerts page

**Current state:** `/admin/dashboard/alerts` is a separate ML Alerts page with its own
nav item. Outbreak Monitor covers this content.

**Proposed change:**
1. Delete the page component and its route.
2. Remove the nav item.
3. Add redirect: `GET /admin/dashboard/alerts` → `/admin/dashboard/outbreak`.
4. Remove tests for the removed page.

**Acceptance:** nav item gone; redirect works; Outbreak Monitor unaffected.  
**Risk:** low. Effort S.

---

## U16 — Admin overview: real health checks, explain stats

**Current state:** "Infrastructure configuration (live health not verified)" shows "Not
verified". Stats show 6,317 fulfilments with 1 patient — inconsistent.

**Proposed change:**
1. **Health checks** (cached for 60 s, do not call ML on every page load):
   - MongoDB: check connection state from mongoose.connection.readyState.
   - Redis: `PING` via the existing redis client.
   - Email (Resend): static config check (key present, domain configured) — no live send.
   - ML service: `GET /health` with 5 s timeout; cache result for 60 s; show "cold start" if status is 503.
   - Display: green/amber/red chip per service, timestamp of last check.
2. **Stats explanation:** show a tooltip on the fulfilment count: "Includes seeded data.
   Real patient accounts: N." Never fabricate. If the counts come from seeded data, label
   them "includes synthetic records".

**Acceptance:** 4 real health indicators shown with correct status; stats have clear labels;
no secret leaked in response; ML endpoint called at most once per 60 s.  
**Risk:** Redis PING may fail in edge cases; ML 503 must not break the page. Effort M.

---

## U17 — Remove all demo/synthetic/test wording from UI

**Scope (audit needed — these are examples):**
- `"SYNTHETIC EPIDEMIOLOGICAL SIMULATION — FOR SYSTEM TESTING ONLY"` tags on outbreak/ML views.
- `TMP-…` display names in any UI.
- Test OTP bypass (`TEST_OTP_ENABLED`, `TEST_OTP_CODE`) — remove after Stage E.
- Demo scripts (`scripts/seed-demo-outbreak.js`, `seed-platform-data.js` runs with `DEMO_OUTBREAK_2026_V1`).
- Any UI string containing "demo", "test", "synthetic", "simulated" that is user-visible.

**Covered fully in `DEMO_DATA_REMOVAL_PLAN.md`.**

---

## U18 — Browser console: `feature_collector.js` deprecated parameters

**Current state:** console shows `feature_collector.js … deprecated parameters`. This
originates from a browser extension (confirmed in V1 docs/agent-work/AGENT_LOG_A.md).

**Proposed change:** no product change needed for extension-owned messages. Confirm by:
1. Opening a fresh browser profile with no extensions.
2. If the warning disappears → extension-owned, no action.
3. If it persists → find the app-owned call site and fix the parameter.

Document finding in `CLEANUP_AND_COMMENTING_PLAN.md`.  
**Acceptance:** any app-owned console warnings fixed; extension warnings documented and ignored.

---

## U19 — Capitalize district names everywhere

**Current state:** district names are stored and displayed lower-case (e.g. "kandy",
"gampaha").

**Proposed change:** CSS `capitalize` or `text-transform: capitalize` on all district
name display elements. No data migration needed (storage stays lower-case for consistency
with the ML engine and existing queries).

**Files to update:** GeographicMap.jsx, public health components, pharmacy demand page
(U11), admin overview map, any `districtName.toLowerCase()` display renders.

**Acceptance:** "Kandy", "Gampaha" etc. everywhere in the UI; no data model change.  
**Risk:** very low. Effort S.

---

## U20 — Rewrite outbreak notification text

**Current state:** notification text is a raw technical string about the outbreak alert.

**Proposed change:** short, clear, role-appropriate text in EN/SI/TA:

| Role | English template |
|------|-----------------|
| Admin | "⚠️ Outbreak alert: {disease} rising in {District}. {alertLevel} level. View Outbreak Monitor." |
| Hospital | "⚠️ Alert in your district: {disease} cases increasing in {District}. Check district dashboard." |
| Pharmacy | "📊 Health update: {disease} activity in {District}. See district demand page." |

Add i18n keys `notification.outbreak.admin`, `notification.outbreak.hospital`,
`notification.outbreak.pharmacy` in EN/SI/TA.

**Acceptance:** notifications readable in all 3 languages; no raw key or JSON blob visible;
clipping fixed (U8).

---

## U21 — Public pages: UTC day buckets → Sri Lanka time proposal

**Current state:** daily case counts bucket by UTC midnight, so a case at 23:00 UTC
(04:30 IST next day) counts in the wrong day.

**Proposed change:**
- Backend: add `Asia/Colombo` offset (+05:30) to all date truncation queries.
  `$dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "Asia/Colombo" }`
- Display: show "Data in Sri Lanka time (UTC+05:30)" label.
- Forecast: use Sri Lanka day boundaries.

**Assumption:** operator approves this change as part of Stage B.  
**Acceptance:** day buckets shift by +5:30; label visible; forecast aligned.  
**Risk:** Mongo aggregation timezone requires MongoDB ≥ 3.6 (Atlas is current — OK). Effort S.

---

## U22 — Tiny text audit and fix

**Found by static scan (Antigravity no-network audit):**

| File | Line | Class | Context |
|------|------|-------|---------|
| ActiveOutbreakBanner.jsx | 96 | `text-[9px]` | badge |
| ChangePasswordCard.jsx | 74 | `text-[10px]` | role monospace label |
| ChangePasswordCard.jsx | 137 | `text-[11px]` | hint text |
| GeographicMap.jsx | 132 | `text-[10px]` | district badge |
| GeographicMap.jsx | 164 | `text-[10px]` | district risk label |
| GeographicMap.jsx | 167 | `text-[9px]` | district sub-label |
| LabDetailModal.jsx | 65, 75, 83 | `text-[9px]` | section headers (uppercase) |
| LabDetailModal.jsx | 91 | `text-[10px]` | section header |
| LanguagePreferenceCard.jsx | 220 | `text-[10px]` | language badge |
| LanguagePreferenceCard.jsx | 232, 241 | `text-[11px]` | hint text |
| LoginOtpStep.jsx | 131 | `text-[11px]` | label |
| LoginShell.jsx | 63, 101 | `text-[10px]` | badges |
| MedicalTimeline.jsx | 269, 326 | `text-[10px]` | badges |
| MedicalTimeline.jsx | 340 | `text-[10px]` | section header |
| PasswordCriteriaTips.jsx | 87 | `text-[11px]` | criteria list |
| PasswordStrengthMeter.jsx | 38 | `text-[10px]` | strength label |
| PublicNavbar.jsx | 84 | `text-[9px]` | (needs context) |
| Sidebar.jsx | 128, 164 | `text-[10px]` | nav labels |

**Proposed minimum sizes:**
- Readable body/hint text: **12 px** (`text-xs` = 12 px in Tailwind).
- Short uppercase badges/labels: **11 px** minimum (`text-[11px]`).
- 9 px: never. 10 px: only uppercase short labels; evaluate each site.

**Note:** Sinhala and Tamil glyphs need more horizontal space than Latin at the same point
size. At 10 px, SI/TA may become illegible. Verify at 375 px with SI/TA content.

**Acceptance:** no `text-[9px]` in codebase; every `text-[10px]` instance justified or
upgraded; SI/TA legible at 320 px and 375 px.

---

## U23 — Undefined Tailwind classes

**Found by static scan:**

| Class | Files affected | Standard replacement |
|-------|---------------|---------------------|
| `text-slate-550` | Register.jsx, DoctorProfileModal.jsx, HospitalProfileModal.jsx, PharmacyProfileModal.jsx | `text-slate-500` or `text-slate-600` |
| `text-slate-650` | (not found in scan — monitor) | `text-slate-600` or `text-slate-700` |

**Action:** add `slate-550` to `tailwind.config.js` extend colors (value `#64748b` ≈ slate-500,
or the mid-point), **or** replace all usages with the nearest valid class. Adding to config
is simpler — one config change, no component edits.

**Proposed config addition:**
```js
// tailwind.config.js
extend: {
  colors: {
    slate: { 550: '#64748b' } // between slate-500 (#64748b) and slate-600 (#475569)
  }
}
```
(Note: slate-500 and slate-550 would be identical with this value. If the design intent
is a mid-tone, use `#546484`. Operator to confirm preferred value.)

**Acceptance:** `npx tailwindcss build` generates a rule for `text-slate-550`; no silent
no-op classes in the codebase; script confirms no unknown classes.

---

## U24 — Stale trackers and docs

Covered in `TRACKER_RECONCILIATION.md`. Action: add archived pointer at top of each old
tracker file; update docs/agent-work/DECISIONS.md with D10.

---

## U25 — Static security audit

Covered fully in `SECURITY_AUDIT_STATIC.md`.

---

## U26 — C5 coverage document

Covered fully in `C5_COVERAGE.md`.
