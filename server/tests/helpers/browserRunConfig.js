const fs = require('fs');
const path = require('path');
const filename = path.resolve(__dirname, '../../../scratch/phase5x-evidence/5xc-browser-run.json');
const { IR04_COLLECTIONS: BROWSER_COLLECTIONS } = require('./ir04FixtureSafety');
function validateBrowserRunConfig(data) {
  const keys=new Set(['phase','attemptId','approvalSha256','owner','approvalId','authorizedByHuman','confirmedAt','purpose','protocol','frontend','backend','ml','database','clinicalMutationsAllowed','fixtureSetupAllowed','ownedReferences','allowedCollections','sourceProofSha256','sourceProofFile','isolatedQaContractSha256']);
  if(!data||Object.keys(data).some(key=>!keys.has(key)))throw Error('Unapproved browser configuration key');
  require('./e1AttemptIdentity').assertAttempt(data.phase,data.attemptId);
  if(Object.hasOwn(data,'isolatedQaContractSha256')&&!/^[a-f0-9]{64}$/.test(data.isolatedQaContractSha256||''))throw Error('Invalid isolated QA contract hash');
  if(!/^[a-f0-9]{64}$/.test(data.approvalSha256||''))throw Error('Approved attempt digest required');
  if (!/^5xc-b-[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(data.owner || '')) throw new Error('Invalid QA browser run owner');
  for (const [key, expected] of Object.entries({ protocol:'5xd7c-owned-v4',frontend:'http://127.0.0.1:3100',backend:'http://127.0.0.1:5100',ml:'http://127.0.0.1:5101',database:'medisync_automated_test' })) {
    if (data[key] !== expected) throw new Error(`Invalid browser run configuration: ${key}`);
  }
  if(data.authorizedByHuman!==true || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(data.approvalId||'') ||
    data.purpose!=='E1-lifecycle-only' || data.clinicalMutationsAllowed!==false || data.fixtureSetupAllowed!==false ||
    data.ownedReferences!==true || !Array.isArray(data.allowedCollections) || JSON.stringify([...data.allowedCollections].sort())!==JSON.stringify([...BROWSER_COLLECTIONS].sort()) ||
    !/^[a-f0-9]{64}$/.test(data.sourceProofSha256||'') || !/^5xd7c-inert-[a-z0-9-]+\.json$/.test(data.sourceProofFile||'') || !Number.isFinite(Date.parse(data.confirmedAt)) || Date.now()-Date.parse(data.confirmedAt)<0 || Date.now()-Date.parse(data.confirmedAt)>=900000)
    throw Error('Separate fresh E1 approval, exact scope and zero-actor contract required');
  return Object.freeze({ ...data, allowedCollections:Object.freeze([...data.allowedCollections]) });
}
function readBrowserRunConfig() {
  const requestedOwner=process.env.MEDISYNC_QA_BROWSER_OWNER;
  if(!/^5xc-b-[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(requestedOwner||''))throw Error('Trusted parent browser owner required');
  const activeFilename=path.resolve(__dirname,`../../../scratch/phase5x-evidence/5xe1-config-${requestedOwner}.json`);
  const data=validateBrowserRunConfig(JSON.parse(fs.readFileSync(activeFilename,'utf8')));
  if(data.owner!==requestedOwner)throw Error('Parent/config owner mismatch');
  const consumed=JSON.parse(fs.readFileSync(path.resolve(__dirname,`../../../scratch/phase5x-evidence/5xe1-parent-consumed-${data.approvalId}.json`),'utf8'));
  if(consumed.approvalId!==data.approvalId||consumed.owner!==data.owner||consumed.phase!==data.phase||consumed.attemptId!==data.attemptId||consumed.approvalSha256!==data.approvalSha256||consumed.scope!=='one-read-only-zero-actor-lifecycle-attempt')throw Error('Parent consumption/config approved-attempt mismatch');
  const approved=(data.isolatedQaContractSha256?require('./qaIsolatedParentContract').parseUniqueJson:JSON.parse)(fs.readFileSync(path.resolve(__dirname,`../../../scratch/phase5x-evidence/5xe1-approval-${data.approvalId}.json`),'utf8'));
  const parent=require('./e1TrustedParent');parent.validateAdmission(approved);
  if(JSON.stringify(parent.configFor(approved))!==JSON.stringify(data))throw Error('Child configuration differs from the consumed approval');
  return data;
}
module.exports = { readBrowserRunConfig, validateBrowserRunConfig, filename, BROWSER_COLLECTIONS };
