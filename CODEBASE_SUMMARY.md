# MediSync Codebase Summary

This document provides a comprehensive, file-by-file analysis of the MediSync full-stack healthcare platform codebase. It is structured to illustrate the data flow from the React frontend, through the Node.js backend, down to the Python Machine Learning engine.

---

## 1. Backend Database (`server/src/models`)

The MongoDB database schema defines standard healthcare and security entities using Mongoose:

*   **User Models:**
    *   `Doctor.js`: Stores doctor details (`doctorId`, `fullName`, `email`, `password`, `licenseNo`, `specialization`, `role`, 2FA secrets).
    *   `Patient.js`: Stores patient profiles (`fullName`, `email`, `password`, `nic`, `dateOfBirth`, `gender`, `contactInfo`, `riskLevel`, `riskScore`).
    *   `PharmacyStaff.js`: Stores pharmacist details (`fullName`, `email`, `password`, `pharmacyId`, `role`).
    *   `Hospital.js` & `Admin.js`: Stores organizational and administrative accounts.
*   **Security & Auth Models:**
    *   `SessionToken.js`: Manages active JWT refresh sessions (`userId`, `tokenHash`, `deviceInfo`).
    *   `OTPSession.js`: Handles 2FA, login, and password reset OTP states (`userId`, `otp`, `expiresAt`, `purpose`).
*   **Medical & Transactional Models:**
    *   `Consultation.js`: Records doctor visits, symptoms, and diagnoses.
    *   `Prescription.js` & `Dispensing.js`: Manages e-prescriptions and their fulfillment status by pharmacies.
    *   `Drug.js` & `ICDCode.js`: Catalogs for medications and international disease classification codes.
    *   `OutbreakAlert.js`: Stores AI-detected disease outbreak warnings.
    *   `AuditLog.js` & `BroadcastMessage.js`: System auditing and inter-platform communications.
    *   `ConsultationRating.js`: Patient feedback on consultations.

---

## 2. Backend Logic (`server/src/controllers` & `server/src/routes`)

The Express.js backend handles business logic, database mutations, and routing requests to the ML engine:

*   **`authController.js` & `authRoutes.js`:** The core security module. Handles registration for all roles, multi-role login mapping, JWT generation, OTP generation/verification (via email/Speakeasy), and secure password resets.
*   **`doctorController.js` & `doctorRoutes.js`:** Endpoints for doctor workflows, such as fetching patient histories, creating new consultations, and managing workspace states (Personal vs. Hospital).
*   **`patientController.js` & `patientRoutes.js`:** Endpoints for patients to retrieve their health records, active prescriptions, and past consultation history.
*   **`prescriptionController.js` & `pharmacyController.js`:** Logic for issuing prescriptions (Doctors) and fulfilling/dispensing them (Pharmacists).
*   **`adminController.js` & `hospitalController.js`:** Endpoints for aggregating platform-wide statistics (total users, consultations, hospitals) and managing organizational structures.
*   **`alertController.js`:** Endpoints for fetching ML-generated active outbreak alerts.
*   **`drugController.js`:** Handles drug catalog searches and interfaces with the ML engine for drug-drug interaction warnings.

---

## 3. Python ML Engine (`ml-engine`)

The ML Engine is an independent Flask microservice (`app.py` running on port 5001) that provides AI-driven healthcare intelligence to the Node.js backend.

*   **Data Sources:**
    *   `data/symptom_map.json`: A static map linking symptoms to specific diseases, ICD codes, descriptions, and severity.
    *   `data/interactions_clean.json`: A dataset defining known drug-drug interactions and their severity levels.
*   **`app.py` Core Endpoints:**
    *   `POST /api/ml/predict-disease`: Accepts an array of input `symptoms`. It performs a set intersection against `symptom_map.json`, scoring diseases based on the proportion of matched symptoms and their base severity. It returns the top 5 predicted diseases along with their ICD-10 codes.
    *   `POST /api/ml/check-interactions`: Accepts an array of `drugs`. It compares every pair of input drugs against `interactions_clean.json` to detect 'high' or 'moderate' severity interactions, returning warnings to prevent harmful prescriptions.

---

## 4. Frontend Pages (`client/src/pages`)

The React frontend utilizes Framer Motion for animations and Tailwind CSS for styling. Pages are strictly segregated by user role:

*   **`auth/`:**
    *   `Register.jsx`: A dynamic, multi-step registration form adapting its payload to the selected role (Doctor, Patient, Pharmacist).
*   **`doctor/`:**
    *   `Login.jsx`: Specialized doctor login.
    *   `Dashboard.jsx`: Workspace selector (Personal Clinic vs. Hospital), patient NIC search, and a comprehensive view of patient profiles and medical history.
    *   `NewConsultation.jsx`: A multi-step flow where doctors input symptoms (which triggers the ML disease prediction), select diagnoses, and prescribe drugs (which triggers ML interaction checks).
*   **`patient/`:**
    *   `Login.jsx` & `Dashboard.jsx`: Allows patients to view their allergies, active prescriptions (with fulfillment status), and timeline of past consultations.
*   **`pharmacy/`:**
    *   `Login.jsx` & `Dashboard.jsx`: Interface for pharmacists to verify patient NICs, review e-prescriptions, and mark them as dispensed.
*   **`hospital/`:**
    *   `Login.jsx` & `Dashboard.jsx`: Management interface for hospital administrators to view doctor rosters and organizational statistics.
*   **`admin/`:**
    *   `Login.jsx` & `Dashboard.jsx`: The Super Admin overview showing platform-wide geographical metrics, active user stats, and live AI Outbreak Alerts.
*   **Root Pages:**
    *   `Home.jsx`: The landing page outlining MediSync features.
    *   `SelectRole.jsx`: The gateway page directing users to their specific role-based login portal.

---

## 5. Frontend Components (`client/src/components`)

Reusable UI elements that enforce design consistency and encapsulate complex logic:

*   **Form & Input Components:**
    *   `DrugSearchInput.jsx`: An autocomplete input for prescribing medications that automatically debounces queries and flags drug interactions in real-time.
    *   `SymptomTagInput.jsx`: A specialized input allowing doctors to add/remove symptoms as tags for ML analysis.
*   **Layout & UI Elements:**
    *   `common/Sidebar.jsx`: A dynamic navigation sidebar that adjusts its color scheme and links based on the active user role.
    *   `common/StatCard.jsx`: Glassmorphic statistical display cards used heavily in Admin/Hospital dashboards.
    *   `common/PageTransition.jsx`: A wrapper component utilizing Framer Motion to provide smooth page entry/exit animations.
    *   `MedicalTimeline.jsx`: A visual timeline component displaying a patient's historical diagnoses and consultations.
    *   `LoadingSkeleton.jsx` & `Modal.jsx`: Standardized UI fallbacks and dialog wrappers.
*   **Security Context:**
    *   `auth/PrivateRoute.jsx`: A higher-order component that checks `localStorage` for valid JWT tokens and enforces strict route protection, ensuring users cannot access dashboards that do not match their authorized role.
