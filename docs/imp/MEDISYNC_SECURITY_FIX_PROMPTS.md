# MediSync — Security Hardening: Implementation Prompts

Covers every finding from the audit so far: the two critical/high issues found in the docs (hardcoded ML-engine fallback secret, OTP bypass code) plus the three architectural gaps just raised (OTP brute-forcing, key rotation, Redis multi-instance failover), plus two lower-priority items worth closing out while you're in this code.

Run **Prompt A** first — it's small, self-contained, and closes the two most dangerous holes. Then run **Prompt B**. Prompt C (key rotation) is the largest architectural change — do it last, on a branch, with the other two merged and tested first.

---

## Prompt A — Critical: kill the hardcoded fallback secrets (do this first)

```
You are hardening the security of MediSync, my own full-stack healthcare project
(Node/Express backend, Python Flask ML engine). This is a defensive fix pass on
code I own — find and remove insecure fallback patterns, don't add new features.

TASK 1 — ml-engine/app.py, verify_internal_token:
This function currently accepts a hardcoded fallback string
("medisync-secure-key-123") as valid auth if the real HMAC check fails or is
unavailable. Remove the fallback entirely. The function must fail closed: if the
HMAC signature (computed from the shared secret + rotating time window) does not
validate, reject the request with 403, full stop. Read the shared secret from an
environment variable at startup; if it's missing, crash on boot with a clear error
— do not silently fall back to any default string, anywhere in this file.

TASK 2 — server-side counterpart:
Find wherever the Node backend generates the x-internal-key / HMAC header sent to
the ML engine (likely server/src/utils/internalAuth.js or similar) and confirm it
has no matching hardcoded fallback on that side either. Apply the same fail-closed
rule.

TASK 3 — grep the entire repo (server/, ml-engine/, client/) for any other literal
hardcoded secret-like strings used as auth fallbacks (passwords, API keys, tokens).
List every one you find with file/line before changing anything, then remove each
fallback the same way: env var required at startup, fail closed if missing.

TASK 4 — search for the OTP bypass code used in testing (referenced as "123456" in
the test suite). Show me exactly where in production code paths this value is
accepted, and confirm (or add, if missing) a guard so it is ONLY accepted when
NODE_ENV/FLASK_ENV is explicitly 'test' or 'development' AND a dedicated
TEST_MODE=true env var is set — never accepted in a production build regardless of
NODE_ENV. If you can't find such a guard already, add it and show me the diff
before applying.

After each task, tell me exactly what you changed and why, and flag anything you're
not fully confident is safe rather than guessing.
```

---

## Prompt B — High: rate-limit OTP verification + fix Redis multi-instance failover

```
Continuing the MediSync security hardening pass, same rules: defensive fixes only,
on code I own, fail-closed by default.

TASK 1 — OTP brute-force protection:
Find every endpoint that verifies a 6-digit OTP (doctor session MFA, hospital
consent OTP, doctor report-access OTP, patient registration OTP if any). These
currently share general auth rate-limiting but likely have no OTP-specific limiter.
Add a dedicated limiter per OTP session (keyed by the OTP session ID or patient/
doctor identifier, not just IP — a single IP shouldn't be able to spray guesses
across many session IDs either, so add an IP-based limiter too):
  - Max 5 verification attempts per OTP session.
  - On the 5th failed attempt, invalidate that OTP immediately (delete from Redis/
    Mongo) and require the user to request a new one — do not just keep counting.
  - Add a short exponential backoff between attempts (e.g. reject attempts made
    less than 1 second apart) to blunt scripted brute-forcing even within the
    5-attempt budget.
  - Log repeated failures to the audit log as a security event.

TASK 2 — Redis failover for multi-instance safety:
The current design uses an in-memory JS Map as a fallback when Redis is
unreachable. This breaks correctness the moment the app runs behind a load
balancer with more than one Node instance, because OTPs generated on instance A
won't exist on instance B.
  - Do NOT silently keep the in-memory fallback as a transparent replacement for
    Redis in a way that could mask this in production.
  - Add a startup check: if REDIS_URL is configured, the app must successfully
    connect to Redis before accepting traffic — if it can't, fail loudly (log
    critical error, optionally refuse to start) rather than silently degrading to
    an in-memory store that only works for single-instance deployments.
  - Keep the in-memory fallback available ONLY for explicit local/dev use (e.g.
    gated by a SINGLE_INSTANCE_DEV_MODE env var), clearly logged as "not safe for
    multi-instance production" whenever it's active.
  - Document (in a comment at the top of the relevant config file) that any future
    horizontal scaling requires Redis (or Redis Cluster/Sentinel for HA) — no
    silent single-point-of-failure fallback in production.

Show me the diff for each change before/as you apply it, and tell me which existing
tests (Jest/Playwright) reference OTP flows so I know what to re-run afterward.
```

---

## Prompt C — Medium: Vault master-key rotation strategy (larger change, do last, on a branch)

```
Continuing the MediSync security hardening pass. This is the largest change in
this batch — implement it on a separate branch, don't touch anything from
Prompts A/B, and stop to show me a design before writing the migration code.

CONTEXT: Currently there is a single Vault master key (global.ENCRYPTION_KEY) used
to wrap every field-level AES key and every file DEK (data encryption key). If this
key is ever rotated, every already-encrypted record in the database becomes
unreadable, because there's no versioning telling the app which key wrapped which
record.

TASK — design and implement key versioning (do NOT do a live rotation yet, just
build the capability):
1. Add a `keyVersion` field (small integer, default 1) to every schema that stores
   wrapped keys or field-level encrypted data: Patient, Consultation, Prescription,
   LabTest (encryptedFileKey), and any others using mongoose-field-encryption.
2. Change the Vault integration to support multiple named/versioned master keys
   (e.g. Vault KV path per version: secret/medisync/mek/v1, v2, ...) rather than a
   single global.ENCRYPTION_KEY. On boot, load ALL known key versions into memory
   (not just the latest), keyed by version number.
3. All NEW writes use the current/latest key version and stamp `keyVersion` with
   it. All READS look up `keyVersion` on the record and decrypt with the matching
   key from the loaded set — never assume "latest key decrypts everything."
4. Write a one-off, resumable background migration script (not a request-time
   operation) that: for a given batch of records on an old keyVersion, decrypts
   with the old key, re-encrypts with the new key, updates keyVersion, and commits
   — with checkpointing so it can be safely stopped/resumed on a large collection
   without downtime. Do NOT run this automatically; it's a manually-triggered ops
   script.
5. Add an audit log entry every time a record is re-wrapped during migration.

Show me the schema diff and the Vault access-pattern diff first, before writing the
migration script itself, so I can confirm the design matches how Vault is actually
configured in this project.
```

---

## Prompt D — Low priority, optional: reduce public PII exposure in reviews

```
One lower-priority item from the audit: Review.js currently denormalizes the
patient's decrypted fullName into a plaintext `reviewerName` field, which is shown
on public doctor/hospital/pharmacy directory pages. This means a patient's real
name becomes permanently public the moment they leave a review, even though
Patient.fullName is field-level encrypted everywhere else.

TASK: Change review display to use a non-identifying label instead of the real
name — e.g. "Verified Patient" plus the review date, or a patient-chosen display
name captured separately at review-submission time (not the same field as their
encrypted legal name). Keep the performance win from PERF-04 (no query-time
decryption) by still denormalizing whatever label you choose onto the Review
document — just don't denormalize the real name. Show me the schema and controller
diff before applying.
```

---

## Suggested order

1. **Prompt A** — merge and deploy same day, these are active exploitable holes
2. **Prompt B** — merge within the week
3. **Prompt D** — quick win, do whenever convenient
4. **Prompt C** — schedule separately; it touches every encrypted schema and needs its own testing pass before you trust it near real data
