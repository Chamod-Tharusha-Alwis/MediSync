#!/bin/bash
set -e

echo "Starting MediSync Security Hardening Tests..."

# Wait for Node server to be ready
echo "Waiting for Node server on port 5000..."
while ! curl -s http://localhost:5000/api/health > /dev/null; do
  sleep 1
done
echo "Node server is ready!"

# Wait for Flask server to be ready
echo "Waiting for Flask ML Engine on port 5001..."
while ! curl -s http://localhost:5001/model-status > /dev/null; do
  sleep 1
done
echo "Flask server is ready!"

echo "------------------------------------------------"
echo "TEST 1: OTP Rate Limiting Rejection (429)"
echo "------------------------------------------------"
# 1. Log in as Admin to grab JWT token
RESPONSE=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "superadmin@medisync.com", "password": "SecureCiAdminPassword2026!"}')

TOKEN=$(echo $RESPONSE | node -e "const data = JSON.parse(require('fs').readFileSync(0)); console.log(data?.data?.accessToken || '');")

if [ -z "$TOKEN" ]; then
  echo "❌ FAIL: Login failed! Response was: $RESPONSE"
  exit 1
fi

# 2. Generate OTP request (now it will succeed and create an OTPSession)
curl -s -X POST http://localhost:5000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "superadmin@medisync.com", "purpose": "password-reset"}' > /dev/null

# 3. Attempt 6 incorrect OTPs
RATE_LIMITED=false
for i in {1..6}; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:5000/api/auth/reset-password \
    -H "Content-Type: application/json" \
    -d '{"email": "superadmin@medisync.com", "otp": "000000", "newPassword": "Password123!"}')
  
  echo -n "$CODE"
  
  if [ "$CODE" == "429" ]; then
    RATE_LIMITED=true
    break
  fi
done

if [ "$RATE_LIMITED" == true ]; then
  echo -e "\n✅ PASS: OTP Rate Limiter successfully rejected request with 429."
else
  echo -e "\n❌ FAIL: OTP Rate Limiter did not return 429. Last code: $CODE"
  exit 1
fi

echo ""
echo "------------------------------------------------"
echo "TEST 2: ML-Engine HMAC Verification (403)"
echo "------------------------------------------------"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:5001/api/ml/predict-disease \
  -H "Content-Type: application/json" \
  -d '{"symptoms": ["headache"]}')

if [ "$STATUS" -eq 403 ]; then
  echo "✅ PASS: Flask ML Engine strictly enforcing HMAC with 403 Forbidden."
else
  echo "❌ FAIL: Flask ML Engine returned $STATUS instead of 403."
  exit 1
fi
echo "Executing Test 3: Verifying Vault Fail-Closed behavior..."

# FIX: Safely kill ONLY the process listening on port 5000
npx kill-port 5000 || true
sleep 2

echo ""
echo "------------------------------------------------"
echo "TEST 3: Vault Fail-Closed Assertion"
echo "------------------------------------------------"
echo "Starting Node.js without VAULT_TOKEN..."

# Attempt to run app.js directly, which should crash
set +e
VAULT_TOKEN="" node src/app.js > vault_test.log 2>&1
EXIT_CODE=$?
set -e

if [ $EXIT_CODE -ne 0 ]; then
  echo "✅ PASS: Node Server gracefully failed-closed (Exit Code $EXIT_CODE) without VAULT_TOKEN."
else
  echo "❌ FAIL: Node Server started without VAULT_TOKEN!"
  exit 1
fi

echo ""
echo "🎉 All Security Hardening CI tests passed successfully!"
