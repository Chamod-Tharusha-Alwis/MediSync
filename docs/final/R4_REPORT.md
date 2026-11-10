# Task R4 Report: Formulary Data Quality & UI Neutral Fallback

## 1. Overview & Objectives
Task R4 addresses formulary catalog data quality and patient profile user experience:
1. **Formulary Typo Correction ("Penicitin" -> "Penicillin")**:
   - Replaced erroneous entry `Penicitin Capsule 10'S` and `Penicitin 250mg Capsule 10'S` with canonical `Penicillin Capsule 10'S` and `Penicillin 250mg Capsule 10'S`.
   - Updated category to `antibiotic` and indication to `Bacterial Infection`.
   - Updated both `server/reference-data/drugs_clean.json` and `ml-engine/data/drugs_clean.json` with byte-for-byte exact parity.
   - Updated `server/reference-data/manifest.json` sha256 (`cb186f64deac071aa83b170b980a7518b681d86c955fbd02e62e496aeb74c2a0`) and byte count (`999036`).
   - Added `penicillin` mappings (`penicillin`, `penicillin g`, `penicillin v`) to `REVIEWED_SYNONYMS` in `server/src/utils/ingredientResolver.js`, resolving to canonical `benzylpenicillin` / `phenoxymethylpenicillin` with 0 unresolved ingredients.
2. **Suspected Brand Typos Scan (No Unverified Clinical Guessing)**:
   - Scanned 3,000 reference drug brand names for near-duplicate stems (Levenshtein distance 1) and suspicious orthographic anomalies.
   - Findings logged below for clinician/pharmacist audit (no speculative changes applied to unverified stems).
3. **Patient Detail Screens: Neutral Fallback ("Not provided")**:
   - Doctor Patient Detail (`client/src/pages/doctor/PatientDetail.jsx`): Replaced red alarming `text-red-400` with `'N/A'` with neutral slate `text-slate-400` and `'Not provided'`.
   - Pharmacy Dispense Dashboard (`client/src/pages/pharmacy/Dashboard.jsx`): Replaced `N/A` for missing contact, blood group, and DOB with neutral `'Not provided'`.
   - Doctor Consultation Patient Header (`client/src/pages/doctor/NewConsultation.jsx`): Replaced red `text-red-400` Unknown with neutral `Not provided`.
   - Patient Profile & Dashboard (`client/src/pages/patient/Profile.jsx`, `Dashboard.jsx`): Added neutral badge and labels for unprovided optional fields.

## 2. Brand Typos Scan Audit
The following near-duplicate brand pairs and orthographic variants were detected in `drugs_clean.json`:
- `ACNELEX` vs `ACNEREX` (potential brand collision or transcription artifact)
- `ADALENE` vs `ADLENE` (adapalene brand variants)
- `CLIFACE` vs `CLINFACE` (clindamycin topical variants)
- `CLINKA` vs `CLINXA` (clindamycin variants)
- `CLINOL` vs `CLINSOL` (clindamycin topical variants)
- `CETIRIZINE` vs `CETRIZINE` (spelling variant in brand stem)
- `BILASET` vs `BILAST` (bilastine brand variants)
- `DESWIN` vs `DEFWIN` (deflazacort brand variants)
- `DEFAC` vs `DEFZAC` (deflazacort brand variants)

*Audit Policy*: Consistent with build discipline and patient safety, no speculative clinical modifications were made to these pairs without authorized clinician/pharmacist review. Listed in `OWNER_ACTIONS.md` for formulary committee sign-off.

## 3. Automated Verification
- Unit test suite: `server/tests/dataQualityFormulary.test.js` (5 passing tests).
- Offline test runner whitelist: registered in `server/clinical.offline.jest.cjs`.
- Parity: `server/reference-data/drugs_clean.json` and `ml-engine/data/drugs_clean.json` match byte-for-byte.
- Manifest: verified SHA-256 and byte size integrity in `manifest.json`.
- Client build: exit code 0.
