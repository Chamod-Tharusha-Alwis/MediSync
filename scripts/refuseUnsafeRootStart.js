console.error('MediSync root startup is disabled: it previously selected the live Atlas test database and exposed Redis/Vault.');
console.error('Use only the reviewed, separate Phase 5X QA commands in phase5x_local_verification_commands.md.');
process.exitCode = 1;
