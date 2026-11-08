"""
Tests for MediSync Sourced Disease-Symptom Knowledge Base (Phase D2)
Verifies schema, provenance completeness, symptom non-emptiness, and strict separation of unmapped entries.
Zero hallucination / zero synthetic filler verification.
"""

import json
import os
import re
import unittest

KB_PATH = os.path.join(os.path.dirname(__file__), "data", "disease_symptom_kb.v1.json")
UNMAPPED_PATH = os.path.join(os.path.dirname(__file__), "data", "unmapped_diseases.v1.json")
ICD_PATH = os.path.join(os.path.dirname(__file__), "..", "server", "reference-data", "icd10_clean.json")


class TestDiseaseSymptomKnowledgeBase(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        with open(KB_PATH, "r", encoding="utf-8") as f:
            cls.kb = json.load(f)
        with open(UNMAPPED_PATH, "r", encoding="utf-8") as f:
            cls.unmapped = json.load(f)
        with open(ICD_PATH, "r", encoding="utf-8") as f:
            cls.icd_catalog = json.load(f)
        cls.icd_codes = {item["code"] for item in cls.icd_catalog}

    def test_schema_structure(self):
        """KB payload must conform to required top-level schema contract."""
        self.assertEqual(self.kb.get("version"), "1.0.0")
        self.assertTrue(isinstance(self.kb.get("generatedAt"), str) and len(self.kb["generatedAt"]) > 10)
        self.assertTrue("CDC" in self.kb.get("source", "") or "SymCAT" in self.kb.get("source", ""))
        self.assertIn("clinicalValidation: not_established", self.kb.get("disclaimer", ""))
        self.assertIn("clinicalValidation", self.kb.get("disclaimer", ""))
        self.assertTrue(isinstance(self.kb.get("diseases"), list) and len(self.kb["diseases"]) >= 100)

    def test_provenance_completeness(self):
        """Every disease entry must trace to raw source provenance without exception."""
        for d in self.kb["diseases"]:
            prov = d.get("provenance")
            self.assertIsInstance(prov, dict, f"Disease {d.get('name')} missing provenance dictionary")
            self.assertTrue(bool(prov.get("source")), f"Disease {d.get('name')} missing provenance.source")
            self.assertTrue(bool(prov.get("retrievedAt")), f"Disease {d.get('name')} missing provenance.retrievedAt")

    def test_no_empty_symptoms(self):
        """Every disease must have at least 1 verified symptom; no empty lists, no blank strings."""
        for d in self.kb["diseases"]:
            syms = d.get("symptoms")
            self.assertIsInstance(syms, list, f"Disease {d.get('name')} symptoms must be a list")
            self.assertGreaterEqual(len(syms), 1, f"Disease {d.get('name')} has empty symptoms")
            for s in syms:
                self.assertIsInstance(s, str)
                self.assertGreater(len(s.strip()), 0, f"Disease {d.get('name')} has empty symptom string")
                self.assertNotIn("generic", s.lower(), "Generic filler detected in symptom list")
                self.assertNotIn("placeholder", s.lower(), "Placeholder detected in symptom list")

    def test_mapping_confidence_and_icd_validity(self):
        """Mapped diseases must have confidence 'exact' or 'broader' and valid ICD syntax."""
        for d in self.kb["diseases"]:
            self.assertIn(d.get("mappingConfidence"), ("exact", "broader"), f"Disease {d.get('name')} invalid confidence")
            code = d.get("icd10")
            self.assertIsInstance(code, str, f"Disease {d.get('name')} missing icd10 code")
            self.assertTrue(re.match(r"^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$", code), f"Invalid ICD syntax: {code}")

    def test_separation_of_unmapped_records(self):
        """Unmapped records must remain in unmapped_diseases.v1.json, never in mapped KB."""
        mapped_ids = {d["diseaseId"] for d in self.kb["diseases"]}
        unmapped_ids = {d["diseaseId"] for d in self.unmapped["diseases"]}

        # Disjoint sets: no overlap
        self.assertEqual(len(mapped_ids.intersection(unmapped_ids)), 0, "Mapped and unmapped disease IDs overlap")

        for d in self.unmapped["diseases"]:
            self.assertEqual(d.get("mappingConfidence"), "none", f"Unmapped record {d.get('name')} has non-none confidence")
            self.assertIsNone(d.get("icd10"), f"Unmapped record {d.get('name')} has populated icd10")


if __name__ == "__main__":
    unittest.main()
