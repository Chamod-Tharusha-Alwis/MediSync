/**
 * Master Offline Suite: Item U23 - Undefined Tailwind Classes & Design System Tokens
 *
 * Verifies that all 6 categories of undefined Tailwind classes identified in
 * B1_INVESTIGATION_REPORT.md §3 Item U23 are completely eliminated:
 *   - Category A: Nonexistent palette shades (slate-550, slate-555, slate-850, emerald-450, etc.)
 *   - Category B: Non-standard spacing scale (py-0.2 typo eliminated; 4.5, 5.5, 6.5, 18 configured)
 *   - Category C: Non-standard transitions & scale (scale-102, hover:scale-103, duration-350)
 *   - Category D: Invalid color opacity syntax (border-white/6, via-white/12, /12, /8 opacities)
 *   - Category E: Missing custom utilities (text-gradient-*, glass-button, animate-in typos)
 *   - Category F: Dynamic template string concatenations (doctor/Dashboard, hospital/Dashboard)
 *
 * Invariant: client/src/components/SymptomTagInput.jsx and other 14 protected files remain intact.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const srcDir = path.resolve(__dirname, '..');
const clientRoot = path.resolve(srcDir, '..');
const repoRoot = path.resolve(clientRoot, '..');

function getAllComponentFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.resolve(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      // Exclude test directory itself to avoid false positives on regex literals
      if (file !== '__master_offline__') {
        results = results.concat(getAllComponentFiles(fullPath));
      }
    } else if (/\.(jsx?|tsx?)$/.test(file)) {
      results.push(fullPath);
    }
  });
  return results;
}

const componentFiles = getAllComponentFiles(srcDir);

describe('Item U23: Undefined Tailwind Classes Suite', () => {

  describe('Category A: Nonexistent Palette Shades', () => {
    const forbiddenShades = [
      /\b(?:text|bg|border|hover:text|hover:bg|focus:text|focus:bg)-slate-550\b/,
      /\b(?:text|bg|border|hover:text|hover:bg|focus:text|focus:bg)-slate-555\b/,
      /\b(?:text|bg|border|hover:text|hover:bg|focus:text|focus:bg)-slate-850\b/,
      /\b(?:text|bg|border|hover:text|hover:bg|focus:text|focus:bg)-slate-855\b/,
      /\b(?:text|bg|border|hover:text|hover:bg|focus:text|focus:bg)-slate-350\b/,
      /\b(?:text|bg|border|hover:text|hover:bg|focus:text|focus:bg)-slate-355\b/,
      /\b(?:text|bg|border|hover:text|hover:bg|focus:text|focus:bg)-emerald-450\b/,
      /\b(?:text|bg|border|hover:text|hover:bg|focus:text|focus:bg)-rose-455\b/,
      /\b(?:text|bg|border|hover:text|hover:bg|focus:text|focus:bg)-indigo-450\b/,
      /\b(?:text|bg|border|hover:text|hover:bg|focus:text|focus:bg)-amber-450\b/
    ];

    test('asserts 0 nonexistent palette shades exist across component tree', () => {
      const violations = [];
      componentFiles.forEach(f => {
        const rel = path.relative(repoRoot, f).replace(/\\/g, '/');
        const content = fs.readFileSync(f, 'utf8');
        forbiddenShades.forEach(pattern => {
          if (pattern.test(content)) {
            violations.push(`${rel} matches ${pattern}`);
          }
        });
      });
      expect(violations).toEqual([]);
    });
  });

  describe('Category B: Non-Standard Spacing Scale', () => {
    test('asserts 0 py-0.2 typo spacing instances exist across component tree', () => {
      const violations = [];
      const py02Pattern = /\bpy-0\.2\b/;
      componentFiles.forEach(f => {
        const rel = path.relative(repoRoot, f).replace(/\\/g, '/');
        const content = fs.readFileSync(f, 'utf8');
        if (py02Pattern.test(content)) {
          violations.push(`${rel} matches ${py02Pattern}`);
        }
      });
      expect(violations).toEqual([]);
    });

    test('verifies standard icon tokens and hero spacing are configured in tailwind.config.js', () => {
      const configPath = path.resolve(clientRoot, 'tailwind.config.js');
      expect(fs.existsSync(configPath)).toBe(true);
      delete require.cache[require.resolve(configPath)];
      const tailwindConfig = require(configPath);

      const spacing = tailwindConfig.theme?.extend?.spacing;
      expect(spacing).toBeDefined();
      expect(spacing['4.5']).toBe('1.125rem'); // 18px standard icon sizing across headers & navbars
      expect(spacing['5.5']).toBe('1.375rem'); // 22px standard icon sizing for featured headers
      expect(spacing['6.5']).toBe('1.625rem'); // 26px standard avatar/badge sizing
      expect(spacing['18']).toBe('4.5rem');    // 72px standard hero section top padding
    });
  });

  describe('Category C: Non-Standard Transitions & Scale', () => {
    const forbiddenScaleTransitions = [
      /\bscale-102\b/,
      /\bhover:scale-103\b/,
      /\bduration-350\b/
    ];

    test('asserts 0 non-standard scale or duration tokens exist in source files', () => {
      const violations = [];
      componentFiles.forEach(f => {
        const rel = path.relative(repoRoot, f).replace(/\\/g, '/');
        const content = fs.readFileSync(f, 'utf8');
        forbiddenScaleTransitions.forEach(pattern => {
          if (pattern.test(content)) {
            violations.push(`${rel} matches ${pattern}`);
          }
        });
      });
      expect(violations).toEqual([]);
    });
  });

  describe('Category D: Invalid Color Opacity Syntax', () => {
    const invalidOpacityPattern = /\b(?:border|via|bg|text)-[a-zA-Z0-9-]+(?:\/(?:6|12|8))\b/;

    test('asserts 0 invalid bare-slash opacities (/6, /12, /8) exist across component tree', () => {
      const violations = [];
      componentFiles.forEach(f => {
        const rel = path.relative(repoRoot, f).replace(/\\/g, '/');
        const content = fs.readFileSync(f, 'utf8');
        if (invalidOpacityPattern.test(content)) {
          violations.push(`${rel} matches ${invalidOpacityPattern}`);
        }
      });
      expect(violations).toEqual([]);
    });
  });

  describe('Category E: Missing Custom Utilities & Typo Classes', () => {
    test('asserts 0 glass-btn typo classes exist in component files', () => {
      const violations = [];
      const glassBtnPattern = /\bglass-btn\b/;
      componentFiles.forEach(f => {
        const rel = path.relative(repoRoot, f).replace(/\\/g, '/');
        const content = fs.readFileSync(f, 'utf8');
        if (glassBtnPattern.test(content)) {
          violations.push(`${rel} matches ${glassBtnPattern}`);
        }
      });
      expect(violations).toEqual([]);
    });

    test('asserts 0 unconfigured animation utility classes (animate-in, slide-in-from-bottom-2) exist', () => {
      const violations = [];
      const animPattern = /\b(?:animate-in|slide-in-from-bottom-2)\b/;
      componentFiles.forEach(f => {
        const rel = path.relative(repoRoot, f).replace(/\\/g, '/');
        const content = fs.readFileSync(f, 'utf8');
        if (animPattern.test(content)) {
          violations.push(`${rel} matches ${animPattern}`);
        }
      });
      expect(violations).toEqual([]);
    });

    test('verifies text-gradient utilities exist in client/src/index.css', () => {
      const indexCssPath = path.resolve(srcDir, 'index.css');
      expect(fs.existsSync(indexCssPath)).toBe(true);
      const cssContent = fs.readFileSync(indexCssPath, 'utf8');

      expect(cssContent).toMatch(/\.text-gradient-blue\s*\{/);
      expect(cssContent).toMatch(/\.text-gradient-rose\s*\{/);
      expect(cssContent).toMatch(/\.text-gradient-purple\s*\{/);
      expect(cssContent).toMatch(/\.text-gradient-amber\s*\{/);
      expect(cssContent).toMatch(/\.glass-button\s*\{/);
    });
  });

  describe('Category F: Dynamic Template String Concatenations', () => {
    test('asserts doctor/Dashboard.jsx does not use dynamic bg-${color}-500/10 string', () => {
      const docDashPath = path.resolve(srcDir, 'pages/doctor/Dashboard.jsx');
      const content = fs.readFileSync(docDashPath, 'utf8');
      expect(content).not.toMatch(/bg-\$\{color\}-500\/10/);
      expect(content).not.toMatch(/border-\$\{color\}-500\/20/);
      expect(content).not.toMatch(/text-\$\{color\}-400/);
    });

    test('asserts hospital/Dashboard.jsx does not use dynamic bg-${stat.color}-500/5 string', () => {
      const hospDashPath = path.resolve(srcDir, 'pages/hospital/Dashboard.jsx');
      const content = fs.readFileSync(hospDashPath, 'utf8');
      expect(content).not.toMatch(/bg-\$\{stat\.color\}-500\/5/);
    });
  });

  describe('Tailwind PostCSS Utility Compilation', () => {
    test('confirms PostCSS with client/tailwind.config.js successfully generates CSS for 4.5, 5.5, 6.5, 18', async () => {
      const postcss = require('postcss');
      const tailwindcss = require('tailwindcss');
      const configPath = path.resolve(clientRoot, 'tailwind.config.js');
      delete require.cache[require.resolve(configPath)];
      const tailwindConfig = require(configPath);

      const customConfig = {
        ...tailwindConfig,
        content: [{ raw: '<div class="w-4.5 h-4.5 w-5.5 h-5.5 w-6.5 h-6.5 pt-18"></div>' }]
      };

      const result = await postcss([tailwindcss(customConfig)]).process('@tailwind utilities;', { from: undefined });
      expect(result.css).toContain('1.125rem');
      expect(result.css).toContain('1.375rem');
      expect(result.css).toContain('1.625rem');
      expect(result.css).toContain('4.5rem');
    });
  });

  describe('Protected Files Invariant Check', () => {
    test('confirms SymptomTagInput.jsx is untouched and matches release candidate hash', () => {
      const ledgerPath = path.resolve(repoRoot, 'docs/release/PROTECTED_HASHES.json');
      const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
      const symptomRow = ledger.files.find(f => f.path === 'client/src/components/SymptomTagInput.jsx');
      expect(symptomRow).toBeDefined();

      const symptomFile = path.resolve(repoRoot, symptomRow.path);
      const actualSha = crypto.createHash('sha256').update(fs.readFileSync(symptomFile)).digest('hex');
      expect(actualSha).toBe(symptomRow.releaseCandidateSha256);
    });
  });
});
