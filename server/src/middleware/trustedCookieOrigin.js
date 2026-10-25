'use strict';
function trustedCookieOrigin(req, res, next) {
  if (!req.cookies?.refreshToken) return next();
  try {
    const configured = new URL(require('../security/clientOriginPolicy').clientOrigin());
    const supplied = new URL(req.headers.origin);
    if (!['http:', 'https:'].includes(configured.protocol) || configured.username || configured.password || supplied.origin !== configured.origin || req.headers.origin !== supplied.origin) throw new Error();
    return next();
  } catch (_) { return res.status(403).json({ error: 'Refresh origin verification required' }); }
}
module.exports = trustedCookieOrigin;
