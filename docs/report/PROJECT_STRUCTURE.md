# MediSync Project Structure & Directory Guide

This document provides an annotated hierarchical tree of all tracked directories in the MediSync repository, with the single-line architectural purpose of each directory.

```
medisync/
├── .github/
│   └── workflows/                   # GitHub Actions CI definitions for clinical offline gates & security audits
├── client/                          # React 18 single-page application (Tailwind CSS, Framer Motion)
│   ├── public/                      # Static assets, HTML entry point, and Sri Lanka district GeoJSON
│   ├── scripts/                     # Client build validation and production compilation scripts
│   ├── src/                         # Application source code
│   │   ├── __master_offline__/      # Master offline Jest component and contract test suites (78 suites, 666 tests)
│   │   ├── api/                     # Axios HTTP client configuration and interceptors
│   │   ├── components/              # Shared UI components across all application roles
│   │   │   ├── auth/                # Authentication forms, password meters, and registration steps
│   │   │   ├── common/              # Reusable UI widgets: active outbreak banners, safety panels, navigation
│   │   │   └── ui/                  # Low-level primitive components (buttons, badges, inputs, modals)
│   │   ├── config/                  # Client runtime environment configuration and API endpoint mappings
│   │   ├── context/                 # React Context providers (AuthContext, LanguageContext, SessionContext)
│   │   ├── data/                    # Client reference datasets (district populations, specialty mappings)
│   │   ├── hooks/                   # Custom React hooks (useAuth, useLanguage, useDebounce)
│   │   ├── i18n/                    # Localization infrastructure and language switching logic
│   │   │   └── translations/        # Trilingual translation dictionaries with 100% key parity (EN, SI, TA)
│   │   ├── pages/                   # Role-specific portal views and route pages
│   │   │   ├── admin/               # Administrator portal: outbreak monitor, audit logs, user management
│   │   │   ├── auth/                # Login, registration, password reset, and OTP verification views
│   │   │   ├── common/              # Universal shared error, loading, and unauthorized views
│   │   │   ├── dev/                 # Offline development simulator and component sandbox views
│   │   │   ├── doctor/              # Doctor portal: new consultations, symptom tagging, prescription builder
│   │   │   ├── hospital/            # Hospital admin views: doctor affiliation roster, facility metrics
│   │   │   ├── patient/             # Patient portal: medical timeline, prescriptions, profile management
│   │   │   ├── pharmacy/            # Pharmacy staff portal: prescription dispensing, OTC checkout, history, and district demand
│   │   │   └── public/              # Public unauthenticated views: home, public health map, QR verification
│   │   └── utils/                   # Client helper utilities (date formatting, encryption helpers, PDF triggers)
│   └── tests/                       # Offline integration test specifications
├── docs/                            # Comprehensive engineering, audit, and operational documentation
│   ├── agent-work/                  # Historical multi-agent trajectory logs and verification matrices
│   ├── ml-evaluation/               # Machine learning evaluation metrics, feature importances, and benchmarks
│   ├── new/                         # Sub-project delivery archives (sub1 through sub4 historical runbooks)
│   │   ├── sub1/                    # Sub-Project 1: foundation polish and disk optimization logs
│   │   ├── sub2/                    # Sub-Project 2: post-merge fix findings and Mongoose decoupling
│   │   ├── sub3/                    # Sub-Project 3: docs sync, public health map, and offline gates
│   │   └── sub4/                    # Sub-Project 4: truth pass, sourced knowledge base, and tiered matcher
│   ├── release/                     # Release configuration and protected SHA-256 file hashes ledger
│   ├── report/                      # Sub-Project 5: technical report chapters, figures, scans, and viva kit
│   │   ├── chapters/                # Individual chapters of the technical report
│   │   ├── data/                    # JSON data artifacts from project scans, memory tests, and sanity queries
│   │   ├── diagrams/                # Mermaid architecture and sequence diagram definitions
│   │   ├── export/                  # Exported technical report documents (PDF, DOCX)
│   │   └── figures/                 # High-resolution generated report figures (F01–F14)
│   ├── screenshots/                 # Verified desktop and mobile viewport screenshot captures
│   ├── security/                    # Security policies, threat models, and vulnerability disclosure terms
│   └── temp/                        # Historical offline test verification receipts and execution logs
├── ml-engine/                       # Python Flask microservice for symptom matching and disease prediction
│   ├── data/                        # Processed disease datasets, reference clean ICD-10 catalog, safety limits
│   ├── data_pipeline/               # Ingestion, curation, and mapping pipelines for external clinical datasets
│   │   └── raw/                     # Raw public domain CDC NAMCS outpatient survey CSV snapshot
│   ├── evaluation/                  # Automated figure generation scripts and statistical evaluators
│   └── scripts/                     # ML verification utilities, AST scoring checks, and benchmark scripts
├── scripts/                         # Repository-wide management, quality gates, seeders, and migration tools
│   └── fixtures/                    # Mock JSON test payloads and synthetic consultation generators
└── server/                          # Node.js Express backend API gateway with AES-256-GCM encryption
    ├── reference-data/              # Backend copy of verified diagnostic catalogs (icd10, interactions)
    ├── scripts/                     # Database maintenance, indexing, and offline migration utilities
    ├── src/                         # Server application source code
    │   ├── config/                  # Database connection, Redis caching, and environment bootstrapping
    │   ├── controllers/             # HTTP route controllers handling business logic and responses
    │   ├── data/                    # Server reference datasets (safety limits, district populations)
    │   ├── demo/                    # Synthetic demo data definitions for offline presentations
    │   ├── middleware/              # Express middleware: authentication, rate limiting, error handlers
    │   ├── models/                  # Mongoose ODM schema definitions and database models
    │   ├── routes/                  # Express route declarations mapped to controllers and role guards
    │   ├── security/                # Cryptographic policy: AES-256-GCM field encryption, key ring rotation
    │   ├── services/                # Business services: outbreak surveillance, token issuing, audit logging
    │   └── utils/                   # Server utility modules: PDF generator, email dispatchers, token helpers
    └── tests/                       # Backend offline Jest test suites (123 suites, 2,635 tests)
        └── helpers/                 # Test harnesses, in-memory MongoDB replica set runners, mock factories
```
