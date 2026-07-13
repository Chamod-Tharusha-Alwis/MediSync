# MediSync Redesign — Prompts for AntiGravity 2.0 (Gemini 3.1 Flash High)

How to use: run **Prompt 0** first in its own session so the agent builds the design system and shared components. Then run Prompts 1–6 **in separate sessions/tasks, one at a time**, in the order given — each one depends on Prompt 0's output. Feeding all pages in a single giant prompt to a Flash-tier model will produce inconsistent results; scoping it per portal keeps each task inside a reliable context size and lets you review/commit between phases.

---

## Prompt 0 — Design System & Shared Components (run first)

```
You are redesigning the UI of MediSync, an existing full-stack healthcare platform
(React 18 + Vite + Tailwind CSS + Framer Motion + Lucide icons + Recharts in client/).
Do NOT touch server/ or ml-engine/. Do NOT change any API calls, prop contracts passed
from parent pages, route protection, or business logic — visual/structural UI only.

GOAL: Establish a single design system before touching any individual page.

1. Design direction: clinical-modern SaaS. Soft teal/blue primary palette, neutral
   light background, one clear accent color for alerts/urgency (warnings, expired,
   interaction risk). Typography: Inter or Poppins, define a type scale (display,
   h1-h3, body, caption). Rounded-2xl cards, soft shadows, subtle glass/blur on
   modals only. Purposeful Framer Motion transitions — no gratuitous animation.

2. Add/confirm Tailwind config: extend theme with the new color palette, font
   family, border-radius, and shadow tokens as named values (not one-off hex codes
   scattered across components).

3. Build these shared components in client/src/components/ui/ (or the existing
   shared components folder — inspect the repo structure first and follow its
   conventions):
   - AppShell: Sidebar + Topbar + NotificationBell, parameterized by role
     (patient/doctor/hospital/pharmacy/admin) and accepting userName/userRole props
   - OtpInput: segmented 6-digit input, countdown timer, resend action — purely
     presentational, calls an onSubmit(code) prop, does not know about Redis/Speakeasy
   - StatusBadge: pending/approved/completed/dispensed/expired/banned variants
   - Modal/Drawer shell with glass/blur treatment
   - Toast/notification component (success/error/info)
   - EmptyState and Skeleton loader components

4. Do not wire these into any page yet in this task — just build and export them,
   plus a small style-guide page (e.g. /dev/style-guide route, remove before
   production) so I can visually review every component before we redesign real
   pages.

5. Before writing code, list every existing shared/UI component you find already
   in the repo so we don't duplicate. Tell me what you found and what you're about
   to build, then proceed.
```

---

## Prompt 1 — Patient Portal

```
Continue the MediSync redesign using the design system and shared components
(AppShell, OtpInput, StatusBadge, Modal, Toast, EmptyState/Skeleton) built in the
previous task. Do not touch server/ or ml-engine/, or any API/data-fetching logic —
only presentation and layout.

Redesign these Patient portal pages, reusing the shared components wherever they
fit instead of writing new one-off UI:

1. Patient Dashboard — use AppShell, add quick-stat cards (upcoming labs, active
   prescriptions, unread messages), ensure NotificationBell renders correctly.
2. Medical History / Lab Reports — timeline or list view with StatusBadge
   (pending/approved/completed), OTP-gated download using the new OtpInput
   component, download progress indicator.
3. Support Ticket panel — card or chat-style ticket thread with StatusBadge,
   EmptyState for no tickets.
4. Doctor Review submission — interactive hover-star rating, character counter,
   success confirmation animation on submit.
5. Profile Settings / picture upload — drag-and-drop avatar upload zone with
   preview and upload progress.

Preserve every existing prop, API call, and route exactly as-is — only change
markup/styling/structure. After each page, tell me which existing tests (if any,
check client/tests/) reference selectors you changed, and update those selectors
in the same task so nothing breaks.
```

---

## Prompt 2 — Doctor Portal

```
Continue the MediSync redesign, same rules as before (design system + shared
components already built, no backend/logic changes, update any test selectors you
break).

Redesign:
1. Doctor Dashboard — AppShell, today's-consultations widget, quick patient search.
2. NewConsultation wizard — this is the highest priority page. Convert to a clean
   multi-step stepper (NIC search → OTP → symptoms → ML analyze → prescribe) with a
   visible progress bar across all steps. Replace plain symptom text entry with a
   chip-based multi-select. Add a visualization of the ML disease-prediction
   confidence scores returned by the existing API (don't change what the API
   returns, just present it better). Redesign the drug interaction warning
   (currently a text banner) as a color-coded severity card with an icon —
   preserve the exact trigger logic/test-ids used by DOC-02's Playwright test.
3. Lab Test Ordering step — searchable multi-select with tag chips for
   "Recommended Lab Tests".
4. OTP-gated lab report download — use the shared OtpInput component.

Keep all existing form state, validation, and submit handlers intact — this is a
visual/structural pass only.
```

---

## Prompt 3 — Hospital & Laboratory Portal

```
Continue the MediSync redesign, same constraints as previous tasks.

Redesign:
1. Hospital Dashboard — AppShell, pending-consent and pending-approval widgets.
2. Consent OTP request/entry — use the shared OtpInput component with expiry
   countdown, consistent with the doctor-side OTP redesign.
3. Lab Test Approval — replace the flat pending-test list with a status-tab or
   kanban-style board (Pending / Approved / Completed) using StatusBadge.
4. Report Upload (assistant role) — drag-and-drop upload zone with an
   "encrypting..." progress indicator during the existing in-memory
   AES-256-GCM envelope encryption step, and a success/failure toast on
   completion. Do not alter the actual encryption/upload logic.
```

---

## Prompt 4 — Pharmacy Portal

```
Continue the MediSync redesign, same constraints as previous tasks.

Redesign:
1. Pharmacist NIC search — prominent hero-style search bar, recent-searches list,
   skeleton loaders while fetching.
2. Prescription cards — show drug, dosage, prescribing doctor, expiry countdown
   using StatusBadge. On dispense, animate the card to a grayed-out/success state
   before removing it, rather than an instant disappearance. Add a confirmation
   modal (use the shared Modal component) before dispensing.
3. Alternative drug substitution — convert the current checkbox+text-field into an
   inline expandable panel with an autocomplete substitute-drug search.
4. Inventory view — add a stock-level bar/gauge per drug with a low-stock color
   warning, sortable table.

Preserve the exact dispense/double-dispense/expiry validation logic and API
calls — this task is visual only.
```

---

## Prompt 5 — Super Admin Command Center

```
Continue the MediSync redesign, same constraints as previous tasks.

Redesign:
1. Admin login — reuse the shared login shell (build one now if it doesn't exist
   yet, following the Prompt 0 design system) with a visually distinct "restricted
   access" cue.
2. Audit Log — searchable/filterable data table, role filter chips, clear
   timestamp formatting, visual indicator for masked/encrypted fields.
3. Broadcast Composer — audience-selector (role/district), live preview of how the
   notification will appear in a patient's NotificationBell, send confirmation.
4. Outbreak Monitor — restyle the existing Recharts z-score output with a
   threshold reference line matching the new palette; "Initialize Scan" button
   with a loading state; results summary card instead of raw output.
5. User Ban management — table with status toggle and a confirmation modal (use
   shared Modal) before banning.

Keep every existing data-fetching call, socket listener, and admin-only route
guard unchanged.
```

---

## Prompt 6 — Public Portal (last)

```
Continue the MediSync redesign, same constraints as previous tasks. This is the
final phase — the design system should now be fully proven out across all
authenticated portals, so apply it consistently here.

Redesign:
1. Landing/Home page — new hero section, role-selector cards (Patient / Doctor /
   Hospital / Pharmacy), clear CTA hierarchy.
2. Public Doctor Directory — restyled cards (avatar, rating, specialty tags),
   search/filter bar, skeleton loading states.
3. DoctorProfileModal / HospitalProfileModal / PharmacyProfileModal — tabbed
   layout (About / Reviews / Location), styled container around the existing
   getEmbedMapUrl iframe, smooth open/close motion.
4. Registration forms (all four roles) — convert to a multi-step wizard with a
   progress indicator, inline field validation states, password strength meter.
   Preserve the existing duplicate NIC/email check exactly as-is.
5. Login pages (all roles) — consistent shared login shell (reuse across roles,
   differentiate by icon/branding only).

After this task, do a final pass: list every page from Prompts 1-6 and confirm
each one uses the shared components from Prompt 0 rather than duplicated
one-off styles, and confirm all previously-passing Playwright/Jest tests still
pass or have been updated to match intentional UI changes.
```
