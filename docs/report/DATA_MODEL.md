# MediSync Data Model & Database Architecture Specification

> **Database Engine**: MongoDB Atlas Replica Set (MongoDB 7.0+ / 8.0+)  
> **Object Data Modeling (ODM)**: Mongoose v8+  
> **Zero Real Data Policy**: All schemas and relationship examples below use synthetic and structural prototypes only.

---

## 1. Cryptographic Security & Field-Level Encryption

To guarantee patient confidentiality in compliance with healthcare data protection principles, MediSync enforces **authenticated field-level AES-256-GCM encryption** prior to database persistence:

1. **Envelope Architecture**:
   - Sensitive text fields are transformed into a ciphertext format: `v{version}:{iv_hex}:{auth_tag_hex}:{ciphertext_hex}`.
   - Encrypted with active operator keys managed by `server/src/security/operatorKeyPolicy.js`.
   - Each encrypted document retains a `keyVersion` attribute supporting seamless key rotation.
2. **Blind Indexing for Queries**:
   - Direct searches on encrypted columns (e.g. National Identity Card - NIC) utilize deterministic blind indices (`patientNic_bi` / `nicHash`) derived via HMAC-SHA256, enabling fast index lookups without decrypting the dataset or exposing plaintexts.
3. **Foreign Key Integrity**:
   - Queries and relational links utilize unencrypted MongoDB `ObjectId` references (`patientId`, `doctorId`, `hospitalId`) rather than plaintext identity attributes.

---

## 2. Core Clinical Collections

### 2.1 `Patient` (`patients`)
Represents registered patient records across public and clinical portals.

| Field | Type | Attributes | Description / Encryption |
|---|---|---|---|
| `_id` | `ObjectId` | Primary Key | Unique MongoDB document identifier |
| `nic` | `String` | Required, Unique, Index | Patient National Identity Card number (unencrypted lookup key) |
| `patientNic_bi` | `String` | Index | Blind index hash for secure identity matching |
| `fullName` | `String` | Required | **AES-256-GCM Encrypted** patient legal name |
| `email` | `String` | Required, Unique | Patient email for notification dispatch and password recovery |
| `contactInfo` | `String` | Optional | **AES-256-GCM Encrypted** primary phone contact |
| `address` | `String` | Default: `""` | Residential address string |
| `district` | `String` | Index | Administrative district (1 of 25 Sri Lankan districts) |
| `dateOfBirth` | `Date` | Optional | Date of birth |
| `gender` | `String` | Enum: `Male`, `Female`, `Other` | Demographic gender |
| `bloodGroup` | `String` | Optional | ABO/Rh blood classification (e.g. `O+`, `B+`) |
| `allergies` | `[String]` | Array | **AES-256-GCM Encrypted** known drug and food allergen list |
| `chronicConditions` | `[String]` | Array | Known pre-existing diagnoses (e.g. `Hypertension`, `Asthma`) |
| `preferredLanguage`| `String` | Enum: `en`, `si`, `ta` | Trilingual interface preference |
| `password` | `String` | Required | bcrypt salted hash |
| `isActive` | `Boolean` | Default: `true` | Administrative account standing |
| `twoFactorEnabled` | `Boolean` | Default: `false` | Status of two-factor OTP enforcement |
| `keyVersion` | `Number` | Default: active version | Active encryption key version identifier |
| `createdAt` / `updatedAt` | `Date` | Mongoose timestamps | Automated audit timestamps |

### 2.2 `Consultation` (`consultations`)
Represents an encounter between an attending clinician and a patient.

| Field | Type | Attributes | Description / Encryption |
|---|---|---|---|
| `_id` | `ObjectId` | Primary Key | Unique consultation identifier |
| `consultationId` | `String` | Unique, Index | Human-readable transaction identifier (`CON-YYYYMMDD-XXXXXX`) |
| `patientId` | `ObjectId` | Ref: `Patient`, Index | Unencrypted relational link to Patient |
| `patientNic` | `String` | Required | **AES-256-GCM Encrypted** patient NIC |
| `patientNic_bi` | `String` | Index | Blind index hash for patient NIC |
| `doctorId` | `ObjectId` | Ref: `Doctor`, Required, Index | Relational link to attending clinician |
| `hospitalId` | `ObjectId` | Ref: `Hospital`, Optional | Facility where encounter transpired |
| `diagnosis` | `String` | Required | **AES-256-GCM Encrypted** diagnosis text |
| `icdCode` | `String` | Index | Standardized ICD-10 or ICD-11 diagnostic concept code |
| `icdDescription` | `String` | Optional | Clinical concept title from catalog |
| `icdVersion` | `String` | Default: `'ICD-10'` | Classification taxonomy version |
| `symptoms` | `[String]` | Array | Clinical symptom tokens tagged during consultation |
| `notes` | `String` | Optional | **AES-256-GCM Encrypted** clinical examination observations |
| `district` | `String` | Index | District location for epidemiological surveillance |
| `isFollowUpRequired`| `Boolean` | Default: `false` | Follow-up tracking flag |
| `followUpDate` | `Date` | Optional | Scheduled follow-up visit date |
| `isSynthetic` | `Boolean` | Default: `false` | Invariant tagging synthetic/test records |
| `keyVersion` | `Number` | Default: active version | Encryption key version |
| `createdAt` / `updatedAt` | `Date` | Mongoose timestamps | Automated encounter timestamps |

### 2.3 `Prescription` (`prescriptions`)
Represents medication orders issued during a consultation or over-the-counter dispensing.

| Field | Type | Attributes | Description / Encryption |
|---|---|---|---|
| `_id` | `ObjectId` | Primary Key | Unique prescription identifier |
| `prescriptionId` | `String` | Unique, Index | Order identifier (`RX-YYYYMMDD-XXXXXX`) |
| `consultationId` | `ObjectId` | Ref: `Consultation`, Optional | Parent consultation encounter |
| `patientId` | `ObjectId` | Ref: `Patient`, Index | Target patient reference |
| `doctorId` | `ObjectId` | Ref: `Doctor`, Optional | Prescribing physician reference |
| `hospitalId` | `ObjectId` | Ref: `Hospital`, Optional | Hospital where prescribed |
| `drugName` | `String` | Optional | Prescribed pharmaceutical trade name |
| `dosage` | `String` | Optional | Strength specification (e.g. `500mg`) |
| `frequency` | `String` | Optional | Administration schedule (e.g. `TDS`, `BD`) |
| `durationDays` | `Number` | Optional | Course duration evaluated against formulary limits |
| `instructions` | `String` | Optional | Patient directions (with WinAnsi fallback safety) |
| `status` | `String` | Enum: `pending`, `dispensed`, `cancelled` | Fulfillment status |
| `isOTC` | `Boolean` | Default: `false` | Over-the-counter pharmacy direct dispensing flag |
| `isAlternativeDispensed` | `Boolean` | Default: `false` | Formulary brand substitution flag |
| `alternativeDetails` | `String` | Optional | Pharmacist clinical justification note |
| `dispensedAt` | `Date` | Optional | Fulfillment completion timestamp |
| `dispensedBy` | `ObjectId` | Ref: `Pharmacy` | Fulfilling pharmacy establishment |

### 2.4 `Dispensing` (`dispensings`)
Auditable record of physical pharmaceutical handover events.

| Field | Type | Attributes | Description |
|---|---|---|---|
| `_id` | `ObjectId` | Primary Key | Unique dispensing record identifier |
| `prescriptionId` | `ObjectId` | Ref: `Prescription`, Index | Relational link to prescription order |
| `patientId` | `ObjectId` | Ref: `Patient`, Index | Receiving patient |
| `pharmacyId` | `ObjectId` | Ref: `Pharmacy`, Required | Dispensing pharmacy facility |
| `staffId` | `ObjectId` | Ref: `PharmacyStaff` | Attending licensed pharmacist |
| `dispensedItems` | `[Object]` | Array | Detailed medication lines, lot numbers, and quantities |
| `dispensedDate` | `Date` | Default: `Date.now` | Event timestamp |
| `syntheticSeedBatch` | `String` | Optional | Tag for synthetic demonstration seed batches |

### 2.5 `VerificationToken` (`verificationtokens`)
Cryptographic capability tokens enabling public authenticity verification via QR code (`server/src/models/VerificationToken.js`).

| Field | Type | Attributes | Description |
|---|---|---|---|
| `_id` | `ObjectId` | Primary Key | Unique capability record identifier |
| `tokenHash` | `String` | Required, Unique, Index | SHA-256 hash of the 256-bit unguessable random capability token |
| `consultationId` | `ObjectId` | Ref: `Consultation`, Required, Index | Bound consultation encounter reference |
| `patientRef` | `ObjectId` | Ref: `Patient`, Required, Index | Reference to patient record for NIC gate validation |
| `doctorRef` | `ObjectId` | Ref: `Doctor`, Optional | Attending medical officer reference |
| `consultationRef` | `String` | Optional, Trim | Human-readable consultation reference code |
| `expiresAt` | `Date` | Index (`expireAfterSeconds: 0`) | **TTL Index**: Automatic document deletion after 90 days |
| `revokedAt` | `Date` | Default: `null` | Timestamp when capability token was explicitly revoked |
| `revokedBy` | `ObjectId` | Default: `null` | User account that executed the revocation |
| `revocationReason` | `String` | Max length: 250 | Justification recorded for revocation |
| `useCount` | `Number` | Default: `0`, Min: `0` | Cumulative scan count |
| `lastUsedAt` | `Date` | Default: `null` | Audit timestamp of most recent scan |

---

## 3. Surveillance & Operations Collections

### 3.1 `OutbreakAlert` (`outbreakalerts`)
Tracks communicable disease outbreak detections, administrative review lifecycles, and public broadcasts.

| Field | Type | Attributes | Description |
|---|---|---|---|
| `_id` | `ObjectId` | Primary Key | Unique alert record identifier |
| `disease` | `String` | Required, Index | Condition name or standardized ICD code |
| `location` | `String` | Index | Affected district, province, or `"Nationwide"` |
| `severity` | `String` | Enum: `Low`, `Moderate`, `High`, `Critical` | Automated risk stratification |
| `status` | `String` | Enum: `Pending`, `Active`, `Resolved`, `Dismissed` | Administrative lifecycle state |
| `feedbackStatus` | `String` | Enum: `unverified`, `confirmed`, `false_positive` | Epidemiologist field review state |
| `affectedCount` | `Number` | Required | Number of verified episodes satisfying Gate 1 ($N \ge 5$) |
| `sourceConsultationIds` | `[ObjectId]` | Ref: `Consultation` | Originating clinical encounter records |
| `approvedBy` | `ObjectId` | Ref: `Admin` | Reviewing epidemiologist / platform administrator |
| `approvedAt` | `Date` | Optional | Confirmation timestamp |
| `resolutionNotes` | `String` | Optional | Mandatory explanation ($\ge 5$ chars) when resolving alert |

### 3.2 `AuditLog` (`auditlogs`)
Append-only immutable record of sensitive security, authentication, and clinical access actions.

| Field | Type | Attributes | Description |
|---|---|---|---|
| `_id` | `ObjectId` | Primary Key | Unique log event identifier |
| `action` | `String` | Required, Index | Machine action tag (e.g. `CONSENT_VERIFY`, `OUTBREAK_RESOLVE`) |
| `actorId` | `ObjectId` | Required, Index | User initiating action |
| `actorRole` | `String` | Enum: `patient`, `doctor`, `pharmacy`, `hospital`, `admin` | Active actor credential role |
| `ipAddress` | `String` | Optional | Sanitized client IP address |
| `details` | `Object` | Mixed (Zero PII) | Structured metadata without unmasked identity fields |
| `timestamp` | `Date` | Default: `Date.now`, Index | Exact event timestamp |

---

## 4. Ephemeral Security Collections & TTL Indexes

| Collection | Model File | Primary Key / Token | TTL Duration | Security Purpose |
|---|---|---|:---:|---|
| `otpsessions` | `OTPSession.js` | `sessionId` | **300 s (5 min)** | Short-lived single-use OTP codes for authentication |
| `recoverytokens` | `RecoveryToken.js` | `tokenHash` | **900 s (15 min)** | Cryptographic tokens for password resets |
| `clinicalcommands`| `ClinicalCommand.js` | `commandId` | **24 hours** | Idempotency deduplication for clinical actions |
| `accountinvitations` | `AccountInvitation.js` | `invitationToken` | **48 hours** | Onboarding invitation tokens for hospital staff |
| `banrecords` | `BanRecord.js` | `identifier` | **Dynamic** | Temporary IP and account blocks following security violations |
| `verificationtokens` | `VerificationToken.js` | `expiresAt` (tokenHash) | **90 days** | QR code capability tokens for consultation verification |

---

## 5. Entity-Relationship Overview

```
 [ Patient ] <═════(1:N)═════ [ Consultation ] ═════(N:1)═════> [ Doctor ]
      ║                               ║                               ║
      ║ (1:N)                         ║ (1:1)                         ║ (1:N)
      ▼                               ▼                               ▼
 [ Prescription ] <═══(1:N)═══ [ VerificationToken ]          [ Hospital ]
      ║
      ║ (1:N)
      ▼
 [ Dispensing ] ══════(N:1)═════> [ Pharmacy ] <════(1:N)═════ [ PharmacyStaff ]
```
