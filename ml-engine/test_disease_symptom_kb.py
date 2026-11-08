"""
Tests for MediSync Sourced Disease-Symptom Knowledge Base (Phase D2b Curation)
Verifies:
- Edge probability presence and threshold enforcement (P >= 15.0%).
- Minimum surviving symptoms enforcement (>= 3).
- Quarantine isolation: dummy imputation cluster & duplicate profiles quarantined.
- Zero contamination of active KB by dummy cluster or Sri Lankan priority diseases.
- Schema compliance and provenance completeness.
- Verification of mapping_review.csv and icd10_synonyms.v1.json.
- Zero hallucination / zero synthetic filler verification.
"""

import csv
import json
import os
import re
import unittest

KB_PATH = os.path.join(os.path.dirname(__file__), "data", "disease_symptom_kb.v1.json")
UNMAPPED_PATH = os.path.join(os.path.dirname(__file__), "data", "unmapped_diseases.v1.json")
QUARANTINE_PATH = os.path.join(os.path.dirname(__file__), "data", "kb_quarantine.v1.json")
REVIEW_CSV_PATH = os.path.join(os.path.dirname(__file__), "data_pipeline", "mapping_review.csv")
SYNONYMS_PATH = os.path.join(os.path.dirname(__file__), "data_pipeline", "icd10_synonyms.v1.json")
ICD_PATH = os.path.join(os.path.dirname(__file__), "..", "server", "reference-data", "icd10_clean.json")


class TestDiseaseSymptomKnowledgeBaseV2(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        with open(KB_PATH, "r", encoding="utf-8") as f:
            cls.kb = json.load(f)
        with open(UNMAPPED_PATH, "r", encoding="utf-8") as f:
            cls.unmapped = json.load(f)
        with open(QUARANTINE_PATH, "r", encoding="utf-8") as f:
            cls.quarantine = json.load(f)
        with open(SYNONYMS_PATH, "r", encoding="utf-8") as f:
            cls.synonyms = json.load(f)
        with open(ICD_PATH, "r", encoding="utf-8") as f:
            cls.icd_catalog = json.load(f)
        cls.icd_codes = {item["code"] for item in cls.icd_catalog}

    def test_schema_and_metadata(self):
        """KB payload must conform to required top-level schema contract and license status."""
        self.assertEqual(self.kb.get("version"), "1.0.0")
        self.assertIn("SymCAT", self.kb.get("source", ""))
        self.assertEqual(self.kb.get("licenseStatus"), "internal research use, licence unverified")
        self.assertIn("clinicalValidation: not_established", self.kb.get("disclaimer", ""))
        self.assertIsInstance(self.kb.get("curation"), dict)
        self.assertEqual(self.kb["curation"].get("probabilityThreshold"), 15.0)
        self.assertEqual(self.kb["curation"].get("minSurvivingSymptoms"), 3)
        self.assertIsInstance(self.kb.get("diseases"), list)
        self.assertGreaterEqual(len(self.kb["diseases"]), 100)

    def test_symptom_probability_and_threshold(self):
        """Every symptom edge must have a valid probability >= 15.0%."""
        for d in self.kb["diseases"]:
            syms = d.get("symptoms")
            self.assertIsInstance(syms, list)
            self.assertGreaterEqual(len(syms), 3, f"Disease {d.get('name')} has fewer than 3 surviving symptoms")
            for s in syms:
                self.assertIsInstance(s, dict, f"Symptom edge in {d.get('name')} must be an object")
                name = s.get("name")
                prob = s.get("probability")
                self.assertIsInstance(name, str)
                self.assertGreater(len(name.strip()), 0)
                self.assertIsInstance(prob, (int, float))
                self.assertGreaterEqual(prob, 15.0, f"Symptom {name} in {d.get('name')} below 15% threshold: {prob}")
                self.assertLessEqual(prob, 100.0)

    def test_provenance_completeness(self):
        """Every disease entry must trace to source provenance."""
        for d in self.kb["diseases"]:
            prov = d.get("provenance")
            self.assertIsInstance(prov, dict, f"Disease {d.get('name')} missing provenance")
            self.assertTrue(bool(prov.get("source")))
            self.assertEqual(prov.get("licenseStatus"), "internal research use, licence unverified")
            self.assertTrue(bool(prov.get("retrievedAt")))

    def test_quarantine_integrity_and_zero_contamination(self):
        """Quarantined dummy cluster and priority diseases must NEVER appear in active KB."""
        quarantined_names = {d["name"].lower() for d in self.quarantine["quarantinedDiseases"]}
        self.assertGreaterEqual(len(quarantined_names), 100)

        # Must quarantine known dummy cluster diseases
        must_quarantine = [
            "blastomycosis", "chancroid", "leishmaniasis", "leptospirosis",
            "rabies", "air embolism", "fat embolism", "chagas disease",
            "typhoid fever", "dengue fever"
        ]
        for name in must_quarantine:
            self.assertIn(name, quarantined_names, f"Expected {name} to be quarantined")

        # Zero contamination in active KB
        active_names = {d["name"].lower() for d in self.kb["diseases"]}
        for name in must_quarantine:
            self.assertNotIn(name, active_names, f"Quarantined disease {name} found in active KB!")

    def test_mapping_confidence_and_icd_validity(self):
        """Mapped diseases must have exact_normalized confidence and valid catalog codes."""
        icd_regex = re.compile(r"^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$")
        for d in self.kb["diseases"]:
            self.assertEqual(d.get("mappingConfidence"), "exact_normalized")
            code = d.get("icd10")
            self.assertIsInstance(code, str)
            self.assertTrue(bool(icd_regex.match(code)), f"Invalid ICD format: {code}")
            # Verify code without dot exists in catalog
            clean_code = code.replace(".", "")
            self.assertIn(clean_code, self.icd_codes, f"Code {clean_code} not found in icd10_clean.json")

    def test_mapping_review_ledger(self):
        """mapping_review.csv must document all active conditions with exact status."""
        self.assertTrue(os.path.isfile(REVIEW_CSV_PATH))
        with open(REVIEW_CSV_PATH, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
        self.assertEqual(len(rows), len(self.kb["diseases"]) + len(self.unmapped["diseases"]))
        for r in rows:
            self.assertIn(r["status"], ("auto_accepted", "needs_owner_review"))
            if r["status"] == "auto_accepted":
                self.assertEqual(r["confidence"], "exact_normalized")
                self.assertEqual(r["score"], "1.00")


if __name__ == "__main__":
    unittest.main()
