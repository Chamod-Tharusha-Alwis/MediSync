const fs = require('fs');
const path = require('path');
const auditRegistry = require('../server/src/utils/auditRegistry');

const routesDir = path.resolve(__dirname, '../server/src/routes');
const controllersDir = path.resolve(__dirname, '../server/src/controllers');

const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));
const results = [];

const controllerContents = {};
for (const cf of fs.readdirSync(controllersDir).filter(f => f.endsWith('.js'))) {
  controllerContents[cf] = fs.readFileSync(path.join(controllersDir, cf), 'utf8');
}

for (const file of files) {
  if (file === 'qaRoutes.js' || file === 'testRoutes.js') continue;
  const content = fs.readFileSync(path.join(routesDir, file), 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    const match = trimmed.match(/router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]\s*,\s*(.+)\);?/);
    if (!match) return;

    const method = match[1].toUpperCase();
    const routePath = match[2];
    const handlerChain = match[3];

    const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const isSensitive = isMutating || /history|prescriptions|otp|verification|profile|consultation/i.test(routePath);

    let controllerName = null;
    let handlerFunc = null;

    const controllerMatch = handlerChain.match(/([a-zA-Z0-9_]+Controller)\.([a-zA-Z0-9_]+)/);
    if (controllerMatch) {
      controllerName = controllerMatch[1] + '.js';
      handlerFunc = controllerMatch[2];
    } else {
      const parts = handlerChain.split(',').map(s => s.trim());
      const lastPart = parts[parts.length - 1];
      if (/^[a-zA-Z0-9_]+$/.test(lastPart)) {
        handlerFunc = lastPart;
        for (const l of lines) {
          if (l.includes(handlerFunc) && l.includes('require(')) {
            const reqMatch = l.match(/require\(['"]([^'"]+)['"]\)/);
            if (reqMatch) {
              controllerName = path.basename(reqMatch[1]) + (reqMatch[1].endsWith('.js') ? '' : '.js');
              break;
            }
          }
        }
      } else {
        handlerFunc = 'inline';
      }
    }

    let audited = false;
    let eventName = 'NONE';

    // Check 1: Route chain includes auditRoute('ACTION_NAME')
    const auditRouteMatch = handlerChain.match(/auditRoute\(['"]([A-Z0-9_]+)['"]/);
    if (auditRouteMatch) {
      audited = true;
      eventName = auditRouteMatch[1];
    }

    // Check 2: Controller includes AuditLog.create
    if (!audited && controllerName && controllerContents[controllerName] && handlerFunc && handlerFunc !== 'inline') {
      const cContent = controllerContents[controllerName];
      const funcIdx = cContent.indexOf(handlerFunc);
      if (funcIdx !== -1) {
        const slice = cContent.slice(funcIdx, funcIdx + 5000);
        if (slice.includes('AuditLog.create') || slice.includes('AuditLog') || slice.includes('recordAudit')) {
          audited = true;
          const actMatch = slice.match(/action:\s*['"]([A-Z0-9_]+)['"]/);
          if (actMatch) eventName = actMatch[1];
          else eventName = 'CONTROLLER_AUDIT';
        }
      }
    }

    // Check 3: Registered in auditRegistry
    if (!audited) {
      const regAction = auditRegistry.isAudited(file, method, routePath);
      if (regAction) {
        audited = true;
        eventName = regAction;
      }
    }

    // Extract role from handlerChain
    let role = 'public';
    const roleMatch = handlerChain.match(/protect\(\s*\[?([^\]\)]*)\]?\s*\)/);
    if (roleMatch && roleMatch[1].trim()) {
      role = roleMatch[1].replace(/['"\s]/g, '');
    } else if (handlerChain.includes('protect()')) {
      role = 'authenticated';
    } else if (handlerChain.includes('pharmacyAuth')) {
      role = 'pharmacist,pharmacy_admin,assistant';
    } else if (handlerChain.includes('dispensingAuth')) {
      role = 'pharmacist,pharmacy_admin';
    } else if (handlerChain.includes('hospAuth')) {
      role = 'hospital_admin';
    }

    results.push({
      routeFile: file,
      line: idx + 1,
      method,
      path: routePath,
      role,
      controllerName: controllerName || 'inline',
      handlerFunc: handlerFunc || 'inline',
      isMutating,
      isSensitive,
      audited,
      eventName
    });
  });
}

// Generate Markdown
let md = `# Audit Log Route Coverage Report (docs/final/AUDIT_COVERAGE.md)\n\n`;
md += `Generated: ${new Date().toISOString()}\n\n`;
md += `## 1. Summary Metrics\n\n`;
const totalRoutes = results.length;
const mutatingRoutes = results.filter(r => r.isMutating);
const mutatingAudited = mutatingRoutes.filter(r => r.audited);
const coveragePct = ((mutatingAudited.length / mutatingRoutes.length) * 100).toFixed(1);

md += `- **Total Registered API Routes:** ${totalRoutes}\n`;
md += `- **Total Mutating Routes (POST/PUT/PATCH/DELETE):** ${mutatingRoutes.length}\n`;
md += `- **Mutating Routes Audited:** ${mutatingAudited.length} / ${mutatingRoutes.length} (**${coveragePct}%**)\n`;
md += `- **Audit Coverage Requirement Met:** ${mutatingAudited.length === mutatingRoutes.length ? 'YES (100% compliant)' : 'NO'}\n\n`;

md += `## 2. Complete Mutating & Sensitive Route Coverage Matrix\n\n`;
md += `| Route | Method | Role Restriction | Handler (File:Line) | Audited | Event Name |\n`;
md += `|---|:---:|---|---|:---:|---|\n`;

results.filter(r => r.isMutating || r.isSensitive).forEach(r => {
  const handlerStr = `${r.routeFile}:${r.line} (${r.handlerFunc})`;
  md += `| \`${r.path}\` | \`${r.method}\` | \`${r.role}\` | \`${handlerStr}\` | ${r.audited ? 'YES' : 'NO'} | \`${r.eventName}\` |\n`;
});

const reportPath = path.resolve(__dirname, '../docs/final/AUDIT_COVERAGE.md');
fs.writeFileSync(reportPath, md, 'utf8');
console.log(`Saved AUDIT_COVERAGE.md with ${results.length} routes.`);
