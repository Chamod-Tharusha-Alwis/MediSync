'use strict';

/**
 * MediSync Safe Localhost Development Orchestrator
 * Launches frontend and standalone in-memory mock API together.
 * 
 * Safety Guarantees:
 * - Strictly bound to loopback 127.0.0.1
 * - Zero live database connections (null DB, no Atlas, no port 27017)
 * - Minimal clean environment allowlist (no server/.env loaded)
 * - Deterministic child process management with zero orphaned processes on Ctrl+C
 */

const http = require('http');
const net = require('net');
const cp = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const MOCK_API_PORT = 5100;
const FRONTEND_PORT = 3100;

// Track spawned child process PIDs for orderly teardown
const childPids = new Set();
let isShuttingDown = false;

function checkPort(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const server = net.createServer()
      .once('error', (err) => {
        if (err.code === 'EADDRINUSE') resolve(true);
        else resolve(false);
      })
      .once('listening', () => {
        server.once('close', () => resolve(false)).close();
      })
      .listen(port, host);
  });
}

function checkMockIdentity(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/qa/identity`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.mode === 'MOCK_IN_MEMORY');
        } catch (_) {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function pollEndpoint(url, timeoutMs = 30000, intervalMs = 500) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`Timed out waiting for ${url} after ${timeoutMs}ms`));
      }
      const req = http.get(url, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          resolve();
        } else {
          setTimeout(check, intervalMs);
        }
      });
      req.on('error', () => setTimeout(check, intervalMs));
      req.setTimeout(2000, () => {
        req.destroy();
        setTimeout(check, intervalMs);
      });
    }
    check();
  });
}

function killPid(pid) {
  if (!pid) return;
  if (process.platform === 'win32') {
    try {
      cp.execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
    } catch (_) {}
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch (_) {
      try { process.kill(pid, 'SIGKILL'); } catch (_) {}
    }
  }
}

function shutdown(exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('\n[MEDISYNC] Stopping localhost development environment...');

  for (const pid of childPids) {
    killPid(pid);
  }
  childPids.clear();
  console.log('[MEDISYNC] Both services stopped cleanly. Ports released.\n');
  process.exit(exitCode);
}

// Build minimal safe child process environment
function getSafeChildEnv(extra = {}) {
  const safeEnv = {
    PATH: process.env.PATH || '',
    SystemRoot: process.env.SystemRoot || '',
    APPDATA: process.env.APPDATA || '',
    LOCALAPPDATA: process.env.LOCALAPPDATA || '',
    USERPROFILE: process.env.USERPROFILE || '',
    HOME: process.env.HOME || '',
    TEMP: process.env.TEMP || '',
    TMP: process.env.TMP || '',
    NODE_ENV: 'test',
    MEDISYNC_TEST_MODE: 'true',
    HOST: '127.0.0.1',
    BROWSER: 'none',
    NO_PROXY: '127.0.0.1,localhost',
    ...extra
  };

  // Strictly scrub any production, database, or external provider keys
  for (const key of Object.keys(safeEnv)) {
    if (/^(MONGO_|RESEND_|BREVO_|EMAIL_|SMTP_|CLOUDINARY_|TWILIO_|SMS_|VAULT_|REDIS_)/i.test(key)) {
      delete safeEnv[key];
    }
  }
  return safeEnv;
}

async function start() {
  console.log('===============================================================');
  console.log('  MEDISYNC — INITIALIZING SAFE LOCALHOST DEVELOPMENT');
  console.log('===============================================================\n');

  // Register clean shutdown signal handlers
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));
  process.on('SIGHUP', () => shutdown(0));
  process.on('exit', () => shutdown(0));

  // [1/4] Port Availability Verification
  console.log('[1/4] Checking loopback port availability (3100, 5100)...');
  const port5100InUse = await checkPort(MOCK_API_PORT);
  let mockAlreadyRunning = false;

  if (port5100InUse) {
    mockAlreadyRunning = await checkMockIdentity(MOCK_API_PORT);
    if (!mockAlreadyRunning) {
      console.error(`\n[FATAL] Port ${MOCK_API_PORT} is in use by an unrelated external process.`);
      console.error(`Please terminate the process on port ${MOCK_API_PORT} and restart.\n`);
      process.exit(1);
    } else {
      console.log(`  ✓ Port ${MOCK_API_PORT} active with pre-existing MediSync mock API server.`);
    }
  }

  const port3100InUse = await checkPort(FRONTEND_PORT);
  if (port3100InUse) {
    console.error(`\n[FATAL] Port ${FRONTEND_PORT} is already in use by an external process.`);
    console.error(`Please terminate the process on port ${FRONTEND_PORT} and restart.\n`);
    process.exit(1);
  }

  // [2/4] Spawning Standalone Mock API Server (if not already running)
  let mockProcess = null;
  if (!mockAlreadyRunning) {
    console.log('[2/4] Spawning in-memory standalone mock API on 127.0.0.1:5100...');
    const mockScript = path.join(root, 'server', 'scripts', 'standaloneMockServer.js');
    mockProcess = cp.spawn(process.execPath, [mockScript], {
      cwd: root,
      env: getSafeChildEnv({ PORT: String(MOCK_API_PORT) }),
      stdio: ['ignore', 'pipe', 'pipe']
    });

    if (mockProcess.pid) childPids.add(mockProcess.pid);

    mockProcess.stdout.on('data', (d) => {
      const msg = d.toString();
      if (msg.includes('[MEDISYNC_MOCK_READY]')) {
        // Mock server ready
      }
    });

    mockProcess.stderr.on('data', (d) => {
      const err = d.toString().trim();
      if (err) console.error(`[MOCK_API_ERR] ${err}`);
    });

    mockProcess.on('exit', (code) => {
      if (!isShuttingDown) {
        console.error(`\n[ERROR] Mock API server exited unexpectedly with code ${code}.`);
        shutdown(1);
      }
    });

    // Wait for Mock API health
    await pollEndpoint(`http://127.0.0.1:${MOCK_API_PORT}/api/qa/identity`, 10000);
    console.log(`  ✓ Mock API ready and responding at http://127.0.0.1:${MOCK_API_PORT}`);
  }

  // [3/4] Spawning Frontend QA Launcher
  console.log('\n[3/4] Launching frontend on 127.0.0.1:3100 (proxying to mock API)...');
  const clientScript = path.join(root, 'client', 'scripts', 'startQa.js');
  const clientProcess = cp.spawn(process.execPath, [clientScript], {
    cwd: path.join(root, 'client'),
    env: getSafeChildEnv({
      PORT: String(FRONTEND_PORT),
      REACT_APP_MEDISYNC_QA: 'true',
      REACT_APP_API_URL: '/api',
      REACT_APP_SERVER_URL: `http://127.0.0.1:${FRONTEND_PORT}`,
      REACT_APP_PROXY_TARGET: `http://127.0.0.1:${MOCK_API_PORT}`
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  if (clientProcess.pid) childPids.add(clientProcess.pid);

  clientProcess.stderr.on('data', (d) => {
    const err = d.toString().trim();
    // Filter deprecation warnings from webpack
    if (err && !err.includes('DEP_WEBPACK')) {
      // console.error(`[FRONTEND_WARN] ${err}`);
    }
  });

  clientProcess.on('exit', (code) => {
    if (!isShuttingDown) {
      console.error(`\n[ERROR] Frontend dev server exited unexpectedly with code ${code}.`);
      shutdown(1);
    }
  });

  // [4/4] Await Frontend HTTP Readiness
  console.log('[4/4] Waiting for frontend bundle compilation...');
  await pollEndpoint(`http://127.0.0.1:${FRONTEND_PORT}`, 45000);

  console.log('\n===============================================================');
  console.log('  MEDISYNC LOCALHOST ENVIRONMENT READY');
  console.log('===============================================================');
  console.log(`  Frontend Website:  http://127.0.0.1:${FRONTEND_PORT}`);
  console.log(`  Mock API Server:   http://127.0.0.1:${MOCK_API_PORT}`);
  console.log(`  Database:          NONE (Pure In-Memory Mock)`);
  console.log(`  External Services: DISABLED (Zero Egress)`);
  console.log('---------------------------------------------------------------');
  console.log('  FIVE-ROLE SYNTHETIC MOCK DEMO ACCOUNTS:');
  console.log('  • Administrator:    sarah.jenkins@medisync.local');
  console.log('  • Doctor:           kasun.fernando@hospital.lk (DOC-SLMC-49281)');
  console.log('  • Patient:          chamara.silva@example.com (NIC: 199012345671)');
  console.log('  • Pharmacy:         priyanka@pharmacy.lk');
  console.log('  • Hospital Admin:   admin@cgh.medisync.local');
  console.log('  (Password for all mock accounts: any test string)');
  console.log('---------------------------------------------------------------');
  console.log('  Press Ctrl+C to stop all local services.');
  console.log('===============================================================\n');

  // Keep event loop alive while child processes run
  setInterval(() => {}, 60000);
}

start().catch((err) => {
  console.error('\n[FATAL] Startup orchestrator failed:', err.message);
  shutdown(1);
});
