# MediSync Sub-Project 2 — Owner Operational Actions & Infrastructure Runbook

Date: November 8, 2026  
Status: RELEASE CANDIDATE SUB2  
Services:
- **Backend API**: `https://medisync-wabc.onrender.com`
- **ML Engine**: `https://medisync-ml.onrender.com`

---

## 1. Render Free Tier Idle Sleep & Cold-Start Mechanics

The MediSync Machine Learning microservice (`medisync-ml.onrender.com`) is deployed on the Render Free Tier (512 MB RAM, shared CPU).

### Free Tier Lifecycle Behavior
1. **Inactivity Sleep**: Render automatically spins down free-tier web services after **15 minutes of zero inbound traffic**.
2. **Cold-Start Duration**: When an inbound request hits a sleeping container (e.g., an administrator opening Outbreak Monitor or a doctor triggering disease prediction), Render boots a fresh container. Boot time is typically **50 to 90 seconds** because Python, Gunicorn, scikit-learn, and the reference ICD dataset must load into memory.
3. **Application Mitigation Added**:
   - Backend now returns `{ availabilityState: 'waking', status: 'waking' }` after a quick 5s probe rather than blocking or hanging.
   - Admin UI components (`OutbreakMonitor.jsx` and `Dashboard.jsx`) now detect the waking state, display an informative amber "Service waking up..." badge, and automatically poll every 10 seconds (up to 6 times) so no manual refresh is required.
   - A non-blocking background ping is dispatched to `https://medisync-ml.onrender.com/health` to trigger warm-up as soon as an administrator accesses the command center.

---

## 2. Verifying ML Health and Render Container Logs

### A. Checking Render Container Logs
1. Navigate to the Render Dashboard: `https://dashboard.render.com`
2. Select the service: **`medisync-ml`**.
3. Under the **Logs** tab, look for:
   ```text
   ==> Starting service with 'gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 4 app:app'
   [INFO] Listening at: http://0.0.0.0:10000
   [INFO] MediSync ML Engine initialized. Loaded 14 reference files / 71,704 ICD concepts.
   ```
4. If memory exceeds 512 MB, Render will log `Container killed by OOM (Out of Memory)`. Verify that memory usage stays within ~300–400 MB.

### B. Command-Line Health Probes (Read-Only)
Run the following from your local terminal or PowerShell:

```powershell
# Probe ML Engine directly
curl -s https://medisync-ml.onrender.com/health

# Expected Output when awake:
# {"status":"ready","references":{"files":14,"icd10Concepts":71704,"clinicalValidation":"not_established"}}
```

```powershell
# Probe Backend Gateway system health
curl -s https://medisync-wabc.onrender.com/health

# Expected Output:
# {"status":"ready","commit":"da438aa","service":"medisync-express"}
```

---

## 3. Operational Recommendations

### Immediate (Zero Cost): Free External Keep-Alive Pinger
To prevent `medisync-ml` from entering idle sleep during demonstrations or clinical reviews:
1. Create a free account on **UptimeRobot** (`https://uptimerobot.com`) or **Cron-Job.org** (`https://cron-job.org`).
2. Add a new **HTTP(s) Monitor**:
   - **Friendly Name**: `MediSync ML Engine Keep-Alive`
   - **URL**: `https://medisync-ml.onrender.com/health`
   - **Monitoring Interval**: Every **10 minutes** (Render sleeps at 15 minutes, so 10 minutes keeps the instance permanently hot).
   - **HTTP Method**: `GET`
   - **Accepted Status**: `200`
3. Add a second monitor for the backend:
   - **URL**: `https://medisync-wabc.onrender.com/health`
   - **Monitoring Interval**: Every **10 minutes**

### Long-Term (Production Grade): Upgrade to Render Starter
For uncompromised, 100% uptime without cold starts or free-tier sleep:
- Upgrade `medisync-ml` from **Free** ($0) to **Starter** ($7/month).
- Upgrade `medisync-wabc` from **Free** ($0) to **Starter** ($7/month).
- Benefits: Always-on containers, no spin-down, dedicated CPU thread, 512 MB–1 GB RAM, faster response times.

---

## 4. Demo Batch Removal Runbook Reference

Before executing the demo batch removal:
1. Run dry run and inspect counts:
   ```powershell
   node scripts/remove_demo_batch.js --db medisync_prod --dry-run
   ```
2. Verify that targeted records match:
   - 6,309 consultations
   - 14 outbreak alerts (6 active in monitor + 8 historical/terminal alerts in database)
3. Once satisfied, execute with explicit confirmation:
   ```powershell
   node scripts/remove_demo_batch.js --db medisync_prod --confirm-delete
   ```
