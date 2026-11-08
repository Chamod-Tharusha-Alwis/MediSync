import re
from pathlib import Path

routes_dir = Path("server/src/routes")
routes = []

# Map route files to their mount points in app.js
mount_points = {
    "adminRoutes.js": "/api/admin",
    "alertRoutes.js": "/api/alerts",
    "authRoutes.js": "/api/auth",
    "deviceRoutes.js": "/api/devices",
    "doctorRoutes.js": "/api/doctors",
    "drugRoutes.js": "/api/drugs",
    "hospitalRoutes.js": "/api/hospitals",
    "labRoutes.js": "/api/labs",
    "notificationRoutes.js": "/api/notifications",
    "patientRoutes.js": "/api/patients",
    "pharmacyRoutes.js": "/api/pharmacies",
    "prescriptionRoutes.js": "/api/prescriptions",
    "publicRoutes.js": "/api/public",
    "qaRoutes.js": "/api/qa",
    "reviewRoutes.js": "/api/reviews",
    "supportRoutes.js": "/api/support",
    "testRoutes.js": "/api/tests",
    "userRoutes.js": "/api/users",
    "verificationRoutes.js": "/api/verify"
}

for p in sorted(routes_dir.glob("*.js")):
    prefix = mount_points.get(p.name, f"/api/{p.name.replace('Routes.js', '')}")
    with open(p, "r", encoding="utf-8") as f:
        lines = f.readlines()
    for line in lines:
        m = re.search(r"router\.(get|post|put|patch|delete)\s*\(\s*['\"]([^'\"]+)['\"]", line)
        if m:
            method = m.group(1).upper()
            subpath = m.group(2)
            full_path = prefix if subpath == "/" else f"{prefix}{subpath}"
            routes.append({
                "file": p.name,
                "method": method,
                "path": full_path,
                "line": line.strip()
            })

print(f"Total Express routes: {len(routes)}")
for r in routes[:30]:
    print(f"{r['method']:6} {r['path']}")
