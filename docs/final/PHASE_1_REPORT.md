# MediSync Phase 1 Report: Documentation Leftover Sweep (docs/final/PHASE_1_REPORT.md)

- **Date**: 2026-11-09
- **Phase Target**: Documentation leftover sweep (no appointments / queue / QR-at-pharmacy / inventory claims anywhere)
- **Branch**: `final/p1-docs-sweep`
- **Status**: **COMPLETE**

---

## 1. Objectives & Scope
Sweep all markdown documents across the repository to excise obsolete claims regarding unbuilt or non-existent features:
1. Appointment booking & doctor scheduling (does not exist; patient lookup via NIC + OTP consent).
2. OPD waiting queue & queue numbers (does not exist; direct NIC consultation workflow).
3. Pharmacy inventory & stock endpoints (does not exist; atomic dispense status only).
4. QR code scanned at pharmacy to dispense (does not exist; QR is on Consultation Summary PDF linking to `/verify/:token`; pharmacy uses NIC lookup + OTP consent).
5. Renal, hepatic, pediatric, and geriatric rule engines (unbuilt; safety engine checks DDI, allergies, dose ceilings, course duration).
6. Random Forest / SVM / Naive Bayes ML claims (excised; real engine is TF-IDF + Cosine Similarity).
7. Legacy surveillance claims (EWMA, C-SUM, 4-week window, 150%/300%/800% spikes; real engine is 7-day window vs 56-day baseline with dual gates $N \ge 5$ and 2 consecutive days $z > 2.0$).
8. Add `<!-- TODO-P2 -->` markers to all active NIC-gate references so Phase 8 can reconcile them into the OTP-gated verification flow.

---

## 2. Table of Reconciled Leftovers & File Edits

| File | Line(s) | Old Claim / Stale Text | Reconciled / Ground-Truth Replacement |
|---|---|---|---|
| `docs/report/PROJECT_OVERVIEW.md` | 11 | "3. Protecting prescriptions with unique QR codes and identity verification so they can only be filled once." | "3. Protecting prescriptions with atomic status tracking so they can only be filled once, with verifiable cryptographic summaries." |
| `docs/report/PROJECT_OVERVIEW.md` | 21 | "- **Appointments**: Books clinic appointments with doctors and views their estimated queue position." | "- **Profile & Preferences**: Manages their contact details and sets preferred interface language (English, Sinhala, Tamil)." |
| `docs/report/PROJECT_OVERVIEW.md` | 23 | "- **Digital Prescriptions**: Receives prescriptions directly on their smartphone with a secure QR code. They can show this QR code at any pharmacy or print a PDF copy." | "- **Digital Prescriptions & Summaries**: Receives verifiable Consultation Summary PDFs directly on their smartphone. Each summary embeds a secure verification QR code linking to the public portal for instant document authenticity checks (it is not scanned at the pharmacy to dispense; pharmacy dispensing uses NIC lookup with patient consent)." |
| `docs/report/PROJECT_OVERVIEW.md` | 27 | "- **Queue Management**: Sees the day's patient queue and begins consultations with one click." | "- **Patient Lookup & Consent**: Looks up patients by National Identity Card (NIC) with patient OTP consent verification." |
| `docs/report/PROJECT_OVERVIEW.md` | 38 | "...while full history PDF downloads require passing the patient NIC gate." | "...while full history PDF downloads require passing the patient NIC gate <!-- TODO-P2 -->." |
| `docs/report/PROJECT_OVERVIEW.md` | 65–89 | Data-flow diagram with "Books Appointment", "Prescription QR Code Issued", "Pharmacist Scans QR Code" | Replaced with in-person consultation, patient NIC lookup with OTP consent, Consultation Summary PDF with verification QR, and pharmacy NIC lookup. |
| `docs/Feature_Breakdown.md` | 45–49 | "rolling historical baseline average and standard deviation over a 4-week window... High Danger Tier (>10 cases and >=150% spike)... Medium Danger... Low Danger..." | Replaced with verified 7-day rolling window vs. 56-day district baseline with regularized variance ($\sigma \ge 0.5$) and dual gates ($N \ge 5$, 2 consecutive days $z > 2.0$). |
| `docs/Feature_Breakdown.md` | 71, 76, 77 | Claims pharmacy module prevents "inventory discrepancies", logs "medication batch numbers and expiration dates during inventory onboarding", and performs "Inventory Depletion". | Excised inventory onboarding and depletion; clarified atomic double-dispense prevention (`ALREADY_DISPENSED`), allergy verification, and generic substitution logging (`isAlternativeDispensed`, `alternativeDetails`). |
| `docs/ui_design.md` | 95 | "...and inventory depletion charts." | "...and atomic dispensing status." |
| `docs/report/API_REFERENCE.md` | 102 | Line referencing NIC gate | Appended `<!-- TODO-P2 -->` marker. |
| `docs/report/CLAIMS_AUDIT.md` | 63 | Line referencing Patient NIC Gate | Appended `<!-- TODO-P2 -->` marker. |
| `docs/report/DATA_MODEL.md` | 121 | Reference to patient record for NIC gate validation | Appended `<!-- TODO-P2 -->` marker. |
| `docs/report/DEMO_SCRIPT.md` | 62 | Line referencing Patient NIC Gate | Appended `<!-- TODO-P2 -->` marker. |
| `docs/report/FEATURE_EXISTENCE_MATRIX.md` | 15 | Line referencing NIC Gate | Appended `<!-- TODO-P2 -->` marker. |
| `docs/report/SCREENSHOT_CHECKLIST.md` | 29 | Line referencing Patient NIC Gate | Appended `<!-- TODO-P2 -->` marker. |
| `docs/report/SLIDES_OUTLINE.md` | 142 | Line referencing Patient NIC gate | Appended `<!-- TODO-P2 -->` marker. |
| `docs/report/TECHNICAL_REPORT.md` | 287, 573, 980 | Diagram and narrative references to NIC Gate | Appended `<!-- TODO-P2 -->` marker. |
| `docs/report/VIVA_QA.md` | 51 | Line referencing Patient NIC gate | Appended `<!-- TODO-P2 -->` marker. |
| `docs/report/chapters/04_architecture.md` | 97 | Diagram D04 reference to NIC Gate | Appended `<!-- TODO-P2 -->` marker. |
| `docs/report/chapters/07_security_privacy.md` | 67 | Narrative reference to NIC Gate | Appended `<!-- TODO-P2 -->` marker. |
| `docs/report/chapters/13_appendices.md` | 87 | Diagram D04 reference to NIC Gate | Appended `<!-- TODO-P2 -->` marker. |

---

## 3. Intentional Mentions Cataloged
All remaining matches for the scanned terms in `docs/report/` were audited and confirmed to be intentional truthful negative disclosures:
1. `docs/report/FEATURE_EXISTENCE_MATRIX.md`: Explicitly documents that appointments, queues, inventory, and organ/age checks are NOT built.
2. `docs/report/CLAIMS_AUDIT.md`: Documents the history of excised legacy claims (e.g. Random Forest, EWMA, SVM).
3. `docs/report/DATA_MODEL.md`: Medication administration schedule (`frequency`: `TDS`, `BD`) and consultation `followUpDate`.
4. `docs/report/chapters/02_objectives_scope.md`: Explicitly lists Financial Billing and ERP inventory as out-of-scope.
5. `docs/report/chapters/03_requirements.md`: FR-LAB-01 laboratory investigation order queue.

---

## 4. Quality Gate & Link Verification
- **Link Integrity**: `python scripts/check_report_links.py` -> `96/96 relative links valid (100% OK)`.
- **Protected Ledger**: 15/15 files accounted for and verified unchanged.

---

## 5. Next Steps
Merge `final/p1-docs-sweep` into `main`, update `MASTER_STATE.md` and `PROGRESS.md`, and advance to **PHASE 2: OTP-Gated QR Verification Page**.
