# Snippet index

Commit for every snippet: `f5337833cf1bc79c0a4d0f06b3ea01cc292e086f` (`main`, 17 Nov 2026).

- Lines are copied exactly by `report-evidence/scripts/snippets.cjs`, at most 25 lines each.
- Omitted lines are shown as `// ...` (JavaScript) or `# ...` (Python, where `//` would be invalid).
- The PNG of each snippet is `report-evidence/screenshots/code/<ID>.png`.
- The HTML used to render it is `report-evidence/screenshots/code/html/<ID>.html`.
- **Report section:** I don't have your report's numbering, so these are suggestions. Replace them with your
  real section numbers.

| ID | Title | File : lines | Report section (suggested) | Viva topic |
|---|---|---|---|---|
| S1 | Outbreak detector core (floor N≥5, z-score, 2-day persistence) | `server/src/services/surveillanceService.js` : 440, 466-471, 478, 482-491 | 6.2.1 Outbreak detection, implementation | Code, Justification |
| S2 | 72-hour projection (last value + 10th-90th percentile = 80% range) | `server/src/services/alertProjection72h.js` : 23-24, 48-57, 78, 85 | 6.2.2 72-hour projection | Code, Justification |
| S3 | Trend projection with prediction interval (OLS, client) | `client/src/utils/outbreakForecasting.js` : 301-302, 305-316, 384, 392-397 | 6.2.3 Trend projection | Code |
| S4 | Scan → alert record (deterministic id, Pending, severity) | `server/src/services/surveillanceService.js` : 110-114, 132-140, 150-151, 157-159 | 6.2.4 Alert creation and approval workflow | Workflow |
| S5 | Alert email: kill switch, allowlist, daily cap | `server/src/services/outbreakDetailedDelivery.js` : 55, 64-85 | 6.2.5 Alert notification | Workflow, Validation |
| S6 | Authentication: bcrypt 12, 5-attempt lockout, JWT 15 min / 7 days | `server/src/utils/passwordUtils.js` : 55-56; `server/src/security/passwordAttemptPolicy.js` : 2, 21-22; `server/src/controllers/authController.js` : 336, 351-357, 493-495 | 6.3.1 Security: authentication | Authentication |
| S7 | Authorization: role check + patient consent | `server/src/middleware/auth.js` : 8, 17-23, 43-46; `server/src/middleware/patientConsent.js` : 1-9 | 6.3.2 Security: authorization and consent | Authorization |
| S8 | Validation: prescription duration rule + route | `server/src/utils/prescriptionDuration.js` : 3-8, 13-21; `server/src/routes/doctorRoutes.js` : 11 | 6.3.3 Data validation | Validation |
| S9 | Idempotent dispense in one transaction | `server/src/services/dispensingService.js` : 44, 48, 116, 125-132, 137, 190-193, 216 | 6.4 Pharmacy dispensing (data integrity) | Code, Optimization |
| S10 | Symptom matcher, TF-IDF + cosine (sub-module) | `ml-engine/app.py` : 377-380, 561-564 | 6.5 Sub-modules: symptom matcher | Code, Justification |

Notes:

- **S3:** the product's trend projection is plain JavaScript OLS. statsmodels is used only in the offline
  study (SARIMA and ETS in `ml-engine/evaluation/study/forecast_benchmark.py`). See DISCREPANCY D-6 in
  `02_outbreak_ml.md`.
- **S6:** no age-based password expiry exists. Only temporary passwords must be changed on first login
  (`mustChangePassword`). The 5 attempts / 900 s lockout is the password-login rule. The OTP rule (5 attempts,
  15 min, 60 s cooldown) is separate, in `server/src/config/redis.js:314-337`.
- **S8:** no Joi schema exists (see `03_validation.md`), so S8 shows a hand-written validator, which is what
  the code actually uses.
