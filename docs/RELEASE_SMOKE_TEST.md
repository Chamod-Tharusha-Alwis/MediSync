# MediSync Production Release Runbook & Smoke Test Checklist

## 1. Rollback Procedures

### A. Vercel Frontend Rollback
1. **Instant UI Rollback**:
   - Navigate to [Vercel Dashboard](https://vercel.com/) -> Project `medi-sync`.
   - Go to **Deployments**.
   - Find the previous known-good deployment (e.g. `dpl_7J2VKfMH2jPfuUuD9ikBFobQKNKK`).
   - Click `...` and select **Promote to Production** / **Rollback**.
   - Traffic routes to the prior deployment in < 5 seconds.
2. **Git-Level Rollback**:
   ```bash
   git revert HEAD -m 1
   git push origin main
   ```

### B. Render Services Rollback (Backend & ML Engine)
1. **Immediate Service Suspension (Emergency Halt)**:
   - If an unexpected error occurs during launch, immediately suspend backend ingress:
     - Render Dashboard -> Web Service `medisync-wabc` -> Settings -> **Suspend Service**.
     - Public endpoints immediately return HTTP 503 while database state is preserved.
2. **Instant Image / Commit Rollback**:
   - In Render Dashboard for `medisync-wabc` and `medisync-ml-service`:
   - Go to **Events** / **Deploys**.
   - Locate the previous successful deployment.
   - Click **Rollback to this deploy**.
   - Render re-deploys the previous container build within 2 minutes.

---

## 2. Production Smoke Test Account Management
- **Zero Hardcoded Passwords**: No test or default passwords are stored in configuration or documentation.
- **Runtime Password Provisioning**: The operator generates strong, unique random passwords (minimum 16 characters with mixed case, digits, and symbols) at runtime when provisioning temporary smoke-test accounts.
- **Post-Verification Deactivation**: Immediately upon conclusion of the smoke test, all temporary accounts are deactivated by setting `isActive: false` or removing the temporary testing record.

---

## 3. Production Smoke Test Checklist

Execute these 7 verification steps immediately upon deployment before declaring general availability:

| Step # | Verification Item | Action & Expected Result | Pass / Fail |
|--------|-------------------|--------------------------|-------------|
| 1 | **Five-Role Login** | Log in sequentially with operator-provisioned test accounts for each role:<br>• Patient<br>• Doctor<br>• Pharmacist<br>• Hospital Admin<br>• System Admin<br>Verify 2FA OTP prompt displays, authentication tokens are issued in `HttpOnly` cookies, and appropriate role dashboard renders. | [ ] |
| 2 | **Symptom Checker & ML Triage** | Navigate to `/symptom-checker`. Select symptoms (e.g. "itching", "skin rash"). Click "Analyze Symptoms".<br>Verify ML engine responds with predicted condition, triage urgency, and confidence without network timeout or 500 error. | [ ] |
| 3 | **Public Health Map** | Navigate to `/outbreak-map`. Verify CARTO / Leaflet tile layers load, Sri Lanka district boundaries render, and outbreak risk levels display correctly. | [ ] |
| 4 | **Trilingual Language Switch** | Toggle language between **EN** (English), **SI** (Sinhala), and **TA** (Tamil) in navigation bar.<br>Verify all UI headings, navigation links, and notices update immediately without missing string keys. | [ ] |
| 5 | **Clinical Workflow: Consultation & Dispensing** | 1. Doctor creates consultation note and issues e-prescription for patient.<br>2. Patient profile reflects new prescription under `/prescriptions`.<br>3. Pharmacist dispenses prescription; verify inventory quantity decrements atomically. | [ ] |
| 6 | **Laboratory Test & Diagnostic View** | 1. Navigate to `/lab` as Doctor or Patient.<br>2. Open existing lab test detail modal (`LabDetailModal`).<br>3. Verify test parameters, reference ranges, and notes display cleanly. | [ ] |
| 7 | **Truthful PDF Export Disabled State** | On `/prescriptions`, `/history`, and `LabDetailModal`:<br>1. Verify PDF download buttons are disabled (`aria-disabled="true"`).<br>2. Verify tooltip and label truthfully state `"PDF export temporarily unavailable"` (in EN, SI, and TA).<br>3. Verify clicking disabled button does not trigger network request, error toast, or crash. | [ ] |
