# PDF Export Encryption — Known Limitation

**Status:** Exports are **off by default**. This page explains what happens when they are turned on.

## What the code does
- **Gate (server):** `PDF_EXPORT_ENABLED` must be exactly `true`. Otherwise the consultation, lab-report and QR-history PDF endpoints return HTTP 503 with `SECURITY_HOLD` (`server/src/utils/pdfGenerator.js`, `prescriptionController.js`, `labController.js`, `verificationController.js`).
- **Gate (client):** the consultation PDF button also checks the build-time flag `REACT_APP_PDF_EXPORT_ENABLED === 'true'` (`client/src/utils/pdfDownload.js`). Vercel must rebuild for a change to take effect.
- **Cipher:** when enabled, PDFs are encrypted by `@pdfsmaller/pdf-encrypt-lite@1.2.0`, which writes a Standard security handler with `/V 2 /R 3 /Length 128`. That is **RC4-128** (PDF 1.4). The library has no AES mode.
- **Password:** the user password is the patient NIC (uppercase, no spaces). If there is no NIC, the consultation reference is used. If neither exists, the export is **refused** with `SECURITY_HOLD` (`reason: PDF_PASSWORD_UNAVAILABLE`). The earlier fixed fallback password has been removed.
- **Owner password:** 32 random bytes per file. Copying, editing and annotation are disallowed; printing is allowed.

## Why this is a limitation
1. RC4 is a deprecated stream cipher with known biases. It is not acceptable for confidentiality of health data under current guidance.
2. A Sri Lankan NIC (9 digits + letter, or 12 digits) or a consultation reference is low-entropy and may be known to third parties. An offline brute-force or dictionary attack on the password is practical.
3. PDF permission flags are advisory. Most tools ignore them once the file is opened.

So the lock should be described as a **casual-access deterrent**, not as encryption that protects confidentiality.

## Recommended stance for the viva and live demo
- Keep `PDF_EXPORT_ENABLED` and `REACT_APP_PDF_EXPORT_ENABLED` **off** on the live site unless the examiner specifically asks to see an export.
- If enabled, use only synthetic records, and state that the file is RC4-128 with an identifier-derived password.

## What a proper fix needs (not implemented)
- An AES-256 (`/V 5 /R 6`) capable PDF encryption tool (for example qpdf invoked server-side), which means a new dependency or binary.
- A password that is **not** derived from an identifier: a random one-time password delivered through a separate channel (for example the existing OTP email), or no password plus authenticated download only.
- Tests asserting `/V 5 /R 6` and AESV3 in the output.
