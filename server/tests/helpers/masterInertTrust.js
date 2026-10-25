'use strict';
// Capability-based SIGNER DOUBLE. Not cryptography, attestation, persistent storage or a live adapter.
const assert = require('assert');
const crypto = require('crypto');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const fields = ['issuer','hostId','hostEpoch','credentialVersion','sourceHash','ledgerEpoch','issuedAt','expiresAt','attempt'];
function snapshot(value) {
  assert(value && Object.getPrototypeOf(value) === Object.prototype);
  assert.deepEqual(Object.keys(value).sort(), [...fields].sort());
  for (const key of fields) {
    assert(Object.hasOwn(Object.getOwnPropertyDescriptor(value,key), 'value'), 'Accessors refused');
    assert(typeof value[key] === (['issuedAt','expiresAt'].includes(key) ? 'number' : 'string'));
  }
  assert(Number.isFinite(value.issuedAt) && Number.isFinite(value.expiresAt));
  assert(value.expiresAt > value.issuedAt && value.expiresAt - value.issuedAt <= 900000);
  return JSON.stringify(value);
}
function createInertTrust(binding) {
  const expected = Object.freeze({...binding});
  assert(expected.issuer === 'master-inert-issuer' && expected.hostId === 'master-inert-host');
  for (const key of ['hostEpoch','credentialVersion','sourceHash','ledgerEpoch']) assert(typeof expected[key] === 'string' && expected[key]);
  const signatures = new WeakMap(), checkpoints = new WeakMap(), consumed = new Set();
  let sequence = 0;
  const checkpoint = () => { const proof=Object.freeze({simulationOnly:true,executionAuthorized:false});checkpoints.set(proof,sequence);return proof; };
  function issue(payload) {
    const encoded = snapshot(payload);
    const envelope = Object.freeze({simulationOnly:true,executionAuthorized:false,digest:sha(encoded)});
    signatures.set(envelope, encoded); return envelope;
  }
  function consume(envelope, payload, observation, now) {
    const encoded = snapshot(payload);
    assert(signatures.get(envelope) === encoded, 'Invalid/missing inert signature capability');
    assert(checkpoints.has(observation) && checkpoints.get(observation) === sequence, 'Missing/rolled back ledger checkpoint');
    for (const key of ['issuer','hostId','hostEpoch','credentialVersion','sourceHash','ledgerEpoch']) assert(payload[key] === expected[key], 'Binding mismatch: '+key);
    assert(Number.isFinite(now) && now >= payload.issuedAt && now < payload.expiresAt, 'Stale/future proof');
    assert(payload.attempt && !consumed.has(payload.attempt), 'Attempt replay');
    consumed.add(payload.attempt); sequence++;
    return Object.freeze({simulationOnly:true,executionAuthorized:false,sequence,digest:sha(encoded)});
  }
  return Object.freeze({issue,checkpoint,consume});
}
module.exports={createInertTrust};
