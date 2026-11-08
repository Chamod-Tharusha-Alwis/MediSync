# MediSync

MediSync is a secure, full-stack healthcare platform featuring a zero-trust architecture, role-based access control (Doctor, Patient, Pharmacy, Hospital Admin), and an integrated Machine Learning engine for real-time outbreak detection and symptom diagnosis.

## Live Deployment
- **Frontend (Client)**: `https://medisync.chamodtharusha.com.lk`
- **Backend API**: `https://medisync-wabc.onrender.com`
- **ML Engine**: `https://medisync-ml.onrender.com`

## Architecture Overview
- `client/`: React-based frontend using Tailwind CSS and Framer Motion (76 test suites, 661 component & contract tests).
- `server/`: Node.js/Express backend handling authentication, MongoDB Atlas interactions, encryption, dynamic surveillance, and business logic (124 test suites, 2,639 offline tests).
- `ml-engine/`: Python Flask service matching symptoms to diseases via Tiered Matcher V2 (Tier 1: 41 curated profiles; Tier 2: 174 mapped empirical KB profiles; 71,704 ICD-10 concepts for manual lookup) and forecasting observation (78 tests across PyTest & Flask).

## Disease & Surveillance Coverage
- **Tier 1 Curated Profiles**: 41 high-confidence reference symptom profiles (including Sri Lankan priority communicable diseases: Dengue, Malaria, Typhoid, etc.).
- **Tier 2 Sourced Knowledge Base**: 174 mapped clinical conditions with empirical edge probabilities derived from CDC NAMCS outpatient survey data, filtered at $P \ge 15.0\%$ with clinical cardinal symptom guards.
- **Full ICD-10 Diagnostic Catalog**: 71,704 validated leaf concepts supported across doctor consultations, patient history, PDF reports, and prescription workflows.
- **Dynamic Outbreak Surveillance**: Dynamic grouping by `(entity, diseaseId)` evaluating Gate 1 ($N \ge 5$), Gate 2 (2 consecutive elevated days), and Gate 3 ($z > 2.0$) for **any** recorded ICD code with zero disease whitelists.

## Verification & Quality Gates
- **Offline Quality Gate**: `node scripts/run_offline_tests.js` (**3,465 tests passed, 0 failed**, 0 skipped across 207 suites).
- **Client Build**: `npm --prefix client run build` (Exit code 0, 119 bundled modules, zero demo dependencies).
- **Protected File Ledger**: 15 critical security, model, and database files pinned via SHA-256 in `docs/release/PROTECTED_HASHES.json`.
- **Clinical Validation Disclaimer**: All ML inference and epidemiological trend observation endpoints operate under the regulatory contract `clinicalValidation: not_established`.

## Documentation & Capstone Submission Pack
- **Master Documentation Index**: [`docs/report/INDEX.md`](docs/report/INDEX.md)
- **Technical Report (Full Thesis)**: [`docs/report/TECHNICAL_REPORT.md`](docs/report/TECHNICAL_REPORT.md)
- **Project Overview (Plain Language)**: [`docs/report/PROJECT_OVERVIEW.md`](docs/report/PROJECT_OVERVIEW.md)
- **Viva Defense Guide (32 Q&As)**: [`docs/report/VIVA_QA.md`](docs/report/VIVA_QA.md)
- **Live Demonstration Script**: [`docs/report/DEMO_SCRIPT.md`](docs/report/DEMO_SCRIPT.md)
- **Presentation Slides Outline**: [`docs/report/SLIDES_OUTLINE.md`](docs/report/SLIDES_OUTLINE.md)
- **Publication Figures (F01–F14)**: [`docs/report/figures/FIGURES.md`](docs/report/figures/FIGURES.md)
- **Document Export Guide (DOCX/PDF)**: [`docs/report/export/CONVERSION_GUIDE.md`](docs/report/export/CONVERSION_GUIDE.md)

## Local Development

You can run the entire stack via Docker:
```bash
docker-compose up --build
```
Alternatively, see the individual `README.md` files in each service folder for manual startup instructions.
