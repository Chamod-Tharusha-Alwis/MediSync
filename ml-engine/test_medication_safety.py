import os
import hmac
import hashlib
import unittest
from datetime import datetime, timezone
from app import app, analyze_medication_safety_ml, NO_INTERACTION_MESSAGE_ML


class TestFlaskMedicationSafety(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        api_key = os.environ.get('INTERNAL_API_KEY', '')
        now_utc = datetime.now(timezone.utc)
        hour_str = now_utc.strftime('%Y-%m-%dT%H').encode('utf-8')
        self.token = hmac.new(api_key.encode('utf-8'), hour_str, hashlib.sha256).hexdigest()

    def test_brand_to_generic_and_retained_metadata(self):
        res = analyze_medication_safety_ml(["ALMOX DT 250 Tablet 15's", "Warfarin"])
        self.assertTrue(res["hasInteraction"])
        self.assertFalse(res["verificationIncomplete"])
        self.assertEqual(res["unresolvedIngredients"], [])
        w = res["warnings"][0]
        self.assertEqual(w["drug1"], "ALMOX DT 250 Tablet 15's")
        self.assertEqual(w["drug1Strength"], "250 mg")
        self.assertEqual(w["drug1Formulation"], "Dispersible Tablet")

    def test_multi_ingredient_and_duplicate_ingredient_detection(self):
        res = analyze_medication_safety_ml(["ALMOX DT 250 Tablet 15's", "CLAVAM Tablet 10's"])
        self.assertTrue(res["hasInteraction"])
        self.assertEqual(len(res["duplicateIngredients"]), 1)
        self.assertEqual(res["duplicateIngredients"][0]["type"], "duplicate_ingredient")
        self.assertEqual(res["duplicateIngredients"][0]["ingredient"].lower(), "amoxicillin")

    def test_salt_ester_vitamer_distinction(self):
        res = analyze_medication_safety_ml(["COBASWIFT NS Nasal Spray", "Chloramphenicol"])
        self.assertTrue(res["verificationIncomplete"])
        self.assertIn("methylcobalamin (vitamin b12)", res["unresolvedIngredients"])

    def test_substring_false_positive_prevention(self):
        res = analyze_medication_safety_ml(["Ursodeoxycholic Acid", "Cyclosporine"])
        self.assertFalse(res["hasInteraction"])
        self.assertFalse(res["verificationIncomplete"])

    def test_unmapped_and_unknown_medicines(self):
        res = analyze_medication_safety_ml(["Cognistar Injection 1'S", "Warfarin"])
        self.assertFalse(res["hasInteraction"])
        self.assertTrue(res["verificationIncomplete"])
        self.assertEqual(res["unresolvedIngredients"], ["cerebroprotein hydrolysate"])

    def test_endpoint_neutral_reference_message(self):
        resp = self.client.post(
            "/api/ml/check-interactions",
            json={"drugs": ["Paracetamol", "Amoxicillin"]},
            headers={"x-internal-key": self.token}
        )
        self.assertEqual(resp.status_code, 200)
        body = resp.get_json()
        self.assertFalse(body["hasInteraction"])
        self.assertFalse(body["verificationIncomplete"])
        self.assertEqual(body["statusMessage"], NO_INTERACTION_MESSAGE_ML)


if __name__ == "__main__":
    unittest.main()
