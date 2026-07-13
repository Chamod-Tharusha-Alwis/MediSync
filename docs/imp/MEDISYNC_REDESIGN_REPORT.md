# MediSync — Full Platform UI/UX Redesign Report

**Scope:** Every page across all six portals (Public, Patient, Doctor, Hospital/Lab, Pharmacy, Admin)
**Goal:** Replace current functional-but-plain UI with an attractive, consistent, user-friendly design system — without touching any backend logic, encryption flows, OTP gates, or API contracts.

---

## 0. Design Direction (assumption — confirm or adjust)

| Element | Current (inferred) | New Direction |
|---|---|---|
| Palette | Default Tailwind blues/grays, inconsistent per page | Unified clinical-modern palette: teal/blue primary, soft neutral background, one accent color for alerts/urgency |
| Typography | Default system/Tailwind font stack | Inter or Poppins, clear type scale (display/heading/body/caption) |
| Cards & Surfaces | Flat white boxes, hard borders | Soft shadows, rounded-2xl corners, subtle glass/blur on modals |
| Motion | Framer Motion present but likely underused | Purposeful micro-interactions: page transitions, button/hover states, OTP/step transitions, toast/notification animations |
| Icons | Lucide (already in stack) | Keep Lucide, standardize sizing/weight across portals |
| Data viz | Recharts (already in stack) | Restyle charts (Outbreak z-score, ratings, stock) to match new palette |
| Layout | Per-portal inconsistency implied (dashboard, sidebar issues noted in BUG-03) | One shared shell: consistent sidebar/topbar/notification-bell pattern reused across all 5 role dashboards |

If this direction is wrong, say so before you run the prompts — the master prompt below locks the agent to whatever direction you approve.

---

## 1. Public Portal

| Page | Current State | Change | Add | Remove |
|---|---|---|---|---|
| Landing / Home | Assumed generic marketing layout | Hero redesign, trust badges (encryption/HIPAA-style messaging), clearer CTA hierarchy for each role | Animated stats/illustration, role-selector cards (Patient/Doctor/Hospital/Pharmacy) | Any redundant/duplicate CTAs |
| Public Doctor Directory | List of doctors, likely plain cards | Card redesign with avatar, rating stars, specialty tags | Search/filter bar (specialty, hospital, rating), skeleton loading states | Any dense/plain table-style listing if present |
| DoctorProfileModal / HospitalProfileModal / PharmacyProfileModal | Functional modal with embedded Google Map (SEC-06 fix already applied) | Redesign modal layout: header with photo/name/rating, tabbed sections (About / Reviews / Location) | Smooth open/close motion, review submission inline with star-hover animation | Raw/plain map iframe styling — wrap in styled container |
| Registration (Patient/Doctor/Hospital/Pharmacy) | Multi-field forms, NIC/email duplicate-check (AUT-02) | Multi-step wizard with progress indicator instead of single long form | Inline validation states (success/error per field), password strength meter | Long unsegmented single-page forms if currently used |
| Login (per role) | Separate login pages per role | Consistent shared login shell, role indicated by branding/icon | "Remember me", clearer error states for bad credentials/banned accounts (ADM-04) | Inconsistent styling between role login pages |

---

## 2. Patient Portal

| Page | Current State | Change | Add | Remove |
|---|---|---|---|---|
| Dashboard | Sidebar previously missing `userName`/`userRole` props, hiding NotificationBell (BUG-03, now fixed functionally) | Redesign sidebar + topbar shell, prominent NotificationBell with animated badge count | Quick-stat cards (upcoming labs, active prescriptions, unread messages) | Any leftover placeholder/blank states from the prop bug |
| Medical History / Lab Report Download | Functional PDF stream download (PAT-01) | Timeline/list view of lab tests with status chips (pending/approved/completed) | Download progress indicator, OTP-request modal redesign (LAB-03 flow) | Plain link-style download buttons |
| Support Ticket Panel | Basic subject/description form, ticket list | Redesign as chat-style or card-based ticket thread | Status badges (pending/replied/closed), empty-state illustration | Bare table listing if present |
| Doctor Reviews (submit) | 5-star rating + text field (PAT-04) | Interactive hover-star component with micro-animation | Character counter, success confirmation animation | — |
| Profile Settings / Picture Upload | Cloudinary upload (PAT-05) | Avatar cropper/preview before upload, drag-and-drop zone | Upload progress bar | Plain file-input button |

---

## 3. Doctor Portal

| Page | Current State | Change | Add | Remove |
|---|---|---|---|---|
| Dashboard | Standard dashboard (assumed) | Match new shared shell (sidebar/topbar/notification bell) | Today's-consultations widget, quick patient search | — |
| NewConsultation Wizard | Multi-step: NIC search → OTP → symptoms → ML analyze → prescribe (DOC-01–04); controlled-input warnings already fixed (BUG-02) | Redesign as a clean stepper UI with progress bar across all 5 steps | Symptom chip-selector (instead of plain text list), ML confidence visualization for disease suggestions, drug interaction banner redesign (currently text banner per DOC-02) → color-coded severity card with icon | Any dense form-in-one-page layout |
| Lab Test Ordering | "Recommended Lab Tests" add flow (DOC-03) | Searchable multi-select with tag chips | Recently-ordered quick-add suggestions | — |
| Lab Report OTP-Gated Download | OTP request + bypass flow (LAB-03) | Redesign OTP modal: 6-digit segmented input, countdown timer, resend action | Success/failure animation on verify | — |

---

## 4. Hospital & Laboratory Portal

| Page | Current State | Change | Add | Remove |
|---|---|---|---|---|
| Hospital Dashboard | Assumed generic | Match shared shell | Pending-consent and pending-approval widgets | — |
| Consent OTP Request | Emailed OTP before registration/search (per security lifecycle doc) | Redesign OTP entry as segmented-input modal (shared component with doctor/lab flows) | Clear expiry countdown | — |
| Lab Test Approval | "Approve Test" action, status pending→approved (LAB-01) | Kanban-style or status-tab board (Pending / Approved / Completed) instead of flat list | Bulk actions if multiple pending tests | — |
| Report Upload (Assistant) | Dummy PDF upload to Cloudinary, envelope encryption in-memory (LAB-01, LAB-02) | Drag-and-drop upload zone with encryption-in-progress indicator | Upload success/failure toast | Plain `<input type=file>` |

---

## 5. Pharmacy Portal

| Page | Current State | Change | Add | Remove |
|---|---|---|---|---|
| Pharmacist Dashboard / NIC Search | Enter NIC → pending prescriptions shown as cards (PHR-01) | Redesign search bar as prominent hero search with recent-searches | Loading skeletons while fetching | — |
| Prescription Card / Dispense | "Dispense Now" action, disappears from list on dispense (PHR-02) | Redesign cards: drug name, dosage, prescribing doctor, expiry countdown badge | Confirmation modal with animated success state | Cards for double-dispensed/expired items should visually gray out before disappearing rather than instantly vanish |
| Alternative Drug Substitution | Checkbox + substitute field (PHR-03) | Redesign as inline expandable panel instead of raw checkbox+input | Autocomplete substitute-drug search | — |
| Inventory View | Stock level decrement on dispense (PHR-06) | Add stock-level bar/gauge per drug, low-stock warning color | Inventory table with sortable columns | — |

---

## 6. Super Admin Command Center

| Page | Current State | Change | Add | Remove |
|---|---|---|---|---|
| Admin Login | Separate `/admin/login` | Match shared login shell, add distinct "restricted access" visual cue | — | — |
| Audit Log | Role-filterable log list (ADM-01) | Redesign as filterable/searchable data table with masked-field indicators, timestamp formatting | Role filter chips, export button (if backend supports it — flag if not, don't fake it) | Raw unstyled table if present |
| Broadcast Composer | Send message → Socket.IO to notification bell (ADM-02) | Redesign as composer card with audience-selector (district/role), live preview of notification card | Send confirmation + delivery count if available | — |
| Outbreak Monitor | Z-score scan trigger, ML metrics returned (ADM-03) | Restyle Recharts output — z-score chart with threshold line, district map/heatmap if coordinates available | "Initialize Scan" button with loading/progress state, results summary card | Raw JSON-looking output if currently shown |
| User Ban Management | Ban by email, blocks login (ADM-04) | Redesign as user table with status toggle + confirmation modal | Search/filter by role/status | — |

---

## 7. Shared Components To Build Once, Reuse Everywhere

These currently seem to be duplicated or inconsistent per portal — building them once as shared components will cut most of the redesign work:

1. **AppShell** (Sidebar + Topbar + NotificationBell) — reused by Patient/Doctor/Hospital/Pharmacy/Admin dashboards
2. **OTP Input** (segmented 6-digit, countdown, resend) — reused by Doctor MFA, Hospital consent, Doctor report access, Doctor NIC-search bypass
3. **StatusBadge** (pending/approved/completed/dispensed/expired/banned) — reused everywhere status appears
4. **Modal/Drawer shell** with the glass/blur treatment — reused by all profile modals, confirmation dialogs
5. **Toast/Notification** component — success/error/info states
6. **EmptyState** and **Skeleton loaders** — currently likely missing platform-wide

---

## 8. Explicit Non-Goals (do not touch)

- No changes to `mongoose-field-encryption`, blind indexing, envelope encryption, Vault, or OTP *logic* (Redis TTLs, Speakeasy generation) — visual redesign of the OTP input only, not its validation flow
- No changes to RBAC middleware, route protection, or API contracts
- No changes to the Playwright/Jest test *assertions* unless a redesign changes a selector/test-id, in which case tests must be updated alongside the UI change, not left broken
- No new backend dependencies

---

## 9. Suggested Implementation Order

1. Design tokens + shared components (Section 7) first — everything else depends on these
2. Patient Portal (highest page count, most user-facing)
3. Doctor Portal (most complex wizard — NewConsultation)
4. Hospital/Lab Portal
5. Pharmacy Portal
6. Admin Command Center
7. Public Portal (marketing/registration/login) — last, since it's least functionally risky but should reflect the finished design language

