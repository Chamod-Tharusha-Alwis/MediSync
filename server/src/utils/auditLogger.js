'use strict';

const mongoose = require('mongoose');
const { findActionByUrl } = require('./auditRegistry');

function maskNic(nic) {
  if (!nic || typeof nic !== 'string') return 'N/A';
  const clean = nic.trim();
  if (clean.length < 6) return 'REDACTED';
  return clean.slice(0, 4) + '****' + clean.slice(-2);
}

function parseDevice(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') return 'Web Console';
  if (/mobile/i.test(userAgent)) return 'Mobile Device';
  if (/tablet/i.test(userAgent)) return 'Tablet Device';
  return 'Desktop Browser';
}

/**
 * Safely create an AuditLog entry.
 * Never throws, never logs secrets/passwords, and skips execution when Mongoose is disconnected.
 */
async function recordAudit(params = {}) {
  try {
    const AuditLog = require('../models/AuditLog');
    if (!AuditLog || typeof AuditLog.create !== 'function') return;
    if (mongoose.connection && mongoose.connection.readyState !== 1 && !jest.isMockFunction?.(AuditLog.create)) return;

    const {
      actorId = 'anonymous',
      actorRole = 'anonymous',
      action = 'SYSTEM_ACTION',
      accessedNic = 'N/A',
      deviceModel = 'Web Console',
      details = {}
    } = params;

    // Sanitize details: strictly strip credentials, tokens, and PII
    const PII_OR_SECRET_PATTERN = /password|token|secret|authorization|cookie|key|nic|email|fullName|patientName|doctorName|phone|address|dateOfBirth|dob|symptoms|diagnosis|notes|prescription/i;

    const sanitizedDetails = {};
    if (details && typeof details === 'object' && !Array.isArray(details)) {
      for (const [key, val] of Object.entries(details)) {
        if (PII_OR_SECRET_PATTERN.test(key)) continue;
        if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
          sanitizedDetails[key] = typeof val === 'string' ? val.slice(0, 200) : val;
        } else if (val && typeof val === 'object' && !Array.isArray(val)) {
          for (const [k2, v2] of Object.entries(val)) {
            if (!PII_OR_SECRET_PATTERN.test(k2) &&
                (typeof v2 === 'string' || typeof v2 === 'number' || typeof v2 === 'boolean')) {
              sanitizedDetails[`${key}_${k2}`] = typeof v2 === 'string' ? v2.slice(0, 200) : v2;
            }
          }
        }
      }
    }

    await AuditLog.create({
      actorId: String(actorId || 'anonymous'),
      actorRole: String(actorRole || 'anonymous'),
      action: String(action || 'SYSTEM_ACTION').toUpperCase(),
      accessedNic: maskNic(accessedNic),
      deviceModel: String(deviceModel || 'Web Console'),
      details: Object.keys(sanitizedDetails).length > 0 ? sanitizedDetails : undefined,
      timestamp: new Date()
    });
  } catch (_) {
    // Fail-safe: audit errors must never break clinical transactions
  }
}

/**
 * Express middleware to audit an HTTP route on successful response.
 */
function auditRoute(action, options = {}) {
  return function (req, res, next) {
    res.on('finish', () => {
      if (res.statusCode < 400 || options.alwaysAudit === true) {
        const actorId = req.user?.id || req.user?._id || options.actorId || 'anonymous';
        const actorRole = req.user?.role || options.actorRole || 'anonymous';
        const rawNic = req.params?.nic || req.body?.nic || req.query?.nic || req.body?.patientNic || options.accessedNic || 'N/A';
        const deviceModel = parseDevice(req.headers?.['user-agent']);

        recordAudit({
          actorId,
          actorRole,
          action,
          accessedNic: rawNic,
          deviceModel,
          details: {
            path: req.originalUrl || req.url,
            method: req.method,
            statusCode: res.statusCode,
            ...(options.details || {})
          }
        });
      }
    });
    next();
  };
}

/**
 * Global audit middleware mounted on /api to audit all mutating and sensitive routes.
 */
function auditMiddleware(req, res, next) {
  const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  const targetUrl = req.originalUrl || req.url || '';
  const matchedAction = findActionByUrl(req.method, targetUrl);

  if (!matchedAction && !isMutating) return next();

  res.on('finish', () => {
    if (res.statusCode < 400) {
      const actorId = req.user?.id || req.user?._id || 'anonymous';
      const actorRole = req.user?.role || 'anonymous';
      const rawNic = req.params?.nic || req.body?.nic || req.query?.nic || req.body?.patientNic || 'N/A';
      const deviceModel = parseDevice(req.headers?.['user-agent']);
      const finalAction = matchedAction || `${req.method}_${targetUrl}`.replace(/[^A-Z0-9_]/gi, '_').toUpperCase();

      recordAudit({
        actorId,
        actorRole,
        action: finalAction,
        accessedNic: rawNic,
        deviceModel,
        details: {
          path: targetUrl,
          method: req.method,
          statusCode: res.statusCode
        }
      });
    }
  });

  next();
}

module.exports = {
  recordAudit,
  auditRoute,
  auditMiddleware,
  maskNic,
  parseDevice
};
