const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Color formatting utilities for console
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m'
};

const print = (color, text) => console.log(`${color}${text}${colors.reset}`);

// Target URL of the ML engine
const ML_ENGINE_URL = process.env.ML_ENGINE_URL || 'http://127.0.0.1:5001';

// Shared secret key for internal service authentication
const getSecretKey = () => {
  return process.env.INTERNAL_API_KEY || 'medisync-internal-secret-2024';
};

// Generates the HMAC authentication token using the current UTC hour
const generateToken = () => {
  const secret = getSecretKey();
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hour = String(now.getUTCHours()).padStart(2, '0');
  const hourStr = `${year}-${month}-${day}T${hour}`;

  return crypto
    .createHmac('sha256', secret)
    .update(hourStr)
    .digest('hex');
};

async function runTests() {
  print(colors.magenta, '\n==================================================');
  print(colors.magenta, '   🧪 ML ENGINE AUTOMATED HEALTH CHECK SCRIPT   ');
  print(colors.magenta, '==================================================\n');

  print(colors.cyan, `Using ML Engine Endpoint: ${ML_ENGINE_URL}`);
  print(colors.cyan, `Using Internal Secret Key: ${getSecretKey().substring(0, 5)}... [REDACTED]\n`);

  let passed = 0;
  let total = 4;

  // ---------------------------------------------------------------------------
  // TEST 1: Unauthorized Access Block
  // ---------------------------------------------------------------------------
  try {
    print(colors.yellow, 'Running Test 1: Unauthorized Access Block...');
    await axios.post(`${ML_ENGINE_URL}/api/ml/predict-disease`, {
      symptoms: ['Fever', 'Cough']
    });
    print(colors.red, '❌ Test 1 Failed: The request succeeded but should have been blocked (403).');
  } catch (err) {
    if (err.response && err.response.status === 403) {
      print(colors.green, '✅ Test 1 Passed: Unauthorized request was blocked with 403 Forbidden.');
      passed++;
    } else {
      print(colors.red, `❌ Test 1 Failed: Expected 403 Forbidden, got: ${err.response ? err.response.status : err.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Valid Disease Prediction
  // ---------------------------------------------------------------------------
  try {
    print(colors.yellow, '\nRunning Test 2: Valid Disease Prediction...');
    const token = generateToken();
    const res = await axios.post(`${ML_ENGINE_URL}/api/ml/predict-disease`, {
      symptoms: ['Fever', 'Cough', 'Fatigue']
    }, {
      headers: {
        'x-internal-key': token
      }
    });

    if (res.status === 200 && res.data && Array.isArray(res.data.predictions)) {
      print(colors.green, '✅ Test 2 Passed: Valid disease predictions returned successfully.');
      console.log('   Predictions:', JSON.stringify(res.data.predictions));
      passed++;
    } else {
      print(colors.red, `❌ Test 2 Failed: Unexpected response layout. Status: ${res.status}`);
    }
  } catch (err) {
    print(colors.red, `❌ Test 2 Failed: Error during valid prediction request: ${err.message}`);
    if (err.response) {
      console.log('   Response body:', err.response.data);
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Graceful Error Handling (Gibberish)
  // ---------------------------------------------------------------------------
  try {
    print(colors.yellow, '\nRunning Test 3: Graceful Error Handling (Gibberish)...');
    const token = generateToken();
    const res = await axios.post(`${ML_ENGINE_URL}/api/ml/predict-disease`, {
      symptoms: ['ththt', 'drgdr']
    }, {
      headers: {
        'x-internal-key': token
      }
    });

    if (res.status === 200 && res.data && Array.isArray(res.data.predictions)) {
      print(colors.green, '✅ Test 3 Passed: Gibberish input handled gracefully without 500 error.');
      console.log('   Response data:', JSON.stringify(res.data));
      passed++;
    } else {
      print(colors.red, `❌ Test 3 Failed: Unexpected response layout. Status: ${res.status}`);
    }
  } catch (err) {
    print(colors.red, `❌ Test 3 Failed: ML Engine crashed or failed with error: ${err.message}`);
    if (err.response) {
      console.log('   Response body:', err.response.data);
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 4: PDF Security Endpoints
  // ---------------------------------------------------------------------------
  try {
    print(colors.yellow, '\nRunning Test 4: PDF Security Endpoints...');
    const token = generateToken();

    // Verify /lab/encrypt-pdf exists and blocks unauthorized
    let encryptProtected = false;
    try {
      await axios.post(`${ML_ENGINE_URL}/lab/encrypt-pdf`, {});
    } catch (err) {
      if (err.response && err.response.status === 403) {
        encryptProtected = true;
      }
    }

    // Verify /lab/decrypt-pdf exists and blocks unauthorized
    let decryptProtected = false;
    try {
      await axios.post(`${ML_ENGINE_URL}/lab/decrypt-pdf`, {});
    } catch (err) {
      if (err.response && err.response.status === 403) {
        decryptProtected = true;
      }
    }

    // Verify route exists and returns 400 Bad Request (since body is empty but auth passed)
    let encryptRouteExists = false;
    try {
      await axios.post(`${ML_ENGINE_URL}/lab/encrypt-pdf`, {}, {
        headers: { 'x-internal-key': token }
      });
    } catch (err) {
      if (err.response && err.response.status === 400) {
        encryptRouteExists = true;
      }
    }

    let decryptRouteExists = false;
    try {
      await axios.post(`${ML_ENGINE_URL}/lab/decrypt-pdf`, {}, {
        headers: { 'x-internal-key': token }
      });
    } catch (err) {
      if (err.response && err.response.status === 400) {
        decryptRouteExists = true;
      }
    }

    if (encryptProtected && decryptProtected && encryptRouteExists && decryptRouteExists) {
      print(colors.green, '✅ Test 4 Passed: PDF security endpoints exist, are protected, and behave correctly.');
      passed++;
    } else {
      print(colors.red, `❌ Test 4 Failed: encryptProtected=${encryptProtected}, decryptProtected=${decryptProtected}, encryptRouteExists=${encryptRouteExists}, decryptRouteExists=${decryptRouteExists}`);
    }
  } catch (err) {
    print(colors.red, `❌ Test 4 Failed: Error verifying PDF endpoints: ${err.message}`);
  }

  print(colors.magenta, '\n==================================================');
  if (passed === total) {
    print(colors.green, `🎉 ALL ${passed}/${total} TESTS PASSED SUCCESSFULLY!`);
  } else {
    print(colors.red, `⚠️ Health Check Failed: Passed ${passed}/${total} tests.`);
  }
  print(colors.magenta, '==================================================\n');

  process.exit(passed === total ? 0 : 1);
}

runTests();
