# MediSync Read-Only Dependency Audit Report

**Date**: 2026-11-11  
**Scope**: Server (`server/`), Client (`client/`), ML Engine (`ml-engine/`)  
**Mode**: Read-only scan (no packages or dependencies were modified or upgraded).

---

## 1. Server Dependencies (`npm audit --prefix server`)

- **Total Vulnerabilities**: 22
  - **Low**: 3
  - **Moderate**: 17
  - **High**: 2
  - **Critical**: 0

### Key Advisory Breakdown

1. **`cross-spawn` (6.0.5 - 7.0.4)**
   - Severity: High
   - Advisory: Regular Expression Denial of Service (ReDoS) / Command Injection on Windows
   - Path: `nodemon > chokidar > fsevents > node-pre-gyp > rimraf > glob > minimatch` / direct dependencies
   - Author assessment: Build/dev tooling only; not exposed in production runtime endpoints.

2. **`cookie` (<0.7.0)**
   - Severity: Low
   - Advisory: Out of bounds read / unhandled characters in cookie parser
   - Path: `express > cookie`

3. **`path-to-regexp` (<0.1.10, <1.9.0, <6.3.0)**
   - Severity: High
   - Advisory: Regular Expression Denial of Service (ReDoS) in route parameter parser
   - Path: `express > path-to-regexp`
   - Author assessment: Express is a production runtime dependency. Reachability and patched versions require individual verification.

4. **`braces` / `micromatch`**
   - Severity: Moderate
   - Advisory: ReDoS in pattern matching
   - Path: `nodemon > chokidar > anymatch > micromatch > braces`
   - Author assessment: Development watcher only.

---

## 2. Client Dependencies (`npm audit --prefix client`)

- **Total Vulnerabilities**: 36
  - **Low**: 16
  - **Moderate**: 7
  - **High**: 13
  - **Critical**: 0

### Key Advisory Breakdown

1. **`react-scripts` / `webpack-dev-server` / `nth-check` / `postcss` / `loader-utils`**
   - Severity: High / Moderate
   - Advisory: Development server prototype pollution, CSS parsing ReDoS, webpack dev middleware issues.
   - Author assessment: Legacy `react-scripts 5.0.1` transitive build graph. Production build produces static HTML/JS bundles that do not include webpack-dev-server.

2. **`axios` (0.27.2)**
   - Severity: Moderate / High (SSRF / CSRF handling in certain node configurations)
   - Author assessment: Running in browser client environment; browser enforces SOP/CORS.

---

## 3. ML Engine Python Dependencies (`pip-audit`)

- **Status**: `pip-audit` package is not installed in the local python virtual environment (`ml-engine/.venv`).
- **Runtime Environment**: Python 3.12 / 3.13 venv with pinned packages in `ml-engine/requirements.txt`.
- **Findings**:
  - Key libraries (`flask`, `joblib`, `numpy`, `scikit-learn`, `cryptography`) are pinned.
  - Additional observation from the Codex review. `ml-engine/app.py` accepts the current and previous UTC hour for internal HMAC authentication. F10 concerns startup DDL.

---

## 4. Policy Recommendation

Per release constraints, zero breaking dependency upgrades are performed during security remediation to prevent breaking change cascades in protected production flows. A dedicated dependency modernization sprint should follow the release.
