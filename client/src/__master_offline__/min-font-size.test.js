/**
 * Master Offline Suite: Item U22 - Tiny Text Font Size Minimums (WCAG 1.4.4 Compliance)
 *
 * Verifies that all sub-12px / sub-11px font sizes identified in
 * B1_INVESTIGATION_REPORT.md §3 Item U22 comply with MediSync typography constraints:
 *   - No text-[Npx] with N < 11 exists anywhere in client/src (body/hint/badge).
 *   - Any remaining text-[11px] is strictly restricted to uppercase/tracking classes
 *     or explicitly approved short status/indicator badges.
 *   - Recharts chart fonts comply with minimum readable sizes (>= 11px / 12px).
 *
 * Invariant: Protected ledger file client/src/components/SymptomTagInput.jsx is untouched.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const srcDir = path.resolve(__dirname, '..');
const clientRoot = path.resolve(srcDir, '..');
const repoRoot = path.resolve(clientRoot, '..');

// Read protected hashes ledger to verify SymptomTagInput.jsx
const protectedLedgerPath = path.join(repoRoot, 'docs/release/PROTECTED_HASHES.json');

function getAllSourceFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.resolve(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      if (file !== '__master_offline__' && file !== 'tests') {
        results = results.concat(getAllSourceFiles(fullPath));
      }
    } else if (/\.(jsx?|tsx?|css)$/.test(file)) {
      results.push(fullPath);
    }
  });
  return results;
}

const allFiles = getAllSourceFiles(srcDir);

// Approved short badges allowed to use 11px without explicit inline uppercase class
const APPROVED_SHORT_BADGE_SIGNATURES = [
  // MedicalTimeline.jsx status badge
  'data.status?.toUpperCase()',
  // NewConsultation.jsx clinicalValidation badge
  'Reference matches only',
  'clinicalValidation: not_established',
  // NewConsultation.jsx ICD-10 confidence / code badge
  'diag.icd_code',
  // NewConsultation.jsx specialist recommendation badge
  'diag.recommendedSpecialist',
  // NewConsultation.jsx ICD version filter pill button
  'icdVersionFilter === f.id'
];

describe('Item U22: Minimum Font Size Compliance Suite', () => {

  test('asserts zero occurrences of text-[Npx] with N < 11 exist in client/src', () => {
    const sub11Regex = /\btext-\[(\d+)px\]/g;
    const violations = [];

    allFiles.forEach(filePath => {
      // Exclude protected SymptomTagInput.jsx from modification checks (must remain untouched)
      const relPath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
      if (relPath === 'client/src/components/SymptomTagInput.jsx') {
        return;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        let match;
        while ((match = sub11Regex.exec(line)) !== null) {
          const size = parseInt(match[1], 10);
          if (size < 11) {
            violations.push({
              file: relPath,
              line: idx + 1,
              size,
              snippet: line.trim()
            });
          }
        }
      });
    });

    expect(violations).toEqual([]);
  });

  test('asserts all text-[11px] instances are uppercase/tracking classes or approved short badges', () => {
    const elevenRegex = /\btext-\[11px\]/g;
    const unapproved = [];

    allFiles.forEach(filePath => {
      const relPath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
      if (relPath === 'client/src/components/SymptomTagInput.jsx') {
        return;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        let match;
        while ((match = elevenRegex.exec(line)) !== null) {
          const hasUpperOrTrack = /\buppercase\b/.test(line) || /\btracking-(?:wider|widest|wide)\b/.test(line);
          const isApprovedBadge = APPROVED_SHORT_BADGE_SIGNATURES.some(sig => {
            // Check current line and adjacent lines for signature context
            const start = Math.max(0, idx - 4);
            const end = Math.min(lines.length, idx + 8);
            const context = lines.slice(start, end).join(' ');
            return context.includes(sig);
          });

          if (!hasUpperOrTrack && !isApprovedBadge) {
            unapproved.push({
              file: relPath,
              line: idx + 1,
              snippet: line.trim()
            });
          }
        }
      });
    });

    expect(unapproved).toEqual([]);
  });

  test('asserts zero Recharts SVG chart fonts are smaller than 11px', () => {
    const fontSizeRegex = /fontSize\s*[:=]\s*(?:\{?\s*(\d+)\s*\}?|['"](\d+)px['"])/g;
    const chartViolations = [];

    allFiles.forEach(filePath => {
      const relPath = path.relative(repoRoot, filePath).replace(/\\/g, '/');
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');

      lines.forEach((line, idx) => {
        let match;
        while ((match = fontSizeRegex.exec(line)) !== null) {
          const size = parseInt(match[1] || match[2], 10);
          if (size < 11) {
            chartViolations.push({
              file: relPath,
              line: idx + 1,
              size,
              snippet: line.trim()
            });
          }
        }
      });
    });

    expect(chartViolations).toEqual([]);
  });

  test('asserts protected SymptomTagInput.jsx hash matches approved ledger baseline', () => {
    if (!fs.existsSync(protectedLedgerPath)) {
      throw new Error('PROTECTED_HASHES.json missing at: ' + protectedLedgerPath);
    }

    const ledger = JSON.parse(fs.readFileSync(protectedLedgerPath, 'utf8'));
    const entry = ledger.files.find(f => f.path === 'client/src/components/SymptomTagInput.jsx');
    expect(entry).toBeDefined();

    const targetFile = path.join(repoRoot, entry.path);
    const actualHash = crypto.createHash('sha256').update(fs.readFileSync(targetFile)).digest('hex');

    expect(actualHash).toBe(entry.releaseCandidateSha256);
  });
});
