import React from 'react';
import fs from 'fs';
import path from 'path';

describe('Part 5 — Console Warnings & Friendly Errors Verification', () => {
  const repoRoot = path.resolve(__dirname, '../../..');

  test('1. AnalyticsDashboard wraps all 4 Recharts charts in containers with explicit minHeight and minWidth', () => {
    const filePath = path.join(repoRoot, 'client/src/pages/admin/AnalyticsDashboard.jsx');
    const content = fs.readFileSync(filePath, 'utf8');

    // All 4 chart glass panels have minHeight >= 280
    const matches = content.match(/minHeight:\s*320/g);
    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(4);

    // ResponsiveContainer has minWidth={0} minHeight={200}
    const respMatches = content.match(/minWidth=\{0\}\s*minHeight=\{200\}/g);
    expect(respMatches).not.toBeNull();
    expect(respMatches.length).toBeGreaterThanOrEqual(4);
  });

  test('2. DiseaseAnalyticsSection wraps Recharts chart with minHeight >= 280 and minWidth: 0', () => {
    const filePath = path.join(repoRoot, 'client/src/components/admin/DiseaseAnalyticsSection.jsx');
    const content = fs.readFileSync(filePath, 'utf8');

    expect(content).toContain('minHeight: 280');
    expect(content).toContain('minWidth: 0');
    expect(content).toContain('minWidth={0} minHeight={200}');
  });

  test('3. PublicHealth forecast chart container has minHeight: 256 and minWidth: 0', () => {
    const filePath = path.join(repoRoot, 'client/src/pages/public/PublicHealth.jsx');
    const content = fs.readFileSync(filePath, 'utf8');

    expect(content).toContain('minHeight: 256');
    expect(content).toContain('minWidth: 0');
    expect(content).toContain('minWidth={0} minHeight={200}');
  });

  test('4. OutbreakMonitor maps 409 to friendly "already approved" message and 400 to friendly nationwide message', () => {
    const filePath = path.join(repoRoot, 'client/src/pages/admin/OutbreakMonitor.jsx');
    const content = fs.readFileSync(filePath, 'utf8');

    expect(content).toContain('status === 409');
    expect(content).toContain('This outbreak alert has already been approved and activated.');
    expect(content).toContain('status === 400');
    expect(content).toContain('Nationwide broadcast requires typing the exact disease name');
  });

  test('5. Pharmacy Dashboard maps 409 and ALREADY_DISPENSED to "This prescription has already been dispensed."', () => {
    const filePath = path.join(repoRoot, 'client/src/pages/pharmacy/Dashboard.jsx');
    const content = fs.readFileSync(filePath, 'utf8');

    expect(content).toContain('This prescription has already been dispensed.');
    expect(content).toContain('status === 409');
    expect(content).toContain('ALREADY_DISPENSED');
  });
});
