'use strict';

const crypto = require('crypto');
const assert = require('assert');

const GENESIS_PREV_HASH = '0'.repeat(64);
const AUTHORIZED_ISSUER = 'medisync-qa-trust-authority-v1';
const AUTHORIZED_ALGORITHM = 'HMAC-SHA256';
const MAX_TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes max validity

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Creates and signs a synthetic approval token.
 */
function createSyntheticToken(payload, secretKey) {
  const header = { alg: AUTHORIZED_ALGORITHM, typ: 'QA_APPROVAL_TOKEN' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Verifies synthetic approval token against B02 trusted authority specification.
 */
function verifySyntheticToken(token, secretKey, expectedBinding = {}, options = {}) {
  if (!token || typeof token !== 'string') {
    const err = new Error('B02: Missing or malformed token string');
    err.code = 'B02_INVALID_TOKEN';
    throw err;
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    const err = new Error('B02: Token must have exactly 3 dot-delimited segments');
    err.code = 'B02_MALFORMED_TOKEN_STRUCTURE';
    throw err;
  }

  const [rawHeader, rawPayload, rawSig] = parts;
  let header, payload;
  try {
    header = JSON.parse(Buffer.from(rawHeader, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(rawPayload, 'base64url').toString('utf8'));
  } catch (e) {
    const err = new Error('B02: Failed to parse token JSON segments: ' + e.message);
    err.code = 'B02_PARSE_FAILURE';
    throw err;
  }

  // Downgrade attack prevention (algorithm verification)
  if (!header.alg || header.alg.toLowerCase() === 'none' || header.alg !== AUTHORIZED_ALGORITHM) {
    const err = new Error(`B02: Prohibited algorithm "${header.alg}". Only "${AUTHORIZED_ALGORITHM}" permitted`);
    err.code = 'B02_ALGORITHM_DOWNGRADE';
    throw err;
  }

  // Verify HMAC signature
  const expectedSig = crypto
    .createHmac('sha256', secretKey)
    .update(`${rawHeader}.${rawPayload}`)
    .digest('base64url');

  const sigBuffer = Buffer.from(rawSig, 'utf8');
  const expectedBuffer = Buffer.from(expectedSig, 'utf8');
  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    const err = new Error('B02: Invalid token signature or tampered approval payload');
    err.code = 'B02_INVALID_SIGNATURE';
    throw err;
  }

  // Issuer check
  if (payload.issuer !== (expectedBinding.issuer || AUTHORIZED_ISSUER)) {
    const err = new Error(`B02: Wrong issuer "${payload.issuer}". Expected "${expectedBinding.issuer || AUTHORIZED_ISSUER}"`);
    err.code = 'B02_WRONG_ISSUER';
    throw err;
  }

  // Timestamp & TTL check
  const now = options.now !== undefined ? options.now : Date.now();
  if (typeof payload.issuedAt !== 'number' || typeof payload.expiresAt !== 'number') {
    const err = new Error('B02: Token timestamps must be valid numbers');
    err.code = 'B02_INVALID_TIMESTAMPS';
    throw err;
  }

  if (payload.expiresAt <= payload.issuedAt) {
    const err = new Error('B02: Token expiration must be after issue time');
    err.code = 'B02_INVALID_EXPIRY';
    throw err;
  }

  if (payload.expiresAt - payload.issuedAt > MAX_TOKEN_TTL_MS) {
    const err = new Error(`B02: Token TTL exceeds policy limit of ${MAX_TOKEN_TTL_MS}ms`);
    err.code = 'B02_EXCESSIVE_TTL';
    throw err;
  }

  if (now < payload.issuedAt) {
    const err = new Error('B02: Token issued in the future (clock skew violation)');
    err.code = 'B02_FUTURE_TOKEN';
    throw err;
  }

  if (now >= payload.expiresAt) {
    const err = new Error('B02: Token expired');
    err.code = 'B02_EXPIRED_TOKEN';
    throw err;
  }

  // Attempt ID check
  if (expectedBinding.attemptId && payload.attemptId !== expectedBinding.attemptId) {
    const err = new Error(`B02: Attempt ID mismatch. Expected "${expectedBinding.attemptId}", got "${payload.attemptId}"`);
    err.code = 'B02_ATTEMPT_MISMATCH';
    throw err;
  }

  // Host ID check
  if (expectedBinding.hostId && payload.hostId !== expectedBinding.hostId) {
    const err = new Error(`B02: Host ID mismatch. Expected "${expectedBinding.hostId}", got "${payload.hostId}"`);
    err.code = 'B02_HOST_MISMATCH';
    throw err;
  }

  // Revocation list check
  if (options.revocationList && options.revocationList.has(payload.tokenId)) {
    const err = new Error(`B02: Token ${payload.tokenId} has been explicitly revoked`);
    err.code = 'B02_REVOKED_TOKEN';
    throw err;
  }

  // Replay check (nonce)
  if (options.consumedNonces) {
    if (!payload.nonce) {
      const err = new Error('B02: Nonce required in approval token');
      err.code = 'B02_MISSING_NONCE';
      throw err;
    }
    if (options.consumedNonces.has(payload.nonce)) {
      const err = new Error(`B02: Replayed token nonce "${payload.nonce}" detected`);
      err.code = 'B02_REPLAYED_NONCE';
      throw err;
    }
    options.consumedNonces.add(payload.nonce);
  }

  return { valid: true, payload };
}

/**
 * Append-only verifiable durable ledger implementation.
 */
class DurableLedger {
  constructor(authorizedWriter = 'medisync-qa-ledger-writer') {
    this.authorizedWriter = authorizedWriter;
    this.chain = [];
  }

  computeBlockHash(seq, prevHash, timestamp, writer, action, payload) {
    const canonical = JSON.stringify({ seq, prevHash, timestamp, writer, action, payload });
    return sha256(canonical);
  }

  append(action, payload, callerWriter, timestamp = Date.now()) {
    if (callerWriter !== this.authorizedWriter) {
      const err = new Error(`B02: Unauthorized ledger writer principal "${callerWriter}"`);
      err.code = 'B02_UNAUTHORIZED_WRITER';
      throw err;
    }

    const seq = this.chain.length;
    let prevHash;
    if (seq === 0) {
      prevHash = GENESIS_PREV_HASH;
    } else {
      const lastBlock = this.chain[seq - 1];
      if (timestamp < lastBlock.timestamp) {
        const err = new Error(`B02: Out-of-order timestamp. Current: ${timestamp}, Last: ${lastBlock.timestamp}`);
        err.code = 'B02_OUT_OF_ORDER_TIMESTAMP';
        throw err;
      }
      prevHash = lastBlock.hash;
    }

    const hash = this.computeBlockHash(seq, prevHash, timestamp, callerWriter, action, payload);
    const block = Object.freeze({
      seq,
      prevHash,
      timestamp,
      writer: callerWriter,
      action,
      payload: Object.freeze({ ...payload }),
      hash
    });

    this.chain.push(block);
    return block;
  }

  verifyChain(expectedMinLength = 1) {
    if (this.chain.length < expectedMinLength) {
      const err = new Error(`B02: Truncated log. Expected at least ${expectedMinLength} entries, found ${this.chain.length}`);
      err.code = 'B02_TRUNCATED_LOG';
      throw err;
    }

    let prevHash = GENESIS_PREV_HASH;
    let prevTime = -Infinity;

    for (let i = 0; i < this.chain.length; i++) {
      const block = this.chain[i];

      // Sequence check
      if (block.seq !== i) {
        const err = new Error(`B02: Sequence gap or duplicate entry at index ${i}. Block seq is ${block.seq}`);
        err.code = 'B02_SEQUENCE_ERROR';
        throw err;
      }

      // Prev hash check
      if (block.prevHash !== prevHash) {
        const err = new Error(`B02: Broken hash chain at seq ${i}. Expected prevHash ${prevHash}, got ${block.prevHash}`);
        err.code = 'B02_BROKEN_HASH_CHAIN';
        throw err;
      }

      // Timestamp check
      if (block.timestamp < prevTime) {
        const err = new Error(`B02: Out-of-order timestamp at seq ${i}`);
        err.code = 'B02_OUT_OF_ORDER_TIMESTAMP';
        throw err;
      }

      // Payload / block integrity check
      const recomputed = this.computeBlockHash(block.seq, block.prevHash, block.timestamp, block.writer, block.action, block.payload);
      if (recomputed !== block.hash) {
        const err = new Error(`B02: Altered entry payload or tampered hash at seq ${i}`);
        err.code = 'B02_TAMPERED_ENTRY';
        throw err;
      }

      prevHash = block.hash;
      prevTime = block.timestamp;
    }

    return { valid: true, length: this.chain.length, headHash: prevHash };
  }
}

module.exports = {
  AUTHORIZED_ISSUER,
  AUTHORIZED_ALGORITHM,
  GENESIS_PREV_HASH,
  MAX_TOKEN_TTL_MS,
  createSyntheticToken,
  verifySyntheticToken,
  DurableLedger
};
