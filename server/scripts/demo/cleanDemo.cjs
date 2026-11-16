'use strict';
// Synthetic demonstration data. Dry run by default; see docs/demo/DEMO_RUNBOOK.md.
const cli = require('./demoCli.cjs');
if (require.main === module) cli.main(() => cli.runClean());
module.exports = cli;
