# What the MediSync evaluation does NOT establish

MediSync's analytical components (symptom suggestions, the medicine interaction checker, the outbreak detector and the trend projection) have been tested only offline, on public data. The results are in [AI_EVALUATION.md](AI_EVALUATION.md). This page lists what that work does not show.

**Clinical validation: not established.**

## Not established

- **No real patients.** Every test used public, non-patient data: LLM-rewritten symptom descriptions (gretelai/symptom_to_diagnosis), synthetic patients (DDXPlus), statements in US FDA drug labels, and public national dengue case counts (OpenDengue). No patient record, consultation or prescription from MediSync or any health service was used.
- **No clinician review.** No doctor, pharmacist or epidemiologist has reviewed the suggestions, warnings, alerts or projections, or judged whether they would help or harm care.
- **No ethics approval.** No ethics committee or institutional review board has reviewed or approved any study involving MediSync, because no study with people has been done.
- **No prospective study.** All testing is retrospective and offline. MediSync has not been used in a clinic and followed up to see what happens to patients.
- **No regulatory assessment.** MediSync has not been assessed by the National Medicines Regulatory Authority (NMRA) of Sri Lanka or any other regulator, and it is not approved or certified as a medical device or clinical decision support system.

## What the benchmarks do show, and their limits

- They show how often the software agrees with dataset labels, label statements and a pre-written outbreak definition, with intervals and simple baselines.
- They do not show accuracy for real patients, safety, effect on outcomes, or fitness for clinical use.
- Several results are weak. On one dataset the symptom engine does worse than random guessing, and the trend projection is less accurate than repeating last week's count. A known defect (the symptom vectorizer keeps stop words) is documented and not fixed, because the fix is in a protected file.
- Data licences: all datasets used carry a published licence (Apache-2.0, CC BY 4.0, CC0 1.0). The licences of the data MediSync's own profiles and medicine catalogue were built from are not verified.

## Before any clinical use, at minimum

1. Fix and re-test the documented engine defects.
2. Obtain ethics approval for a study with real, consented patient data.
3. Have clinicians review outputs against real cases, prospectively.
4. Obtain a regulatory assessment.

Last verified: 2026-11-18 at commit f5337833. Location and internal links only; the content is a dated record and was not re-checked against the code (current documents are listed in docs/INDEX.md).
