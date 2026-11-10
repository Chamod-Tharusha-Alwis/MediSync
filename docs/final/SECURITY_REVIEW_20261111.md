# MediSync read-only security and defect review

Date: 11 November 2026 (Asia/Colombo)
Reviewed HEAD: df690f5f0839d462b7b12b89d5e5910e81ed003b
Verdict: REMEDIATION REQUIRED. This is a targeted source review, not a production penetration test or certification.

## Scope and preservation

Reviewed Express startup, authentication and account checks, QR verification and OTP flows, audit persistence, encryption and identity storage, PDF generation, production database admission, browser session storage, ML authentication, dependency declarations and CI definitions.

No application, test, configuration or existing documentation file was edited. This new report is the only file created for this review. No credentials or private environment files were read. No Atlas, Redis, provider, browser login, live HTTP, deployment, Git fetch/push/staging, package installation or migration was performed.

Initial working-tree modification: server/clinical.offline.jest.cjs. During the review docs/final/data/medicine_coverage_gaps.json also became modified. Neither modification was made by this review. The working tree was therefore not a frozen whole-project test baseline. HEAD stayed unchanged. The 15 protected files matched their releaseCandidateSha256 entries in docs/release/PROTECTED_HASHES.json (15/15, zero mismatches).

## Priority findings

Severity describes impact and prerequisites, not a claim of exploitation on the live service. Source locations below refer to the reviewed checkout.

### F01 — High: any authenticated doctor can revoke another doctor's verification link

Evidence: server/src/controllers/verificationController.js:670–699; server/src/routes/verificationRoutes.js:67.

The revocation authorization allows callerRole === doctor without comparing callerId to token.doctorRef, checking the treating relationship, or requiring patient consent. The patient path does check ownership. An unrelated verified doctor who obtains a valid QR link can revoke it and disrupt verification. Token unpredictability limits discovery but does not provide object authorization.

Reproduced offline with the actual exported controller and inert dependencies: unrelated doctor -> HTTP 200 and one revokeToken invocation. No database operation occurred.

Minimum fix: enforce issuing/treating-doctor ownership or an explicitly authorized clinical relationship; retain a separately justified admin override. Add unrelated-doctor and own-doctor tests, including expired/revoked tokens.

### F02 — High, export-dependent: NIC fallback bypasses OTP and expands encounter access to entire history

Evidence: verificationController.js:553–580 and 618–628; verificationRoutes.js:63.

A valid QR token plus knowledge of the patient's NIC passes authorization without OTP, even when a supplied view token is invalid. The handler then queries all consultations and prescriptions for the patient, rather than just the consultation bound to the QR token. A NIC is an identifier, not a secret or consent credential. Even an OTP view session is encounter-bound at issuance but grants whole-history export here.

Reproduced offline: no authenticated session or OTP, synthetic matching NIC -> full-history generator called. An inert SECURITY_HOLD response returned 503. The actual generator checks PDF_EXPORT_ENABLED at pdfGenerator.js:309; live setting was not inspected. This is NOT proof that a PDF was obtainable from production.

Minimum fix: remove NIC as authorization; require a purpose- and scope-bound consent/session check. Limit encounter QR exports to the encounter unless separate full-history consent is granted. Preserve the export hold until reviewed.

### F03 — High: QR OTP consumption and failure counts are not atomic

Evidence: verificationController.js:302–310, 329–354, 375–377; models/OTPSession.js:29–37.

The controller reads used:false, checks the OTP, and saves a hydrated document with used=true. It does not atomically claim the record with a used:false predicate. Concurrent readers can both pass, and concurrent failed attempts can overwrite each other's increments. The comment saying consumption is atomic is inaccurate. The schema does not enable optimisticConcurrency.

Reproduced offline: two separate snapshots returned by the actual controller's mocked findOne both unlock, HTTP 200/200, with two saves. This demonstrates the missing compare-and-set contract, not a live Mongo concurrency test.

Minimum fix: atomic attempt reservation and successful consumption using exact ID, token binding, expiry, used:false and bounded attempts. Return failure when the conditional update loses. Add concurrent success and concurrent wrong-code tests with an isolated database when separately approved.

### F04 — High: decryption failures are suppressed during model hydration

Evidence: utils/versionedEncryption.js:62–98; verificationController.js:380–395 and 431.

The post-init hook catches decryption failures, logs err.message and returns the document. Earlier fields may already be decrypted while later fields remain encrypted or incomplete. Callers also suppress manual decryption errors; the verification response converts non-array allergies to an empty array. A key mismatch or corrupt clinical field can therefore become apparently usable clinical data or a misleading empty allergy list.

Reproduced with the real plugin and an inert decrypt failure: init returned with the encrypted field unchanged and one error log; it did not reject hydration.

Minimum fix: attach/propagate an explicit decryption-failure state and refuse clinical use or saves until resolved; distinguish unavailable allergies from none. Repair requires individually approved protected-file changes and backward-compatible migration planning, not automatic data rewriting.

### F05 — High, export-dependent: enabled PDF path still uses RC4-128 and identifier-derived passwords

Evidence: utils/pdfGenerator.js:299–318; utils/pdfSecurity.js:4, 10–24, 42–69; installed @pdfsmaller/pdf-encrypt-lite README.md:10, 35–36.

The comment says exports are unconditionally held and weak ciphers eliminated, but PDF_EXPORT_ENABLED=true reaches securePdfBuffer. That helper invokes the RC4-128 library and derives user passwords from NIC/consultation reference, with a fixed fallback. Checking requested algorithm names does not establish the output cipher.

Actual offline library run on a synthetic blank in-memory PDF produced an encryption dictionary with V=2, R=3, Length=128, consistent with its documented RC4-128 implementation. No file, clinical content or live export was used. Production flag state is NOT VERIFIED.

Minimum fix: retain the hold; adopt an independently verified modern PDF encryption implementation and random out-of-band key delivery. Verify the emitted encryption dictionary, not only presence of /Encrypt. Do not simply flip the export flag.

### F06 — High: audit persistence is best-effort; event detail is silently discarded

Evidence: middleware/auth.js:99–117; utils/auditLogger.js:25–69 and 104–136; models/AuditLog.js:5–14; verificationController.js:477–489.

Canonical auth continues after audit creation fails. Global audit runs after the response and swallows errors. recordAudit constructs sanitizedDetails but omits it from AuditLog.create; the schema has no details field. QR outcome/token correlation details passed by controllers are consequently not retained under normal strict schemas. Important access/revocation evidence can be absent even when the user operation succeeds.

Reproduced offline using actual recordAudit: supplied synthetic outcome and status metadata were absent from the object sent to create.

Minimum fix: define required audit events and durable delivery guarantees (transactional/outbox where appropriate), explicitly model allowed structured metadata, and distinguish audit outage from success. Do not indiscriminately block emergency clinical work without an approved policy. Model mutation hooks are a useful safeguard, but capped retention and readWrite DB credentials do not provide immutable external archival storage.

### F07 — Medium: controller error responses expose raw exception messages

Evidence: verificationController.js:649–651 and 719; drugController.js:188, 240, 272; doctorController.js:38, 69, 125, 154, 172, 229; prescriptionController.js:493; alertController.js:27, 46, 93; adminController.js:738.

Locally caught errors bypass the sanitized global error handler and return error.message/details. Driver, validation or provider exceptions can contain implementation detail or input data. Exposure depends on the error actually thrown; no real secret leak was asserted.

Reproduced offline: a synthetic internal exception from verification resolution appeared verbatim in the revocation HTTP 500 details field.

Minimum fix: fixed public codes/messages, allowlisted diagnostic categories server-side, and tests asserting sentinel values never enter response bodies. Preserve deliberately safe validation messages only after explicit review.

### F08 — Medium: long-lived refresh tokens are exposed to page JavaScript

Evidence: client/src/pages/admin/Login.jsx:31–33 (also patient, doctor, hospital and pharmacy login pages); client/src/api/axiosInstance.js:107 and 138–141; server/src/controllers/authController.js:1954–1967.

Although the backend sets an httpOnly refresh cookie, it also returns the refresh token in JSON and the frontend stores it in localStorage. Any same-origin script compromise/XSS can steal the seven-day credential. This review did not establish an XSS exploit; this is a confirmed credential-exposure architecture weakness.

Minimum fix: cookie-only refresh tokens with strict origin/CSRF protection, access tokens held in memory where feasible, and a staged compatibility rollout across all five roles.

### F09 — Medium: OTP throttles are process-local and cross-token issuance can invalidate another verification

Evidence: verificationController.js:23–65 and 217–222; verificationRoutes.js:18–54; app.js:327–335.

The QR cooldown and hourly cap use a local Map; rate-limit middleware uses its default memory store. Limits reset on restart and differ across instances. A QR OTP request deletes all unused qr_view sessions for that patient, without tokenHash in the deletion predicate; a different valid consultation link can invalidate an ongoing flow. Multiple concurrent sends can race through deletion/creation. The Map is not periodically evicted.

Minimum fix: shared bounded atomic throttles, patient/token-specific issuance with deterministic invalidation rules, and concurrency tests. No Redis connection or provider send was attempted.

### F10 — Medium: production storage verification may execute DDL during startup

Evidence: security/productionStorageAdmission.js:91–118; config/dbGuard.js:283–284.

MEDISYNC_AUTO_PROVISION_STORAGE=true makes the function named verifyProductionStorage create missing collections and indexes during normal production connection admission. It rejects incompatible definitions, which is positive, but missing-storage repair is not purely read-only and can partially complete before a subsequent failure. Mongoose autoCreate/autoIndex=false does not prevent these explicit driver operations.

Minimum fix: keep runtime verification read-only; perform reviewed provisioning through an operator tool and fresh preflight. Whether the live flag is set is NOT VERIFIED.

### F11 — Medium: production cluster selection is broad, not an exact existing-cluster pin

Evidence: security/productionAtlasPolicy.js:5–18.

The URI policy accepts any syntactically valid multi-label *.mongodb.net hostname with medisync_prod and allowed options. It still enforces TLS policy and an exact database role. A configuration mistake can connect to a different Atlas cluster containing that database/role, so messages implying verification of the existing cluster overstate the check.

Reproduced offline: a fabricated unrelated Atlas-shaped hostname was admitted. No DNS lookup or connection was made.

Minimum fix: an explicitly approved exact host allowlist, changed only through controlled configuration review. This is an operational isolation risk, not a remotely demonstrated arbitrary-host attack.

### F12 — High confidentiality limitation: sensitive patient fields remain outside field encryption

Evidence: models/Patient.js:6–38 and 47–50; security/securityRuntime.js:18–24 and 54–62; utils/versionedEncryption.js:2–5; installed mongoose-field-encryption implementation:4.

The Patient plugin covers fullName, contactInfo and allergies only. NIC, email, address, birth date, emergency contact, insurance and chronic conditions are not covered by that plugin. Legacy fields use AES-CBC without an authentication tag. The security runtime correctly blocks unapproved HMAC/GCM cutover; the existence of GCM/HMAC helper code is not evidence the current models use it. Under the operator-key branch, absent security configuration defaults to legacy.

This is an at-rest disclosure/integrity risk if database access or storage is compromised, not proof of anonymous API exposure. Actual storage contents and infrastructure encryption were not inspected.

Minimum fix: approved backup/restore rehearsal, field inventory, dual-read migration with exact-ID resumable writes and a separate key-management review. Never activate the migration merely to resolve this report.

## Additional review observations (not counted as confirmed remote exploits)

- ML internal authentication at ml-engine/app.py:493–524 signs only the UTC hour and accepts the previous hour. A captured internal credential is reusable across protected endpoints for roughly one to two hours, without request-body/path binding. TLS helps prevent capture. Consider method/path/body-bound signatures and replay control; no live replay was attempted.
- Some auth settings routes use canonical auth rather than verifiedAuth (routes/authRoutes.js:39–51). The canonical middleware checks session/ban/role but not current account state. Individual controllers add varying owner checks. A complete disabled-account matrix for settings routes remains NOT VERIFIED; no blanket bypass claim is made.
- Public verification GETs are not side-effect-free: verificationTokenService.js:97–105 increments useCount/lastUsedAt, and verificationController.js writes scan audit records. Do not classify these as zero-write production checks.
- No present CVE count is claimed. Package manifests/installed PDF implementation were reviewed, but npm audit, pip-audit, remote advisory lookup and complete secret-history scanning were NOT RUN. Historical vulnerability totals are not current evidence.

## Offline execution evidence

All probes used Node via PowerShell stdin (here-string piped to node); no test source files were created. The actual controller/plugin/logger source was loaded with vm.runInNewContext. Unknown imports were rejected; database and provider dependencies were inert; the controller probe's email service threw if used. VM probes exercise the source logic but are not a hostile-code sandbox or real infrastructure proof.

Execution 1, exit 0:

    REPRODUCED: unrelated doctor reaches revocation; HTTP 200
    REPRODUCED: NIC-only reaches full-history generator; hold stub returns 503
    REPRODUCED: raw internal exception included in HTTP 500
    REPRODUCED: two concurrent OTP snapshots both unlock; HTTP 200/200
    4/4 inert reproductions confirmed; network and provider modules not loaded

Execution 2, exit 0:

    protectedMatched=15 total=15 mismatches=[]
    REPRODUCED: unrelated Atlas-shaped hostname accepted by offline production URI policy
    REPRODUCED: init suppresses decryption failure and returns unchanged encrypted field

Execution 3, exit 0:

    REPRODUCED: recordAudit discards sanitized outcome/status details
    pdfLibraryEncryptionMetadata: V1=false V2=true R3=true length128=true

Totals: 8 successful diagnostic observations (7 defect reproductions and 1 actual PDF cipher inspection), plus 15/15 protected hash matches. Successful reproduction means the defect was observed, NOT that security passed. These are ad-hoc diagnostic probes, not eight additions to the project's regression baseline.

No full regression/build ran: those generate artifacts and may start additional local processes, and this request asked for a no-edit scan. No previous regression total has been presented as a current-source result. Several exploratory searches returned absent paths/no matches; these were corrected by reading the actual security/ paths and do not count as tests.

## Suggested repair order

1. QR scope/ownership and atomic OTP consumption (F01–F03); preserve existing PDF hold.
2. Resolve PDF cipher and export configuration inconsistency (F05) before any export enablement.
3. Fail safely on clinical decryption errors and establish audit guarantees (F04/F06).
4. Remove raw exception exposure; harden session storage and shared OTP limits (F07–F09).
5. Separate storage verification from provisioning and pin the approved cluster (F10/F11).
6. Plan the protected, backward-compatible encryption migration separately (F12), with restore-tested backups.

No fix was applied. Live behavior, deployed SHA, production settings, data condition, clinical correctness, current dependency advisories, complete authorization coverage, backup restoration and final five-role end-to-end acceptance remain NOT VERIFIED by this review.
## Final workspace observation

The final status also showed concurrent modifications to docs/final/FINAL_STATUS.md and docs/final/MASTER_STATE.md. These were not edited by this review. The staged index was empty. All four pre-existing/concurrently modified paths were preserved. The report is under the repository's ignored docs/temp area, so it is not listed by ordinary git status.

