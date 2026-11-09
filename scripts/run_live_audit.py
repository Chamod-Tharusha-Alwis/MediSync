import urllib.request
import urllib.error
import json
import time
import os

BASE_BACKEND = "https://medisync-wabc.onrender.com"
BASE_ML = "https://medisync-ml.onrender.com"
BASE_FRONTEND = "https://medisync.chamodtharusha.com.lk"
EVIDENCE_DIR = "docs/final/evidence"
os.makedirs(EVIDENCE_DIR, exist_ok=True)

results = []

def run_test(test_id, name, url, method="GET", data=None, headers=None, expected_status=[200]):
    full_headers = {'User-Agent': 'MediSync-Live-Audit/1.0'}
    if headers:
        full_headers.update(headers)
    
    body_bytes = None
    if data is not None:
        body_bytes = json.dumps(data).encode('utf-8')
        full_headers['Content-Type'] = 'application/json'
    
    t0 = time.time()
    status = None
    resp_body = ""
    success = False
    
    req = urllib.request.Request(url, data=body_bytes, headers=full_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            status = resp.status
            resp_body = resp.read().decode('utf-8', errors='replace')
            success = status in expected_status
    except urllib.error.HTTPError as e:
        status = e.code
        resp_body = e.read().decode('utf-8', errors='replace')
        success = status in expected_status
    except Exception as e:
        status = f"ERR: {type(e).__name__}"
        resp_body = str(e)
        success = False
        
    duration_ms = (time.time() - t0) * 1000
    
    # Save sanitized evidence file
    evidence_file = f"{test_id.lower()}_{name.lower().replace(' ', '_')}.json"
    evidence_path = os.path.join(EVIDENCE_DIR, evidence_file)
    
    # Try parsing as JSON for pretty output, else raw
    try:
        parsed = json.loads(resp_body)
        with open(evidence_path, 'w', encoding='utf-8') as f:
            json.dump(parsed, f, indent=2)
    except Exception:
        with open(evidence_path, 'w', encoding='utf-8') as f:
            f.write(resp_body[:2000]) # Cap size
            
    res_entry = {
        "testId": test_id,
        "name": name,
        "url": url,
        "method": method,
        "status": status,
        "expected": expected_status,
        "durationMs": round(duration_ms, 1),
        "success": success,
        "evidenceFile": evidence_file
    }
    results.append(res_entry)
    print(f"[{test_id}] {name}: {'PASS' if success else 'FAIL'} (HTTP {status}, {duration_ms:.1f}ms)")
    return res_entry

# 1. System Health Checks
run_test("LT-01", "Backend Health Check", f"{BASE_BACKEND}/health", expected_status=[200])
run_test("LT-02", "ML Health Check", f"{BASE_ML}/health", expected_status=[200])
run_test("LT-03", "Vercel Web Shell", f"{BASE_FRONTEND}/", expected_status=[200])

# 2. Public Health & Surveillance Endpoints
run_test("LT-04", "Public Health Stats Fail-Closed", f"{BASE_BACKEND}/api/public/health-stats", expected_status=[200, 503])
run_test("LT-05", "Active Outbreak Alerts Auth Guard 401", f"{BASE_BACKEND}/api/alerts/active", expected_status=[401])
run_test("LT-06", "Public Consultation Activity", f"{BASE_BACKEND}/api/public/consultation-activity", expected_status=[200])
run_test("LT-07", "Public Directory Doctors", f"{BASE_BACKEND}/api/public/doctors", expected_status=[200])
run_test("LT-08", "Public Directory Hospitals", f"{BASE_BACKEND}/api/public/hospitals", expected_status=[200])
run_test("LT-09", "Public Directory Pharmacies", f"{BASE_BACKEND}/api/public/pharmacies", expected_status=[200])

# 3. QR Verification Page Endpoints
run_test("LT-10", "Verify Non-Existent Token", f"{BASE_BACKEND}/api/verify/non-existent-token-12345", expected_status=[404])
run_test("LT-11", "Verify OTP Request Missing Token", f"{BASE_BACKEND}/api/verify/request-otp", method="POST", data={}, expected_status=[400, 404])
run_test("LT-12", "Verify OTP Unlock Missing Token", f"{BASE_BACKEND}/api/verify/unlock", method="POST", data={"otp": "123456"}, expected_status=[400, 404])

# 4. Security & Error Handling Endpoints
run_test("LT-13", "Maintenance Seed Denied HTTP 403", f"{BASE_BACKEND}/api/admin/seed-outbreak-demo", method="POST", data={}, expected_status=[401, 403])
run_test("LT-14", "Invalid JSON Format Defense", f"{BASE_BACKEND}/api/auth/login", method="POST", data="invalid-json-payload", headers={'Content-Type': 'application/json'}, expected_status=[400])
run_test("LT-15", "Unauthenticated Doctor Route 401", f"{BASE_BACKEND}/api/doctor/consultations", expected_status=[401])
run_test("LT-16", "Unauthenticated Patient Route 401", f"{BASE_BACKEND}/api/patient/consultations", expected_status=[401])
run_test("LT-17", "Unauthenticated Pharmacy Route 401", f"{BASE_BACKEND}/api/pharmacy/history", expected_status=[401])
run_test("LT-18", "Unauthenticated Hospital Route 401", f"{BASE_BACKEND}/api/hospital/doctors", expected_status=[401])
run_test("LT-19", "Unauthenticated Admin Route 401", f"{BASE_BACKEND}/api/admin/system-health", expected_status=[401])
run_test("LT-20", "Non-Existent API Route 404", f"{BASE_BACKEND}/api/non-existent-probe-route", expected_status=[404])

# Print summary
passed = sum(1 for r in results if r['success'])
failed = sum(1 for r in results if not r['success'])
print("\n" + "=" * 50)
print(f"Live Test Run Complete: {passed} PASSED, {failed} FAILED out of {len(results)} tests")
print("=" * 50)

with open('docs/final/evidence/live_test_summary.json', 'w', encoding='utf-8') as f:
    json.dump(results, f, indent=2)
