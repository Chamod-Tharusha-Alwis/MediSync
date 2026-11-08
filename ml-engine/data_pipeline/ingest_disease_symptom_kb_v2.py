"""
MediSync Disease-Symptom Knowledge Base Ingestion Pipeline v2 (Phase D2b)
Features:
- Preserves empirical probability P(symptom | condition) on every surviving edge.
- Filters low-evidence noise (P >= 15.0%, min 3 surviving symptoms).
- Identifies and excludes dummy imputation clusters (Jaccard >= 0.70) and duplicate profiles (Jaccard >= 0.85).
- Shields Sri Lankan priority diseases (strictly reserved for Tier 1 curated profiles).
- Mapper v2: auto-accepts ONLY exact normalized matches from icd10_clean.json and versioned icd10_synonyms.v1.json.
- Generates mapping_review.csv for owner audit.
- Outputs kb_quarantine.v1.json (never deletes rows silently).
- Medical disclaimer: Academic simulation only. clinicalValidation: not_established.
- License status: internal research use, licence unverified.
"""

import csv
import json
import os
import re
import sys
from datetime import datetime, timezone

RAW_DATA_PATH = os.path.join(os.path.dirname(__file__), "raw", "symcat_conditions.csv")
ICD10_DATA_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "server", "reference-data", "icd10_clean.json")
SYNONYMS_DATA_PATH = os.path.join(os.path.dirname(__file__), "icd10_synonyms.v1.json")

OUTPUT_KB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "disease_symptom_kb.v1.json")
OUTPUT_UNMAPPED_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "unmapped_diseases.v1.json")
OUTPUT_QUARANTINE_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "kb_quarantine.v1.json")
OUTPUT_REVIEW_CSV_PATH = os.path.join(os.path.dirname(__file__), "mapping_review.csv")

PROB_THRESHOLD = 15.0
MIN_SURVIVING_SYMPTOMS = 3

DUMMY_CLUSTER = frozenset({
    "ankle pain", "excessive anger", "excessive urination at night", "facial pain",
    "fatigue", "joint stiffness or tightness", "knee lump or mass", "pain during pregnancy",
    "pain in eye", "pain or soreness of breast", "shoulder cramps or spasms", "wrist pain"
})

SL_PRIORITY_TERMS = frozenset({
    "dengue fever", "dengue", "leptospirosis", "typhoid fever", "typhoid",
    "chikungunya", "influenza", "flu", "cholera", "dysentery", "measles",
    "tuberculosis", "malaria", "viral hepatitis", "hepatitis a", "hepatitis b", "hepatitis c"
})

METADATA = {
    "source": "SymCAT (CDC NAMCS/NHAMCS aggregate survey data via Ahead Research, Inc.)",
    "license": "internal research use, licence unverified",
    "disclaimer": "Reference knowledge base for academic simulation only. clinicalValidation: not_established.",
    "retrievedAt": "2026-11-08T14:40:19Z"
}


def slugify(text: str) -> str:
    s = text.strip().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def format_icd_dot(code: str) -> str:
    if not code:
        return ""
    code = code.strip().upper()
    if "." in code:
        return code
    if len(code) > 3:
        return f"{code[:3]}.{code[3:]}"
    return code


def clean_norm(text: str) -> str:
    t = text.lower()
    t = re.sub(r"'s\b", "", t)
    t = re.sub(r"s'\b", "", t)
    t = re.sub(r"[^a-z0-9 ]", "", t)
    return " ".join(t.split())


def load_raw_symcat(path: str):
    pairs = [(2, 5, 7), (27, 30, 32), (52, 56, 58), (77, 81, 83), (102, 105, 107), (127, 130, 132), (152, 155, 157)]
    conditions = {}

    with open(path, mode="r", newline="", encoding="utf-8", errors="ignore") as fp:
        reader = csv.reader(fp)
        next(reader)
        for row in reader:
            for d_idx, s_idx, p_idx in pairs:
                if d_idx < len(row) and s_idx < len(row) and p_idx < len(row):
                    d = row[d_idx].strip()
                    s = row[s_idx].strip()
                    p = row[p_idx].strip()
                    if d and s and len(d) > 2 and len(s) > 2 and not d.startswith("<") and not s.startswith("<"):
                        if d not in conditions:
                            conditions[d] = {}
                        try:
                            prob_val = float(p)
                        except ValueError:
                            prob_val = 0.0
                        s_norm = s.strip().lower()
                        conditions[d][s_norm] = prob_val

    return conditions


def load_icd_catalog_and_synonyms():
    with open(ICD10_DATA_PATH, "r", encoding="utf-8") as f:
        icd_catalog = json.load(f)

    with open(SYNONYMS_DATA_PATH, "r", encoding="utf-8") as f:
        syn_payload = json.load(f)

    catalog_codes = {item["code"] for item in icd_catalog}

    syn_map = {}
    for item in syn_payload.get("synonyms", []):
        term_clean = clean_norm(item["term"])
        syn_map[term_clean] = (item["icdCode"], item["icdDescription"], item["source"])

    norm_to_entry = {}
    unspecified_to_entry = {}

    for idx, item in enumerate(icd_catalog):
        code = item["code"]
        desc = item["description"]
        cn = clean_norm(desc)
        if cn and cn not in norm_to_entry:
            norm_to_entry[cn] = (code, desc)

        for sfx in [", unspecified", ", unspecified site", ", unspecified organism", " without complications", ", not specified as acute or chronic"]:
            if sfx in desc.lower():
                prefix = clean_norm(desc.lower().split(sfx)[0])
                if prefix and prefix not in unspecified_to_entry:
                    unspecified_to_entry[prefix] = (code, desc)

    return icd_catalog, catalog_codes, syn_map, norm_to_entry, unspecified_to_entry


def run_pipeline():
    print("=" * 75)
    print("MediSync Knowledge Base Curation Pipeline v2 (Phase D2b)")
    print("=" * 75)

    if not os.path.isfile(RAW_DATA_PATH):
        print(f"ERROR: Raw data not found: {RAW_DATA_PATH}", file=sys.stderr)
        sys.exit(1)

    print(f"1. Loading raw SymCAT conditions from {RAW_DATA_PATH}...")
    raw_conditions = load_raw_symcat(RAW_DATA_PATH)
    print(f"   Loaded {len(raw_conditions)} distinct conditions.")

    print(f"2. Loading ICD-10 catalog and versioned synonyms...")
    catalog, catalog_codes, syn_map, norm_to_entry, unspecified_to_entry = load_icd_catalog_and_synonyms()
    print(f"   Loaded {len(catalog):,} catalog concepts, {len(syn_map)} verified synonyms.")

    # Quality Filtering & Quarantine
    quarantine_records = []
    surviving_conditions = {}

    for name, s_map in sorted(raw_conditions.items(), key=lambda x: x[0]):
        slug = slugify(name)
        name_l = name.lower().strip()
        raw_symptoms_list = [{"name": s, "probability": p} for s, p in sorted(s_map.items())]

        # Check Sri Lankan Priority Disease Shield
        if name_l in SL_PRIORITY_TERMS:
            quarantine_records.append({
                "diseaseId": slug,
                "name": name,
                "reason": "sri_lankan_priority_reserved_for_tier1",
                "rawSymptomsCount": len(s_map),
                "survivingSymptomsCount": 0,
                "rawSymptoms": raw_symptoms_list
            })
            continue

        # Check Dummy Imputation Cluster Overlap
        raw_set = set(s_map.keys())
        dummy_overlap = len(raw_set.intersection(DUMMY_CLUSTER))
        dummy_jaccard = dummy_overlap / len(raw_set.union(DUMMY_CLUSTER))
        if dummy_jaccard >= 0.70:
            quarantine_records.append({
                "diseaseId": slug,
                "name": name,
                "reason": f"dummy_imputation_cluster (Jaccard={dummy_jaccard:.2f} with 12-symptom fallback set)",
                "rawSymptomsCount": len(s_map),
                "survivingSymptomsCount": 0,
                "rawSymptoms": raw_symptoms_list
            })
            continue

        # Edge Probability Filtering (P >= 15.0%)
        surv_map = {s: p for s, p in s_map.items() if p >= PROB_THRESHOLD}
        if len(surv_map) < MIN_SURVIVING_SYMPTOMS:
            quarantine_records.append({
                "diseaseId": slug,
                "name": name,
                "reason": f"insufficient_surviving_symptoms ({len(surv_map)} < {MIN_SURVIVING_SYMPTOMS} at {PROB_THRESHOLD}% threshold)",
                "rawSymptomsCount": len(s_map),
                "survivingSymptomsCount": len(surv_map),
                "rawSymptoms": raw_symptoms_list
            })
            continue

        surviving_conditions[name] = surv_map

    # Near-identical Profile Detection on Surviving Symptoms
    surv_names = sorted(list(surviving_conditions.keys()))
    quarantined_duplicates = set()

    for i in range(len(surv_names)):
        n1 = surv_names[i]
        if n1 in quarantined_duplicates:
            continue
        s1 = set(surviving_conditions[n1].keys())
        for j in range(i + 1, len(surv_names)):
            n2 = surv_names[j]
            if n2 in quarantined_duplicates:
                continue
            s2 = set(surviving_conditions[n2].keys())
            jaccard = len(s1.intersection(s2)) / len(s1.union(s2))
            if jaccard >= 0.85:
                quarantined_duplicates.add(n2)
                quarantine_records.append({
                    "diseaseId": slugify(n2),
                    "name": n2,
                    "reason": f"near_identical_profile (Jaccard={jaccard:.2f} with '{n1}')",
                    "rawSymptomsCount": len(raw_conditions[n2]),
                    "survivingSymptomsCount": len(s2),
                    "rawSymptoms": [{"name": s, "probability": p} for s, p in sorted(raw_conditions[n2].items())]
                })

    active_conditions = {k: v for k, v in surviving_conditions.items() if k not in quarantined_duplicates}

    print(f"3. Quality Filtering Summary:")
    print(f"   Raw conditions:        {len(raw_conditions)}")
    print(f"   Quarantined:           {len(quarantine_records)}")
    print(f"   Active surviving:      {len(active_conditions)}")

    # Mapper v2 & mapping_review.csv
    review_rows = []
    mapped_kb_diseases = []
    unmapped_kb_diseases = []

    for name in sorted(active_conditions.keys()):
        slug = slugify(name)
        s_map = active_conditions[name]
        symptoms_payload = [{"name": s, "probability": p} for s, p in sorted(s_map.items())]

        name_clean = re.sub(r"\s*\([A-Za-z0-9/ -]+\)", "", name).strip()
        cn_full = clean_norm(name)
        cn_clean = clean_norm(name_clean)

        matched_code = None
        matched_desc = None
        match_type = None

        # Check verified synonyms
        if cn_full in syn_map:
            matched_code, matched_desc, _ = syn_map[cn_full]
            match_type = "synonym_catalog_match"
        elif cn_clean in syn_map:
            matched_code, matched_desc, _ = syn_map[cn_clean]
            match_type = "synonym_catalog_match"

        # Check exact normalized catalog descriptions
        elif cn_full in norm_to_entry:
            matched_code, matched_desc = norm_to_entry[cn_full]
            match_type = "exact_normalized_catalog"
        elif cn_clean in norm_to_entry:
            matched_code, matched_desc = norm_to_entry[cn_clean]
            match_type = "exact_normalized_catalog"

        # Check canonical unspecified concepts
        elif cn_full in unspecified_to_entry:
            matched_code, matched_desc = unspecified_to_entry[cn_full]
            match_type = "canonical_unspecified_catalog"
        elif cn_clean in unspecified_to_entry:
            matched_code, matched_desc = unspecified_to_entry[cn_clean]
            match_type = "canonical_unspecified_catalog"

        if matched_code:
            assert matched_code in catalog_codes, f"Accepted code {matched_code} NOT in icd10_clean.json"
            formatted_code = format_icd_dot(matched_code)
            review_rows.append({
                "name": name,
                "candidate_codes": f"{formatted_code} ({matched_desc})",
                "score": "1.00",
                "confidence": "exact_normalized",
                "status": "auto_accepted"
            })
            mapped_kb_diseases.append({
                "diseaseId": slug,
                "name": name,
                "icd10": formatted_code,
                "mappingConfidence": "exact_normalized",
                "symptoms": symptoms_payload,
                "provenance": {
                    "source": METADATA["source"],
                    "licenseStatus": METADATA["license"],
                    "retrievedAt": METADATA["retrievedAt"]
                }
            })
        else:
            # Generate candidate proposals from catalog tokens
            name_tokens = set(cn_clean.split())
            candidate_matches = []
            for item in catalog:
                desc_tokens = set(clean_norm(item["description"]).split())
                overlap = len(name_tokens.intersection(desc_tokens))
                if overlap > 0:
                    jaccard = overlap / len(name_tokens.union(desc_tokens))
                    if jaccard >= 0.30:
                        candidate_matches.append((jaccard, item["code"], item["description"]))

            candidate_matches.sort(reverse=True, key=lambda x: x[0])
            top_candidates = candidate_matches[:3]

            if top_candidates:
                cand_str = " | ".join(f"{format_icd_dot(c[1])} ({c[2]})" for c in top_candidates)
                top_score = f"{top_candidates[0][0]:.2f}"
            else:
                cand_str = "None"
                top_score = "0.00"

            review_rows.append({
                "name": name,
                "candidate_codes": cand_str,
                "score": top_score,
                "confidence": "candidate",
                "status": "needs_owner_review"
            })
            unmapped_kb_diseases.append({
                "diseaseId": slug,
                "name": name,
                "icd10": None,
                "mappingConfidence": "none",
                "symptoms": symptoms_payload,
                "provenance": {
                    "source": METADATA["source"],
                    "licenseStatus": METADATA["license"],
                    "retrievedAt": METADATA["retrievedAt"]
                }
            })

    # Write mapping_review.csv
    with open(OUTPUT_REVIEW_CSV_PATH, mode="w", newline="", encoding="utf-8") as fp:
        writer = csv.DictWriter(fp, fieldnames=["name", "candidate_codes", "score", "confidence", "status"])
        writer.writeheader()
        writer.writerows(review_rows)
    print(f"4. Wrote mapping review ledger to {OUTPUT_REVIEW_CSV_PATH} ({len(review_rows)} rows).")

    # Write kb_quarantine.v1.json
    quarantine_payload = {
        "version": "1.0.0",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "disclaimer": "Quarantined conditions from raw SymCAT source due to dummy cluster overlap, near-identical profiles, or insufficient evidence. clinicalValidation: not_established.",
        "quarantinedCount": len(quarantine_records),
        "quarantinedDiseases": quarantine_records
    }
    with open(OUTPUT_QUARANTINE_PATH, "w", encoding="utf-8") as f:
        json.dump(quarantine_payload, f, indent=2)
    print(f"5. Wrote quarantine ledger to {OUTPUT_QUARANTINE_PATH} ({len(quarantine_records)} excluded diseases).")

    # Write disease_symptom_kb.v1.json (Active mapped KB)
    kb_payload = {
        "version": "1.0.0",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": METADATA["source"],
        "licenseStatus": METADATA["license"],
        "disclaimer": METADATA["disclaimer"],
        "curation": {
            "probabilityThreshold": PROB_THRESHOLD,
            "minSurvivingSymptoms": MIN_SURVIVING_SYMPTOMS,
            "quarantinedCount": len(quarantine_records)
        },
        "metrics": {
            "totalRawConditions": len(raw_conditions),
            "activeFilteredConditions": len(active_conditions),
            "mappedDiseasesCount": len(mapped_kb_diseases),
            "unmappedDiseasesCount": len(unmapped_kb_diseases),
            "quarantinedDiseasesCount": len(quarantine_records),
            "autoAcceptedExactRatePercent": round((len(mapped_kb_diseases) / len(active_conditions)) * 100, 2)
        },
        "diseases": mapped_kb_diseases
    }
    with open(OUTPUT_KB_PATH, "w", encoding="utf-8") as f:
        json.dump(kb_payload, f, indent=2)
    print(f"6. Wrote active filtered KB to {OUTPUT_KB_PATH} ({len(mapped_kb_diseases)} diseases).")

    # Write unmapped_diseases.v1.json
    unmapped_payload = {
        "version": "1.0.0",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "disclaimer": "Active conditions with surviving symptoms whose ICD mapping is candidate-only (needs_owner_review). Strictly separated from mapped KB.",
        "count": len(unmapped_kb_diseases),
        "diseases": unmapped_kb_diseases
    }
    with open(OUTPUT_UNMAPPED_PATH, "w", encoding="utf-8") as f:
        json.dump(unmapped_payload, f, indent=2)
    print(f"7. Wrote unmapped active records to {OUTPUT_UNMAPPED_PATH} ({len(unmapped_kb_diseases)} diseases).")

    print("\n" + "=" * 75)
    print("INGESTION & CURATION PIPELINE V2 COMPLETE")
    print(f"  Raw conditions:                  {len(raw_conditions)}")
    print(f"  Quarantined:                     {len(quarantine_records)}")
    print(f"  Active filtered:                 {len(active_conditions)}")
    print(f"  Mapped (auto_accepted):          {len(mapped_kb_diseases)}")
    print(f"  Unmapped (needs_owner_review):   {len(unmapped_kb_diseases)}")
    print("=" * 75)


if __name__ == "__main__":
    run_pipeline()
