# MediSync: User Interface Screenshot & Demonstration Capture Checklist

This checklist defines the complete set of required UI screenshots for inclusion in `docs/report/TECHNICAL_REPORT.md` (Chapter 5), presentation slide decks, and project viva appendices.

> [!IMPORTANT]
> **Privacy & Credential Rule**:  
> Never capture real person National Identity Card (NIC) numbers, real passwords, or confidential clinical notes. Use exclusively synthetic demonstration accounts and sanitized test scenarios.

---

## 1. Public & Trilingual Citizen Views

| Screen ID | Target Filename | Viewport | URL Path | Required Elements to Display |
|---|---|---|---|---|
| **SS-01** | `ss01_home_landing_en.png` | Desktop (1920x1080) | `/` | Hero section, trilingual language switcher, key feature highlights, emergency helpline notice. |
| **SS-02** | `ss02_home_landing_si.png` | Desktop (1920x1080) | `/?lang=si` | Same view rendered in **Sinhala (සිංහල)** demonstrating complete font rendering and key parity. |
| **SS-03** | `ss03_home_landing_ta.png` | Desktop (1920x1080) | `/?lang=ta` | Same view rendered in **Tamil (தமிழ்)** demonstrating font rendering and layout integrity. |
| **SS-04** | `ss04_public_health_advisory.png` | Desktop (1920x1080) | `/public-health` | Public epidemic advisory banner (e.g., Monsoon Dengue Alert, preventive guidance). |

---

## 2. Patient Experience Views

| Screen ID | Target Filename | Viewport | URL Path | Required Elements to Display |
|---|---|---|---|---|
| **SS-05** | `ss05_patient_dashboard.png` | Desktop (1920x1080) | `/patient/dashboard` | Patient welcome header, recent clinical encounters, emergency contacts overview. |
| **SS-06** | `ss06_patient_medical_timeline.png` | Desktop (1920x1080) | `/patient/dashboard/history` | Chronological clinical timeline showing past visits, diagnosed conditions, and vital trends. |
| **SS-07** | `ss07_prescription_qr_card.png` | Mobile (375x812) | `/patient/dashboard/history` | Digital prescription detail showing medications, dosage instructions, and the **cryptographic QR capability token**. |
| **SS-08** | `ss08_public_verification_portal.png` | Desktop (1920x1080) | `/verify/:token` | Public consultation verification portal displaying verified issuance metadata, zero patient PII, and the **Email OTP Verification** prompt and unlocked clinical encounter details. | 

---

## 3. Clinical Consultation & Doctor Views

| Screen ID | Target Filename | Viewport | URL Path | Required Elements to Display |
|---|---|---|---|---|
| **SS-09** | `ss09_doctor_dashboard.png` | Desktop (1920x1080) | `/doctor/dashboard` | Doctor clinical dashboard: daily consultation count, active facility status, "Start Consultation" CTA. |
| **SS-10** | `ss10_consultation_vitals_symptoms.png`| Desktop (1920x1080) | `/doctor/consultation/new` | Patient NIC authentication, vitals entry inputs, and interactive symptom tag chips (`high_fever`, `joint_pain`). |
| **SS-11** | `ss11_ml_differential_guidance.png`| Desktop (1920x1080) | `/doctor/consultation/new` | **ML suggestion card** showing *Dengue Fever* with the amber disclaimer banner: `clinicalValidation: not_established`. |
| **SS-12** | `ss12_icd10_catalog_search.png`| Desktop (1920x1080) | `/doctor/consultation/new` | US ICD-10-CM search dropdown filtering 71,704 validated leaf concepts (e.g., `A90 Dengue fever`). |
| **SS-13** | `ss13_medicine_safety_blocking_alert.png`| Desktop (1920x1080) | `/doctor/consultation/new` | **Red blocking alert modal**: Pairwise drug-drug interaction warning (e.g., *Warfarin + Ciprofloxacin*). |
| **SS-14** | `ss14_prescription_authored.png`| Desktop (1920x1080) | `/doctor/consultation/new` | Finalized prescription summary, dosage regimen, duration in days, digital sign-off button. |

---

## 4. Pharmacy & Dispensing Views

| Screen ID | Target Filename | Viewport | URL Path | Required Elements to Display |
|---|---|---|---|---|
| **SS-15** | `ss15_pharmacy_nic_lookup.png` | Desktop (1920x1080) | `/pharmacy/dashboard/dispense` | Pharmacy dispensing console: patient National Identity Card (NIC) lookup input. |
| **SS-16** | `ss16_pharmacy_consent_gate.png`| Desktop (1920x1080) | `/pharmacy/dashboard/dispense` | Patient consent authorization modal unlocking pending e-prescriptions (`x-patient-access`). |
| **SS-17** | `ss17_pharmacy_dispense_confirmed.png`| Desktop (1920x1080) | `/pharmacy/dashboard/dispense` | Dispensing confirmation modal showing dispensed quantities, receipt number, and timestamp. |
| **SS-18** | `ss18_duplicate_dispense_block.png`| Desktop (1920x1080) | `/pharmacy/dashboard/dispense` | **Red error alert**: *"Prescription is not eligible for dispensing." (code: ALREADY_DISPENSED)*. |

---

## 5. Hospital Laboratory Views

| Screen ID | Target Filename | Viewport | URL Path | Required Elements to Display |
|---|---|---|---|---|
| **SS-19** | `ss19_lab_investigation_orders.png`| Desktop (1920x1080) | `/hospital/dashboard/tests` | Hospital laboratory management: pending investigation requests and patient tags. |
| **SS-20** | `ss20_lab_pdf_upload_validation.png`| Desktop (1920x1080) | `/hospital/dashboard/tests` | Report upload modal with `.pdf` drag-and-drop zone and magic byte verification status indicator. |

---

## 6. Public Health & Epidemiological Surveillance Views

| Screen ID | Target Filename | Viewport | URL Path | Required Elements to Display |
|---|---|---|---|---|
| **SS-21** | `ss21_epidemiology_district_map.png`| Desktop (1920x1080) | `/public-health` | Sri Lanka 25-district choropleth map with active communicable disease intensity color gradients. |
| **SS-22** | `ss22_outbreak_alert_card.png` | Desktop (1920x1080) | `/public-health` | Active Outbreak Alert card: District, Disease, $z$-score, Volume Gate ($N \ge 5$) and Persistence Gate (2 days) passed. |
| **SS-23** | `ss23_statistical_projections_chart.png`| Desktop (1920x1080)| `/public-health` | 14-day projection graph with label: *"Descriptive projection; not a validated clinical forecast"*. |

---

## 7. System Administration & Security Views

| Screen ID | Target Filename | Viewport | URL Path | Required Elements to Display |
|---|---|---|---|---|
| **SS-24** | `ss24_security_audit_logs.png` | Desktop (1920x1080) | `/admin/dashboard/sessions` | Session & security audit monitor: Actor ID, Role, Action, IP Address, Timestamp. |
| **SS-25** | `ss25_user_management.png` | Desktop (1920x1080) | `/admin/dashboard/users` | Platform account management: role assignments, status toggling, facility affiliation. |
