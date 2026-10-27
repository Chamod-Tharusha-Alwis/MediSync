# MediSync Post-Release Backlog & Requirements for Real Patient Clearance

## Status: PROTOTYPE ONLY (Synthetic Data Only)

> **CRITICAL RELEASE POLICY**:
> This MediSync deployment is qualified strictly as a **CAPSTONE PROTOTYPE** with **SYNTHETIC DATA ONLY**.
> It is **NOT CLEARED** for real patient use, real PHI (Protected Health Information), or real clinical diagnosis/prescriptions.
> All clinical workflows display a prominent trilingual banner (English / Sinhala / Tamil) stating:
> *"Prototype: synthetic data only. Not for real patient use."*

---

## 1. Prerequisites Required Before Clearing Real Patient Data

The following engineering, clinical, and security milestones must be completed, audited, and approved before removing the prototype restriction and onboarding real patients:

| ID | Backlog Item | Description | Condition for Lifting Restriction | Priority |
|---|---|---|---|---|
| **BKL-01** | **Standards-Compliant Encrypted PDF Export** | PDF reports and prescriptions currently have download buttons disabled with clear notice. Standardized PDF encryption (AES-256 or password-based secure envelope adhering to ISO 32000-2 / HIPAA transit standards) is deferred. | Implementation of real crypto-locked PDF pipeline in `pdfGenerator.js` with client-side key derivation, offline verification tests, and independent security sign-off. | HIGH |
| **BKL-02** | **Full Field-Level Encryption & Blind Index Migration** | Legacy fields use single-pass AES-256-CBC with SHA-256 HMAC lookup digests. Target standard requires AES-256-GCM authenticated encryption and blind indexing (HMAC-SHA256 with pepper) across all PHI models (`Patient`, `Consultation`, `Prescription`, `LabTest`). | Completion of zero-downtime database migration script proven on test/staging records with backwards-compatibility verification and cryptographic test assertions. | HIGH |
| **BKL-03** | **Production Secret Management (HashiCorp Vault / Cloud KMS)** | For this prototype release, an operator-key policy (`operatorKeyPolicy.js`) is used via environment variables (`ENCRYPTION_KEYS` and `ACTIVE_KEY_VERSION`). A hosted Vault or Cloud KMS is not attached. | Provisioning and integration of dedicated HashiCorp Vault or AWS/GCP KMS for dynamic secret rotation, automated lease renewal, and hardware-backed master keys. | CRITICAL |
| **BKL-04** | **Fail-Closed Audit Logging Policy** | Certain non-blocking audit logging paths currently log warnings rather than crashing active user requests when audit persistence encounters transient network errors. | Transition to a strict fail-closed audit log queue with persistent dead-letter recovery (`Outbox`) before permitting legal medical transactions. | MEDIUM |
| **BKL-05** | **Real Atlas End-to-End Test Groups (Groups 1–14)** | Historical offline suite counts are not current-source clinical integration evidence. Historical independently accepted real backend progress remains 2/14 pending newer accepted receipts; the release smoke checklist is not an executed receipt. | Execute and independently accept all required current-source integration groups with separately authorized synthetic data and ownership/cleanup evidence. | HIGH |
| **BKL-06** | **Production Atlas network isolation** | The approved Render egress and Atlas access-list configuration must be verified for the actual services. Do not assume a world-open `0.0.0.0/0` rule is required or enable one automatically. | Establish and verify the approved least-access network path; evaluate dedicated egress/private connectivity before any real patient use. | HIGH |
| **BKL-07** | **Independent Clinical & Privacy Impact Assessment (DPIA / HIPAA)** | Formal medical oversight and independent data protection impact assessment for Sri Lankan Personal Data Protection Act (PDPA) No. 9 of 2022 and HIPAA/GDPR clinical compliance. | Review and written sign-off by a qualified medical informatics specialist and healthcare privacy legal counsel. | CRITICAL |
| **BKL-08** | **ML installed-image dependency audit maintenance** | Initial installed-image audit found 143 advisory matches across 11 packages. After targeted dependency/lock and image-tooling updates, the rebuilt image audit returned exit 0: no known vulnerabilities found. `pip check`, 19 ML tests and local image health passed; see before/after evidence below. Hosted deployment and clinical validation remain separate. | Preserve installed-inventory audit in release checks, monitor new advisories, and rerun image/runtime regression on dependency changes. Do not assume the public Render URL is private-only. | MEDIUM |
| **BKL-09** | **Client dependency audit remediation** | Captured current lock audit: 55 vulnerable dependency entries (3 critical, 32 high, 10 moderate, 10 low); exit 1. Includes CRA tooling and entries such as `socket.io-parser`, `engine.io-client`/`ws`, `source-map-js` and `colord`. Runtime bundle reachability has not been established, so these cannot all be dismissed as build-only. See captured run below. | Triage advisory paths and production bundle reachability; perform reviewed compatible updates and regressions. Evaluate CRA replacement separately. Do not run a blanket forced audit fix or use the suggested `react-scripts@0.0.0` replacement. | HIGH |

---

## 2. Maintenance and Patch Roadmap

### Phase 1.1 (Next Immediate Minor Patch)
- Transition from `operatorKeyPolicy` to hosted KMS / Vault instance.
- Run database index optimization and background index building verification.
- Re-run full browser automation test suite in staging environment.

### Phase 1.2 (Security Hardening Patch)
- Implement encrypted PDF download with user-managed passphrase/key.
- Enable mutual TLS (mTLS) between Render Express backend and Render ML microservice.
- Complete strict rate limiting per IP + user token across all mutation routes.

---

## 3. Prototype Scope Attestation

- **Environment**: Staging / Prototype Production (`medisync_prod`)
- **Data Allowed**: Synthetic test accounts, mock prescriptions, simulated lab data, synthetic epidemiological outbreak alerts.
- **Data Prohibited**: Any real National Identity Card (NIC) numbers, real patient names, actual medical histories, real contact details, or genuine clinical observations.

## 4. Captured dependency audit evidence (26 October 2026)

### Client lock audit: completed, findings remain

Captured run `gate3-client-audit-20261026_233854` at release source `6fac964` used the existing `client/package-lock.json`; no dependency installation, lock update or audit fix was performed. Command run from the project directory in Windows PowerShell:

```powershell
Push-Location client
npm audit --package-lock-only --ignore-scripts --json
Pop-Location
```

Actual captured summary (not an expected result):

```text
AUDIT_EXIT=1
node=v26.4.0
npm=11.17.0
vulnerabilities: info=0 low=10 moderate=10 high=32 critical=3 total=55
```

Local captured raw evidence: `scratch/gate3-client-audit-20261026_233854/client-npm-audit.json` and `client-npm-audit.stderr.txt`. The ignored scratch files are execution evidence, not files to commit. This registry-backed lock audit identifies advisory matches; it does not establish exploitability or validate a deployed browser bundle. It is not a Node 24 deployment-runtime verification.

### ML installed-image audit: initial findings and verified remediation

Captured run `gate3-ml-verification-20261026_234200` built the clean-clone ML image from source `6fac964`. The reviewer extracted the packages actually installed in the image and audited that installed inventory, including the image tooling; this is not merely an audit of `requirements.txt`.

Actual captured summary (not an expected result):

```text
installed_packages=59
pip_audit_exit=1
Found 143 known vulnerabilities in 11 packages
unique_advisory_ids=105
```

Affected installed versions: `certifi==2026.4.22`, `cryptography==46.0.6`, `gunicorn==21.2.0`, `idna==3.13`, `lxml==6.0.2`, `pillow==12.0.0`, `pip==24.0`, `pypdf==6.14.2`, `setuptools==79.0.1`, `urllib3==2.6.3`, `Werkzeug==3.1.8`.

Captured local evidence: `scratch/gate3-ml-verification-20261026_234200/installed-pip-audit-summary.json` and `installed-pip-audit.json`. The 143 count includes advisory matches repeated across packages; 105 is the distinct-ID count. These replace the earlier historical eight-package description as the current measured baseline. This initial image predates the targeted dependency updates below.

Fresh image build and local ML HTTP `/health` passed (HTTP 200, ready; seven reference files, 71,704 ICD concepts), according to the same captured container run. This verifies that local image only, not the currently deployed Render service. Docker was initially unavailable; that initial blocker was resolved for the authorized local checks and is not the final audit outcome. No hosted service was resumed or deployed by this audit.
#### Post-update installed-image rerun

The same captured run then applied targeted dependency/lock updates and rebuilt from the clean release clone with only six ML dependency/build-file changes over `6fac964`. The application implementation was unchanged. Actual captured results:

```text
clean_no_cache_docker_build_exit=0
pip_audit_exit=0
No known vulnerabilities found
No broken requirements found.
ML_tests=19 PASS
GET http://127.0.0.1:55184/health -> HTTP 200
{"references":{"clinicalValidation":"not_established","files":7,"icd10Concepts":71704},"status":"ready"}
```

Audited updated runtime packages: `certifi==2026.10.19`, `cryptography==50.0.0`, `gunicorn==22.0.0`, `idna==3.15`, `lxml==6.1.0`, `pillow==13.0.0`, `pypdf==6.21.2`, `urllib3==2.8.0`, `Werkzeug==3.1.9`; hashed image tooling was updated to `pip==26.2` and `setuptools==84.1.0`.

Actual post-update evidence in `scratch/gate3-ml-verification-20261026_234200/`: `docker-build-minimal-bumps.log`, `minimal-bumps-installed-packages.json`, `minimal-bumps-installed-pip-audit.json`, `minimal-bumps-installed-pip-audit.stderr.txt`, `minimal-bumps-ml-tests.log`, and `minimal-bumps-fresh-container-health.json`. This clears the advisories known to the audit service for that installed inventory at this run; it does not prove absence of unknown vulnerabilities, live Render readiness, or clinical validation. The health payload explicitly states that clinical validation is not established.

### Release interpretation

Neither this audit nor the smoke checklist authorizes deployment or clinical use. Current registry findings require documented release-risk disposition. No claim that all 14 real E2E groups passed follows from offline CI; historical accepted backend progress remains 2/14 unless newer genuine receipts are independently accepted.
