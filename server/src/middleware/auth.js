const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const SessionToken = require('../models/SessionToken');
const AuditLog = require('../models/AuditLog');

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
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Verify session in database
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const session = await SessionToken.findOne({ tokenHash });
    
    if (!session || !session.isValid) {
      return res.status(401).json({ error: 'Session expired or invalidated. Please log in again.' });
    }

    // Update last used
    session.lastUsed = new Date();
    await session.save();

    // RBAC
    if (allowedRoles.length > 0 && !allowedRoles.includes(decoded.role)) {
      return res.status(403).json({ error: 'Access denied: insufficient permissions' });
    }

    // Write to AuditLog
    try {
      let accessedNic = 'N/A';
      if (req.params && req.params.nic) accessedNic = req.params.nic;
      else if (req.body && req.body.nic) accessedNic = req.body.nic;
      else if (req.body && req.body.patientNic) accessedNic = req.body.patientNic;

      await AuditLog.create({
        actorId: decoded.id || decoded.sub || 'unknown',
        actorRole: decoded.role || 'unknown',
        action: `${req.method} ${req.originalUrl || req.path}`,
        accessedNic: accessedNic,
        ipAddress: req.ip || req.connection.remoteAddress
      });
    } catch (auditErr) {
      console.error('Failed to write audit log:', auditErr);
      // Don't block the request if audit logging fails
    }

    // Attach to request
    req.user = decoded;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Server error during authentication' });
  }
};

module.exports = protect;