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
while ! curl -s http://localhost:5001/health > /dev/null; do
  sleep 1
done
echo "Flask server is ready!"

echo ""
echo "------------------------------------------------"
echo "TEST 1: OTP Rate Limiting Rejection (429)"
echo "------------------------------------------------"
# Generate OTP request first
curl -s -X POST http://localhost:5000/api/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "sysadmin@medisync.com", "purpose": "password-reset"}' > /dev/null

# Attempt 6 incorrect OTPs
for i in {1..5}; do
  curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:5000/api/auth/reset-password \
    -H "Content-Type: application/json" \
    -d '{"email": "sysadmin@medisync.com", "otp": "000000", "newPassword": "Password123!"}'
done
echo ""

# The 6th attempt should be blocked with 429
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:5000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"email": "sysadmin@medisync.com", "otp": "000000", "newPassword": "Password123!"}')

if [ "$STATUS" -eq 429 ]; then
  echo "✅ PASS: OTP Rate Limiter successfully rejected request with 429."
else
  echo "❌ FAIL: OTP Rate Limiter returned $STATUS instead of 429."
  exit 1
fi

echo ""
echo "------------------------------------------------"
echo "TEST 2: ML-Engine HMAC Verification (403)"
echo "------------------------------------------------"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:5001/predict \
  -H "Content-Type: application/json" \
  -d '{"symptoms": ["headache"]}')

if [ "$STATUS" -eq 403 ]; then
  echo "✅ PASS: Flask ML Engine strictly enforcing HMAC with 403 Forbidden."
else
  echo "❌ FAIL: Flask ML Engine returned $STATUS instead of 403."
  exit 1
fi
# Kill the background Node server from Test 1 so port 5000 is completely free
killall node || true
sleep 2 # Give the OS a moment to fully release the port

# ... [Your existing Test 3 code continues here] ...

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
