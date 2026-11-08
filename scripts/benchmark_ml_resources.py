#!/usr/bin/env python3
"""
Benchmark real process RSS memory and inference latency for MediSync ML Engine.
Measures true OS resident set size (RSS) via psutil and calculates p50/p95 latency over 200 predictions.
"""

import os
import sys
import time
import json
import statistics
import hmac
import hashlib
from datetime import datetime, timezone
from pathlib import Path

# Measure interpreter baseline RSS before heavy ML imports
import psutil

process = psutil.Process(os.getpid())
rss_interpreter_start_bytes = process.memory_info().rss
rss_interpreter_start_mb = round(rss_interpreter_start_bytes / (1024 * 1024), 2)

# Ensure ml-engine is on sys.path
repo_root = Path(__file__).resolve().parent.parent
ml_engine_dir = repo_root / "ml-engine"
sys.path.insert(0, str(ml_engine_dir))

if not os.environ.get('INTERNAL_API_KEY'):
    os.environ['INTERNAL_API_KEY'] = 'dev-internal-secret-key-medisync-2026'

from app import app

rss_after_load_bytes = process.memory_info().rss
rss_after_load_mb = round(rss_after_load_bytes / (1024 * 1024), 2)

client = app.test_client()
secret = os.environ['INTERNAL_API_KEY']
hour = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H')
token = hmac.new(secret.encode(), hour.encode(), hashlib.sha256).hexdigest()
headers = {'x-internal-key': token}

test_queries = [
    ["fever", "headache", "joint pain", "vomiting"],
    ["cough", "fever", "breathlessness"],
    ["back pain", "abdominal pain", "nausea"],
    ["itching", "skin rash", "fatigue"],
    ["high fever", "chills", "sweating"],
    ["numbness in hand", "wrist pain", "hand tingling"],
    ["chest pain", "shortness of breath", "dizziness"],
    ["burning urination", "frequent urination", "bladder pain"],
    ["yellow skin", "fatigue", "dark urine"],
    ["sore throat", "runny nose", "sneezing"]
]

# Run 100 warm-up predictions to measure RSS under sustained load
for i in range(100):
    query = test_queries[i % len(test_queries)]
    res = client.post('/api/ml/predict-disease', headers=headers, json={'symptoms': query})
    assert res.status_code == 200

rss_after_100_bytes = process.memory_info().rss
rss_after_100_mb = round(rss_after_100_bytes / (1024 * 1024), 2)

# Benchmark 200 predictions for latency profiling
latencies_ms = []
for i in range(200):
    query = test_queries[i % len(test_queries)]
    t0 = time.perf_counter()
    res = client.post('/api/ml/predict-disease', headers=headers, json={'symptoms': query})
    t1 = time.perf_counter()
    assert res.status_code == 200
    latencies_ms.append((t1 - t0) * 1000.0)

latencies_sorted = sorted(latencies_ms)
p50_latency = round(statistics.median(latencies_ms), 3)
p90_idx = int(0.90 * len(latencies_sorted))
p95_idx = int(0.95 * len(latencies_sorted))
p90_latency = round(latencies_sorted[p90_idx], 3)
p95_latency = round(latencies_sorted[p95_idx], 3)
mean_latency = round(statistics.mean(latencies_ms), 3)
min_latency = round(min(latencies_ms), 3)
max_latency = round(max(latencies_ms), 3)

results = {
    "metadata": {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "pythonVersion": sys.version.split()[0],
        "platform": sys.platform,
        "pid": os.getpid(),
        "clinicalValidation": "not_established",
        "methodology": "True process Resident Set Size (RSS) via psutil.Process().memory_info().rss"
    },
    "memoryRSS": {
        "unit": "MB",
        "interpreterStartMB": rss_interpreter_start_mb,
        "afterTier1AndTier2LoadMB": rss_after_load_mb,
        "after100PredictionsMB": rss_after_100_mb,
        "deltaLoadMB": round(rss_after_load_mb - rss_interpreter_start_mb, 2),
        "deltaInferenceMB": round(rss_after_100_mb - rss_after_load_mb, 2),
        "renderFreeLimitMB": 512,
        "utilizationOf512MBPercent": round((rss_after_100_mb / 512.0) * 100.0, 2)
    },
    "inferenceLatency": {
        "samples": len(latencies_ms),
        "unit": "milliseconds",
        "meanMs": mean_latency,
        "p50Ms": p50_latency,
        "p90Ms": p90_latency,
        "p95Ms": p95_latency,
        "minMs": min_latency,
        "maxMs": max_latency
    }
}

output_path = repo_root / "docs" / "report" / "data" / "ml_resource_measurements.json"
output_path.parent.mkdir(parents=True, exist_ok=True)
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2)

print(json.dumps(results, indent=2))
print(f"Measurements saved to: {output_path}")
