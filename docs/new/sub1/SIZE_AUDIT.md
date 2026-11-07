# Sub-Project 1 — Size Audit

Status: TODO (filled in Phase 1 after owner approval).

Method (planned): directory totals only (size, file count, last modified) via `scripts/size_report.ps1`; no file-by-file reads inside node_modules, .venv, Python, scratch, research or medisync-qa-evidence; `git ls-files` for tracked status; verdict per item: KEEP / GITIGNORE / OWNER-DELETE / REGENERABLE.
