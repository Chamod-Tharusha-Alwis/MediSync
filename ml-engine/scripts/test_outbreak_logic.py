import sys
import os

# Ensure app can be imported from ml-engine directory
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app import calculate_outbreak_metrics

def run_tests():
    print()
    print("=" * 84)
    print("      MEDISYNC WEIGHTED RISK & ANOMALY SYSTEM — MATHEMATICAL PROOF SUITE      ")
    print("=" * 84)
    print()
    
    scenarios = [
        {
            "name": "Scenario 1 (High Danger - Dengue - Early Warning)",
            "disease": "Dengue",
            "current": 15,
            "baseline": 5,
            "expected_anomaly": True,
            "expected_risk": "Low",
            "rationale": "High Danger disease exceeding strict guardrail (>10 cases) and >=150% spike threshold."
        },
        {
            "name": "Scenario 2 (Low Danger - Common Cold - Minor Spike)",
            "disease": "Common Cold",
            "current": 15,
            "baseline": 5,
            "expected_anomaly": False,
            "expected_risk": "Normal",
            "rationale": "Low Danger disease with identical 200% spike is IGNORED (preventing false alarms on minor seasonal variance)."
        },
        {
            "name": "Scenario 3 (Low Danger - Common Cold - Massive Spike)",
            "disease": "Common Cold",
            "current": 150,
            "baseline": 15,
            "expected_anomaly": True,
            "expected_risk": "Medium",
            "rationale": "Exceeds >100 case guardrail and >=800% spike threshold (900% spike), but severity is strictly capped at 'Medium' (never High)."
        },
        {
            "name": "Scenario 4 (Medium Danger - Gastroenteritis - Moderate Outbreak)",
            "disease": "Gastroenteritis",
            "current": 35,
            "baseline": 8,
            "expected_anomaly": True,
            "expected_risk": "Medium",
            "rationale": "Medium Danger disease exceeding >30 case guardrail and >=300% spike threshold (338% spike)."
        },
        {
            "name": "Scenario 5 (High Danger - Cholera - Critical Epidemic Surge)",
            "disease": "Cholera",
            "current": 80,
            "baseline": 10,
            "expected_anomaly": True,
            "expected_risk": "High",
            "rationale": "High Danger disease exceeding >=600% spike threshold (700% spike) triggers unrestricted High alert."
        },
        {
            "name": "Scenario 6 (Low Danger - Allergic Rhinitis - Extreme 2500% Surge)",
            "disease": "Allergy",
            "current": 520,
            "baseline": 20,
            "expected_anomaly": True,
            "expected_risk": "Medium",
            "rationale": "Even with an extreme 2500% spike and 520 cases, Low Danger diseases remain permanently capped at Medium risk."
        },
        {
            "name": "Scenario 7 (Boundary False-Positive Guard - High Danger at Exactly 10 Cases)",
            "disease": "Dengue",
            "current": 10,
            "baseline": 2,
            "expected_anomaly": False,
            "expected_risk": "Low",
            "rationale": "Boundary check: High Danger requires strictly >10 cases for anomaly=True; 10 cases with +400% spike stays anomaly=False."
        },
        {
            "name": "Scenario 8 (Boundary False-Negative Guard - High Danger at 11 Cases & 150% Spike)",
            "disease": "Dengue",
            "current": 11,
            "baseline": 4.4,
            "expected_anomaly": True,
            "expected_risk": "Low",
            "rationale": "Boundary check: High Danger at 11 cases (>10) and +150% spike (>=150%) triggers anomaly=True, risk='Low'."
        },
        {
            "name": "Scenario 9 (Boundary False-Positive Guard - Medium Danger at 30 Cases)",
            "disease": "Gastroenteritis",
            "current": 30,
            "baseline": 5,
            "expected_anomaly": False,
            "expected_risk": "Low",
            "rationale": "Boundary check: Medium Danger requires strictly >30 cases for anomaly=True; 30 cases with +500% spike stays anomaly=False."
        },
        {
            "name": "Scenario 10 (Boundary False-Negative Guard - Medium Danger High Escalation at >=600% Spike)",
            "disease": "Gastroenteritis",
            "current": 35,
            "baseline": 5,
            "expected_anomaly": True,
            "expected_risk": "High",
            "rationale": "Boundary check: Medium Danger at 35 cases (>30) and +600% spike (>=600%) escalates risk_level to 'High'."
        },
        {
            "name": "Scenario 11 (Boundary False-Positive Guard - Low Danger at 100 Cases / 900% Spike)",
            "disease": "Common Cold",
            "current": 100,
            "baseline": 10,
            "expected_anomaly": False,
            "expected_risk": "Low",
            "rationale": "Boundary check: Low Danger requires strictly >100 cases for anomaly=True; 100 cases stays anomaly=False."
        },
        {
            "name": "Scenario 12 (Boundary False-Positive Guard - Low Danger at 101 Cases / 790% Spike)",
            "disease": "Common Cold",
            "current": 101,
            "baseline": 11.35,
            "expected_anomaly": False,
            "expected_risk": "Low",
            "rationale": "Boundary check: Low Danger with >100 cases but +790% spike (<800%) does not trigger anomaly=True."
        }
    ]
    
    passed_count = 0
    total_count = len(scenarios)
    
    for idx, sc in enumerate(scenarios, 1):
        print(f"[{idx}/{total_count}] {sc['name']}")
        print("-" * 84)
        print(f"  * Disease / Input : {sc['disease']} | Current Cases: {sc['current']} | Baseline Avg: {sc['baseline']}/wk")
        print(f"  * Rationale       : {sc['rationale']}")
        
        # Execute outbreak metric calculation
        metrics = calculate_outbreak_metrics(sc['current'], sc['baseline'], disease=sc['disease'])
        
        anomaly = metrics['anomaly']
        risk_level = metrics['risk_level']
        spike_pct = metrics['spike_percentage']
        danger_level = metrics['danger_level']
        
        # Check assertions
        anomaly_match = (anomaly == sc['expected_anomaly'])
        risk_match = (risk_level == sc['expected_risk'])
        passed = anomaly_match and risk_match
        
        if passed:
            passed_count += 1
            status_badge = "[ PASS ]"
        else:
            status_badge = "[ FAIL ]"
            
        print(f"  * System Output   : Anomaly={anomaly} | Risk Level='{risk_level}' | Severity='{metrics['severity']}'")
        print(f"  * Resolved Danger : '{danger_level}' | Calculated Spike: +{spike_pct}%")
        print(f"  * Assertion Check : Expected Anomaly={sc['expected_anomaly']}, Risk='{sc['expected_risk']}' -> {status_badge}")
        print("-" * 84)
        print()
        
    print("=" * 84)
    print(f"SUMMARY: {passed_count}/{total_count} scenarios passed mathematical proof verification.")
    if passed_count == total_count:
        print("RESULT : SUCCESS — The Weighted Risk & Anomaly System operates perfectly according to design!")
    else:
        print("RESULT : FAILURE — One or more threshold rules diverged from expectation.")
    print("=" * 84)
    print()
    
    if passed_count != total_count:
        sys.exit(1)

if __name__ == '__main__':
    run_tests()
