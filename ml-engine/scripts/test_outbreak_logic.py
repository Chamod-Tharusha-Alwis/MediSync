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
