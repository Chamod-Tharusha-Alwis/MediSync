# MediSync — UX Engagement Review

Stage A planning document. Created: 2026-11-05 (Antigravity no-network, branch `antigravity/stage-a`)

For each role: the 5–8 most common tasks, current steps/clicks, friction, and proposed
improvement. Findings from reading source code and the live page list in V3.

---

## Role: Patient

### Top tasks
1. View medical timeline / consultation history
2. Download lab report PDF (currently unavailable — U4)
3. Check prescription status
4. View public health notices (unauthenticated or authenticated)
5. Manage account / change password

### Friction analysis

| Task | Current steps | Friction | Proposed |
|------|--------------|---------|---------|
| View medical timeline | Login → Patient dashboard → Timeline tab | 3 clicks | Good. No change. |
| Download lab report | Login → Timeline → Report → "PDF temporarily unavailable" | Dead end | Fix U4; show download button when report is ready |
| Check prescription status | Login → Dashboard → check Rx section | 3 clicks | Add a summary banner on dashboard landing: "1 prescription pending" |
| Change password | Login → Settings → Password tab | 3 clicks; strength bar broken (U3) | Fix U3 |
| Provide consent for lab test | Receive email OTP → go back to hospital | Multi-device friction | Show OTP on a full-screen confirmation page; offer copy button |

### Accessibility findings
- Password strength bar (U3) has no accessible text — a blind user gets no feedback.
- Lab report "unavailable" message has no explanation of when it will be available.
- Timeline date labels are `text-[10px]` (U22) — too small at 320 px.

### Mobile findings (375 px)
- Timeline cards clip at right edge on 320 px — needs `overflow-x: hidden` or narrower padding.
- Consent OTP input: adequate size.

---

## Role: Doctor

### Top tasks
1. Start a new consultation (most frequent, most complex)
2. Review patient history before consultation
3. Prescribe medication with safety check
4. Order lab tests
5. Check outbreak alerts for patient's district
6. View past consultations

### Friction analysis

| Task | Current steps | Friction | Proposed |
|------|--------------|---------|---------|
| New consultation | Dashboard → New Consultation → multi-step wizard | AI cold-start may show spinner with no feedback (C4 — fixed) | Current fix is correct; keep disclaimer |
| Drug search | Type name → dropdown overlaps table (U1) | High friction; must scroll away | Portal fix (U1) |
| Safety alert | Prescription step → alert fires for self-comparisons and 3 times (U2) | Confusing; cry-wolf effect | Dedup fix (U2) |
| Soap prescribable | Soap appears as "1 tab TDS" in Rx (U2) | Absurd suggestion | isPrescribable filter (U2) |
| Lab order | Add test → patient consent OTP needed → 429 fires (U6) | Blocks workflow; wastes emails | Single-fire guard (U6) |
| View past consultations | Dashboard → History tab | 2 clicks, good | No change |
| Outbreak alert for patient | No district-specific alert on consultation page | Missed signal | Add "outbreak active in {patient district}" banner on new consultation if relevant |

### Accessibility
- Medication search input: missing `aria-label` or `aria-expanded` on dropdown.
- Safety alert: `role="alert"` should be set so screen readers announce it.

### Mobile (375 px)
- Consultation wizard: each step fits 375 px well.
- Drug table: horizontal scroll on small screens — confirm with Sinhala/Tamil labels.

---

## Role: Hospital (lab technician / admin)

### Top tasks
1. Register a lab test order for a patient
2. Upload test results
3. View pending lab queue
4. Check OTP / patient consent status
5. View outbreak alerts for the hospital's district

### Friction analysis

| Task | Current steps | Friction | Proposed |
|------|--------------|---------|---------|
| Register lab test | Enter NIC → click verify → 429 five times (U6) | High friction; wasted emails | Single-fire guard; mount-only-once check |
| "Send Verification OTP" button | Shows raw `{t(...)}` text (U5) | Breaks trust | Fix i18n call (U5) |
| Upload result | Queue → select order → upload | 3 steps, fine | No change |
| Outbreak alert for district | Admin sub-role gets Outbreak Monitor; lab tech does not | Lab tech may miss alerts | Add outbreak banner to lab queue page if district alert active |
| Notification dropdown | Clips on left edge (U8) | Unusable on mobile | Fix positioning (U8) |

### Accessibility
- Lab queue table: no `scope` on column headers.
- OTP input: adequate ARIA.

---

## Role: Pharmacy (staff)

### Top tasks
1. Look up pending prescriptions by patient NIC
2. Dispense medication(s)
3. OTC walk-in dispense
4. Check district disease demand / most sold medications
5. View analytics by time range

### Friction analysis

| Task | Current steps | Friction | Proposed |
|------|--------------|---------|---------|
| Look up pending prescriptions | Enter NIC → list appears but 403 in console (U7) | Console error erodes trust; potential data loss | Fix 403 (U7) |
| Dispense | Each medication is its own card — no consultation grouping (U9) | Hard to match against consultation | Group by consultation (U9) |
| Restock page | Restock analytics backed by inventory (being removed — U10) | Broken after U10 | Replace with district demand + most-sold (U11) |
| Analytics | Exists but time ranges unclear | Operator wants 24h–30d + custom | Redesign (U12) |
| Select inventory (dispense modal) | "Select inventory" required — removing (U10) | Will be removed | Dispense = record only |
| Notification dropdown | Clips on mobile (U8) | Same as hospital | Fix (U8) |

### Accessibility
- Prescription card buttons: `aria-label` needed (currently just icons).

---

## Role: Admin

### Top tasks
1. Review user list and approve/suspend accounts
2. Monitor outbreak alerts (Outbreak Monitor)
3. Send broadcast messages
4. Manage admin accounts
5. View infrastructure health (currently "Not verified" — U16)
6. Monitor active sessions

### Friction analysis

| Task | Current steps | Friction | Proposed |
|------|--------------|---------|---------|
| View user list | Dashboard → Users → toggle between Users/Hospitals (U13) | Extra click; hospitals hard to find | Single list with role filter (U13) |
| View user detail | Users → no detail panel; identity is a separate page (U14) | Disjointed | Slide-over panel from user row (U14) |
| View ML Alerts | Nav → Alerts page (redundant with Outbreak Monitor — U15) | Redundant nav item | Remove page and nav item (U15) |
| Check health | Overview shows "Not verified" (U16) | No real data | Live health chips, 60 s cache (U16) |
| Stats context | 6,317 fulfilments with 1 patient — unexplained (U16) | Confusing | Label as "includes synthetic data" until demo records removed |
| Outbreak Monitor | Overview → Outbreak Monitor tab | Good; keep |

### Accessibility
- Admin data tables: missing `<caption>` elements.
- Session monitor: IP addresses should be masked (or confirm masking already applied).

---

## Role: Public (unauthenticated)

### Top tasks
1. View public health summary (cases, map, alerts)
2. View outbreak alerts
3. Navigate to role login page
4. View 404 / unknown route

### Friction analysis

| Task | Current steps | Friction | Proposed |
|------|--------------|---------|---------|
| Public health page | Home → Public Health | 1 click | Good; V2 redesign will add more content (V3 §8) |
| Map district | Click district | Hover tooltip may be tiny (U22) | Upgrade text size |
| Find my role | Home → Select Role → choose | 2 clicks | Good |
| Unknown route | → Trilingual recovery page (live-verified `b911713`) | Good | No change |

---

## Cross-cutting findings

| Finding | Severity | Proposed action |
|---------|---------|----------------|
| `text-[9px]` in badges and map labels — illegible at 320 px especially in SI/TA | High | U22 fix |
| `slate-550` class never applies — invisible icon tint | Medium | U23 fix |
| Notification dropdown clipped at mobile (all roles) | High | U8 fix |
| OTP fired on mount — wastes emails, hits rate limit | High | U6 fix |
| Password strength bar no fill — no strength signal | Medium | U3 fix |
| District names lower-case everywhere | Low | U19 fix (CSS only) |
| "PDF temporarily unavailable" — dead-end for 100% of users needing reports | High | U4 — APPROVE PDF-DESIGN |
| Pharmacy 403 in console | Medium | U7 |

---

## User value ranking (highest impact first)

1. U1/U2 — Medication search + safety alert (doctor's most frequent task, currently broken)
2. U4 — PDF export (100% of patients needing a report hit a dead end)
3. U6 — OTP 429 (wastes email quota; blocks lab workflow)
4. U9/U10 — Pharmacy prescription grouping + inventory removal
5. U3 — Password strength bar (trust/accessibility)
6. U8 — Notification dropdown clip (all roles on mobile)
7. U7 — Pharmacy 403
8. U13–U15 — Admin redesign
9. U11/U12 — Pharmacy restock and analytics
10. U5 — Hospital button raw text
11. U16 — Admin health checks
12. U19/U22/U23 — Capitalization, tiny text, undefined classes (small but visible)
