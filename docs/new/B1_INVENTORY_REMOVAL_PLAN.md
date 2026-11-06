# MediSync Stage B2 — Inventory Removal & Admin Redesign Plan (U9–U16)

**Date:** 2026-11-06  
**Repository:** `medisync`  
**Branch:** `stage-b1/fixes`  
**Status:** PROPOSED ARCHITECTURAL PLAN (Read-Only Blueprint for Stage B2)

---

## 1. Executive Summary & Purpose

In the original MediSync design, pharmacies maintained a local real-time inventory of medications with automated stock decrements upon dispensing, local restock prediction models, and inventory item IDs. In practice, clinical pharmacies in Sri Lanka utilize dedicated ERP/dispensary management software; MediSync's clinical role is verification of digital prescriptions, patient consent, dispensing audit records, and national epidemiological surveillance.

Stage B2 removes the medication inventory subsystem entirely (U10) and replaces it with pure dispensing audit trails, district health demand analytics, and streamlined administrative workflows (U9, U11–U16).

---

## 2. Comprehensive Inventory Touchpoint Catalog

### 2.1 Backend Models
1. **`server/src/models/Pharmacy.js:38-60`**
   - Schema field: `inventory: [{ drugName, stock, unit, reorderLevel, expiryDate, batchNumber, ... }]`
   - Target action: Remove schema array, or convert to a deprecated virtual / backward-compatibility shim if legacy tests require it.
2. **`server/src/models/Dispensing.js:35-48`**
   - Schema field: `items[{ inventoryItemId, drugName, quantityDispensed, substitutionFlag, ... }]`
   - Target action: Remove `inventoryItemId`. Dispensing records only require `drugName`, `genericName`, `dosage`, `quantityDispensed`, `substitutionFlag`, and `status`.

### 2.2 Backend Controllers & Routes
1. **`server/src/controllers/pharmacyController.js`**
   - Methods to remove:
     - `getInventory`
     - `updateInventoryItem`
     - `predictRestock` (calls ML engine for inventory forecasting)
     - `getDistrictRestockAlerts`
     - `getRestockAnalytics`
   - Methods to update:
     - `dispenseMedication`: Remove inventory lookup, stock availability validation, and stock decrements. Retain digital signature, pharmacist verification, and audit trail.
2. **`server/src/routes/pharmacyRoutes.js`**
   - Endpoints to remove:
     - `GET /api/pharmacy/inventory`
     - `POST /api/pharmacy/inventory`
     - `PUT /api/pharmacy/inventory/:id`
     - `GET /api/pharmacy/predict-restock`
     - `GET /api/pharmacy/restock-alerts`
     - `GET /api/pharmacy/analytics/restock`
3. **`server/src/services/dispensingService.js`**
   - Remove stock deduction transaction: `Pharmacy.updateOne({ _id: pharmacyId, 'inventory._id': itemId }, { $inc: { 'inventory.$.stock': -qty } })`.

### 2.3 Frontend Components & Pages
1. **`client/src/pages/pharmacy/Dashboard.jsx`**
   - Navigation: Remove `Inventory` and `Restock Predictions` nav items.
   - Modals: Remove `<SelectInventoryModal>` and manual inventory adjustment forms.
   - Views: Replace restock tab with District Demand view (U11).
2. **`client/src/pages/Home.jsx` & `client/src/pages/dev/StyleGuide.jsx`**
   - Remove marketing and style guide references to "Real-time Pharmacy Inventory Management".

### 2.4 Localization (i18n)
- **Files:** `client/src/i18n/translations/en.js`, `si.js`, `ta.js`
- **Keys to audit and remove:**
  - `pharmacy.inventory.*` (`currentStock`, `reorderThreshold`, `outOfStockAlert`, `batchExpiry`, `updateStock`)
  - `pharmacy.restock.*` (`mlPredictionTitle`, `recommendedOrderQty`)

---

## 3. Clinical Acceptance & Protected Hash Dependencies

### 3.1 Critical Finding: `ir04BackendIntegration.test.js` is Pinned
`server/tests/ir04BackendIntegration.test.js` is **File 6** in `docs/release/PROTECTED_HASHES.json` (`sha256: adc80b885a2fb468d3fca90a5181290838298c32bc8508a30e1d187cf20a9ffc`).

It contains hardcoded inventory assertions:
- **Line 252:** `ownedActors.pharmacy = await qa.clone(Pharmacy, { regNo: 'PH-DEMO-001' }, { adminId: undefined, inventory: [] });`
- **Line 266:** `ownedActors.pharmacy.inventory = [{ drugName: 'Paracetamol 500mg', stock: 200, unit: 'tablets', reorderLevel: 50 }];`
- **Line 1329:** `expect(pharmacyAfter.inventory[0].stock).toBe(195);`
- **Line 1344:** `expect((await Pharmacy.findById(ownedActors.pharmacy._id)).inventory[0].stock).toBe(195);`
- **Line 1432 & 1466:** `test('10.2 Pharmacy Admin manages pharmacy profile, staff lifecycle, and inventory' ... .get('/api/pharmacy/inventory'))`

### 3.2 Strategy to Handle the Protected Boundary
- **Option A (Backward-Compatibility Shim — Recommended for Safe Staging):**
  - Keep a lightweight `inventory` field on `Pharmacy` schema that defaults to `[]`.
  - In `dispenseMedication`, if `pharmacy.inventory` contains the drug, decrement it in-memory/save so legacy test 8.1 assertions pass.
  - Keep `GET /api/pharmacy/inventory` returning `{ inventory: pharmacy.inventory || [] }`.
  - Strip inventory from all UI pages, client components, and user-facing routes.
- **Option B (Full Cut & Re-Pin — Operator Release Step):**
  - Remove inventory code completely.
  - Update `ir04BackendIntegration.test.js` to remove inventory test 10.2 and stock assertions.
  - Re-compute SHA-256 and update `docs/release/PROTECTED_HASHES.json` with operator explicit signoff.

---

## 4. Itemized Redesign Specifications

### 4.1 U9 — Group Prescriptions by Consultation
- **Current problem:** Every medication is displayed as a standalone, disconnected card on the pharmacist dashboard.
- **Proposed architecture:**
  - Introduce `<PrescriptionConsultationGroup>` component.
  - Query aggregation: Group active prescriptions by `consultationId`.
  - Header: Consultation Reference (`REF-YYYYMMDD-XXXX`), Prescribing Doctor Name, Hospital/Clinic, Date.
  - Content: Table of ordered drugs (Drug name, strength, frequency, duration, substitution permitted indicator, dispensing status badge).
  - Group actions: "Dispense All Prescribed" or individual item checkoffs.
  - OTC / Walk-in: Dedicated separate section below consultation orders.

### 4.2 U10 — Remove Medication Inventory Entirely
- Dispensing becomes a pure audit record:
  ```json
  {
    "prescriptionId": "ObjectId",
    "consultationId": "ObjectId",
    "pharmacyId": "ObjectId",
    "staffId": "ObjectId",
    "patientNic": "999912345678",
    "items": [
      {
        "drugName": "Amoxicillin 500mg",
        "quantityDispensed": 21,
        "substitutionFlag": false,
        "dispensedAt": "2026-11-06T10:00:00Z"
      }
    ],
    "notes": "Completed full antibiotic course instructions"
  }
  ```

### 4.3 U11 — Pharmacy Restock → District Demand Page
- Replaces `/pharmacy/dashboard/restock`.
- **Top Section (Epidemiological Context):**
  - Displays top disease burdens for the pharmacy's district (e.g. Dengue, Viral Flu, URTI) derived from seeded consultation data.
  - District names formatted with standard Title Case (per U19).
- **Bottom Section (Most Dispensed Medications):**
  - Ranked table of most frequently dispensed medications in that district over the last 30 days.
  - Metric: Total quantity dispensed across all district pharmacies.
  - Empty state: Clean fallback when no data exists.

### 4.4 U12 — Pharmacy Analytics: Time-Range Sold Medications
- Replaces legacy restock analytics with dispensing volume analytics.
- **Selector Buttons:** `[ 24h | 48h | 72h | 7d | 14d | 30d | Month | Custom ]`.
  *(Note: Operator specified "23h" in notes, standardized to standard 24h rolling window; Stated assumption).*
- **Aggregations:**
  - Group `Dispensing` records matching `pharmacyId` and `createdAt >= windowStart`.
  - Sum `items.quantityDispensed` per `items.drugName`.
  - Display bar chart (top 10 medications) and sortable summary table.
  - Enforce `Asia/Colombo` timezone for calendar month and custom date ranges.

### 4.5 U13 — Admin Users: Unified List & Role Filter
- Eliminates confusing tab toggle between "Users" and "Hospitals".
- Single unified table:
  - Columns: Name, Role Badge, Status (Active/Banned/Pending), Last Login (Sri Lanka Time), Actions.
  - Filter dropdown: `All Roles`, `System Admin`, `Doctor`, `Patient`, `Hospital`, `Pharmacy Admin`, `Pharmacist`.
  - Search bar: Full-text search over Name, Email, Registration Number.

### 4.6 U14 — Admin Identity Page → User Detail Slide-Over
- Deprecate standalone `/admin/dashboard/identity` page.
- Add redirect: `GET /admin/dashboard/identity` -> `/admin/dashboard/users`.
- Clicking any row in the U13 user table opens a modern slide-over drawer (`<UserDetailPanel>`):
  - **Tab 1: Overview** (Name, role, verified status, contact details).
  - **Tab 2: Sessions** (Active tokens, masked IP, parsed hardware model).
  - **Tab 3: Trusted Devices** (Device fingerprints, trusted dates, revoke button).
  - **Tab 4: Security Events** (Recent audit logs relating to this user ID).
  - **Tab 5: Recovery** (Active password reset / recovery token status).

### 4.7 U15 — Remove Admin ML Alerts Page
- Currently `/admin/dashboard/alerts` duplicates the Outbreak Surveillance monitor.
- Action: Delete `Alerts.jsx` page component and nav entry.
- Route redirect: `GET /admin/dashboard/alerts` -> `/admin/dashboard/outbreak`.

### 4.8 U16 — Admin Overview: Real Health Checks & Transparent Stats
- Health status card currently says "Not verified".
- Implementation:
  - Add backend route `GET /api/admin/system-health` cached in Redis/memory for 60 seconds.
  - Checks:
    1. MongoDB: `mongoose.connection.readyState === 1`
    2. Redis: `redisClient.ping()`
    3. Email (Resend): Verification that `RESEND_API_KEY` is present and non-empty.
    4. ML Engine: `GET http://127.0.0.1:5001/health` with 5s timeout.
- Statistical transparency:
  - Add info tooltip or chip to fulfilment counts: *"Includes seeded demonstration records. Active registered patients: N"*. Prevents misleading audit evaluators.

---

## 5. Recommended Execution Sequence for Stage B2

```
Step 1: U10 Backend Compatibility Shim
  └── Keep Pharmacy.inventory in schema (default []), provide graceful empty returns.
Step 2: U9 Prescription Consultation Grouping
  └── Client component <PrescriptionConsultationGroup> + pharmacy controller grouping.
Step 3: U11 & U12 District Health Demand & Dispensing Analytics
  └── Aggregations from Dispensing collection + replacement of restock pages.
Step 4: U13 & U14 Admin Users & Slide-Over Drawer
  └── Unified table with role filter + <UserDetailPanel> slide-over.
Step 5: U15 Remove ML Alerts Page & Add Redirect
  └── Clean removal of unused view + redirect to /admin/dashboard/outbreak.
Step 6: U16 Real Admin Health Checks
  └── 60s-cached health check endpoint + stats labeling.
Step 7: Final Inventory Cleanup & Ledger Re-Pin (Coordinated with Operator)
  └── Update ir04BackendIntegration.test.js & PROTECTED_HASHES.json.
```
