# MediSync

MediSync is a secure, full-stack healthcare platform featuring a zero-trust architecture, role-based access control (Doctor, Patient, Pharmacy, Hospital Admin), and an integrated Machine Learning engine for real-time outbreak detection and symptom diagnosis.

## Live Deployment
- **Frontend (Client)**: `https://medisync.chamodtharusha.com.lk`
- **Backend API**: `https://medisync-api.onrender.com`
- **ML Engine**: `https://medisync-ml.onrender.com`

## Architecture Overview
- `client/`: React-based frontend using Tailwind CSS and Framer Motion (75 test suites, 656 component & contract tests).
- `server/`: Node.js/Express backend handling authentication, MongoDB Atlas interactions, encryption, and business logic (122 test suites, 2,625 offline tests).
- `ml-engine/`: Python Flask service matching symptoms to diseases (TF-IDF + Cosine Similarity) and forecasting outbreaks (71 tests across PyTest & Flask).

## Verification & Quality Gates
- **Offline Quality Gate**: `node scripts/run_offline_tests.js` (**3,445 tests passed, 0 failed**, 0 skipped).
- **Client Build**: `npm --prefix client run build` (Exit code 0, 119 bundled modules, zero demo dependencies).
- **Protected File Ledger**: 15 critical security, model, and database files pinned via SHA-256 in `docs/release/PROTECTED_HASHES.json`.
- **Clinical Validation Disclaimer**: All ML inference and epidemiological trend observation endpoints operate under the regulatory contract `clinicalValidation: not_established`.

## Local Development

You can run the entire stack via Docker:
```bash
docker-compose up --build
```
Alternatively, see the individual `README.md` files in each service folder for manual startup instructions.
