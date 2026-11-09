# Chapter 4: System Architecture & Design

## 4.1 Architectural Pattern & Philosophy
MediSync adopts a **cloud-native, decoupled service-oriented architecture (SOA)** centered on zero-trust principles. Recognizing the bandwidth limitations, unpredictable connectivity, and resource constraints of rural healthcare outposts in Sri Lanka, the system deliberately segregates intensive computation (machine learning inference) from transaction processing (consultations and prescriptions) and presentation logic.

The architecture comprises three primary tiers:
1. **Presentation Layer**: A responsive React Single Page Application (SPA) compiled into static assets and deployed to global edge CDNs (Vercel).
2. **Application & API Gateway Tier**: A stateless Node.js / Express microservice handling authentication, authorization, clinical transaction orchestration, and cryptographic operations (Render Web Service: `medisync-wabc.onrender.com`).
3. **Specialized Compute Microservice**: An isolated, lightweight Python 3 / Flask microservice dedicated to symptom feature vectorization, TF-IDF cosine similarity classification, and sparse knowledge-base retrieval (Render Web Service: `medisync-ml.onrender.com`).
4. **Data Persistence Tier**: A managed MongoDB Atlas cluster supporting replica sets, encrypted connections (TLS 1.3), field-level authenticated encryption at rest, and automated TTL indexing.

```
       +-------------------------------------------------------------+
       |                  Client Layer (Vercel CDN)                  |
       |     React 18 SPA | Trilingual UI (EN/SI/TA) | Tailwind CSS  |
       +------------------------------+------------------------------+
                                      | HTTPS / TLS 1.3 (JSON)
                                      v
       +-------------------------------------------------------------+
       |             Backend Core API (Node.js / Express)            |
       |  - RBAC Middleware          - AES-256-GCM Crypto Pipeline   |
       |  - Rate Limiter (Token)     - Medicine Safety Engine        |
       |  - Mongoose Schema Layer    - PDF Report Generator          |
       +--------------+-------------------------------+--------------+
                      |                               |
       Internal HMAC  |                               | Mongoose (TLS)
       Shared Secret  v                               v
+-----------------------------+       +------------------------------+
|   ML Microservice (Flask)   |       |   MongoDB Atlas Database     |
| - Tier 1: TF-IDF + Cos Sim  |       | - Encrypted Patient Store    |
| - Tier 2: Sparse KB Matcher |       | - Consultations & Rx Store   |
| - Memory RSS: 196.82 MB     |       | - Outbreak Surveillance Log  |
| - Latency: 0.77 ms mean     |       | - TTL Index Sessions         |
+-----------------------------+       +------------------------------+
```

---

## 4.2 Component Architecture & Boundaries

### 4.2.1 Presentation Tier (Client)
- **Framework**: React 18 with modern functional hooks, React Router v6 for role-segmented client routing, and Context API for global state (AuthContext, LanguageContext, SocketContext).
- **Styling & Accessibility**: Tailwind CSS utility framework, styled to WCAG 2.1 AA contrast standards.
- **Client Resilience**: Offline detection interceptors with automated retry logic, optimistic UI state updates for high-throughput OPD queue navigation, and graceful cold-start countdown modals for sleep-dormant ML services.

### 4.2.2 Backend Application Gateway (Server)
- **Framework**: Express.js on Node.js runtime, organized into a clean layered pattern:
  - `routes/`: 187 Express endpoint declarations with route-level middleware binding.
  - `controllers/`: Request orchestration, transactional validation, and response formatting.
  - `models/`: 29 Mongoose data schemas enforcing schema validation, encryption hooks, and compound indexes.
  - `middleware/`: Authentication (`auth.js`), role guards, rate limiters, file upload filtering (`multer`), and error trapping.
  - `utils/`: Cryptographic utilities (`versionedEncryption.js`), blind indexing, PDF generation, and dataset loaders.

### 4.2.3 Machine Learning Microservice (ML Engine)
- **Framework**: Python 3.14 with Flask micro-framework and Gunicorn WSGI container.
- **Decoupled Security Boundary**: The ML engine does not connect to MongoDB, does not read patient PII, and operates purely statelessly. Requests from the Node.js backend are authenticated using an internal HMAC-SHA-256 signature in the request headers (`x-internal-key`).
- **Memory Optimization**: Employs Scipy sparse CSR matrices and compressed memory-mapped JSON lookup structures to restrict total process resident memory (RSS) to 196.82 MB, avoiding memory exhaustion crashes on 512 MB cloud containers.

---

## 4.3 Data Flow & Transaction Sequences

### 4.3.1 Consultation and Digital Prescription Sequence
As illustrated in Diagram **D03** (`docs/report/diagrams/d03_consultation_prescription_dispensing.mmd`):
1. The physician enters patient vitals, subjective complaints, and symptom tags.
2. The UI queries the ML engine via the Express gateway; differential predictions are returned with `clinicalValidation: not_established`.
3. The physician selects a standardized diagnosis from the 71,704 ICD-10 catalog concepts and inputs proposed medications.
4. The backend medicine safety engine cross-references the regimen against the drug interaction matrix and dosage limit tables.
5. If safe, the prescription is committed to MongoDB with an auto-generated cryptographic QR token payload; a notification is dispatched to the patient.

### 4.3.2 QR Verification and Identity-Gated Dispensing
As illustrated in Diagram **D04** (`docs/report/diagrams/d04_qr_verification_nic_gate.mmd`):
1. The patient presents their mobile or physical QR prescription token to a community pharmacy.
2. The pharmacy terminal scans the token and requests prescription details.
3. The server validates the token's signature and expiration, returning non-sensitive prescription items.
4. The pharmacist inputs the patient's physical National Identity Card (NIC) number.
5. The server validates the NIC against the encrypted patient dossier's blind index.
6. Upon identity match, dispensing is unlocked; the pharmacist confirms dispensed quantities, and the prescription transitions to `dispensed` or `partially_dispensed`.

---

## 4.4 Deployment Topology & Cloud Infrastructure
As detailed in Diagram **D02** (`docs/report/diagrams/d02_deployment_infrastructure.mmd`):
- **Frontend**: Hosted on Vercel Edge Network (`https://medisync.chamodtharusha.com.lk`).
- **Backend Service**: Hosted on Render Free Web Service (`https://medisync-wabc.onrender.com`).
- **ML Inference Service**: Hosted on Render Free Web Service (`https://medisync-ml.onrender.com`).
- **Database**: Hosted on MongoDB Atlas (Free M0 Cluster, 512 MB storage, shared RAM, AWS ap-south-1 Mumbai region for optimal geographic proximity to Sri Lanka).
- **Communication Channels**: Secure SMTP relay for transactional email OTPs and emergency alert dispatch.

---

## 4.5 Formal Diagram Index
The architectural diagrams supporting this chapter are preserved in the repository in Mermaid source format:
- **D01**: System Architecture (`docs/report/diagrams/d01_system_architecture.mmd`)
- **D02**: Deployment Infrastructure (`docs/report/diagrams/d02_deployment_infrastructure.mmd`)
- **D03**: Consultation to Dispensing Flow (`docs/report/diagrams/d03_consultation_prescription_dispensing.mmd`)
- **D04**: QR Verification & NIC Gate (`docs/report/diagrams/d04_qr_verification_nic_gate.mmd`)
- **D05**: Outbreak Detection Pipeline (`docs/report/diagrams/d05_outbreak_detection_pipeline.mmd`)
- **D06**: Tiered Matcher Flow (`docs/report/diagrams/d06_tiered_matcher_flow.mmd`)
- **D07**: Authentication & Session Flow (`docs/report/diagrams/d07_auth_otp_session_flow.mmd`)
- **D08**: Medicine Safety Decision Flow (`docs/report/diagrams/d08_medicine_safety_decision_flow.mmd`)
- **D09**: Entity-Relationship Diagram (`docs/report/diagrams/d09_entity_relationship_diagram.mmd`)
