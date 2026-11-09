# MediSync: Project Overview & Plain-Language Guide

## 1. What is MediSync?
**MediSync** is an all-in-one digital healthcare and disease tracking platform created for hospitals, doctors, pharmacies, and public health authorities in developing nations, with special adaptation for Sri Lanka.

In many developing healthcare systems, hospital clinics are crowded, medical records are handwritten on paper slips, and patient histories are easily lost. Paper prescriptions can be forged or used multiple times at different pharmacies. Furthermore, when infectious diseases like Dengue fever or Leptospirosis begin to spread, health authorities only find out days or weeks later when paper notification forms slowly make their way through the post.

MediSync solves these issues by:
1. Giving patients a secure, digital medical history they carry on their phones.
2. Giving doctors a fast, automated system to capture consultations and check for medication risks.
3. Protecting prescriptions with unique QR codes and identity verification so they can only be filled once.
4. Monitoring disease trends across all 25 districts of Sri Lanka in real time, automatically notifying public health officials of potential outbreaks.
5. Providing full language support in **English**, **Sinhala (සිංහල)**, and **Tamil (தமிழ்)** so everyone can use it comfortably.

---

## 2. Who Uses MediSync? (User Roles & Workflows)

### 2.1 The Patient
- **Registration**: Signs up with their email/phone or National Identity Card (NIC) number.
- **Appointments**: Books clinic appointments with doctors and views their estimated queue position.
- **Health Timeline**: Reviews their past doctor visits, diagnoses, and lab test results securely in one place.
- **Digital Prescriptions**: Receives prescriptions directly on their smartphone with a secure QR code. They can show this QR code at any pharmacy or print a PDF copy.
- **Privacy Control**: Chooses which doctors are permitted to see their complete medical history.

### 2.2 The Doctor
- **Queue Management**: Sees the day's patient queue and begins consultations with one click.
- **Patient History**: Accesses past visits, allergies, and existing conditions.
- **Symptom Triage Assistant**: Types in the patient's symptoms (e.g., "high fever", "joint pain", "retro-orbital headache"). A lightweight artificial intelligence assistant instantly suggests possible conditions to consider (with a clear notice that this is a clinical decision aid, not an automated diagnosis).
- **ICD-10 Diagnoses**: Selects standard World Health Organization disease codes from an easy search menu.
- **Safe Prescription Authoring**: Types in medications. MediSync's safety engine automatically checks:
  - *Drug-drug interactions*: Warns if two prescribed drugs dangerous interact (e.g., Warfarin and Ciprofloxacin).
  - *Maximum doses*: Warns if a dosage exceeds safe adult daily limits.
- **Lab Ordering**: Orders blood tests and lab investigations directly linked to the visit.

### 2.3 The Pharmacist
- **QR Code Scanning**: Scans the patient's prescription QR code using a phone camera, barcode scanner, or enters the prescription ID.
- **Identity Check (NIC Gate)**: For safety and legal compliance, the pharmacist asks the patient for their National Identity Card (NIC) number and enters it into the system. MediSync confirms that the person holding the card matches the patient on the prescription.
- **Dispensing & Inventory**: The pharmacist records the items dispensed (full or partial).
- **Anti-Fraud Protection**: The moment medication is dispensed, the prescription status updates immediately to "Dispensed". If someone tries to take the same paper slip or screenshot to another pharmacy down the street, the second pharmacy's screen will instantly say: *"This prescription has already been dispensed."*

### 2.4 The Hospital Laboratory
- **Pending Orders**: Sees an electronic list of lab tests requested by doctors.
- **Report Uploads**: Once the test (such as a Dengue antigen or Full Blood Count) is complete, the lab technician uploads the report as a PDF. MediSync scans the file to ensure it is a genuine, safe PDF before storing it.
- **Instant Alerts**: As soon as the report is uploaded, the ordering doctor and the patient receive an immediate notification.

### 2.5 The Regional Epidemiologist / Public Health Inspector
- **District Map**: Views a map of Sri Lanka's 25 districts color-coded by current disease activity.
- **Automated Outbreak Detection**: As doctors across the island enter diagnoses, MediSync continuously evaluates a 7-day window against a 56-day district historical baseline ( > 2.0$) with dual-gate thresholding ( \ge 5$ cases and 2 consecutive calendar days). If cases of an infectious disease (like Dengue, Typhoid, or Chickenpox) spike higher than normal in a particular district, an Outbreak Alert is generated automatically.
- **Smart Filtering (No False Alarms)**: To avoid unnecessary panic, the system filters out small random spikes. An alert is only triggered if cases rise significantly above the normal baseline for at least 3 days in a row and involve at least 5 cases.
- **Trend Projections**: Displays 14-day statistical trend lines showing whether cases are rising, leveling off, or falling.

### 2.6 The System Administrator
- **Account Provisioning**: Creates and approves accounts for doctors, pharmacists, and lab staff.
- **Facility Management**: Sets up hospitals, clinics, and dispensaries.
- **Security Audit Logs**: Inspects an unalterable log recording every login, record view, and sensitive update in the system to protect patient confidentiality.

### 2.7 The Public Citizen (No Login Needed)
- **Health Advisories**: Anyone can visit the public section of the website to read health tips, seasonal disease warnings (e.g., monsoon dengue prevention), and district health notices in English, Sinhala, or Tamil.

---

## 3. How Data Flows Through MediSync

```
[ Patient ] 
     | 1. Books Appointment
     v
[ Doctor ]
     | 2. Records Vitals & Symptoms
     | 3. Consults ML Assistant (Gets Differential Guidance)
     | 4. Prescribes Medication (Safety Engine Verifies Interactions)
     v
[ System Database (Encrypted) ]
     |
     +---> 5. Prescription QR Code Issued to Patient
     |
     +---> 6. Diagnostic Counts Logged for Epidemiological Surveillance
     |          |
     |          v
     |     [ Outbreak Detection Engine ] 
     |     (Checks 56-day baseline z-score & dual gates -> Alerts Public Health Officers)
     |
     v
[ Pharmacist ]
     | 7. Scans QR Code
     | 8. Verifies Patient National Identity Card (NIC)
     | 9. Dispenses Medication (Prescription Marked As Dispensed)
```

---

## 4. Privacy, Security & Compliance
- **Bank-Grade Encryption**: Patient names, national ID numbers, phone numbers, and clinical notes are scrambled using AES-256-GCM authenticated encryption. Even if someone were to steal the database, the patient records would be unreadable without the secret encryption key.
- **Blind Search**: The system can find a patient by NIC without needing to decrypt every patient in the database.
- **Self-Destructing Codes**: Password resets and verification codes automatically delete themselves from the database after a few minutes.
- **Tamper-Evident Code**: All 15 core security and calculation files in MediSync are protected by cryptographic checksums (SHA-256) to ensure no changes slip in unverified.

---

## 5. Important Disclaimers
1. **Academic University Prototype**: MediSync is a software engineering research project created for university evaluation. It uses synthetic test patient data.
2. **Not Certified for Autonomous Medical Use**: The machine learning triage assistant and outbreak tools are designed to assist qualified medical staff. Every ML response carries the notice: `clinicalValidation: not_established`. It does not replace the diagnosis of a certified physician.
