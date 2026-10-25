'use strict';
require('./realLocalStack.cjs').main().catch(error => { console.error('[STARTUP_BLOCKED] ' + error.message); process.exitCode = 1; });
