# MediSync — PDF Export Design

Stage A planning document. Created: 2026-11-05 (Antigravity no-network, branch `antigravity/stage-a`)

**Status: AWAITING `APPROVE PDF-DESIGN` before implementation.**

Covers U4: secure download of consultation and lab report PDFs.

---

## Current state

The download button renders "PDF export temporarily unavailable". The backend has a
`SECURITY_HOLD` on clinical PDF export from V1 (confirmed in protected files via
`docs/release/PROTECTED_HASHES.json`). The hold was placed because the encryption,
ownership check and key delivery design was not finalized.

---

## Requirements

1. Only the owner (patient) or the authorized provider (doctor who issued the consultation,
   hospital that ordered the lab test) may download the PDF.
2. The file must be encrypted in transit (HTTPS already applies) and the download URL
   must be short-lived and unguessable.
3. Wrong key / tampered URL / missing key: reject with 403, no plaintext fallback.
4. Sinhala and Tamil characters must render correctly in the PDF.
5. File naming: `MediSync-Consultation-{date}-{masked-ref}.pdf`, never the patient's real
   name or NIC.
6. Every download is logged in the AuditLog (actor, resource type, resource ID, timestamp).
7. No sensitive data in the URL itself.

---

## Option A — Signed one-time download URL (recommended)

**Mechanism:**
1. Client calls `POST /api/consultations/:id/download-token` (or equivalent lab endpoint)
   with the authenticated JWT.
2. Server checks ownership (patient owns consultation, or doctor issued it, or hospital
   ordered the lab test).
3. If authorized: generate a short-lived signed token (HMAC-SHA256 of `resourceType +
   resourceId + userId + expiresAt`, signed with `PDF_SIGNING_SECRET`). TTL = 60 seconds.
   Store the token hash in Redis with 60 s TTL.
4. Return `{ downloadUrl: "/api/pdf/download?token=<token>" }` — no resource ID in URL.
5. Client opens the URL in a new tab or triggers download.
6. `GET /api/pdf/download?token=<token>`:
   - Verify HMAC signature.
   - Check Redis: token exists (consume it — one-time use).
   - Regenerate the PDF on-demand (no file storage needed).
   - Stream the PDF bytes with `Content-Disposition: attachment`.
   - Log to AuditLog.
7. If token invalid / expired / already used: 403, no content.

**Key delivery:** `PDF_SIGNING_SECRET` is an environment variable set by the operator
on Render (never committed). It is independent of patient identifiers.

**PDF generation:** `pdfkit` (already in package.json if present, else add). Load
Noto Sans Sinhala and Noto Sans Tamil fonts from `server/fonts/` (operator places font
files there; they are gitignored to avoid licensing issues in the public repo — provide
a `.gitignore` entry and instructions in OPERATOR_ACTIONS.md).

**Wrong key / tamper:** any modification of the token invalidates the HMAC → 403.
No plaintext fallback: if the PDF cannot be generated or the token is invalid, return
403 and log.

**Pros:** no file storage; token is stateless except the Redis one-time-use check;
short TTL limits exposure; no PII in URL.  
**Cons:** Redis must be available (it already is); PDF regeneration on each download
(fast for a small consultation PDF).

---

## Option B — Encrypted file storage with separate key delivery

**Mechanism:**
1. When a consultation is finalized, generate and encrypt the PDF with AES-256-GCM.
2. Store the encrypted file in a temporary object store (or on Render's ephemeral disk).
3. Store the encryption key separately (in a Mongo document associated with the resource
   and authorized users, encrypted with the server's master key).
4. On download: ownership check → retrieve key → decrypt → stream.

**Pros:** PDF not regenerated on each download.  
**Cons:** storage dependency; key management complexity; Render free tier has no
persistent disk — temporary files are lost on restart. This option requires a paid Render
plan or an external store.

---

## Recommendation

**Option A** is recommended. It requires no additional storage, works on the free
Render plan, and the one-time token prevents replay. The PDF is regenerated in < 200 ms
for a typical consultation (a few pages).

**New environment variable:** `PDF_SIGNING_SECRET` — operator sets on Render. This needs
an entry in `OPERATOR_ACTIONS.md`.

---

## PDF layout (trilingual)

**Consultation PDF:**
```
┌──────────────────────────────────────────────────────┐
│  MediSync                           [Date] [Time IST] │
│  Consultation Summary                                  │
├──────────────────────────────────────────────────────┤
│  Reference: CON-2026-XXXXX  (masked — not real ID)   │
│  Patient:   [name in EN / SI / TA per preference]    │
│  Doctor:    Dr. [name]                               │
│  Facility:  [hospital name]                          │
├──────────────────────────────────────────────────────┤
│  Chief Complaint                                      │
│  [text]                                               │
│  Diagnosis  [ICD-10 code] [description]              │
│  Prescription                                         │
│  - [drug] [dosage] [frequency] [duration]            │
│  Lab Orders (if any)                                  │
│  - [test name] [status]                              │
├──────────────────────────────────────────────────────┤
│  CLINICAL INFORMATION NOTICE                         │
│  This document is for the named patient only.        │
│  Not a prescription dispensed directly.              │
│  Consult your pharmacist or doctor for queries.      │
│  clinicalValidation: not_established                 │
└──────────────────────────────────────────────────────┘
```

**Lab report PDF:**
```
┌──────────────────────────────────────────────────────┐
│  MediSync Lab Report               [Date] [Time IST] │
│  Reference: LAB-2026-XXXXX                           │
│  Patient:   [name]                                   │
│  Hospital:  [name]                                   │
│  Test:      [test name]                              │
│  Result:    [result text / structured]               │
│  Reviewed by: [technician / doctor]                  │
│  NOTICE: For informational purposes. Consult doctor. │
└──────────────────────────────────────────────────────┘
```

**Font files required** (operator action — not committed):
- `server/fonts/NotoSansSinhala-Regular.ttf`
- `server/fonts/NotoSansTamil-Regular.ttf`
- `server/fonts/NotoSans-Regular.ttf` (Latin)
Obtain from Google Fonts (open-source, OFL license). Instructions in OPERATOR_ACTIONS.md.

---

## Acceptance criteria

1. Only the authorized user can get a valid download token; a 403 for anyone else.
2. Token expires in ≤ 60 seconds; replayed token returns 403.
3. PDF renders with correct Sinhala/Tamil characters for SI/TA patient preference.
4. File name contains no real NIC or full name.
5. Every download logged in AuditLog with actor and resource.
6. No plaintext PDF served without a valid token.
7. Frontend download button appears only for owners (patient) and authorized providers.

---

## Risks

| Risk | Mitigation |
|------|-----------|
| Font file not present on Render | Fallback to Latin-only PDF with a note; operator MUST upload fonts |
| Redis unavailable | Download token generation fails; return 503 with "try again shortly" |
| PDF generation slow for large consultations | Cap consultation length at 20 Rx items in PDF; link to full view |
| pdfkit not in package.json | Add as dependency in plan |

---

## Operator actions needed before implementation

Write in `OPERATOR_ACTIONS.md`:
1. Set `PDF_SIGNING_SECRET` on Render (random 64-char hex; never commit).
2. Upload font files to `server/fonts/` on the Render instance (or add to the repo
   if the license allows — OFL does allow redistribution).
3. Type `APPROVE PDF-DESIGN` to unblock implementation.
