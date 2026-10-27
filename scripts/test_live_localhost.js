'use strict';

const path = require('path');
const { chromium } = require(path.join(__dirname, '../client/node_modules/playwright'));
const http = require('http');

async function testLive() {
  console.log('\n[PLAYWRIGHT] Verifying live localhost website at http://127.0.0.1:3100...\n');

  // Verify Mock API endpoint
  await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:5100/api/qa/identity', res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const id = JSON.parse(data);
        console.log(`  ✓ Mock API confirmed: mode=${id.mode}, db=${id.database}`);
        resolve();
      });
    }).on('error', reject);
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:3100', viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  let passed = 0;
  let failed = 0;

  async function check(name, fn) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ PASS: ${name}`);
    } catch (e) {
      failed++;
      console.error(`  ✗ FAIL: ${name}: ${e.message}`);
    }
  }

  // 1. Homepage
  await check('Homepage renders title and hero', async () => {
    await page.goto('/');
    await page.waitForSelector('text=Access Login Portals', { timeout: 10000 });
  });

  // 2. Select-role hub
  await check('Select-role displays all 5 role cards', async () => {
    await page.goto('/select-role');
    await page.waitForSelector('[data-testid="role-card-admin"]', { timeout: 10000 });
    await page.waitForSelector('[data-testid="role-card-doctor"]', { timeout: 10000 });
    await page.waitForSelector('[data-testid="role-card-patient"]', { timeout: 10000 });
    await page.waitForSelector('[data-testid="role-card-pharmacy"]', { timeout: 10000 });
    await page.waitForSelector('[data-testid="role-card-hospital"]', { timeout: 10000 });
  });

  // 3. Doctor Portal
  await check('Doctor portal renders with verified credentials', async () => {
    await page.evaluate(() => {
      localStorage.setItem('token', 'mock-jwt-doctor');
      localStorage.setItem('role', 'doctor');
      localStorage.setItem('userRole', 'doctor');
      localStorage.setItem('userName', 'Dr. Kasun Fernando');
      localStorage.setItem('user', JSON.stringify({ id: 'u_doc_01', name: 'Dr. Kasun Fernando', role: 'doctor' }));
    });
    await page.goto('/doctor/dashboard');
    await page.waitForSelector("text=Today's Consultations", { timeout: 10000 });
  });

  // 4. Patient Portal
  await check('Patient portal renders medical overview', async () => {
    await page.evaluate(() => {
      localStorage.setItem('token', 'mock-jwt-patient');
      localStorage.setItem('role', 'patient');
      localStorage.setItem('userRole', 'patient');
      localStorage.setItem('userName', 'Chamara Silva');
      localStorage.setItem('nic', '199012345671');
      localStorage.setItem('user', JSON.stringify({ id: 'u_pat_01', name: 'Chamara Silva', role: 'patient' }));
    });
    await page.goto('/patient/dashboard');
    await page.waitForSelector('text=Chamara Silva', { timeout: 10000 });
  });

  // 5. Pharmacy Portal
  await check('Pharmacy portal renders dispense and restock alert cards', async () => {
    await page.evaluate(() => {
      localStorage.setItem('token', 'mock-jwt-pharmacist');
      localStorage.setItem('role', 'pharmacist');
      localStorage.setItem('userRole', 'pharmacist');
      localStorage.setItem('userName', 'Priyanka Perera');
      localStorage.setItem('user', JSON.stringify({ id: 'u_pharm_01', name: 'Priyanka Perera', role: 'pharmacist' }));
    });
    await page.goto('/pharmacy/dashboard');
    await page.waitForSelector('text=Dispense', { timeout: 10000 });
    await page.goto('/pharmacy/dashboard/restock');
    await page.waitForSelector('text=Paracetamol 500mg', { timeout: 10000 });
  });

  // 6. Hospital Portal
  await check('Hospital portal renders administration and doctor roster', async () => {
    await page.evaluate(() => {
      localStorage.setItem('token', 'mock-jwt-hospital');
      localStorage.setItem('role', 'hospital_admin');
      localStorage.setItem('userRole', 'hospital_admin');
      localStorage.setItem('userName', 'Colombo General Hospital');
      localStorage.setItem('user', JSON.stringify({ id: 'u_hosp_01', name: 'Dr. Mohan De Silva', role: 'hospital_admin' }));
    });
    await page.goto('/hospital/dashboard');
    await page.waitForSelector('text=Hospital Administration', { timeout: 10000 });
    await page.goto('/hospital/dashboard/doctors');
    await page.waitForSelector('text=Dr. Kasun Fernando', { timeout: 10000 });
  });

  // 7. Admin Portal
  await check('Admin portal renders user governance table', async () => {
    await page.evaluate(() => {
      localStorage.setItem('token', 'mock-jwt-admin');
      localStorage.setItem('role', 'admin');
      localStorage.setItem('userRole', 'admin');
      localStorage.setItem('userName', 'Sarah Jenkins');
      localStorage.setItem('user', JSON.stringify({ id: 'u_admin_01', name: 'Sarah Jenkins', role: 'admin' }));
    });
    await page.goto('/admin/dashboard');
    await page.waitForSelector('text=Super Admin Command', { timeout: 10000 });
    await page.goto('/admin/dashboard/users');
    await page.waitForSelector('text=Dr. Kasun Fernando', { timeout: 10000 });
  });

  await browser.close();

  console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
}

testLive().catch(err => {
  console.error('[FATAL]', err.message);
  process.exit(1);
});
