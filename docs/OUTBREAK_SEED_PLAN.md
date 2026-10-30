# MediSync Phase 6 — Synthetic Outbreak Surveillance Seed Plan

**Batch Identifier**: `PHASE6_SYNTHETIC_V1`  
**Target Collection**: `outbreakalerts` in `medisync_prod`  
**Execution Mode**: Additive, Idempotent, Isolated Teardown Script  
**Approval State**: Pending Operator Confirmation (`apply`)

---

## 1. Objectives & Boundaries

1. **Exact 2-2-2 Tier Distribution**:
   - 2 HIGH severity alert scenarios.
   - 2 MEDIUM severity alert scenarios (persisted as Mongoose schema enum `Moderate`).
   - 2 LOW severity alert scenarios.
2. **Strict Identity Isolation**:
   - Zero patient names, NICs, phone numbers, or emails generated or stored.
   - Zero real public health entity attributions (no false claims of Ministry of Health authorship).
   - Zero automated notification egress (no emails, SMS, or public webhooks dispatched).
3. **Traceability & Teardown**:
   - Every document is marked with `syntheticSeedBatch: 'PHASE6_SYNTHETIC_V1'`.
   - Every document carries `syntheticLabel: 'SYNTHETIC EPIDEMIOLOGICAL SIMULATION — FOR SYSTEM TESTING ONLY'`.
   - An isolated teardown script (`scripts/remove_synthetic_outbreaks.js`) targets strictly `syntheticSeedBatch: 'PHASE6_SYNTHETIC_V1'`.

---

## 2. Approved 6-Scenario Specification

| # | Scenario ID | Disease Name | ICD-10 | Sri Lankan District | Baseline | Current Cases | Spike % | Persisted Severity | Display Severity | Danger Level | Priority |
|---|-------------|--------------|--------|---------------------|----------|---------------|---------|-------------------|------------------|--------------|----------|
| 1 | `SIM-HIGH-DENGUE-COLOMBO` | Dengue Fever | `A90` | Colombo | 25 | 142 | +468% | `High` | High | `High` | `P1-Immediate` |
| 2 | `SIM-HIGH-LEPTO-GAMPAHA` | Leptospirosis | `A27.9` | Gampaha | 8 | 45 | +462% | `High` | High | `High` | `P1-Immediate` |
| 3 | `SIM-MED-HEPATITIS-KANDY` | Viral Hepatitis | `B19.9` | Kandy | 12 | 38 | +216% | `Moderate` | Medium | `Medium` | `P2-Urgent` |
| 4 | `SIM-MED-CHICKENPOX-GALLE` | Chickenpox | `B01.9` | Galle | 10 | 29 | +190% | `Moderate` | Medium | `Medium` | `P3-Moderate` |
| 5 | `SIM-LOW-FLU-RATNAPURA` | Seasonal Influenza | `J10.1` | Ratnapura | 15 | 24 | +60% | `Low` | Low | `Low` | `P4-Routine` |
| 6 | `SIM-LOW-MUMPS-MATARA` | Mumps | `B26.9` | Matara | 5 | 8 | +60% | `Low` | Low | `Low` | `P4-Routine` |

---

## 3. Schema & Persistence Contract

```javascript
{
  surveillancePolicy: '5w-verified-episodes-v1',
  disease: String,
  location: String, // District
  affectedCount: Number,
  severity: 'Low' | 'Moderate' | 'High',
  dangerLevel: 'Low' | 'Medium' | 'High',
  riskLevel: 'Low' | 'Medium' | 'High',
  responsePriority: String,
  status: 'Active',
  emailScope: 'none',
  feedbackStatus: 'unverified',
  message: String,
  syntheticSeedBatch: 'PHASE6_SYNTHETIC_V1',
  syntheticLabel: 'SYNTHETIC EPIDEMIOLOGICAL SIMULATION — FOR SYSTEM TESTING ONLY',
  publicAuthorityNotice: 'ACADEMIC SYNTHETIC PREVIEW ONLY — NOT AN OFFICIAL PUBLIC HEALTH NOTICE',
  isSimulation: false, // Ensures visibility in standard authenticated administrative alert monitors
  createdAt: ISODate,
  updatedAt: ISODate
}
```

---

## 4. Teardown Procedure

The teardown script (`scripts/remove_synthetic_outbreaks.js`) executes an exact filter:
```javascript
await db.collection('outbreakalerts').deleteMany({
  syntheticSeedBatch: 'PHASE6_SYNTHETIC_V1'
});
```
This guarantees zero unintended impact on real or historical epidemiological records.
