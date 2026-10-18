# MediSync — Safe Localhost Development Guide

**Target Environment:** Localhost (In-Memory Standalone Mock)  
**Host URL:** `http://127.0.0.1:3100`  
**API Endpoint:** `http://127.0.0.1:5100`  
**Database:** None (Zero live database, zero Atlas, zero port 27017)  
**External Services:** Disabled (Zero egress to SMS, email, Cloudinary)  

---

## 1. Quick Start

From the MediSync repository root:

```powershell
npm start
```

This single command automatically:
1. Validates loopback ports `3100` and `5100`.
2. Launches the standalone in-memory mock API server on `127.0.0.1:5100`.
3. Launches the React frontend on `127.0.0.1:3100` with API proxying to `127.0.0.1:5100`.
4. Waits for health checks before reporting readiness.
5. Provides a clean terminal display with demo access links.

To stop both services cleanly, press `Ctrl+C` in the terminal. All child processes and ports are terminated immediately without leaving orphaned processes.

---

## 2. Available NPM Commands

| Command | Purpose |
|:---|:---|
| `npm start` | Launches safe localhost development environment (frontend + mock API). |
| `npm run start:mock` | Explicit alias for `npm start`. |
| `npm run test:offline` | Runs all 244 approved offline regression tests (unit, governance, ML, clinical). |
| `npm run build` | Compiles optimized production frontend bundle (`CI=true`). |

---

## 3. Five-Role Synthetic Demo Accounts

All credentials use synthetic in-memory test profiles:

| Role | Synthetic Username / Email | Identifier / Credential | Password | Mock Capabilities |
|:---|:---|:---|:---|:---|
| **Administrator** | `sarah.jenkins@medisync.local` | Super Admin (`u_admin_01`) | *Any text* | Metrics, user governance table, audit logs. |
| **Doctor** | `kasun.fernando@hospital.lk` | SLMC: `DOC-SLMC-49281` | *Any text* | Consultations, patient OTP lookup, active Rx. |
| **Patient** | `chamara.silva@example.com` | NIC: `199012345671` | *Any text* | Medical timeline, prescriptions, allergy profile. |
| **Pharmacist** | `priyanka@pharmacy.lk` | Pharmacy: Colombo Central | *Any text* | Dispense queue, ML district restock demand. |
| **Hospital Admin**| `admin@cgh.medisync.local` | Colombo General Hospital | *Any text* | Bed capacity, ward telemetry, doctor roster. |

---

## 4. Security Invariants
- `npm start` **NEVER** connects to MongoDB Atlas, production database `test`, or workstation port `27017`.
- Production credentials in `server/.env` are scrubbed before child processes launch.
- Real Atlas QA testing (E1/E2/E3) remains an explicitly gated process requiring separate operator authorization.
