const jwt = require('jsonwebtoken');
const AuditLog = require('../models/AuditLog');

const protect = (allowedRoles = []) => async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // RBAC check
    if (allowedRoles.length && !allowedRoles.includes(decoded.role)) {
      return res.status(403).json({ error: 'Access denied: insufficient role' });
    }

    // Write audit log for every protected request
    await AuditLog.create({
      actorId: decoded.id,
      actorRole: decoded.role,
      action: `${req.method} ${req.path}`,
      accessedNic: req.params.nic || req.body?.nic || 'N/A',
      ipAddress: req.ip
    });

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = protect;