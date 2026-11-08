#!/usr/bin/env python3
"""
Generate comprehensive FILE_GUIDE.md for MediSync.
Scans all 1,129 git-tracked files, classifies purpose, type, LOC, exports/routes,
protected status, and role (runtime, dev, test, data, one-off).
Groups high-volume generated/temp/receipt files in compact tables.
"""

import os
import re
import json
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

# Load protected file hashes
protected_path = REPO_ROOT / "docs" / "release" / "PROTECTED_HASHES.json"
with open(protected_path, "r", encoding="utf-8") as f:
    protected_data = json.load(f)
protected_files = {f["path"].replace("\\", "/") for f in protected_data.get("files", [])}

out = subprocess.check_output(["git", "ls-files"], cwd=REPO_ROOT, text=True)
all_files = [line.strip().replace("\\", "/") for line in out.splitlines() if line.strip()]

def get_loc(p):
    full = REPO_ROOT / p
    try:
        with open(full, "rb") as f:
            chunk = f.read(1024)
            if b"\x00" in chunk:
                return 0, True
        with open(full, "r", encoding="utf-8", errors="ignore") as f:
            return len(f.readlines()), False
    except:
        return 0, False

def extract_purpose(p):
    full = REPO_ROOT / p
    # Heuristics from header comments
    try:
        with open(full, "r", encoding="utf-8", errors="ignore") as f:
            lines = [f.readline().strip() for _ in range(15)]
        comments = []
        for l in lines:
            if l.startswith(("//", "/*", "*", "#", '"""', "<!--")):
                c = re.sub(r"^[/*#\"<!\- ]+", "", l).strip()
                if len(c) > 5 and not c.startswith("@"):
                    comments.append(c)
        if comments:
            return comments[0][:100]
    except:
        pass
    # Fallback from path pattern
    name = Path(p).name
    if "test" in p or "spec" in p:
        return f"Test suite for {name.replace('.test.js', '').replace('.test.jsx', '')}"
    if "controller" in p.lower():
        return f"HTTP controller handling {name.replace('Controller.js', '')} business logic"
    if "service" in p.lower():
        return f"Domain service handling {name.replace('Service.js', '')} operations"
    if "model" in p.lower():
        return f"Mongoose schema and data model for {name.replace('.js', '')}"
    if "route" in p.lower():
        return f"Express route definitions for {name.replace('Routes.js', '')}"
    if p.endswith(".md"):
        return f"Documentation guide for {name.replace('.md', '')}"
    if p.endswith(".json"):
        return f"Configuration / reference data payload for {name}"
    return "Application component module"

def classify_role(p):
    if "test" in p or "spec" in p or "mock" in p:
        return "test"
    if p.startswith("docs/temp/"):
        return "one-off / receipt"
    if p.startswith("docs/"):
        return "documentation"
    if p.endswith((".json", ".csv", ".db")):
        return "data"
    if p.startswith("scripts/"):
        return "dev / script"
    if "config" in p or p in ("Dockerfile", "docker-compose.yml", "package.json"):
        return "dev-only"
    return "runtime"

records = []
for p in all_files:
    loc, is_bin = get_loc(p)
    purpose = extract_purpose(p)
    is_prot = p in protected_files
    role = classify_role(p)
    ext = Path(p).suffix
    records.append({
        "path": p,
        "loc": loc,
        "isBinary": is_bin,
        "purpose": purpose,
        "protected": is_prot,
        "role": role,
        "ext": ext
    })

print(f"Audited {len(records)} files. Pinned protected found: {sum(1 for r in records if r['protected'])}")

# Build Markdown
lines = []
lines.append("# MediSync Tracked File Inventory & Architectural Guide\n")
lines.append("> **Total Tracked Files**: 1,129  ")
lines.append("> **Protected Ledger Files**: 15 (pinned via SHA-256 in `docs/release/PROTECTED_HASHES.json`)  ")
lines.append("> **Classification Criteria**: Runtime production code, dev-only tooling, automated test suites, reference data catalogs, and one-off phase receipts.\n")
lines.append("---\n")

sections = [
    ("Root Directory", lambda p: "/" not in p),
    ("Server Architecture (`server/src/`)", lambda p: p.startswith("server/src/")),
    ("Server Reference Data & Scripts (`server/reference-data/`, `server/scripts/`)", lambda p: p.startswith(("server/reference-data/", "server/scripts/"))),
    ("Server Test Suites (`server/tests/`)", lambda p: p.startswith("server/tests/")),
    ("Client Application (`client/src/`)", lambda p: p.startswith("client/src/") and not p.startswith("client/src/__master_offline__/")),
    ("Client Master Offline Tests (`client/src/__master_offline__/`, `client/tests/`)", lambda p: p.startswith(("client/src/__master_offline__/", "client/tests/"))),
    ("Client Public & Build Scripts (`client/public/`, `client/scripts/`, `client/*`)", lambda p: p.startswith(("client/public/", "client/scripts/")) or (p.startswith("client/") and p.count("/") == 1)),
    ("Machine Learning Engine (`ml-engine/`)", lambda p: p.startswith("ml-engine/")),
    ("Repository Scripts (`scripts/`)", lambda p: p.startswith("scripts/")),
    ("Documentation Core (`docs/`, `docs/report/`, `docs/release/`, etc.)", lambda p: p.startswith("docs/") and not p.startswith("docs/temp/")),
    ("Historical Verification Receipts (`docs/temp/`)", lambda p: p.startswith("docs/temp/"))
]

for title, cond in sections:
    group = [r for r in records if cond(r["path"])]
    lines.append(f"## {title} ({len(group)} files)\n")
    if title.startswith("Historical Verification Receipts"):
        lines.append("*Compact summary of historical test execution receipts and ephemeral run logs:*\n")
        lines.append("| Directory / Pattern | File Count | Type | Purpose | Role |")
        lines.append("|---|:---:|:---:|---|:---:|")
        lines.append(f"| `docs/temp/*.json`, `*.cjs` | {len(group)} | JSON / CJS | Historical offline test receipts, gate execution runs, and patch logs | one-off / receipt |\n")
        continue

    lines.append("| Path | LOC | Type | Role | Protected? | Purpose & Key Responsibilities |")
    lines.append("|---|:---:|:---:|:---:|:---:|---|")
    for r in group:
        prot_badge = "YES (PINNED)" if r["protected"] else "No"
        loc_str = str(r["loc"]) if not r["isBinary"] else "[binary]"
        ext_clean = r["ext"] or "[none]"
        lines.append(f"| `{r['path']}` | {loc_str} | `{ext_clean}` | {r['role']} | {prot_badge} | {r['purpose']} |")
    lines.append("\n")

out_file = REPO_ROOT / "docs" / "report" / "FILE_GUIDE.md"
with open(out_file, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

print(f"Generated {out_file} ({len(lines)} lines)")
