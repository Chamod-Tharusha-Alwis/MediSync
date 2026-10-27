const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const SessionToken = require('../models/SessionToken');
const AuditLog = require('../models/AuditLog');
const BanRecord = require('../models/BanRecord');
const { parseDeviceModel } = require('../utils/deviceParser');

const protect = (allowedRoles = []) => async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided or invalid format' });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify JWT
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Verify session in database
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const session = await SessionToken.findOne({ tokenHash });
    
    if (
      !session ||
      !session.isValid ||
      String(session.userId) !== String(decoded.id) ||
      Boolean(session.logoutAt) ||
      (session.expiredAt && session.expiredAt <= new Date())
    ) {
      return res.status(401).json({ error: 'Session expired or invalidated. Please log in again.' });
    }

    // Update last used
    session.lastUsed = new Date();
    await session.save();

    // RBAC
    if (allowedRoles.length > 0 && !allowedRoles.includes(decoded.role)) {
      return res.status(403).json({ error: 'Access denied: insufficient permissions' });
    }

    // Ban check — verify user is not suspended
    try {
      const activeBan = await BanRecord.findOne({
        targetId: decoded.id,
        isActive: true,
        $or: [
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } }
        ]
      });

      // findOne() proves absence only with null. An unexpected result is not
      // evidence that suspension verification succeeded.
      if (activeBan !== null) {
        if (
          !activeBan || typeof activeBan !== 'object' || Array.isArray(activeBan) ||
          activeBan.isActive !== true || String(activeBan.targetId) !== String(decoded.id) ||
          !['temporary', 'permanent'].includes(activeBan.banType) || typeof activeBan.reason !== 'string' ||
          (activeBan.expiresAt != null &&
            (!Number.isFinite(new Date(activeBan.expiresAt).getTime()) || new Date(activeBan.expiresAt) <= new Date()))
        ) {
          throw new Error('Invalid suspension verification result');
        }
        const expiryStr = activeBan.expiresAt
          ? new Date(activeBan.expiresAt).toLocaleDateString()
          : null;
        return res.status(403).json({
          error: 'Account suspended',
          banType: activeBan.banType,
          reason: activeBan.reason,
          expiresAt: activeBan.expiresAt,
          message: activeBan.banType === 'permanent'
            ? 'Your account has been permanently suspended. Contact support at support@medisync.lk.'
            : `Your account is temporarily suspended until ${expiryStr}.`
        });
      }
    } catch (_) {
      console.error('[Auth] Suspension verification unavailable.');
      return res.status(503).json({ error: 'Authentication verification unavailable. Please try again later.' });
    }

    // Write to AuditLog
    try {
      const clientHw = req.headers['x-hardware-model'] || req.headers['sec-ch-ua-model'];
      await AuditLog.create({
        actorId: decoded.id || decoded.sub || 'unknown',
        actorRole: decoded.role || 'unknown',
        action: `${req.method} ${req.route?.path || 'protected-route'}`,
        accessedNic: 'REDACTED',
        deviceModel: parseDeviceModel(req.headers['user-agent'], clientHw)
      });
    } catch (auditErr) {
      console.error('Audit persistence unavailable.');
      // Don't block the request if audit logging fails
    }

    // Attach to request
    req.user = decoded;
    req.session = session;
    next();
  } catch (error) {
    console.error('Authentication unavailable.');
    res.status(500).json({ error: 'Server error during authentication' });
  }
};

module.exports = protect;