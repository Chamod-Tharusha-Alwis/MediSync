# MediSync — Online Production Test Runbook

**Target Host**: `https://medisync.chamodtharusha.com.lk`  
**API Gateway**: `https://medisync-wabc.onrender.com`  
**ML Engine**: `https://medisync-ml.onrender.com`  
**Status**: Authoritative procedure for production acceptance testing  

---

## 1. Scope & Rules of Engagement

1. **Public GET Validation (Zero Side-Effects)**:
   Any operator or automation suite may execute read-only GET requests against public marketing, surveillance, and directory endpoints.

2. **Authenticated Role-Based Testing (Strict Discipline)**:
   - Rate limit quota: Maximum 50 OTP or email dispatches per 24-hour cycle.
   - No blind retries: If an authentication request fails, stop immediately, inspect server logs, and diagnose root cause before attempting another request.
   - Pre-deployment restriction: Authenticated workflows targeting new features (such as gated PDF exports or modernized surveillance tabs) require prior production deployment of branch `feat/final-stage-b2-to-g` by the repository owner.

---

## 2. Public Read-Only Endpoint Suite

### 2.1 Target Endpoints

| Route | Functionality | Expected HTTP | Content Marker |
|---|---|:---:|---|
| `/` | Landing page | 200 | Brand header, role portals, language toggle |
| `/public-health` | Surveillance v2 (Epidemiology) | 200 | Outbreak map, district analytics, non-diagnostic disclaimer |
| `/doctors` | Certified doctor directory | 200 | Doctor search input, hospital affiliation chips |
| `/hospitals` | Registered hospital directory | 200 | District filter, bed capacity, emergency status |
| `/pharmacies` | Licensed pharmacy directory | 200 | District filter, operating hours, contact info |

### 2.2 Viewport Responsiveness Verification

Each endpoint must render without overflow or horizontal scrollbar across three standardized viewport widths:
- **Mobile Compact (320px)**: iPhone SE / Android small. Ensure navigation hamburger collapses properly, tables convert to stacked cards, and font sizes comply with 11px+ readable floor.
- **Mobile Standard (375px)**: iPhone 12/13/14 standard viewport. Ensure buttons maintain 44px touch targets.
- **Desktop Wide (1440px)**: Standard laptop/desktop layout. Full multi-column grid view.

### 2.3 Trilingual Localization Verification

Verify language switching via the global language toggle:
- **English (`en`)**: Default localization.
- **Sinhala (`si`)**: Native Sinhala script rendering without Unicode truncation or missing glyph placeholders.
- **Tamil (`ta`)**: Native Tamil script rendering cleanly across all directory labels and disclaimers.

### 2.4 Command-Line Automated Smoke Check

```powershell
node -e "
const https = require('https');
const routes = ['/', '/public-health', '/doctors', '/hospitals', '/pharmacies'];
const base = 'https://medisync.chamodtharusha.com.lk';

Promise.all(routes.map(r => new Promise((resolve) => {
  https.get(base + r, res => {
    resolve({ route: r, status: res.statusCode, ok: res.statusCode === 200 });
  }).on('error', err => resolve({ route: r, error: err.message, ok: false }));
}))).then(results => {
  console.table(results);
  const allOk = results.every(r => r.ok);
  if (!allOk) process.exit(1);
});
"
```

---

## 3. Authenticated Role Workflows (Post-Deployment)

*Note: These tests require `feat/final-stage-b2-to-g` to be merged and deployed by the repository owner.*

### 3.1 Patient Portal & Consultation PDF Export

1. Login as registered patient using genuine email OTP flow.
2. Navigate to `/patient/consultations`.
3. Locate a consultation record and click **Export PDF**.
4. **Behavior with `PDF_EXPORT_ENABLED=false` (Default)**:
   - Client displays graceful advisory: "PDF export is currently undergoing security review (503 Service Unavailable)."
   - No crash or PII exposure in console.
5. **Behavior with `PDF_EXPORT_ENABLED=true` (Owner Opt-In)**:
   - Downloads PDF formatted per `docs/new/PDF_EXPORT_DESIGN.md`.
   - Filename adheres to format: `consultation_<consultationId>.pdf` (ZERO NIC in filename).
   - Document contains clinical header, prescribed medications, and mandatory `clinicalValidation: not_established` disclaimer.

### 3.2 Doctor Portal & Consultation Ingestion

1. Login as doctor account.
2. Open `/doctor/consultations/new`.
3. Input patient identifier and observe consent verification.
4. Input symptoms and verify `clinicalValidation: not_established` disclaimer badge is visible above AI suggestion cards.
5. In case of cold start or network 429, verify UI displays graceful fallback "AI suggestions unavailable, continue manually" without freezing form inputs.

### 3.3 Pharmacy Portal & Prescription Dispensing

1. Login as pharmacy staff.
2. Open `/pharmacy/dashboard`.
3. Verify modernized view displays consultation-grouped prescriptions and regional health burden insights.
4. Verify legacy inventory management routes and buttons are completely absent.

### 3.4 Admin Portal & System Health Check

1. Login as system administrator.
2. Navigate to `/admin/system-health`.
3. Verify live service health monitors display real statuses for:
   - MongoDB database connection
   - Render API Gateway
   - ML Engine service
4. Verify legacy ML alerts submenu has been cleanly excised.
