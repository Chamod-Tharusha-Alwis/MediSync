# MediSync — Frontend UI/UX Design & Layout Reference

This document provides a page-by-page breakdown of the MediSync frontend user interfaces, styling tokens, glassmorphic layout components, and interaction models.

---

## 1. Visual Design System (Prompt 0)

MediSync utilizes a cohesive design system centered around **Premium Slate Glassmorphism**:
- **Background Palette**: Deep charcoal and space slate (`#0b1120` to `#0f172a`).
- **Surface Panels**: Translucent container cards with blur effects (`backdrop-blur-xl bg-slate-900/50 border border-white/5`).
- **Typography**: Sleek, modern sans-serif (Inter/Outfit) with sharp weights (black, extra-bold) for headings.
- **Accents by Role**:
  - **Super Admin**: Indigo (`#6366f1`)
  - **Patient**: Rose (`#f43f5e`)
  - **Doctor**: Teal (`#14b8a6`)
  - **Pharmacy**: Emerald (`#10b981`)
  - **Hospital/Laboratory**: Indigo/Purple (`#4f46e5`)

---

## 2. Core Navigation & Layout Components

### 2.1 Reusable Layout Shells
- **`<AppShell />`**: Implements a unified container layout with responsive margins, a fixed global sidebar, and a scrollable workspace page-frame.
- **`<LoginShell />`**: Handles all portal authentication screens, featuring a centered glass box, animated background orbs, role-themed badges, and restricted security warnings.
- **`<Sidebar />`**: Sidebar containing navigation routes, user profile badge, and the interactive `<NotificationBell />`.

### 2.2 Global Communication Widgets
- **`<NotificationBell />`**: Renders a dropdown overlay showing unread broadcast messages, alert banners, and system maintenance logs.
- **`<ActiveOutbreakBanner />`**: A glowing red ticker warning banner displayed at the top of page shells when active outbreaks (Z-score > 2.0) are triggered in the patient's district.

---

## 3. Page-by-Page Design Specifications

### 3.1 Public Portal Pages

#### 3.1.1 Landing / Home Page (`Home.jsx`)
- **Header**: Embedded `PublicNavbar` with translucent pill buttons.
- **Hero**: A high-impact centered greeting with a glowing colored title, subtexts, and a "Choose Your Portal" main CTA button.
- **Workflow Stepper**: An interactive horizontal timeline. Users click roles (Doctor, Lab Assistant, Pharmacist, Patient) to render a step-by-step progress checklist of their journey, featuring role-specific icons and description cards.

#### 3.1.2 Role Selection (`SelectRole.jsx`)
- Displays 5 portal landing cards (Patient, Doctor, Pharmacist, Lab Assistant, Admin).
- Cards are styled with dark slate panel surfaces, glass borders, and distinct hover lifting scales (`.hover-lift` transition).

#### 3.1.3 Registration Wizards (`Register.jsx`)
- **Global Auth Wizard**: Supports registration for patients, doctors, and pharmacists.
- **Role-Specific Registries** (Patient/Doctor/Pharmacy/Hospital `Register.jsx` files):
  - **Step 1: Credentials**: Inputs for Name, Email, Password, and Confirm Password. Integrates an interactive **Password Strength Meter** transitioning color bars (Weak: Rose $\rightarrow$ Moderate: Amber $\rightarrow$ Good: Blue $\rightarrow$ Strong: Emerald).
  - **Step 2: Profile Specifications**: Based on the active role, the form reveals patient fields (NIC, DOB, Contact), doctor fields (License, Specialization dropdown), pharmacy fields (Reg No, District), or hospital details.
  - **Step 3: Success Confirmation**: A full-card view displaying a green checkmark icon, registration message, and a redirect login CTA.

#### 3.1.4 Public Search Rosters & Modals
- **Directory Lists** (`DoctorDirectory.jsx`, `HospitalDirectory.jsx`, `PharmacyDirectory.jsx`):
  - Displays search inputs with debounced key handling.
  - Cards feature ratings, tags, and locations. Unresolved state mounts custom `LoadingSkeleton` pulse cards.
- **Detail Profile Modals** (`DoctorProfileModal.jsx`, `HospitalProfileModal.jsx`, `PharmacyProfileModal.jsx`):
  - **Header**: Provider name, rating highlights, and close button.
  - **Tab Navigation**: Tab triggers to toggle views:
    1. *About*: Biography, operating hours, and specialty details.
    2. *Feedback*: Ratings list, date tags, and customer comments.
    3. *Location Map*: Contains an inverted Google Maps iframe showing physical address coordinates.
  - **Review Submission**: Includes a interactive 1-5 star selector and feedback text-area for logged-in patients.

---

### 3.2 Role-Based Dashboards

#### 3.2.1 Patient Dashboard (`pages/patient/Dashboard.jsx`)
- Renders greeting cards displaying the patient's clinical stats (Active prescriptions, upcoming follow-ups).
- Integrates the timeline (`History.jsx`) detailing clinical histories, lab reports with download progress indicators, and a "Rate Consultation" button locking feedback to prevent double submissions.

#### 3.2.2 Doctor Workspace (`pages/doctor/NewConsultation.jsx`)
- A clinical consultation stepper wizard:
  - **Step 1**: Search patient NIC and input bypass OTP.
  - **Step 2**: Log patient vitals (weight, SpO₂, temperature) with visual ranges.
  - **Step 3**: Symptom autocomplete tags feeding the scikit-learn ML engine model to display ranked diagnosis options with confidence bars.
  - **Step 4**: Prescription selection. Triggers warnings for drug-drug interactions (e.g. Aspirin + Warfarin) and patient allergy checks.

#### 3.2.3 Pharmacy Terminal (`pages/pharmacy/Dashboard.jsx`)
- NIC lookup interface with grid layout for prescriptions.
- Dispensation panel with substitution checkmarks, reason trackers, and inventory depletion charts.

#### 3.2.4 Hospital Lab Board (`pages/hospital/Dashboard.jsx`)
- Consent OTP trigger input, pending tests list, and technician report upload panel with file drag-and-drop slots.

#### 3.2.5 Super Admin Command Center (`pages/admin/Dashboard.jsx`)
- **Stats Grid**: Outbreak metrics, active user registrations, and system CPU/memory dial stats.
- **Audit Logs Table**: Table with timestamp tags, action scopes, and lock icons identifying masked PII data columns.
- **Broadcast Composer**: Message form and live preview container showing exactly how notifications will render in the patient's bell.
- **Outbreak Monitor Chart**: Recharts bar chart displaying district consultation rates and warning lines ($Z = 2.0$).


## Security Hardening Note (Phase 2)
The recent backend security hardening (which included strict HMAC timing-safe validation, Redis rate-limiting, and Vault-backed key rotation) was executed purely on the server and ML engine layers. These structural improvements operate invisibly to the client application and do not alter the UI/UX flows, Glassmorphic component library, or page layouts defined in this document.
