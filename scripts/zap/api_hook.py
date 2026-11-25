"""zap-baseline.py hook for the API target: request known public GET endpoints so that the passive rules see them.

The API has no HTML links, so the spider alone would only see one 404 page. GET requests only; no login, no attack.
"""
PATHS = ['/api/health', '/api/metrics', '/api/public/doctors', '/api/public/hospitals', '/api/public/pharmacies',
         '/api/public/outbreak-alerts', '/api/public/health-stats', '/api/public/consultation-activity',
         '/api/public/diseases/search?q=dengue', '/api/admin/stats', '/api/doctor/profile', '/api/auth/me', '/api/does-not-exist']


def zap_started(zap, target):
    base = target.rstrip('/')
    for path in PATHS:
        zap.core.access_url(base + path, followredirects=False)
    return zap, target
