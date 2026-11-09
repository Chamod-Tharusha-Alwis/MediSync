# Chapter 1: Introduction and Problem Statement

## 1.1 Context and Background: Healthcare in Sri Lanka
The Sri Lankan healthcare system represents an internationally recognized model of public-health delivery, achieving high maternal and child health outcomes and high life expectancy despite resource constraints. Healthcare in Sri Lanka operates along a dual-track delivery mechanism:
1. **Free Public Sector**: Administered by the Ministry of Health (MOH), providing free outpatient consultations, inpatient admissions, and essential pharmaceuticals through provincial general hospitals, district base hospitals, and primary medical care units.
2. **Private Healthcare Sector**: Operating on an out-of-pocket and private medical insurance model, comprising private hospitals, corporate clinics, and independent general practitioner (GP) surgeries.

Despite extensive geographical reach, the operational reality of public outpatient departments (OPDs) is characterized by severe resource asymmetry:
- Single medical officers routinely evaluate between 40 and 80 patients per hour during peak morning clinics, translating to less than 90 seconds of clinical evaluation time per patient [OWNER: cite national OPD workload study].
- Diagnostic workflows remain heavily reliant on paper physical bed-head tickets (BHTs), paper prescription slips, and physical laboratory reports carried by patients.
- Centralized electronic medical record (EMR) adoption is fragmented across tertiary teaching institutions, with zero interoperability connecting public hospital dispensaries, private community pharmacies, and regional public health inspectors (PHIs).

## 1.2 Problem Statement

### 1.2.1 Paper Prescription Fraud and Duplicate Dispensing
Under traditional paper prescription workflows, prescriptions lack tamper-evidence and transactional finality. Patients can present the same physical slip across multiple private community pharmacies ("pharmacy hopping"), resulting in unauthorized multi-refilling of controlled substances, benzodiazepines, and habit-forming analgesics. Furthermore, manual alteration of prescribed quantities and illegible physician handwriting introduce critical medication dispensing errors.

### 1.2.2 Unmonitored Medication Safety and Antibiotic Stewardship
In resource-constrained settings, community dispensaries lack automated decision support. Clinicians under severe time pressure cannot cross-reference complex multi-drug regimens against drug-drug interaction (DDI) databases, maximum daily dosing ceilings, or contraindicated drug-drug interactions and maximum daily dosage ceilings. Uncontrolled dispensing of broad-spectrum antibiotics for viral self-limiting syndromes accelerates antimicrobial resistance (AMR), a primary public health crisis identified by the World Health Organization.

### 1.2.3 Latent, Fragmented Disease Outbreak Surveillance
The current national communicable disease surveillance apparatus relies on the manual completion and postal dispatch of epidemiological notification cards (Form H-544) by treating physicians to local Medical Officers of Health (MOH) [OWNER: cite MOH Epidemiology Unit notification protocol]. By the time physical notifications are aggregated and entered into centralized databases (often involving multi-week delays [OWNER: cite notification delay study]), an emerging vector-borne outbreak (such as Dengue fever during monsoon season) or water-borne cluster (such as Leptospirosis during paddy cultivation) has typically progressed through multiple replication cycles, eliminating opportunities for proactive larval control or prophylactic antimicrobial deployment.

### 1.2.4 Diagnostic Decision Fatigue in High-Volume Clinics
Junior medical officers in rural base hospitals face diagnostic exhaustion when confronting complex multi-symptom presentations. While computerized clinical decision support systems (CDSS) exist in western commercial hospital EHRs, they are resource-intensive, rely on proprietary taxonomies, and are ill-suited for low-bandwidth, low-compute infrastructure.

## 1.3 Project Motivation and Scope
MediSync was initiated as an undergraduate software engineering capstone project to conceptualize, engineer, and evaluate a lightweight, cloud-native, trilingual (English, Sinhala, Tamil) health information and surveillance platform tailored for developing healthcare architectures. The core system objectives include:
1. **Digital Prescription Integrity**: Immutable digital prescriptions signed with cryptographic QR codes, verifiable at dispensing, and constrained by patient identity token confirmation to eliminate duplicate dispensing.
2. **Deterministic Medication Safety**: Automated, zero-latency drug-drug interaction checks, dosage ceiling validations, and course duration limits evaluated prior to signature.
3. **Syndromic Epidemiological Surveillance**: Real-time spatio-temporal outbreak detection utilizing automated statistical anomaly surveillance across all 25 districts of Sri Lanka.
4. **Lightweight Triage Support**: Dual-tier AI/ML clinical symptom matching optimized to operate within a 512 MB memory footprint on cloud-free infrastructure.

---

> [!NOTE]
> Literature citations, historical epidemiological survey figures from the MOH Epidemiology Unit, and national census statistics are marked for final review in `[OWNER: Insert official MOH Annual Health Bulletin 2023 / Census 2024 citations]`.
