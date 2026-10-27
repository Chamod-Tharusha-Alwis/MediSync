'use strict';
const fs = require('fs'), path = require('path');
const parser = require('@babel/parser');
const { resolveClinicalEndpoints } = require('../src/config/clinicalEndpoints');

function inspectClinicalBuild(clientRoot, environment) {
  if ((environment.MEDISYNC_PUBLIC_DEMO !== undefined && environment.MEDISYNC_PUBLIC_DEMO !== 'false') ||
      (environment.MEDISYNC_DEPLOYMENT_MODE !== undefined && environment.MEDISYNC_DEPLOYMENT_MODE !== 'clinical')) {
    throw new Error('CLINICAL_BUILD_DEMO_MODE_FORBIDDEN');
  }
  if (environment.REACT_APP_MEDISYNC_QA !== 'true') {
    resolveClinicalEndpoints(environment.REACT_APP_API_URL, environment.REACT_APP_SERVER_URL);
  }
  require('../src/config/productionClientPolicy').assertProductionClientProfile({...environment,NODE_ENV:environment.REACT_APP_MEDISYNC_QA==='true'?'development':'production'});
  const source = path.join(clientRoot, 'src'), visited = new Set();
  function visit(file) {
    if (visited.has(file)) return;
    const relative = path.relative(source, file).split(path.sep).join('/');
    if (relative.startsWith('../') || path.isAbsolute(relative) || /(?:^|\/)universityDemo\/|(?:^|\/)(?:UniversityApp|universityIndex|UniversityDemoBanner|UniversityDemoNotice|UniversityRuntimeBoundary|UniversityWorkspace)\./.test(relative)) {
      throw new Error('CLINICAL_BUILD_DEMO_IMPORT_FORBIDDEN');
    }
    if (!/\.(?:js|jsx)$/.test(file)) return;
    visited.add(file);
    const ast = parser.parse(fs.readFileSync(file, 'utf8'), { sourceType: 'unambiguous', plugins: ['jsx', 'dynamicImport'] });
    function walk(node) {
      if (!node || typeof node !== 'object') return;
      const spec = ['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type) ? node.source?.value :
        node.type === 'CallExpression' && (node.callee?.type === 'Import' || node.callee?.name === 'require') && node.arguments?.[0]?.type === 'StringLiteral' ? node.arguments[0].value : null;
      if (typeof spec === 'string' && spec.startsWith('.')) {
        const target = path.resolve(path.dirname(file), spec);
        const resolved = [target, target+'.js', target+'.jsx', target+'.json', path.join(target,'index.js'), path.join(target,'index.jsx')].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
        if (!resolved) throw new Error('CLINICAL_BUILD_LOCAL_IMPORT_MISSING');
        visit(resolved);
      }
      for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walk); else if (value && typeof value === 'object') walk(value);
    }
    walk(ast.program);
  }
  visit(path.join(source, 'index.js'));
  if (!visited.has(path.join(source, 'App.js'))) throw new Error('CLINICAL_BUILD_APP_ENTRY_REQUIRED');
  return { entry: 'src/index.js', application: 'src/App.js', modules: visited.size, demoImported: false, profile: environment.REACT_APP_MEDISYNC_QA === 'true' ? 'clinical-qa' : 'clinical-production' };
}
module.exports = { inspectClinicalBuild };
