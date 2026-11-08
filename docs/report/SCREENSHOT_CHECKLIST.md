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
| **SS-04** | `ss04_public_health_advisory.png` | Desktop (1920x1080) | `/advisories` | Public epidemic advisory card (e.g., Monsoon Dengue Alert, preventive instructions). |

---

## 2. Patient Experience Views

| Screen ID | Target Filename | Viewport | URL Path | Required Elements to Display |
|---|---|---|---|---|
| **SS-05** | `ss05_patient_dashboard.png` | Desktop (1920x1080) | `/patient/dashboard` | Patient welcome header, upcoming appointments, recent consultations summary. |
| **SS-06** | `ss06_patient_medical_timeline.png` | Desktop (1920x1080) | `/patient/history` | Chronological clinical timeline showing past visits, diagnosed conditions, and vital trends. |
| **SS-07** | `ss07_prescription_qr_card.png` | Mobile (375x812) | `/patient/prescriptions` | Digital prescription detail showing medications, dosage instructions, and the **cryptographic QR token**. |
| **SS-08** | `ss08_appointment_booking.png` | Desktop (1920x1080) | `/patient/book` | District selector, medical specialty dropdown, doctor schedule calendar, queue number preview. |

---

## 3. Clinical Consultation & Doctor Views

| Screen ID | Target Filename | Viewport | URL Path | Required Elements to Display |
|---|---|---|---|---|
| **SS-09** | `ss09_doctor_queue.png` | Desktop (1920x1080) | `/doctor/dashboard` | OPD waiting queue, triage status badges, "Start Consultation" action buttons. |
| **SS-10** | `ss10_consultation_vitals_symptoms.png`| Desktop (1920x1080) | `/doctor/consult` | Vitals entry inputs, interactive symptom tag chips (`high_fever`, `joint_pain`). |
| **SS-11** | `ss11_ml_differential_guidance.png`| Desktop (1920x1080) | `/doctor/consult` | **ML suggestion card** showing *Dengue Fever* with the amber disclaimer banner: `clinicalValidation: not_established`. |
| **SS-12** | `ss12_icd10_catalog_search.png`| Desktop (1920x1080) | `/doctor/consult` | ICD-10 search dropdown filtering standard WHO codes (e.g., `A90 Dengue fever`). |
| **SS-13** | `ss13_medicine_safety_blocking_alert.png`| Desktop (1920x1080) | `/doctor/consult` | **Red blocking alert modal**: Drug-drug interaction warning (e.g., *Warfarin + Ciprofloxacin*). |
| **SS-14** | `ss14_prescription_authored.png`| Desktop (1920x1080) | `/doctor/consult` | Finalized prescription summary, duration in days, refill authorization, digital sign-off button. |

---

## 4. Pharmacy & Dispensing Views

| Screen ID | Target Filename | Viewport | URL Path | Required Elements to Display |
|---|---|---|---|---|
| **SS-15** | `ss15_pharmacy_qr_scan.png` | Desktop or Tablet | `/pharmacy/dispense` | Active QR scanner viewfinder / prescription token input field. |
| **SS-16** | `ss16_pharmacy_nic_verification_gate.png`| Desktop (1920x1080) | `/pharmacy/dispense` | Staged prescription view showing locked dispense action and **NIC verification input prompt**. |
| **SS-17** | `ss17_pharmacy_dispense_confirmed.png`| Desktop (1920x1080) | `/pharmacy/dispense` | Unlocked dispensing screen showing dispensed quantities, batch timestamp, and confirmation badge. |
| **SS-18** | `ss18_duplicate_dispense_block.png`| Desktop (1920x1080) | `/pharmacy/dispense` | **Red error alert**: *"Prescription Already Dispensed — Fulfilled at Colombo Central Dispensary at 10:14 AM"*. |

---

## 5. Hospital Laboratory Views

| Screen ID | Target Filename | Viewport | URL Path | Required Elements to Display |
|---|---|---|---|---|
| **SS-19** | `ss19_lab_investigation_orders.png`| Desktop (1920x1080) | `/lab/orders` | Pending lab queue (Full Blood Count, Dengue NS1), patient referral tags. |
| **SS-20** | `ss20_lab_pdf_upload_validation.png`| Desktop (1920x1080) | `/lab/orders` | File upload modal with `.pdf` drag-and-drop zone and magic byte verification status indicator. |

---

## 6. Public Health & Epidemiological Surveillance Views

| Screen ID | Target Filename | Viewport | URL Path | Required Elements to Display |
|---|---|---|---|---|
| **SS-21** | `ss21_epidemiology_district_map.png`| Desktop (1920x1080) | `/public-health/map` | Sri Lanka 25-district map with disease intensity color gradients. |
| **SS-22** | `ss22_outbreak_alert_card.png` | Desktop (1920x1080) | `/public-health/alerts`| Active Outbreak Alert card: District, Disease, $z$-score, Volume Gate and Duration Gate passed. |
| **SS-23** | `ss23_statistical_projections_chart.png`| Desktop (1920x1080)| `/public-health/trends`| 14-day projection graph with label: *"Descriptive projection; not a validated clinical forecast"*. |

---

## 7. System Administration & Security Views

| Screen ID | Target Filename | Viewport | URL Path | Required Elements to Display |
|---|---|---|---|---|
| **SS-24** | `ss24_security_audit_logs.png` | Desktop (1920x1080) | `/admin/audit-logs` | Append-only log table: Actor ID, Role, Action, IP Address, Timestamp, Target Entity. |
| **SS-25** | `ss25_user_management.png` | Desktop (1920x1080) | `/admin/users` | Clinical account provisioning, role selection, facility assignment. |
