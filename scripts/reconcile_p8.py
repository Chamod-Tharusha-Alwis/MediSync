import re

# 1. Update docs/report/FEATURE_EXISTENCE_MATRIX.md
with open('docs/report/FEATURE_EXISTENCE_MATRIX.md', 'r', encoding='utf-8') as f:
    fem = f.read()

# Replace row 04
old_row04 = '| **04** | **Consultation Verification Portal (`/verify/:token`) & NIC Gate** | `TECHNICAL_REPORT.md`, `DATA_MODEL.md:113-125`, `API_REFERENCE.md:87-94` | **VERIFIED** | `server/src/routes/verificationRoutes.js:14-25`<br>`server/src/controllers/verificationController.js:19-125`<br>`server/src/models/VerificationToken.js:5-67`<br>`client/src/pages/public/VerifyConsultation.jsx` | Retained and prominently highlighted as the actual cryptographic capability verification architecture. | <!-- TODO-P2 -->'
new_row04 = '| **04** | **Consultation Verification Portal (`/verify/:token`) & OTP Gate** | `TECHNICAL_REPORT.md`, `DATA_MODEL.md:113-125`, `API_REFERENCE.md:87-94` | **VERIFIED** | `server/src/routes/verificationRoutes.js:14-25`<br>`server/src/controllers/verificationController.js:19-125`<br>`server/src/models/VerificationToken.js:5-67`<br>`client/src/pages/public/VerifyConsultation.jsx` | Retained and prominently highlighted as the cryptographic capability verification architecture with email OTP unlock (no NIC entry). |'

fem = fem.replace(old_row04, new_row04)
# Also update Slide 14 key count in row 15 from 813 to 835
fem = fem.replace('813 keys', '835 keys')

# Append rows 17, 18, 19 if not present
new_rows = '''| **17** | **OTP-Gated Verification Flow (`/verify/:token`)** | `client/src/pages/public/VerifyConsultation.jsx`, `server/src/routes/verificationRoutes.js` | **VERIFIED** | `server/src/routes/verificationRoutes.js`<br>`server/src/controllers/verificationController.js`<br>`server/tests/otpVerificationPortal.test.js` | **IMPLEMENTED (Phase 2)**: Replaced legacy NIC entry with mobile-first dynamic 6-digit OTP verification; unlocks clinical encounter and medicine release summary in unified response. |
| **18** | **Medicine Release Data Integrity & Lockout** | `server/src/services/releaseSummaryService.js`, `server/src/services/dispensingService.js` | **VERIFIED** | `server/src/services/releaseSummaryService.js`<br>`server/src/services/dispensingService.js`<br>`server/tests/dispensingIntegrityPhase3.test.js` | **IMPLEMENTED (Phase 3)**: Single shared release summary helper; atomic `partially_dispensed` / `dispensed` transitions; double-dispensing lockout (`ALREADY_DISPENSED`). |
| **19** | **Deterministic Emergency Red-Flag Screen** | `server/src/utils/emergencyAdvisory.js`, `server/src/data/emergencyRedFlags.json` | **VERIFIED** | `server/src/utils/emergencyAdvisory.js`<br>`server/src/data/emergencyRedFlags.json`<br>`client/src/pages/doctor/NewConsultation.jsx`<br>`server/tests/clinicalSafetyPhase4.test.js` | **IMPLEMENTED (Phase 4)**: 6 conservative emergency presentation rules (meningism, cardiorespiratory distress, acute coronary, altered consciousness, anaphylaxis, severe hemorrhage); non-blocking advisory banner. |
'''

if '| **17** |' not in fem:
    fem = fem.replace('<!-- TODO-P2 -->', '')
    fem = fem.replace('---\n\n## 2. Summary of Documentation Corrections Executed', new_rows + '\n---\n\n## 2. Summary of Documentation Corrections Executed')
    with open('docs/report/FEATURE_EXISTENCE_MATRIX.md', 'w', encoding='utf-8') as f:
        f.write(fem)
    print('Updated FEATURE_EXISTENCE_MATRIX.md')

# 2. Update docs/report/API_REFERENCE.md
with open('docs/report/API_REFERENCE.md', 'r', encoding='utf-8') as f:
    ar = f.read()
ar = ar.replace('<!-- TODO-P2 -->', '')
ar = ar.replace(
    '| `POST` | `/api/verify/:token/history-pdf` | Public / Rate-Limited | **Constant-Time NIC Gate**: Accepts patient NIC input; performs constant-time comparison against decrypted patient record. Returns full cumulative medical history PDF. Gated by `PDF_EXPORT_ENABLED`. |',
    '''| `GET` | `/api/verify/:token` | Public | **Public Authenticity Card**: Returns issuance metadata (hospital, doctor, date, status, zero patient PII). |
| `POST` | `/api/verify/request-otp` | Public / Rate-Limited (10/15m) | **OTP Request**: Dispatches 6-digit dynamic OTP to patient's registered email address. |
| `POST` | `/api/verify/unlock` | Public / Rate-Limited (15/15m) | **OTP Unlock**: Verifies 6-digit OTP code and returns unlocked clinical consultation details and medicine release summary. |
| `POST` | `/api/verify/:token/history-pdf` | Public / Rate-Limited (5/15m) | **History PDF Download**: Returns signed cumulative medical history PDF for authorized verification session. Gated by `PDF_EXPORT_ENABLED`. |
| `POST` | `/api/verify/:token/revoke` | Protected (Doctor/Admin) | **Revocation**: Marks token as revoked with clinical justification. |'''
)
with open('docs/report/API_REFERENCE.md', 'w', encoding='utf-8') as f:
    f.write(ar)
print('Updated API_REFERENCE.md')

# 3. Update docs/report/CLAIMS_AUDIT.md
with open('docs/report/CLAIMS_AUDIT.md', 'r', encoding='utf-8') as f:
    ca = f.read()
ca = ca.replace('<!-- TODO-P2 -->', '')
ca = ca.replace('(Public Verification Portal with Patient NIC Gate for history PDF)', '(Public Verification Portal with dynamic email OTP unlock for clinical encounter and medicine release history)')
with open('docs/report/CLAIMS_AUDIT.md', 'w', encoding='utf-8') as f:
    f.write(ca)
print('Updated CLAIMS_AUDIT.md')

# 4. Update docs/report/DATA_MODEL.md
with open('docs/report/DATA_MODEL.md', 'r', encoding='utf-8') as f:
    dm = f.read()
dm = dm.replace('<!-- TODO-P2 -->', '')
dm = dm.replace('Reference to patient record for NIC gate validation', "Reference to patient record for OTP generation and verification unlock")
with open('docs/report/DATA_MODEL.md', 'w', encoding='utf-8') as f:
    f.write(dm)
print('Updated DATA_MODEL.md')

# 5. Update docs/report/DEMO_SCRIPT.md
with open('docs/report/DEMO_SCRIPT.md', 'r', encoding='utf-8') as f:
    ds = f.read()
ds = ds.replace('<!-- TODO-P2 -->', '')
ds = ds.replace(
    'Demonstrate that accessing the full medical history PDF requires passing the **Patient NIC Gate**.',
    "Demonstrate that unlocking the clinical encounter and medicine release history uses a secure **OTP verification flow** sent to the patient's registered email (no NIC entry required on mobile). Note contingency: if email delivery is delayed, clinician can demonstrate authenticated doctor view."
)
with open('docs/report/DEMO_SCRIPT.md', 'w', encoding='utf-8') as f:
    f.write(ds)
print('Updated DEMO_SCRIPT.md')

# 6. Update docs/report/PROGRESS_SUB5.md
with open('docs/report/PROGRESS_SUB5.md', 'r', encoding='utf-8') as f:
    ps5 = f.read()
ps5 = ps5.replace('<!-- TODO-P2 -->', '')
ps5 = ps5.replace('QR verification and NIC gate', 'QR verification and OTP-gated clinical unlock')
with open('docs/report/PROGRESS_SUB5.md', 'w', encoding='utf-8') as f:
    f.write(ps5)
print('Updated PROGRESS_SUB5.md')

# 7. Update docs/report/PROJECT_OVERVIEW.md
with open('docs/report/PROJECT_OVERVIEW.md', 'r', encoding='utf-8') as f:
    po = f.read()
po = po.replace('<!-- TODO-P2 -->', '')
po = po.replace(
    'while full history PDF downloads require passing the patient NIC gate',
    'while full clinical encounter details and history PDF downloads require passing the patient email OTP verification gate'
)
with open('docs/report/PROJECT_OVERVIEW.md', 'w', encoding='utf-8') as f:
    f.write(po)
print('Updated PROJECT_OVERVIEW.md')

# 8. Update docs/report/SCREENSHOT_CHECKLIST.md
with open('docs/report/SCREENSHOT_CHECKLIST.md', 'r', encoding='utf-8') as f:
    sc = f.read()
sc = sc.replace('<!-- TODO-P2 -->', '')
sc = sc.replace('and the **Patient NIC Gate** prompt.', 'and the **Email OTP Verification** prompt and unlocked clinical encounter details.')
with open('docs/report/SCREENSHOT_CHECKLIST.md', 'w', encoding='utf-8') as f:
    f.write(sc)
print('Updated SCREENSHOT_CHECKLIST.md')

# 9. Update docs/report/SLIDES_OUTLINE.md
with open('docs/report/SLIDES_OUTLINE.md', 'r', encoding='utf-8') as f:
    so = f.read()
so = so.replace('<!-- TODO-P2 -->', '')
so = so.replace('while full medical history download requires passing a constant-time Patient NIC gate.', 'while full clinical and release history requires passing a dynamic email OTP verification gate.')
so = so.replace('Tamper-evident digital prescription pipeline with QR and NIC-gate verification.', 'Tamper-evident digital prescription pipeline with QR capability and OTP-gated verification.')
with open('docs/report/SLIDES_OUTLINE.md', 'w', encoding='utf-8') as f:
    f.write(so)
print('Updated SLIDES_OUTLINE.md')

# 10. Update docs/report/TECHNICAL_REPORT.md
with open('docs/report/TECHNICAL_REPORT.md', 'r', encoding='utf-8') as f:
    tr = f.read()
tr = tr.replace('<!-- TODO-P2 -->', '')
tr = tr.replace('D04: QR Verification & NIC Gate', 'D04: QR Verification & OTP Gate Sequence')
tr = tr.replace('QR Verification & NIC Gate (`docs/report/diagrams/d04_qr_verification_nic_gate.mmd`)', 'QR Verification & OTP Gate (`docs/report/diagrams/d04_qr_verification_nic_gate.mmd`)')
tr = tr.replace('Diagram D04: QR Verification & NIC Gate Sequence', 'Diagram D04: QR Verification & OTP Gate Sequence')
tr = tr.replace(
    '1. **Low-Entropy National Identity Card (NIC) Credentials**: In Sri Lanka, citizen NICs follow predictable deterministic formats (9 digits + \'V\' for pre-2016 cards, or 12 digits post-2016 encoding birth year and sequential gender offsets). An attacker possessing a victim\'s birthdate can brute-force candidate NICs. *Mitigation*: The NIC gate in MediSync is strictly paired with one-time dynamic QR tokens and rate-limited.',
    '1. **Low-Entropy National Identity Card (NIC) Credentials**: In Sri Lanka, citizen NICs follow predictable deterministic formats (9 digits + \'V\' for pre-2016 cards, or 12 digits post-2016). To protect against candidate brute-force enumeration, the Public Verification Portal (`/verify/:token`) does NOT require NIC entry on mobile; instead, it enforces dynamic, single-use 6-digit OTP verification dispatched to the patient\'s registered email address with strict rate limiting (10 attempts / 15 min).'
)
with open('docs/report/TECHNICAL_REPORT.md', 'w', encoding='utf-8') as f:
    f.write(tr)
print('Updated TECHNICAL_REPORT.md')

# 11. Update docs/report/VIVA_QA.md
with open('docs/report/VIVA_QA.md', 'r', encoding='utf-8') as f:
    vq = f.read()
vq = vq.replace('<!-- TODO-P2 -->', '')
vq = vq.replace(
    '2. To download full longitudinal medical records from the verification portal, a constant-time Patient NIC gate must be satisfied.',
    "2. To unlock full clinical records and medicine release details from the verification portal, a dynamic 6-digit OTP sent to the patient's registered email must be verified (no NIC entry required on mobile)."
)
with open('docs/report/VIVA_QA.md', 'w', encoding='utf-8') as f:
    f.write(vq)
print('Updated VIVA_QA.md')

# 12. Update docs/report/chapters/04_architecture.md
with open('docs/report/chapters/04_architecture.md', 'r', encoding='utf-8') as f:
    c4 = f.read()
c4 = c4.replace('<!-- TODO-P2 -->', '')
c4 = c4.replace('D04: QR Verification & NIC Gate', 'D04: QR Verification & OTP Gate Sequence')
c4 = c4.replace('QR Verification & NIC Gate (`docs/report/diagrams/d04_qr_verification_nic_gate.mmd`)', 'QR Verification & OTP Gate (`docs/report/diagrams/d04_qr_verification_nic_gate.mmd`)')
with open('docs/report/chapters/04_architecture.md', 'w', encoding='utf-8') as f:
    f.write(c4)
print('Updated chapters/04_architecture.md')

# 13. Update docs/report/chapters/07_security_privacy.md
with open('docs/report/chapters/07_security_privacy.md', 'r', encoding='utf-8') as f:
    c7 = f.read()
c7 = c7.replace('<!-- TODO-P2 -->', '')
c7 = c7.replace(
    '1. **Low-Entropy National Identity Card (NIC) Credentials**: In Sri Lanka, citizen NICs follow predictable deterministic formats (9 digits + \'V\' for pre-2016 cards, or 12 digits post-2016 encoding birth year and sequential gender offsets). An attacker possessing a victim\'s birthdate can brute-force candidate NICs. *Mitigation*: The NIC gate in MediSync is strictly paired with one-time dynamic QR tokens and rate-limited.',
    '1. **Low-Entropy National Identity Card (NIC) Credentials**: In Sri Lanka, citizen NICs follow predictable deterministic formats (9 digits + \'V\' for pre-2016 cards, or 12 digits post-2016). To protect against candidate brute-force enumeration, the Public Verification Portal (`/verify/:token`) does NOT require NIC entry on mobile; instead, it enforces dynamic, single-use 6-digit OTP verification dispatched to the patient\'s registered email address with strict rate limiting (10 attempts / 15 min).'
)
with open('docs/report/chapters/07_security_privacy.md', 'w', encoding='utf-8') as f:
    f.write(c7)
print('Updated chapters/07_security_privacy.md')

# 14. Update docs/report/chapters/13_appendices.md
with open('docs/report/chapters/13_appendices.md', 'r', encoding='utf-8') as f:
    c13 = f.read()
c13 = c13.replace('<!-- TODO-P2 -->', '')
c13 = c13.replace('Diagram D04: QR Verification & NIC Gate Sequence', 'Diagram D04: QR Verification & OTP Gate Sequence')
with open('docs/report/chapters/13_appendices.md', 'w', encoding='utf-8') as f:
    f.write(c13)
print('Updated chapters/13_appendices.md')
