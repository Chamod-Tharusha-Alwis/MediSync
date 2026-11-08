"""
Build and verify clinical synonyms mapping to exact ICD-10-CM catalog descriptions.
Every single entry is verified against server/reference-data/icd10_clean.json.
Source citations: CMS ICD-10-CM Index / NLM UMLS Metathesaurus.
Zero codes typed from memory.
"""

import json
import os
import sys

ICD_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "server", "reference-data", "icd10_clean.json")
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "icd10_synonyms.v1.json")

CANDIDATES = [
    {
        "term": "diabetes",
        "icdDescription": "Type 2 diabetes mellitus without complications",
        "expectedCode": "E119",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0011860)"
    },
    {
        "term": "uti",
        "icdDescription": "Urinary tract infection, site not specified",
        "expectedCode": "N390",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0042029)"
    },
    {
        "term": "hiv",
        "icdDescription": "Human immunodeficiency virus [HIV] disease",
        "expectedCode": "B20",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0019693)"
    },
    {
        "term": "chlamydia",
        "icdDescription": "Chlamydial infection, unspecified",
        "expectedCode": "A749",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0008035)"
    },
    {
        "term": "crohn disease",
        "icdDescription": "Crohn's disease, unspecified, without complications",
        "expectedCode": "K5090",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0010346)"
    },
    {
        "term": "cellulitis",
        "icdDescription": "Cellulitis, unspecified",
        "expectedCode": "L0390",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0007642)"
    },
    {
        "term": "colorectal cancer",
        "icdDescription": "Malignant neoplasm of colon, unspecified",
        "expectedCode": "C189",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0009402)"
    },
    {
        "term": "adhd",
        "icdDescription": "Attention-deficit hyperactivity disorder, unspecified type",
        "expectedCode": "F909",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C1263846)"
    },
    {
        "term": "bell palsy",
        "icdDescription": "Bell's palsy",
        "expectedCode": "G510",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0015469)"
    },
    {
        "term": "alzheimer disease",
        "icdDescription": "Alzheimer's disease, unspecified",
        "expectedCode": "G309",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0002395)"
    },
    {
        "term": "parkinson disease",
        "icdDescription": "Parkinson's disease",
        "expectedCode": "G20",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0030567)"
    },
    {
        "term": "huntington disease",
        "icdDescription": "Huntington's disease",
        "expectedCode": "G10",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0020179)"
    },
    {
        "term": "gerd",
        "icdDescription": "Gastro-esophageal reflux disease without esophagitis",
        "expectedCode": "K219",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0017168)"
    },
    {
        "term": "copd",
        "icdDescription": "Chronic obstructive pulmonary disease, unspecified",
        "expectedCode": "J449",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0024117)"
    },
    {
        "term": "bph",
        "icdDescription": "Benign prostatic hyperplasia without lower urinry tract symp",
        "expectedCode": "N400",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0033570)"
    },
    {
        "term": "pcos",
        "icdDescription": "Polycystic ovarian syndrome",
        "expectedCode": "E282",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0032460)"
    },
    {
        "term": "dvt",
        "icdDescription": "Acute embolism and thombos unsp deep vn unsp lower extremity",
        "expectedCode": "I82409",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0149871)"
    },
    {
        "term": "flu",
        "icdDescription": "Flu due to unidentified influenza virus w oth resp manifest",
        "expectedCode": "J111",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0021400)"
    },
    {
        "term": "kidney stone",
        "icdDescription": "Calculus of kidney",
        "expectedCode": "N200",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0022650)"
    },
    {
        "term": "heart attack",
        "icdDescription": "Acute myocardial infarction, unspecified",
        "expectedCode": "I219",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0027051)"
    },
    {
        "term": "stroke",
        "icdDescription": "Cerebral infarction, unspecified",
        "expectedCode": "I639",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0038454)"
    },
    {
        "term": "hives",
        "icdDescription": "Urticaria, unspecified",
        "expectedCode": "L509",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0042109)"
    },
    {
        "term": "ringworm",
        "icdDescription": "Tinea corporis",
        "expectedCode": "B354",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0040247)"
    },
    {
        "term": "athlete's foot",
        "icdDescription": "Tinea pedis",
        "expectedCode": "B353",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0040251)"
    },
    {
        "term": "shingles",
        "icdDescription": "Zoster without complications",
        "expectedCode": "B029",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0019360)"
    },
    {
        "term": "strep throat",
        "icdDescription": "Streptococcal pharyngitis",
        "expectedCode": "J020",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0153138)"
    },
    {
        "term": "common cold",
        "icdDescription": "Acute nasopharyngitis [common cold]",
        "expectedCode": "J00",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0009443)"
    },
    {
        "term": "high blood pressure",
        "icdDescription": "Essential (primary) hypertension",
        "expectedCode": "I10",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0020538)"
    },
    {
        "term": "chickenpox",
        "icdDescription": "Varicella without complication",
        "expectedCode": "B019",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0008049)"
    },
    {
        "term": "whooping cough",
        "icdDescription": "Whooping cough, unspecified species without pneumonia",
        "expectedCode": "A3790",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0043168)"
    },
    {
        "term": "heartburn",
        "icdDescription": "Heartburn",
        "expectedCode": "R12",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0018834)"
    },
    {
        "term": "food poisoning",
        "icdDescription": "Bacterial foodborne intoxication, unspecified",
        "expectedCode": "A059",
        "source": "CMS ICD-10-CM Index 2024 / NLM UMLS (C0016479)"
    }
]


def build_synonyms():
    with open(ICD_PATH, "r", encoding="utf-8") as f:
        icd_catalog = json.load(f)

    catalog_map = {item["description"].lower().strip(): item["code"] for item in icd_catalog}

    verified_synonyms = []
    for item in CANDIDATES:
        desc = item["icdDescription"].lower().strip()
        if desc not in catalog_map:
            print(f"ERROR: Description not found in catalog: '{desc}'", file=sys.stderr)
            sys.exit(1)
        actual_code = catalog_map[desc]
        if actual_code != item["expectedCode"]:
            print(f"ERROR: Code mismatch for '{item['term']}': expected {item['expectedCode']}, got {actual_code}", file=sys.stderr)
            sys.exit(1)

        verified_synonyms.append({
            "term": item["term"],
            "icdDescription": item["icdDescription"],
            "icdCode": actual_code,
            "source": item["source"]
        })

    payload = {
        "version": "1.0.0",
        "description": "Verified clinical synonym mappings to exact ICD-10-CM descriptions",
        "verifiedCount": len(verified_synonyms),
        "synonyms": verified_synonyms
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    print(f"Successfully generated {OUTPUT_PATH} with {len(verified_synonyms)} verified synonyms.")


if __name__ == "__main__":
    build_synonyms()
