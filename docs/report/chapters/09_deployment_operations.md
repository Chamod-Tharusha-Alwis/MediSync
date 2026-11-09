# Chapter 9: Cloud Deployment, Infrastructure & Operations

## 9.1 Hosting Infrastructure & Service Topology
MediSync is deployed across cost-free tier cloud infrastructure, demonstrating modern cloud-native architectural patterns achievable on student and university research budgets:

```
[ Internet User / Browser ]
           |
           +----> Vercel Edge Network (Global CDN)
           |      Static React SPA | HTTPS / TLS 1.3
           |
           +----> Render Cloud Web Services (Frankfurt / Oregon)
                  - Node.js Express Backend Service
                  - Python Flask ML Inference Service
                  |
                  +----> MongoDB Atlas (AWS Mumbai ap-south-1)
                         Replica Set M0 (512 MB Storage)
```

| Component | Cloud Provider | Plan / Tier | Specifications |
|---|---|---|---|
| **Client Frontend** | Vercel | Hobby Tier | Global Edge CDN, automated Git preview deployments, Brotli compression. |
| **Backend REST API** | Render | Free Web Service | 0.1 CPU core, 512 MB RAM, Node.js 20 LTS runtime, automatic HTTPS. |
| **ML Inference Engine** | Render | Free Web Service | 0.1 CPU core, 512 MB RAM, Python 3.14 / Gunicorn runtime. |
| **Primary Database** | MongoDB Atlas | Free M0 Sandbox | 512 MB encrypted storage, 3-node replica set, TLS 1.3, AWS Mumbai. |
| **Distributed Cache** | Upstash | Free Serverless | Redis REST API, in-memory rate limiting and token invalidation. |

---

## 9.2 Render Free Tier Dynamics & Cold-Start Management

### 9.2.1 The 15-Minute Inactivity Sleep Cycle
Render Free tier web services automatically enter dormancy (spin-down) after 15 consecutive minutes of HTTP inactivity. When a new inbound request arrives:
1. Render spins up the container runtime.
2. The Python runtime initializes dependencies and loads models into memory (~195 MB RSS).
3. The cold-start cycle requires approximately **50 to 60 seconds** before the container responds with HTTP 200 OK.

### 9.2.2 Explanation of Uptime Monitoring False Alerts
Third-party uptime monitors (such as UptimeRobot) frequently report false "Down" alerts for the ML microservice:
- Free uptime monitors typically employ a hardcoded HTTP connection timeout of **30 seconds**.
- When an automated check hits a dormant container, the request times out after 30 seconds while the container is still executing its 50-second initialization.
- The monitoring service logs an HTTP timeout and flags the service as "Down", even though the container subsequently reaches a healthy ready state.

### 9.2.3 Client-Side Cold-Start Mitigation
To prevent user confusion during cold boots:
- The React frontend incorporates an HTTP timeout interceptor. If an ML symptom inquiry exceeds 5 seconds, an informational modal appears informing the clinician: *"Cloud ML engine is waking from power-saving dormancy (~45s)..."*, with a visual countdown timer.
- Once warmed, subsequent inference queries respond with sub-millisecond latency (empirically measured at 0.77 ms mean).

---

## 9.3 Production Operations & Owner Runbook
All live production operations, database mutations, and administrative scripts are consolidated into a unified master runbook:
```
docs/OWNER_CHECKLIST_FINAL.md
```
To protect production integrity, autonomous engineering agents operate in read-only / offline mock modes. The system owner executes production operations using documented command-line flags verified directly against script `--help` specifications:
- **Database Seeding (Dry-Run)**:
  ```bash
  node scripts/seed-dispensing-sample.js --db medisync_prod --dry-run
  ```
- **Service Pre-Warm Command (Pre-Viva Protocol)**:
  ```bash
  curl.exe -i -m 60 https://medisync-ml.onrender.com/health
  curl.exe -i -m 60 https://medisync-wabc.onrender.com/health
  ```
- **Outbreak Simulation Preview**:
  ```bash
  node scripts/previewSyntheticOutbreakScenarios.js --scenario S1 --preview
  ```
