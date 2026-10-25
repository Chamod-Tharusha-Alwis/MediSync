// Pure final receipt check. No filesystem, process signals or database access.
function verifyBrowserCleanupProof(receipt, {owner, processId, processAlive, manifestSha256, processObservation}) {
  require('./e1AttemptIdentity').assertBinding(receipt?.processIdentity,processObservation);
  if(!receipt || receipt.owner!==owner || receipt.protocol!=='5xd5-drain-v1' || receipt.processId!==processId ||
    !Number.isSafeInteger(processId) || processId<=0 || processAlive!==false || receipt.phase!=='stopped' ||
    receipt.drained!==true || receipt.shutdownComplete!==true || receipt.recoveryRequired!==false ||
    receipt.listenerClosed!==true || receipt.disconnected!==true || receipt.frozen!==true || receipt.memoryCleared!==true ||
    ['activeRequests','pendingHandlers','pendingCallbacks','pendingResources','pendingTransactions','pendingWrites'].some(key=>receipt[key]!==0) ||
    !Array.isArray(receipt.failures) || receipt.failures.length || !Array.isArray(receipt.networkAttempts) || receipt.networkAttempts.length ||
    !Array.isArray(receipt.secretReadAttempts) || receipt.secretReadAttempts.length ||
    !receipt.integrations || ['rejectedNativeFetch','rejectedAxios','rejectedProviders','cloudinaryCalls','socketEmits'].some(key=>receipt.integrations[key]!==0) ||
    receipt.lifecycleVersion!=='5xd7c-v1' || ['pendingJobs','pendingTransactionOperations','abortedRequests','drainTimeouts'].some(key=>receipt[key]!==0) ||
    receipt.instrumentation?.ready!==true || receipt.transactionInstrumentation!==true || !Array.isArray(receipt.unknownResourceTypes) || receipt.unknownResourceTypes.length ||
    receipt.listener?.started!==true || receipt.listener.requestedHost!=='127.0.0.1' || receipt.listener.requestedPort!==5100 || receipt.listener.address?.address!=='127.0.0.1' || receipt.listener.address?.port!==5100 ||
    !receipt.listener.closed || receipt.listener.listening!==false || receipt.listener.socketsRemaining!==0 || receipt.listener.shutdownTimedOut || receipt.listener.startupFailed ||
    !processObservation || processObservation.osObserved!==true || processObservation.absent!==true || processObservation.identityVerified!==true || processObservation.processId!==processId ||
    receipt.processIdentity?.owner!==owner || receipt.processIdentity?.processId!==processId || processObservation.owner!==owner || processObservation.nonce!==receipt.processIdentity?.nonce || !/^[a-f0-9]{64}$/.test(processObservation.nonce||'') ||
    !/^[a-f0-9]{64}$/.test(manifestSha256||'') || receipt.manifestSha256!==manifestSha256)throw new Error('Browser process shutdown proof incomplete; preserve recovery manifests');
  return true;
}
function verifyBrowserManifest(manifest,{owner,allowedCollections}){
  const runtime=manifest?.runtimeVerification;
  if(!manifest||manifest.owner!==owner||manifest.frozen!==true||manifest.pendingWrites!==0||manifest.readOnly!==true||manifest.runtimeVerified!==true||manifest.ownedReferences!==true||manifest.cleanupState!=='pending'||manifest.recoveryRequired!==false||manifest.capturedMockEmails!==0||!Array.isArray(manifest.otpKeyHashes)||manifest.otpKeyHashes.length||
    !Array.isArray(manifest.allowedCollections)||JSON.stringify([...manifest.allowedCollections].sort())!==JSON.stringify([...allowedCollections].sort())||
    ['rejected','networkAttempts','secretReadAttempts'].some(key=>!Array.isArray(manifest[key])||manifest[key].length)||!manifest.owned||typeof manifest.owned!=='object'||Object.values(manifest.owned).some(ids=>!Array.isArray(ids)||ids.length)||
    !runtime||runtime.database!=='medisync_automated_test'||runtime.authenticatedUsers!==1||runtime.roles?.length!==1||runtime.roles[0].role!=='readWrite'||runtime.roles[0].db!==runtime.database||
    runtime.productionUriLoaded!==false||runtime.providerSecretKeysLoaded!==0||runtime.dbGuardActive!==true||runtime.nativeFixtureGuardActive!==true||runtime.testMode!==true||runtime.browserMode!==true)
    throw Error('E1 journal/runtime/scope invalid; preserve recovery manifest');
  return true;
}
module.exports={verifyBrowserCleanupProof,verifyBrowserManifest};
