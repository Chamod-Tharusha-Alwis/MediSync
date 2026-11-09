# Chapter 8: Testing, Verification & Quality Assurance

## 8.1 Verification Philosophy & Test Pyramid
MediSync enforces an **offline-first, deterministic quality assurance methodology**. Because clinical software must guarantee non-regression across safety-critical invariants (drug interaction warnings, prescription immutability, role access boundaries), testing cannot depend on fragile external network connections, live cloud databases, or non-deterministic test fixtures.

The automated verification pyramid consists of **3,465 tests across 207 test suites**, achieving a 100% pass rate with zero flaky or intermittent tests:

```
                  / \
                 / E2E \           <- 5-Role Isolated E2E Flows
                /-------\
               / Security \        <- RBAC, DB Guards, Auth Redaction
              /------------\
             /  Integration \      <- Multi-Document Consultations, Dispensing
            /----------------\
           /    Unit Tests    \    <- Crypto, Medicine Safety, TF-IDF Scikit/Pytest
          /--------------------\
```

Figure **F13** visually details the distribution of test suites and test counts across functional components:
- **Backend Services & Isolated DB**: 2,635 tests across 123 suites
- **Client Component & UI Contracts**: 666 tests across 78 suites
- **Root Security & Infrastructure**: 55 tests
- **ML Scoring & Flask Tests**: 78 tests (40 scoring + 31 Flask API + 7 status contracts)
- **Email & PDF Harness**: 31 tests across 2 suites
- **Total**: **3,465 passed, 0 failed across 207 suites**

---

## 8.2 Test Suite Taxonomy & Component Breakdown

### 8.2.1 Core Backend & Services Unit Testing
- **Cryptographic Primitives**: Evaluates AES-256-GCM encryption, decryption, invalid authentication tag rejection, ciphertext tampering detection, and versioned key fallback (`server/tests/crypto.test.js`).
- **Medicine Safety Engine**: Evaluates pairwise drug-drug interaction detection, cumulative daily dose calculations, duplicate ingredient alerts, and duration thresholds (`server/tests/medicineSafety.test.js`).
- **Dataset Loaders**: Tests offline parsing of ICD-10 catalog JSON (71,704 validated concepts) and district geo-coordinate datasets.

### 8.2.2 Clinical Transaction Integration Testing
- **Consultation Lifecycle**: Verifies patient consent validation, vital sign recording, multi-symptom capture, ICD-10 linking, and automated prescription generation.
- **Dispensing Workflows**: Implemented across `server/tests/ir04BackendIntegration.test.js` (Protected File #6), verifying that prescription state transitions atomically to `dispensed` or `partially_dispensed`, and confirming that multi-pharmacy duplicate dispensing attempts fail with HTTP 409 Conflict.
- **Laboratory Subsystem**: Verified in `server/tests/lab.test.js` (Protected File #9), validating MIME type filtering, magic byte `%PDF-` binary enforcement, and clinician report notification triggers.

### 8.2.3 Machine Learning Test Suite
- **Pytest Suite (`ml-engine/tests/`)**: Evaluates symptom tokenization, feature vector alignment, Tier 1 TF-IDF cosine similarity output shapes, Tier 2 sparse knowledge-base retrieval, and HTTP HMAC internal token authentication.
- **Sanity Symptom Suite (`scripts/verify_sanity_symptom_cases.py`)**: 15 standardized query permutations (`SC-01` through `SC-15`) verifying HTTP 200, valid response payloads, `clinicalValidation: not_established` inclusion, and zero false emergency triggers.

### 8.2.4 End-to-End Client & UI Testing
- **Isolated Five-Role Specification**: Implemented in `client/tests/ir04-isolated-five-role-e2e.spec.js` (Protected File #11), walking through sequential role journeys: Patient -> Doctor -> Pharmacy -> Hospital Lab -> Public Health Epidemiologist.
- **Trilingual Key Parity**: Iterates across English, Sinhala, and Tamil translation dictionaries (Figure **F14**), confirming zero missing string keys across 813 registered UI keys.

---

## 8.3 Offline Master Quality Gate (`scripts/run_offline_tests.js`)
All verification is consolidated into a single autonomous command runner that executes in offline developer environments:
```bash
node scripts/run_offline_tests.js
```
The master gate performs three mandatory sequential validation stages:
1. **Cryptographic Ledger Check**: Independently hashes all 15 protected files and confirms equality with `docs/release/PROTECTED_HASHES.json`.
2. **Automated Test Execution**: Spins up an in-memory database instance, executes all 207 Jest and Mocha test suites, and collects results.
3. **Frontend Production Compilation**: Executes `npm --prefix client run build`, confirming zero syntax errors, missing imports, or bundle compilation warnings (exit code 0).

---

## 8.4 Truth in Verification: Offline vs. Live Status
In compliance with project ethical guidelines, verification status is strictly segregated:

| Verification Scope | Status | Evidence / Verification Method |
|---|---|---|
| **Backend REST API Logic** | OFFLINE VERIFIED | 3,465 passed tests via in-memory database mock |
| **Field-Level Encryption & Blind Index** | OFFLINE VERIFIED | Automated test assertions in `server/tests/crypto.test.js` |
| **Deterministic Medicine Safety Engine** | OFFLINE VERIFIED | Validated against rule datasets in unit tests |
| **ML Inference Logic & Fallbacks** | OFFLINE VERIFIED | Pytest suite & 15 sanity cases via Flask `test_client` |
| **Frontend Production Compilation** | OFFLINE VERIFIED | `npm --prefix client run build` exits with code 0 |
| **Atlas Production Cloud Queries** | NOT VERIFIED LIVE | Production database queries reserved for system owner |
| **Render Cloud Free Hosting Live Status**| NOT VERIFIED LIVE | Cold start ~50s accepted; subject to sleep-cycle latency |
| **Formal Clinical Efficacy & Safety** | NOT VERIFIED | System carries `clinicalValidation: not_established` |
