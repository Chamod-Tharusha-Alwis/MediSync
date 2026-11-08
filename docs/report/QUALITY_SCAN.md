# MediSync Comprehensive Quality & Security Scan Report

> **Scan Date**: 2026-11-09  
> **Tool**: `scripts/generate_project_inventory.js` (deterministic `git ls-files` scanner)  
> **Environment**: Offline reproduction environment; zero production network calls.

---

## 1. Project Inventory & Volume Breakdown

| Component | Tracked Files | Total Bytes | Size (MB) | Total Lines of Code (LOC) | Primary Technologies |
|---|:---:|:---:|:---:|:---:|---|
| **`server/`** | 466 | 51,235,944 | 48.86 MB | 1,543,014 | Node.js, Express, Mongoose, Jest |
| **`docs/`** | 281 | 17,953,367 | 17.12 MB | 271,012 | Markdown, JSON receipts, Mermaid, PNG |
| **`client/`** | 257 | 3,138,100 | 2.99 MB | 63,547 | React 18, Tailwind CSS, Framer Motion |
| **`ml-engine/`** | 56 | 141,824,055 | 135.25 MB | 1,547,351 | Python 3.11+, Flask, SQLite, Scikit-Learn |
| **`scripts/`** | 55 | 645,698 | 0.62 MB | 12,902 | Node.js automation, Python verification |
| **`root`** | 14 | 59,171 | 0.06 MB | 1,478 | Docker Compose, configuration, README |
| **Total Tracked** | **1,129** | **214,856,335** | **204.90 MB** | **3,439,304** | **Full Stack System** |

*Note: High LOC counts in `server` and `ml-engine` are driven by large reference JSON datasets (`interactions_clean.json` at 1.48M lines and `icd10_clean.json` at 286K lines).*

---

## 2. 30 Largest Tracked Files

| # | File Path | Component | Size (MB) | Size (Bytes) | Lines of Code | Binary? |
|:---:|---|:---:|:---:|:---:|:---:|:---:|
| 1 | `ml-engine/medisync.db` | ml-engine | 75.63 MB | 79,306,752 | - | Yes |
| 2 | `ml-engine/data/interactions_clean.json` | ml-engine | 37.49 MB | 39,313,275 | 1,481,777 | No |
| 3 | `server/reference-data/interactions_clean.json` | server | 37.49 MB | 39,313,275 | 1,481,777 | No |
| 4 | `ml-engine/data_pipeline/raw/symcat_conditions.csv` | ml-engine | 12.07 MB | 12,660,539 | 50,757 | No |
| 5 | `ml-engine/data/icd10_clean.json` | ml-engine | 7.08 MB | 7,422,963 | 286,819 | No |
| 6 | `server/reference-data/icd10_clean.json` | server | 7.08 MB | 7,422,963 | 286,819 | No |
| 7 | `docs/disease_rankings_full.csv` | docs | 5.12 MB | 5,373,914 | 41,001 | No |
| 8 | `client/package-lock.json` | client | 1.15 MB | 1,209,726 | 28,142 | No |
| 9 | `server/package-lock.json` | server | 0.96 MB | 1,008,555 | 23,256 | No |
| 10 | `docs/screenshots/c3_map_clusters_mobile_375.png` | docs | 0.52 MB | 546,688 | - | Yes |
| 11 | `docs/new/sub4/COVERAGE_REPORT.md` | docs | 0.45 MB | 471,051 | 1,180 | No |
| 12 | `docs/screenshots/c3_map_clusters_desktop_si.png` | docs | 0.26 MB | 270,175 | - | Yes |
| 13 | `docs/screenshots/c3_map_table_view.png` | docs | 0.25 MB | 265,452 | - | Yes |
| 14 | `docs/screenshots/c3_map_clusters_desktop_ta.png` | docs | 0.24 MB | 252,890 | - | Yes |
| 15 | `docs/screenshots/c3_map_clusters_desktop_en.png` | docs | 0.21 MB | 215,062 | - | Yes |
| 16 | `docs/screenshots/public_health_live_desktop_si.png` | docs | 0.20 MB | 209,998 | - | Yes |
| 17 | `docs/screenshots/public_health_live_desktop_ta.png` | docs | 0.19 MB | 197,523 | - | Yes |
| 18 | `docs/screenshots/public_health_live_desktop_en.png` | docs | 0.17 MB | 181,644 | - | Yes |
| 19 | `docs/new.zip` | docs | 0.17 MB | 174,222 | - | Yes |
| 20 | `docs/screenshots/public_health_live_mobile_375.png` | docs | 0.14 MB | 151,228 | - | Yes |
| 21 | `client/public/lk_districts.json` | client | 0.13 MB | 134,704 | 1 | No |
| 22 | `ml-engine/data_pipeline/mapping_review.csv` | ml-engine | 0.10 MB | 108,189 | 666 | No |
| 23 | `ml-engine/data/unmapped_diseases.v1.json` | ml-engine | 0.10 MB | 106,786 | 5,404 | No |
| 24 | `package-lock.json` | root | 0.09 MB | 96,289 | 2,752 | No |
| 25 | `docs/MASTER_STATE.md` | docs | 0.06 MB | 62,127 | 782 | No |
| 26 | `docs/GATE3_OPERATOR_RUNBOOK.md` | docs | 0.05 MB | 56,331 | 821 | No |
| 27 | `docs/PROJECT_AUDIT.md` | docs | 0.05 MB | 48,381 | 747 | No |
| 28 | `docs/TEST_LOG.md` | docs | 0.05 MB | 47,462 | 260 | No |
| 29 | `docs/Project_File_Directory.md` | docs | 0.04 MB | 42,478 | 794 | No |
| 30 | `docs/CODEBASE.md` | docs | 0.04 MB | 41,998 | 632 | No |

---

## 3. Dependency Vulnerability Audit (`npm audit`)

| Scope | Vulnerability Count | Breakdown by Severity | Notes / Remediation Assessment |
|---|:---:|---|---|
| **Root Workspace** | **0** | 0 high, 0 moderate, 0 low | Root workspace dependencies are clean. |
| **`server/`** | **22** | 2 high, 17 moderate, 3 low | Primary high severity: `joi` email DoS and `follow-redirects` sensitiveHeaders. Moderate issues reside in dev tooling (`jest`, `nodemon`, `minimatch`). Production runtime isolated behind helmet and reverse proxy. |
| **`client/`** | **36** | 13 high, 7 moderate, 16 low | Concentrated entirely in legacy `react-scripts 5.0.1` development build pipeline (`postcss`, `serialize-javascript`, `webpack-dev-server`, `nth-check`). Build output produces static HTML/JS bundles; webpack dev server is not deployed to production. |
| **`ml-engine/` (Python)** | N/A | `pip-audit` unavailable offline | Frozen requirements in `ml-engine/requirements.txt` with exact pin versions. |

---

## 4. Secret & Credential Scan (Masked Findings)

All 1,129 tracked files were scanned against high-entropy patterns:
- **Total Pattern Matches**: 219
- **Classification**:
  - **186 Test Fixtures**: Synthetic test tokens, mock JWT secrets (`dev-internal-secret-key-medisync-2026`), and local in-memory passwords inside `server/tests/` and `client/src/__master_offline__/`.
  - **33 Documentation & Template Matches**:
    - `.env.example`: Safe placeholder templates (`mongodb+srv://<PROD_DB_USER>:<PROD_DB_PASS>@...`).
    - Operator runbooks (`docs/GATE3_OPERATOR_RUNBOOK.md`): CLI flag syntax templates with variable expansions.
    - Historical test receipts (`docs/temp/`): Ephemeral test execution logs from synthetic test runs.
- **Audit Confirmation**: **ZERO live secrets, production passwords, or real private keys exist in tracked files.**

---

## 5. TODO & FIXME Technical Debt Inventory

- **Total Tagged Lines**: 123
- **Primary Clusters**:
  - **`docs/` (52 items)**: Historical review logs and phase planning checklists marked as completed or deferred.
  - **`server/` (41 items)**: Edge-case enhancements (e.g. multi-facility inventory reconciliation, SMS gateway fallback retry queues).
  - **`client/` (22 items)**: UI polish (e.g. custom date-picker localization for older mobile Safari, table pagination jump-to-page).
  - **`ml-engine/` (8 items)**: Future research paths (e.g. continuous retraining pipelines, expanded Sri Lankan Sinhala symptom transliteration).

---

## 6. Dependency License Compliance

- **Total Unique Direct Dependencies**: 142 packages audited across root, client, and server.
- **License Distribution**:
  - MIT License: ~82%
  - Apache-2.0: ~11%
  - ISC / BSD-2-Clause / BSD-3-Clause: ~7%
- **GPL Encumbrance**: **Zero** copyleft / GPL-v3 dependencies in production bundles.
- **Medical Ontologies**:
  - CDC NAMCS survey data: US Public Domain (17 U.S.C. § 105).
  - CMS ICD-10-CM 2024 Index: US Public Domain (17 U.S.C. § 105).
  - SymCAT pipeline: MIT Licensed.
  - UMLS CUIs: Retained strictly as non-proprietary reference identifiers.
