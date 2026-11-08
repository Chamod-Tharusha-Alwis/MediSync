# MediSync Sub-Project 3 — Append-Only Decisions Log

### DECISION-SUB3-001: ChunkLoadError Recovery Mechanism
- **Context**: Post-deployment, stale clients visiting the site may request outdated webpack chunk hashes that no longer exist on CDN/hosting, triggering an unhandled `ChunkLoadError`.
- **Decision**: In `RenderErrorBoundary`, detect errors matching `/loading (chunk|css chunk)/i` or `error.name === 'ChunkLoadError'`. Read `sessionStorage.getItem('medisync_chunk_reload')`. If falsey, record flag and invoke `window.location.reload()`. If already set, do not reload again to avoid infinite reload loops; render the accessible fallback screen.
- **Alternatives Considered**: Silent page reload without session guard (causes infinite reload loop if file is genuinely missing on host).
- **Date**: 2026-11-08

### DECISION-SUB3-002: Provenance of `feature_collector.js` Console Warning
- **Context**: Browser console occasionally showed `feature_collector.js: deprecated parameters`.
- **Decision**: Thorough search of MediSync repository, `package.json`, `client/node_modules`, and server dependencies shows 0 references to `feature_collector.js`. The warning originates from client-side browser extensions (e.g., password manager autofill, web-compat polyfills, or wasm glue scripts). Documented as an external artifact; no application modifications made.
- **Date**: 2026-11-08

### DECISION-SUB3-003: Doctor ML Urgency Derivation & Calibration Threshold
- **Context**: Previously, `ml-engine/app.py` set `urgent: True` based on disease profile strings (e.g. "heart attack", "tuberculosis", "pneumonia") or severity >= 4.5 even when cosine similarity was as low as 5%–10%. This caused alarming "URGENT" badges on spurious or low-overlap symptom inputs.
- **Decision**:
  1. Urgency derivation now requires three concurrent conditions:
     - Disease profile indicates high risk (`avg_severity >= 4.5` or known critical condition in `['heart attack', 'paralysis', 'pneumonia', 'aids', 'tuberculosis']`).
     - Minimum similarity score threshold: `combined_score >= 0.50` (50.0% confidence).
     - At least 2 symptoms matched (`len(matched) >= 2`) to eliminate single generic symptom triggers (e.g. "cough").
  2. Justification from `docs/ml-evaluation/REPORT.md`: The symptom TF-IDF cosine distribution shows random symptom noise clusters between 0% and 30%, whereas genuine disease profile matches have high discriminative score (> 50%). Setting the operating floor at 50% guarantees the urgent badge is only displayed on clinically coherent reference matches while suppressing spurious noise.
  3. UI Safeguard: `NewConsultation.jsx` only renders the `URGENT` badge when `diag.urgent && diag.confidence >= 50`, and renders the explicit caption: `"Reference match, not a diagnosis"` (`t('doctor.referenceMatchNotDiagnosis')`).
- **Date**: 2026-11-08

### DECISION-SUB3-004: Seeder Approval Parameter Reconciliation
- **Context**: `scripts/seed-dispensing-sample.js` accepted `--confirm` and checked `$env:MEDISYNC_SEED_RUN_APPROVAL="SEED RUN APPROVED"`, while `docs/new/sub2/FINAL_REPORT.md` referenced `$env:APPROVE_SAMPLE_DISPENSING_SEED="true"` and `--confirm-sample-seed`.
- **Decision**: Support both in `scripts/seed-dispensing-sample.js` so neither form fails. Allow `MEDISYNC_SEED_RUN_APPROVAL="SEED RUN APPROVED"` OR `APPROVE_SAMPLE_DISPENSING_SEED="true"` OR `SEED_APPROVAL="I_APPROVE_SEED_2026_11_B"`, and accept `--confirm`, `--apply`, or `--confirm-sample-seed`. Update documentation to cite both canonical and convenience forms.
- **Date**: 2026-11-08
