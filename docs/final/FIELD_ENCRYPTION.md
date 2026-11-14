# Field-Level Encryption: Current Design, Limitations and GCM Migration Plan

**Status:** documentation only. Nothing here is implemented yet.
**Scope:** `server/src/utils/versionedEncryption.js` (protected file), `mongoose-field-encryption@7.0.1`, and the Patient and Consultation models.

## 1. What the code does today
| Aspect | Actual behaviour | Where |
|---|---|---|
| Cipher | **AES-256-CBC** | `mongoose-field-encryption/lib` (`algorithm = "aes-256-cbc"`) |
| Integrity | **None.** There is no MAC or authentication tag, so ciphertext changes are not detected. | same |
| IV | 16 random bytes per value (`crypto.randomBytes(16)`), stored as hex: `<iv>:<ciphertext>` | `versionedEncryption.js` `saltGenerator` |
| Key derivation | `sha256(secret)` → **hex string** → first 32 characters, used directly as the AES key | `versionedEncryption.js` `_hash` |
| Effective key strength | The 32 key bytes are ASCII hex characters (`0-9a-f`), so the key carries at most **128 bits** of entropy, not 256 | follows from the line above |
| Key versions | `doc.keyVersion` selects a secret from `global.ENCRYPTION_KEYS` (Vault, or `ENCRYPTION_KEY` as version 1) | `versionedEncryption.js`, `app.js` |
| Encrypted fields | Patient `fullName`, `contactInfo`, `allergies`; Consultation `patientNic`, `diagnosis`, `notes` | models |
| Lookups | HMAC-SHA256 blind indexes (separate from this cipher) | `security/nicPersistence.js` |
| Decrypt failure | The library **returns `""` silently** (`notifyDecryptFails` is not set). A wrong key or corrupted value turns into an empty field instead of an error. | library `decrypt` |
| Legacy values | Values without a `:` take a legacy AES-256-CTR path through `crypto.createDecipher`, which current Node versions no longer provide. Such values would also come back as `""`. | library `decryptAes256Ctr` |

## 2. Why this matters
1. **No integrity.** CBC without a MAC is malleable. Anyone with database write access can flip bits in a ciphertext and change the decrypted plaintext predictably. Nothing detects it, because the application never verifies a tag.
2. **No context binding.** A ciphertext can be copied from one document or field to another (for example one patient's allergies onto another patient) and will decrypt without complaint.
3. **Weaker key than labelled.** "AES-256" is accurate for the cipher, but the hex-string key derivation caps the key's entropy at 128 bits. That is still strong against brute force, but it should not be described as 256-bit key strength.
4. **Silent data loss.** Because decrypt failures become empty strings, a key-rotation mistake can erase clinical fields on the next save.

For the dissertation, state it as: "AES-256-CBC field encryption with per-value random IVs; no authenticated encryption; key derived from a hex digest (≤128-bit effective)."

## 3. Proposed migration to AES-256-GCM (not implemented)
**Prerequisite:** `versionedEncryption.js`, `Patient.js` and `Consultation.js` are protected files. Changing them means updating `docs/release/PROTECTED_HASHES.json`, with explicit owner approval and a new release candidate.

**Step 1: new envelope format, written for new key versions only.**
- Format: `v2.gcm.<iv 12B b64url>.<tag 16B b64url>.<ciphertext b64url>`
- Key: `HKDF-SHA256(secret bytes, salt = "medisync-field-v2", info = "<keyVersion>")` producing **32 raw bytes**, replacing the hex-string truncation.
- AAD: `"<collection>|<field>|<document _id>|<keyVersion>"`. This binds each ciphertext to its exact location and stops it being swapped elsewhere.

**Step 2: dual-read dispatcher.**
- `v2.gcm.` values: GCM decrypt with tag verification. A bad tag or wrong AAD **throws** (fail closed) and is audited. It never returns `""`.
- `<hex iv>:<hex ct>` values: the existing CBC path, read-only.
- Values without a separator (legacy CTR): explicit error and a reconciliation log entry, never a silent empty string.
- Set `notifyDecryptFails: true` for the CBC path as well.

**Step 3: switch writes.** Add a new key version (for example 2) to Vault and set `ACTIVE_KEY_VERSION=2`. Every save then writes GCM; existing CBC documents still read.

**Step 4: background re-encryption script** (for example `scripts/migrate_field_encryption_v2.js`):
- dry run by default; writes only with `--confirm`
- batched with resumable cursors; idempotent (skips documents already at `keyVersion >= 2`)
- per document: decrypt, re-encrypt with GCM, write with an optimistic `keyVersion` check, then read back and verify
- counts and failures recorded in the audit log
- run against a restored **staging** copy first, then production during a maintenance window with a verified backup

**Step 5: retire CBC.** Once a migration report shows zero documents below version 2, remove the CBC write path. Keep the old keys **read-only** until backups older than the migration have expired.

**Tests to add with the change:**
- round trip
- tampered ciphertext, IV and tag each throw
- an AAD mismatch from a swapped field or document throws
- a wrong key throws instead of returning `""`
- reading a mixed CBC and GCM collection
- migration idempotency and resume
- the HKDF key is 32 raw bytes

**Rollback:** keep the dual reader and the old key versions until the migration has been verified. Pointing writes back at version 1 restores the old behaviour, and documents already at version 2 still read through the dispatcher.
