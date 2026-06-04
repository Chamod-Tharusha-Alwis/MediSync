# MediSync Security & Performance Bug Report

**Date of Scan:** 2026-06-04
**Scanner:** Lead QA & Security Engineer
**Scope:** Client, Server, ML Engine Codebases
**Status:** All Security and Performance Issues Successfully Patched

The following table details the bugs, performance bottlenecks, and security leaks discovered during static analysis of the MediSync codebase and how they were resolved.

| ID | Severity | Location (File/Line) | Description | Recommended Fix | Status & Resolution Details |
|---|---|---|---|---|---|
| **SEC-01** | Critical | `server/src/routes/labRoutes.js` | **Missing RBAC:** The route `router.get('/public/migrate-nic', migrateNic);` was exposed publicly without any authentication or authorization (`protect`) middleware, allowing unauthenticated database load. | Apply `protect(['admin', 'super_admin'])` middleware or remove the route entirely if migration is complete. | **Fixed:** The route has been completely removed from `labRoutes.js` as the migration is complete. |
| **SEC-02** | Critical | `server/src/app.js` | **Hardcoded Vault Secret:** The Vault root token was hardcoded as `token: 'myroot'` instead of using an environment variable fallback, exposing the master secret. | Update to `token: process.env.VAULT_TOKEN` and ensure the token is provided securely at runtime. | **Fixed:** Updated to `token: process.env.VAULT_TOKEN` with a startup validation check that crashes the process if `VAULT_TOKEN` is missing. |
| **SEC-03** | High | `server/src/utils/internalAuth.js` | **Hardcoded API Key Fallback:** A hardcoded internal API key fallback (`medisync-internal-secret-2024`) was provided, allowing attackers to bypass internal key rotation auth. | Remove the fallback string. Throw a fatal startup error if `process.env.INTERNAL_API_KEY` is not explicitly defined. | **Fixed:** Hardcoded secret fallback removed. The application now throws a fatal error if `INTERNAL_API_KEY` is undefined. |
| **SEC-04** | High | `server/scripts/setupAdmin.js`<br>`server/src/utils/seedAdmin.js` | **Exposed Admin Credentials:** Hardcoded fallback admin password (`'Admin123!'`) used during initialization and seeding scripts. | Remove hardcoded passwords. Require the password to be passed strictly via environment variables or secure terminal input. | **Fixed:** Hardcoded fallback passwords removed. Seeding requires `ADMIN_PASSWORD` env variable, and `setupAdmin.js` requires password argument from process arguments. |
| **PERF-01** | Medium | `server/src/controllers/publicController.js` | **N+1 Query Bottleneck:** The `getDoctors` function used a `Promise.all(doctors.map(...))` loop to execute rating queries for every individual doctor, degrading performance linearly. | Execute a single aggregated query for all returned doctor IDs (`$in: doctorIds`) before the loop, and construct an in-memory map. | **Fixed:** Refactored to aggregate all ratings using an `$in` query beforehand, building an in-memory lookup map. |
| **PERF-02** | Medium | `server/src/controllers/drugController.js` | **N+1 Query Bottleneck:** The `checkInteraction` function looped through the incoming `drugs` array and executed `await Drug.findOne(...)` for each drug individually. | Extract all unique drug names from the request, perform a single `Drug.find(...)` query, and resolve names using a lookup map. | **Fixed:** Batch querying is now used with `$in` to resolve all drug generics at once, utilizing a pre-mapped dictionary lookup. |

---

*Note: No `useEffect` memory leaks were found in the current React components. All `useEffect` hooks relying on asynchronous fetch functions correctly utilize `useCallback` to memoize the function reference, which complies with React 18 ESLint exhaustive-deps rules.*
