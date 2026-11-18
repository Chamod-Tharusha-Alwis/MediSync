# Project structure

Counts are tracked files per folder (`git ls-files <folder> | wc -l`) at commit `f5337833` plus the clean-up
branch. The whole repository has 1,394 tracked files on `main`.

```
medisync/
├── client/                      React 19 web app (Vercel)
│   ├── src/  (242)
│   │   ├── pages/ (54)          one folder per role: admin, doctor, hospital, patient, pharmacy, public, auth, common
│   │   ├── components/ (48)     shared UI (maps, safety panel, modals, public drill-down)
│   │   ├── utils/ (29)          formatting, OTP lock, outbreak trend projection (outbreakForecasting.js)
│   │   ├── i18n/ (4)            LanguageContext + translations/en.js, si.js, ta.js
│   │   └── __master_offline__/ (91)  offline UI tests run by the gate
│   ├── tests/ (7), scripts/ (6), public/ (7)
├── server/                      Express 5 API (Render)
│   ├── src/
│   │   ├── routes/ (20)         228 API routes
│   │   ├── controllers/ (26)    request handlers
│   │   ├── services/ (48)       surveillance (detector), alert projection, dispensing, email delivery, reminders
│   │   ├── models/ (30)         Mongoose schemas
│   │   ├── middleware/ (7)      auth (roles), patient consent, clinical write authorization
│   │   ├── security/ (44)       password-attempt policy, NIC blind index, production/QA admission checks
│   │   ├── utils/ (40), config/ (3)
│   ├── tests/ (267)             Jest tests (the gate runs the list in clinical.offline.jest.cjs)
│   ├── scripts/ (52)            maintenance and demo/proof scripts (in-memory proofs, mock server)
│   └── reference-data/ (5)      drug, ICD-10 and interaction catalogues used by the API
├── ml-engine/                   Flask ML service (Render)
│   ├── app.py                   symptom matcher, interaction checker, outbreak signal helper (hash-protected)
│   ├── data/ (12)               reference data (see docs/DATASETS.md)
│   ├── data_pipeline/ (6)       SymCAT knowledge-base ingestion, ICD-10 synonym list, raw SymCAT export
│   ├── evaluation/ (41)         public-data benchmarks; study/ (10) offline data-science study
│   ├── scripts/ (11)            seeding of medisync.db, rankings exports
│   └── medisync.db              SQLite reference database (ICD rows, synthetic outbreak counts)
├── scripts/ (76)                offline test gate, local-stack launcher, live verification and evaluation helpers
├── docs/                        documentation (see docs/INDEX.md)
│   ├── report/ (98)             report chapters, study results, figures
│   ├── demo/ (41)               fix-pack runbooks and screenshots
│   ├── final/ (80), new/ (66)   dated working records (read by tests; keep)
│   ├── archive/ (27)            superseded documents (history only)
│   └── release/ (2)             PROTECTED_HASHES.json (the 15-file ledger)
├── .github/workflows/           e2e-tests.yml, security-tests.yml
├── package.json                 root scripts: start, start:check, test:offline, build
├── docker-compose.yml           container definitions (needs real .env files; not a quick start)
└── README.md, ARCHITECTURE.md, CHANGELOG.md
```

Last verified: 2026-11-18 at commit f5337833.
